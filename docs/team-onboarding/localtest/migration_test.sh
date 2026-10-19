#!/usr/bin/env bash
# 20261021090000_team_am_onboarding 本機測試（最小 schema＋依正式庫查詢 ② 產生的館別／AM／hotel_admin 資料）
# 套用、回填結果、RPC 權限、自動同步、旗標還原、鎖逾時、rollback、再套用
set -uo pipefail
REPO=/app
DB=amonb
DIR=$REPO/docs/team-onboarding
M=$REPO/supabase/migrations/20261021090000_team_am_onboarding.sql
RB=$DIR/rollback_20261021090000.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
qa() { q -At "$@"; }
U() { python3 -c "import uuid,sys;print(uuid.uuid5(uuid.UUID(int=0),sys.argv[1]))" "$1"; }
KEN=$(U "user:Ken 郭天銳"); SYNN=$(U "user:Synn 関詠心(心心)"); BELLA=$(U "user:Bella 王苑婷"); JOYCE=$(U "user:Joyce 陳香吟")
BELLA_P=$(U "profile:Bella 王苑婷"); KEN_P=$(U "profile:Ken 郭天銳"); SYNN_P=$(U "profile:Synn 関詠心(心心)")
ACC() { U "acc:$1"; }
SU=00000000-0000-0000-0000-00000000aaaa
as_user() { echo "SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$1',true);"; }

P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
q >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email', 'test@local') $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM ('super_admin','hotel_admin','staff','admin','am','am_manager','scout','scout_manager','closer','closer_manager','finance');
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, is_active boolean NOT NULL DEFAULT false,
  first_activated_at timestamptz, payment_provider_active text NOT NULL DEFAULT 'tappay', payuni_mer_id text, payuni_mer_status integer);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE, role app_role NOT NULL DEFAULT 'staff', template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_accommodation_id_role_key UNIQUE (user_id, accommodation_id, role));
CREATE TABLE public.team_member_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, display_name text NOT NULL,
  is_active boolean DEFAULT true, managed_venue text[], am_managed_accommodation_ids uuid[], resigned_at date, created_at timestamptz DEFAULT now());
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, user_id uuid NOT NULL, user_email text,
  action_type text NOT NULL, action_category text NOT NULL, entity_type text, entity_id text, entity_name text, details jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.kol_venues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, is_active boolean, accommodation_id uuid, room_type_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.kol_venue_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_id uuid);
CREATE TABLE public.kol_reciprocal_monthly_quotas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, year_month text, quota integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE FUNCTION public.is_super_admin(user_uuid uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = user_uuid AND role = 'super_admin') $$;
CREATE FUNCTION public.user_has_team_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND accommodation_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'::app_role);
END $$;
SQL
python3 $DIR/localtest/seed.py $DIR/localtest/prod_snapshot_q2.sql | q >/dev/null
q >/dev/null <<SQL
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('$SU', NULL, 'super_admin');
INSERT INTO kol_venues (name, is_active, accommodation_id) VALUES ('哈庫納馬塔塔', true, '$(ACC 哈庫納馬塔塔)');
INSERT INTO kol_reciprocal_monthly_quotas (accommodation_id, year_month, quota) VALUES ('$(ACC 哈庫納馬塔塔)', to_char(now() AT TIME ZONE 'Asia/Taipei','YYYY-MM'), 4);
SQL
# 既有（套用前）的 trigger 與函式：取自 rollback 檔的原始定義
sed -n '/^CREATE OR REPLACE FUNCTION public.enforce_am_managed_accommodations/,/^\$\$;/p' $RB | q >/dev/null
sed -n '/^CREATE OR REPLACE FUNCTION public.enforce_manager_scoped_user_roles/,/^\$function\$;/p' $RB | q >/dev/null
sed -n '/^CREATE OR REPLACE FUNCTION public.am_manages_accommodation/,/^\$\$;/p' $RB | q >/dev/null
q >/dev/null <<'SQL'
CREATE TRIGGER trg_enforce_am_managed_accommodations BEFORE INSERT OR UPDATE ON public.team_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_am_managed_accommodations();
CREATE TRIGGER trg_enforce_manager_scoped_user_roles BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manager_scoped_user_roles();
SQL

