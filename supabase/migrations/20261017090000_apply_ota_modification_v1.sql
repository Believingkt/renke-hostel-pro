-- 20261017090000_apply_ota_modification_v1.sql
-- 目的：OTA（奧丁丁）修改信改為「只改差異」並在單一交易內完成：
--   新增 apply_ota_modification_v1（update_order_with_context → sync_order_rooms_v1 → 回傳 conflicts）
--   新增 owlting_email_orders_raw.mail_sent_at（信件 Date 標頭）
-- 不動：sync_order_rooms_v1、update_order_with_context、change_order_dates、order_rooms／orders 所有 trigger
-- 指紋算法：md5(pg_get_functiondef(oid)) / length(pg_get_functiondef(oid))（與每日 RPC 合約檢查一致）

-- ============================= PRECHECK =============================
DO $pre$
DECLARE
  v_sync oid := to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)');
  v_uowc oid := to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)');
  v_def text; v_secdef boolean; v_trg text;
BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'apply_ota_modification_v1') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：apply_ota_modification_v1 已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'owlting_email_orders_raw' AND column_name = 'mail_sent_at') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：owlting_email_orders_raw.mail_sent_at 已存在，疑似已套用過本 migration';
  END IF;

  IF v_sync IS NULL THEN RAISE EXCEPTION 'PRECHECK 失敗：sync_order_rooms_v1 不存在'; END IF;
  SELECT pg_get_functiondef(v_sync), p.prosecdef INTO v_def, v_secdef FROM pg_proc p WHERE p.oid = v_sync;
  IF md5(v_def) <> '8cc1ae289015f64c2d16801600af8cb2' OR length(v_def) <> 4767 OR v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'PRECHECK 失敗：sync_order_rooms_v1 與設計基準不符（md5 %, len %, secdef %）', md5(v_def), length(v_def), v_secdef;
  END IF;

  IF v_uowc IS NULL THEN RAISE EXCEPTION 'PRECHECK 失敗：update_order_with_context(8 參數) 不存在'; END IF;
  SELECT pg_get_functiondef(v_uowc), p.prosecdef INTO v_def, v_secdef FROM pg_proc p WHERE p.oid = v_uowc;
  IF md5(v_def) <> '7d7e88fcecddcab46c798c5916a1bed0' OR length(v_def) <> 3508 OR v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_order_with_context 與設計基準不符（md5 %, len %, secdef %）', md5(v_def), length(v_def), v_secdef;
  END IF;

  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：order_rooms trigger 數量不是 5';
  END IF;
  SELECT pg_get_triggerdef(t.oid) INTO v_trg FROM pg_trigger t
   WHERE t.tgrelid = 'public.order_rooms'::regclass AND t.tgname = 'validate_order_rooms_inventory_trigger' AND NOT t.tgisinternal;
  IF v_trg IS NULL OR position('BEFORE INSERT OR UPDATE ON public.order_rooms' in v_trg) = 0 OR position(' WHEN ' in v_trg) > 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：validate_order_rooms_inventory_trigger 定義非預期（%）', v_trg;
  END IF;
  SELECT pg_get_triggerdef(t.oid) INTO v_trg FROM pg_trigger t
   WHERE t.tgrelid = 'public.order_rooms'::regclass AND t.tgname = 'trg_validate_room_unit_no_conflict' AND NOT t.tgisinternal;
  IF v_trg IS NULL OR position('UPDATE OF room_unit_id' in v_trg) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：trg_validate_room_unit_no_conflict 定義非預期（%）', v_trg;
  END IF;
END
$pre$;

-- ============================== 主體 ==============================
CREATE FUNCTION public.apply_ota_modification_v1(
  p_order_id     uuid,
  p_patch        jsonb,
  p_expect       jsonb,
  p_source       text,
  p_reason       text,
  p_actor_label  text,
  p_sync_rooms   boolean,
  p_rooms        jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role text;
  v_n    integer;
  v_sync jsonb := NULL;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  IF p_order_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_order_id / p_patch required' USING ERRCODE = 'P0001';
  END IF;
  IF p_sync_rooms AND (p_rooms IS NULL OR jsonb_typeof(p_rooms) <> 'array' OR jsonb_array_length(p_rooms) = 0) THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_rooms required when p_sync_rooms' USING ERRCODE = 'P0001';
  END IF;

  v_n := public.update_order_with_context(
    p_order_id, p_patch, p_source, p_reason, p_actor_label, 'system', p_expect, NULL);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ORDER_CHANGED: 訂單在比對後已被修改或不存在' USING ERRCODE = 'P0001';
  END IF;

  IF p_sync_rooms THEN
    v_sync := public.sync_order_rooms_v1(p_order_id, NULL, p_rooms);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_updated', v_n,
    'synced', p_sync_rooms,
    'conflicts', coalesce(v_sync -> 'conflicts', '[]'::jsonb),
    'sync', v_sync
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)
  TO service_role;
COMMENT ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb) IS
  '2b：OTA 修改信單一交易套用（update_order_with_context → sync_order_rooms_v1 → conflicts）';

ALTER TABLE public.owlting_email_orders_raw ADD COLUMN mail_sent_at timestamptz NULL;
COMMENT ON COLUMN public.owlting_email_orders_raw.mail_sent_at IS
  '信件標頭 Date（headers 行首錨定解析）；解析失敗為 NULL；舊資料不回填';

-- ============================= POSTCHECK =============================
DO $post$
DECLARE
  v_sig  text := 'public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)';
  v_new  oid  := to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)');
  v_def  text;
BEGIN
  IF v_new IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_new) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：apply_ota_modification_v1 未建立或非 SECURITY DEFINER';
  END IF;
  IF NOT coalesce((SELECT 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = v_new), false) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：search_path 未設定';
  END IF;
  IF has_function_privilege('anon', v_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR has_function_privilege('public', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：PUBLIC／anon／authenticated 仍可執行新函式';
  END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：service_role 無法執行新函式';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)')) INTO v_def;
  IF md5(v_def) <> '8cc1ae289015f64c2d16801600af8cb2' OR length(v_def) <> 4767 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：sync_order_rooms_v1 指紋改變';
  END IF;
  SELECT pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)')) INTO v_def;
  IF md5(v_def) <> '7d7e88fcecddcab46c798c5916a1bed0' OR length(v_def) <> 3508 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context 指紋改變';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'owlting_email_orders_raw'
                   AND column_name = 'mail_sent_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：mail_sent_at 欄位不正確';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：order_rooms trigger 數量改變';
  END IF;
END
$post$;

-- ============================== ROLLBACK ==============================
-- 執行 docs/ota-modification/rollback_20261017090000.sql 全文；順序：
--   (1) 先把 Edge Functions 回退到 fc59fa2 版（ingest 不再寫 mail_sent_at、不再呼叫新函式）
--   (2) DO 檢查 → DROP FUNCTION → DROP COLUMN → DO 檢查函式與欄位皆已不存在、兩支既有函式指紋不變
--   已寫入的 ingest_outcome = stale_ignored / modify_blocked 為 text 值，保留不影響。
