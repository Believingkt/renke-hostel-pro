#!/usr/bin/env bash
# 20261025090000_drop_owner_direct 本機測試：最小 schema ＋ 正式版函式原檔 → 套用 → 驗證 → rollback → 再套用
set -uo pipefail
REPO=/app
DB=oddrop
M=$REPO/supabase/migrations/20261025090000_drop_owner_direct.sql
RB=$REPO/docs/team-onboarding/rollback_20261025090000.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
qa() { q -At "$@"; }
PASS=0; FAIL=0
ok() { if [ "$2" = "$3" ]; then echo "PASS $1"; PASS=$((PASS+1)); else echo "FAIL $1：預期 [$3] 實際 [$2]"; FAIL=$((FAIL+1)); fi; }

P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
q >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_dmafqwfynatdvnaeovhz') THEN CREATE ROLE sandbox_exec_dmafqwfynatdvnaeovhz; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-00000000aaaa'::uuid $$;
CREATE TABLE public.accommodation_info(id uuid PRIMARY KEY, name text);
CREATE TABLE public.orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, order_number text,
  order_date timestamptz DEFAULT now(), order_status text DEFAULT 'confirmed', order_source text,
  owner_direct boolean NOT NULL DEFAULT false, requires_owner_review boolean DEFAULT false,
  discount_code text, discount_amount numeric DEFAULT 0, total_price numeric, final_price numeric,
  custom_addon_details jsonb, currency_at_booking text, payment_status text, notes text,
  balance_payment_method text, payment_method text, deposit_payment_method text,
  room_charge_rec_trade_id text, paid_amount numeric, refund_status text, updated_at timestamptz);
CREATE TABLE public.discount_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text, accommodation_id uuid, commission_rate numeric);
CREATE TABLE public.commission_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, discount_code_id uuid, order_id uuid,
  order_total numeric, discount_amount numeric, commission_rate numeric, commission_amount numeric, settlement_status text);