state() { qa -c "SELECT 'resp=' || coalesce((SELECT count(*) FROM accommodation_responsible_am WHERE ended_at IS NULL)::text,'-')
  || '；grants=' || coalesce((SELECT count(*) FROM am_hotel_admin_grants)::text,'-')
  || '；hotel_admin=' || (SELECT count(*) FROM user_roles WHERE role='hotel_admin')" 2>/dev/null \
  || qa -c "SELECT 'resp=-；grants=-；hotel_admin=' || (SELECT count(*) FROM user_roles WHERE role='hotel_admin')"; }
arrays() { qa -c "SELECT display_name || '=' || coalesce((SELECT string_agg(a.name, '、' ORDER BY a.name) FROM accommodation_info a WHERE a.id = ANY(p.am_managed_accommodation_ids)), '∅') FROM team_member_profiles p WHERE p.am_managed_accommodation_ids IS NOT NULL ORDER BY 1"; }

HA_BEFORE=$(qa -c "SELECT md5(string_agg(user_id||':'||accommodation_id, ',' ORDER BY user_id, accommodation_id)) FROM user_roles WHERE role='hotel_admin'")
AR_BEFORE=$(qa -c "SELECT md5(string_agg(id||':'||coalesce(am_managed_accommodation_ids::text,''), ',' ORDER BY id)) FROM team_member_profiles")
echo "== 套用前：$(state)"; arrays
echo "== 套用"; q -f "$M" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  /NOTICE: /'; echo "$(state)"
echo "== 套用後 am_managed_accommodation_ids（只剩開賣中的負責館別）"; arrays
echo "== 系統補開的 hotel_admin"
qa -c "SELECT p.display_name || ' → ' || string_agg(a.name, '、' ORDER BY a.name) FROM am_hotel_admin_grants g JOIN team_member_profiles p ON p.user_id=g.user_id JOIN accommodation_info a ON a.id=g.accommodation_id GROUP BY p.display_name ORDER BY p.display_name"
echo "非系統開的 hotel_admin 筆數 = 套用前：$(qa -c "SELECT count(*) FROM user_roles r WHERE role='hotel_admin' AND NOT EXISTS (SELECT 1 FROM am_hotel_admin_grants g WHERE g.user_id=r.user_id AND g.accommodation_id=r.accommodation_id)")"

echo "== 權限／RLS"
qa -c "SELECT c.relname || ' rls=' || c.relrowsecurity || ' policy=' || (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname) || ' authenticated_select=' || has_table_privilege('authenticated', c.oid, 'SELECT') || ' authenticated_insert=' || has_table_privilege('authenticated', c.oid, 'INSERT') FROM pg_class c WHERE relname IN ('accommodation_responsible_am','accommodation_am_settings','am_hotel_admin_grants','am_onboarding_migration_backup') ORDER BY 1"
qa -c "SELECT p.proname || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE '\_am%' OR p.proname LIKE 'team\_%' OR p.proname='sync_am_hotel_admin') ORDER BY 1"

t() { local title=$1; shift; echo "-- $title"; q -At 2>&1 <<SQL | sed 's/^psql:<stdin>:[0-9]*: //' | grep -vE '^SET$|^$|^[0-9a-f-]{36}$'
BEGIN;
$*
ROLLBACK;
SQL
}
echo "== RPC／同步行為（每項獨立交易、測完 ROLLBACK）"
t "AM 總管 Ken 指定 天送幸福和苑 → Bella" "$(as_user $KEN) SELECT public.team_set_responsible_am('$(ACC 天送幸福和苑)', '$BELLA_P'); RESET ROLE; SELECT 'Bella 陣列：' || (SELECT string_agg(a.name,'、') FROM team_member_profiles p JOIN accommodation_info a ON a.id = ANY(p.am_managed_accommodation_ids) WHERE p.id='$BELLA_P'); SELECT 'audit=' || count(*) FROM audit_logs WHERE entity_type='responsible_am';"
t "Ken 把 哈庫納馬塔塔 從 Synn 換成 Bella（舊的結束為 replaced，Synn 少一館）" "$(as_user $KEN) SELECT public.team_set_responsible_am('$(ACC 哈庫納馬塔塔)', '$BELLA_P'); RESET ROLE; SELECT 'Synn 館數=' || cardinality(am_managed_accommodation_ids) FROM team_member_profiles WHERE id='$SYNN_P'; SELECT 'history=' || string_agg(coalesce(end_reason,'current'), ',' ORDER BY started_at) FROM accommodation_responsible_am WHERE accommodation_id='$(ACC 哈庫納馬塔塔)';"
t "一般 AM Synn 指定負責 AM → 應拒絕" "$(as_user $SYNN) SELECT public.team_set_responsible_am('$(ACC 天送幸福和苑)', '$BELLA_P');"
t "指定 AM 總管 Ken 為負責 AM → 應拒絕" "$(as_user $SU) SELECT public.team_set_responsible_am('$(ACC 天送幸福和苑)', '$KEN_P');"
t "指定到已停用館別（十一鳴）→ 應拒絕" "$(as_user $SU) SELECT public.team_set_responsible_am('$(ACC 旅行日-十一鳴)', '$SYNN_P');"
t "上架中的新館（測試館-上架引導）可以指定；未開賣前不算進陣列" "$(as_user $SU) SELECT public.team_set_responsible_am('$(ACC 測試館-上架引導)', '$BELLA_P'); RESET ROLE; SELECT 'Bella 陣列=' || coalesce(am_managed_accommodation_ids::text,'∅') FROM team_member_profiles WHERE id='$BELLA_P';"
t "直接寫 am_managed_accommodation_ids（super_admin）→ 應拒絕" "$(as_user $SU) UPDATE team_member_profiles SET am_managed_accommodation_ids = NULL WHERE id='$SYNN_P';"
t "直接 INSERT 負責 AM 表（super_admin）→ 應拒絕" "$(as_user $SU) INSERT INTO accommodation_responsible_am (accommodation_id, member_id) VALUES ('$(ACC 天送幸福和苑)', '$BELLA_P');"
t "一館兩位負責 AM（唯一索引）→ 應拒絕" "INSERT INTO accommodation_responsible_am (accommodation_id, member_id) VALUES ('$(ACC 哈庫納馬塔塔)', '$BELLA_P');"
t "不需要負責 AM：有負責人時拒絕；沒有時可標記，之後指定負責人會自動取消標記" "$(as_user $KEN) SELECT public.team_set_am_not_required('$(ACC 沐恩國際溫泉度假飯店)', true); SELECT public.team_set_responsible_am('$(ACC 沐恩國際溫泉度假飯店)', '$BELLA_P'); RESET ROLE; SELECT 'not_required=' || am_not_required FROM accommodation_am_settings; $(as_user $KEN) SELECT public.team_set_am_not_required('$(ACC 哈庫納馬塔塔)', true);"
t "館別停用（森山寫照）→ 負責 AM 自動結束、Synn 陣列少一館、hotel_admin 不收回" "UPDATE accommodation_info SET is_active=false WHERE id='$(ACC 森山寫照)'; SELECT 'end_reason=' || end_reason FROM accommodation_responsible_am WHERE accommodation_id='$(ACC 森山寫照)'; SELECT 'Synn 館數=' || cardinality(am_managed_accommodation_ids) FROM team_member_profiles WHERE id='$SYNN_P'; SELECT 'hotel_admin 仍在=' || count(*) FROM user_roles WHERE accommodation_id='$(ACC 森山寫照)' AND role='hotel_admin';"
t "AM 總管 Ken 移除 Bella 的 am 角色 → 只收回系統開的 hotel_admin" "SELECT 'Bella 套用前 hotel_admin=' || count(*) FROM user_roles WHERE user_id='$BELLA' AND role='hotel_admin'; $(as_user $KEN) DELETE FROM user_roles WHERE user_id='$BELLA' AND accommodation_id IS NULL AND role='am'; RESET ROLE; SELECT 'Bella 之後 hotel_admin=' || count(*) || '（應 = 手動開的筆數）', 'grants=' || (SELECT count(*) FROM am_hotel_admin_grants WHERE user_id='$BELLA') FROM user_roles WHERE user_id='$BELLA' AND role='hotel_admin';"
t "Synn 失去 am 角色 → 負責 AM 全部結束（member_not_eligible）" "$(as_user $KEN) DELETE FROM user_roles WHERE user_id='$SYNN' AND accommodation_id IS NULL AND role='am'; RESET ROLE; SELECT 'Synn 仍負責=' || count(*) FROM accommodation_responsible_am WHERE member_id='$SYNN_P' AND ended_at IS NULL; SELECT 'Synn 陣列=' || coalesce(am_managed_accommodation_ids::text,'NULL') FROM team_member_profiles WHERE id='$SYNN_P';"
t "Ken 幫新成員加 am 角色 → 自動開全部可協作館別的 hotel_admin；同交易內 Ken 加 hotel_admin 仍被擋（旗標已還原）" "INSERT INTO team_member_profiles (user_id, display_name) VALUES ('00000000-0000-0000-0000-0000000000b1', '新AM'); $(as_user $KEN) INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('00000000-0000-0000-0000-0000000000b1', NULL, 'am'); RESET ROLE; SELECT '新AM hotel_admin=' || count(*) || '／可協作館別=' || (SELECT count(*) FROM _am_collab_accommodation_ids()) FROM user_roles WHERE user_id='00000000-0000-0000-0000-0000000000b1' AND role='hotel_admin'; $(as_user $KEN) INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('00000000-0000-0000-0000-0000000000b1', '$(ACC 天送幸福和苑)', 'staff');"
t "成員檔停用 Elaine → 負責結束、系統開的收回" "UPDATE team_member_profiles SET is_active=false WHERE display_name LIKE 'Elaine%'; SELECT 'Elaine 仍負責=' || count(*) FROM accommodation_responsible_am r JOIN team_member_profiles p ON p.id=r.member_id WHERE p.display_name LIKE 'Elaine%' AND r.ended_at IS NULL;"
t "新增館別（上架中）→ 全體 AM 自動取得 hotel_admin" "INSERT INTO accommodation_info (id, name) VALUES ('00000000-0000-0000-0000-0000000000c1', '新館'); SELECT '新館 hotel_admin=' || count(*) || '／職代人數=' || (SELECT count(*) FROM _am_collab_user_ids()) FROM user_roles WHERE accommodation_id='00000000-0000-0000-0000-0000000000c1' AND role='hotel_admin';"
t "HQ 手動刪掉系統開的 hotel_admin → grants 同步刪除" "DELETE FROM user_roles r USING am_hotel_admin_grants g WHERE r.user_id=g.user_id AND r.accommodation_id=g.accommodation_id AND r.role='hotel_admin'; SELECT 'grants=' || count(*) FROM am_hotel_admin_grants;"
t "am_manages_accommodation：Bella（職代）可管哈庫納、Joyce（非 AM）不行" "$(as_user $SU) SELECT 'Bella=' || public.am_manages_accommodation('$BELLA', '$(ACC 哈庫納馬塔塔)') || ' Joyce=' || public.am_manages_accommodation('$JOYCE', '$(ACC 哈庫納馬塔塔)');"
t "總覽 RPC（Synn 可看）" "$(as_user $SYNN) SELECT accommodation_name || '｜負責=' || coalesce(responsible_name,'—') || '｜AM權限 ' || am_with_access || '/' || am_total || '｜其他=' || coalesce(array_to_string(other_hotel_admin_names,'、'),'—') || '+' || other_hotel_admin_unnamed || '｜KOL=' || coalesce(kol_venue_active::text,'—') || '｜額度=' || kol_quota_this_month FROM public.team_onboarding_overview() WHERE accommodation_name IN ('哈庫納馬塔塔','沐恩國際溫泉度假飯店','旅行日-十一鳴'); SELECT 'am_members=' || string_agg(display_name || (CASE WHEN can_be_responsible THEN '(可負責)' ELSE '' END), '、') FROM public.team_onboarding_am_members();"
t "總覽 RPC（Joyce 非 onboarding 角色）→ 應拒絕" "$(as_user $JOYCE) SELECT count(*) FROM public.team_onboarding_overview();"
t "負責 AM 表 RLS：Synn 可讀、Joyce 讀不到" "$(as_user $SYNN) SELECT 'Synn 可讀=' || count(*) FROM accommodation_responsible_am; RESET ROLE; $(as_user $JOYCE) SELECT 'Joyce 可讀=' || count(*) FROM accommodation_responsible_am;"

echo "== 重跑（應被 precheck 擋下）"; q -f "$M" 2>&1 | grep -o "PRECHECK 失敗：[^,]*" | head -1
echo "== rollback"; q -f "$RB" >/dev/null && echo "rollback ok；$(state)"
echo "hotel_admin 與套用前相同：$([ "$(qa -c "SELECT md5(string_agg(user_id||':'||accommodation_id, ',' ORDER BY user_id, accommodation_id)) FROM user_roles WHERE role='hotel_admin'")" = "$HA_BEFORE" ] && echo 是 || echo 否)"
echo "am_managed_accommodation_ids 與套用前相同：$([ "$(qa -c "SELECT md5(string_agg(id||':'||coalesce(am_managed_accommodation_ids::text,''), ',' ORDER BY id)) FROM team_member_profiles")" = "$AR_BEFORE" ] && echo 是 || echo 否)"
echo "== 只有讀取 user_roles 的長交易時套用（讀取不會被擋、應立即成功）"
q -f "$RB" >/dev/null 2>&1
P -d "$DB" -c "BEGIN; SELECT count(*) FROM user_roles; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== user_roles 有未提交的寫入 15 秒時套用（應約 3 秒失敗、無部分變更）"
q -f "$RB" >/dev/null 2>&1
P -d "$DB" -c "BEGIN; UPDATE user_roles SET updated_at = now() WHERE false; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" > /tmp/amonb_timed.out 2>&1; rc=$?; e=$(date +%s%N)
grep -o "ERROR:.*" /tmp/amonb_timed.out | head -1
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== 鎖釋放後再套用"; q -f "$M" >/dev/null 2>&1 && echo "ok；$(state)"