CREATE TABLE public.owner_settlement_pricing_rules(accommodation_id uuid, effective_from date, created_at timestamptz DEFAULT now(), exempt_order_sources text[]);
CREATE TABLE public.system_settings(setting_key text, setting_value jsonb);
CREATE TABLE public.change_log(field text);
CREATE FUNCTION public.set_order_change_context(text, text, text, text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
-- log_order_change 簡化版：保留與正式版相同的欄位清單寫法
CREATE FUNCTION public.log_order_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c_full CONSTANT text[] := ARRAY[
    'meal_plan','display_room_type_name',
    'owner_direct','requires_owner_review','is_pii_pending',
    'order_status'];
  k text;
BEGIN
  FOREACH k IN ARRAY c_full LOOP
    IF (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k) THEN INSERT INTO public.change_log VALUES (k); END IF;
  END LOOP;
  RETURN NEW;
END $fn$;
CREATE TRIGGER log_order_change AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_change();
SQL
q -f $REPO/supabase/migrations/20260731164448_a5b17bb7-1424-47b1-b2b5-55e3a94d9fb2.sql >/dev/null
q -f $REPO/supabase/migrations/20260911073711_510e975d-a193-43a5-9d1b-1a91949f6309.sql >/dev/null

MD5_BEFORE=$(qa -c "SELECT md5(pg_get_functiondef('public.update_order_fields_v1(uuid,jsonb,text,text)'::regprocedure))")
echo "update_order_fields_v1 套用前 md5=$MD5_BEFORE"

A=11111111-1111-1111-1111-111111111111
q >/dev/null <<SQL
INSERT INTO accommodation_info VALUES ('$A','測試館');
INSERT INTO discount_codes(code, accommodation_id, commission_rate) VALUES ('KOL10','$A',10);
INSERT INTO owner_settlement_pricing_rules VALUES ('$A','2020-01-01',now(),'{owner_provided}');
INSERT INTO orders(accommodation_id, order_number, order_source, owner_direct, discount_code, total_price, final_price)
VALUES ('$A','T1','kol',true,'KOL10',10000,10000),
       ('$A','T2','kol',false,'KOL10',10000,10000),
       ('$A','T3','owner_provided',true,'KOL10',10000,10000);
SQL
ok "套用前：開關打開的 T1 沒有分潤" "$(qa -c "SELECT count(*) FROM commission_records c JOIN orders o ON o.id=c.order_id WHERE o.order_number='T1'")" "0"

echo "== 套用 migration"
q -f "$M" >/dev/null && echo "ok"
ok "orders.owner_direct 已刪除" "$(qa -c "SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='owner_direct'")" "0"
ok "備份表筆數" "$(qa -c "SELECT count(*) FROM owner_direct_backup_20260601")" "2"
ok "備份表已啟用 RLS" "$(qa -c "SELECT relrowsecurity FROM pg_class WHERE relname='owner_direct_backup_20260601'")" "t"
ok "create_commission_record 不再引用 owner_direct" "$(qa -c "SELECT pg_get_functiondef('public.create_commission_record()'::regprocedure) ~ '\mowner_direct\M'")" "f"
ok "log_order_change 不再引用 owner_direct" "$(qa -c "SELECT pg_get_functiondef('public.log_order_change()'::regprocedure) ~ '\mowner_direct\M'")" "f"

q -c "UPDATE orders SET final_price = 10001 WHERE order_number='T1'" >/dev/null
ok "套用後：T1（kol 來源）改價會產生分潤" "$(qa -c "SELECT commission_amount FROM commission_records c JOIN orders o ON o.id=c.order_id WHERE o.order_number='T1'")" "1000"
q -c "UPDATE orders SET final_price = 10001 WHERE order_number='T3'" >/dev/null
ok "套用後：T3（業主自帶且在免抽成清單）仍無分潤" "$(qa -c "SELECT count(*) FROM commission_records c JOIN orders o ON o.id=c.order_id WHERE o.order_number='T3'")" "0"
q -c "UPDATE orders SET order_source='owner_provided' WHERE order_number='T2'" >/dev/null
ok "改來源為業主自帶會觸發刪除分潤" "$(qa -c "SELECT count(*) FROM commission_records c JOIN orders o ON o.id=c.order_id WHERE o.order_number='T2'")" "0"
ok "訂單稽核觸發器仍正常" "$(qa -c "SELECT count(*) FROM pg_trigger WHERE tgname='log_order_change'")" "1"

R=$(q -c "SELECT update_order_fields_v1((SELECT id FROM orders WHERE order_number='T1'), '{\"owner_direct\":true}'::jsonb, 'test', null)" 2>&1)
ok "update_order_fields_v1 拒絕 owner_direct" "$(echo "$R" | grep -c '欄位不在白名單內 (owner_direct)')" "1"
ok "update_order_fields_v1 其他欄位仍可更新" "$(qa -c "SELECT update_order_fields_v1((SELECT id FROM orders WHERE order_number='T1'), '{\"notes\":\"x\"}'::jsonb, 'test', null)")" "1"
MD5_AFTER=$(qa -c "SELECT md5(pg_get_functiondef('public.update_order_fields_v1(uuid,jsonb,text,text)'::regprocedure))")
LEN_AFTER=$(qa -c "SELECT length(pg_get_functiondef('public.update_order_fields_v1(uuid,jsonb,text,text)'::regprocedure))")
echo "update_order_fields_v1 新 md5=$MD5_AFTER len=$LEN_AFTER"
ok "授權保留（authenticated 可執行）" "$(qa -c "SELECT has_function_privilege('authenticated','public.update_order_fields_v1(uuid,jsonb,text,text)','EXECUTE')")" "t"

echo "== 預檢：有其他函式引用 owner_direct 時要中止"
P -d postgres -c "DROP DATABASE IF EXISTS ${DB}_pre" -c "CREATE DATABASE ${DB}_pre TEMPLATE $DB" >/dev/null
P -d ${DB}_pre -v ON_ERROR_STOP=1 -q -c "ALTER TABLE orders ADD COLUMN owner_direct boolean" -c "CREATE FUNCTION public.zz() RETURNS boolean LANGUAGE sql AS \$\$ SELECT owner_direct FROM orders LIMIT 1 \$\$" >/dev/null
R=$(P -d ${DB}_pre -v ON_ERROR_STOP=1 -f "$M" 2>&1)
ok "預檢擋下未知函式" "$(echo "$R" | grep -c 'PRECHECK 失敗')" "1"
P -d postgres -c "DROP DATABASE ${DB}_pre" >/dev/null

echo "== rollback"
q -f "$RB" >/dev/null && echo "ok"
ok "rollback 後欄位恢復" "$(qa -c "SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='owner_direct'")" "1"
ok "rollback 後開關值依備份還原" "$(qa -At -c "SELECT string_agg(order_number,',' ORDER BY order_number) FROM orders WHERE owner_direct")" "T1,T3"
ok "rollback 後 update_order_fields_v1 與套用前完全相同" "$(qa -c "SELECT md5(pg_get_functiondef('public.update_order_fields_v1(uuid,jsonb,text,text)'::regprocedure))")" "$MD5_BEFORE"
ok "rollback 後 create_commission_record 恢復開關判斷" "$(qa -c "SELECT pg_get_functiondef('public.create_commission_record()'::regprocedure) ~ 'NEW\.owner_direct'")" "t"

echo "== 再套用"
q -f "$M" >/dev/null && echo "ok"
ok "再套用後欄位已刪除" "$(qa -c "SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='owner_direct'")" "0"

P -d postgres -c "DROP DATABASE $DB" >/dev/null
echo "== 結果：PASS=$PASS FAIL=$FAIL"
