-- RPC 合約漂移每日檢查：告警開關欄位 + 唯讀查詢函式 + 每日排程
-- 全部為 additive 變更，precheck/postcheck 皆在同一交易內完成。

BEGIN;

-- ============ PART 1: alert_recipients 新增 notify_rpc_contract_drift ============
DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 10 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: alert_recipients cols=% (expected 10)', v_cols;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='alert_recipients'
               AND column_name='notify_rpc_contract_drift') THEN
    RAISE EXCEPTION 'PRECHECK FAILED: column already exists';
  END IF;
  RAISE NOTICE 'PRECHECK OK: alert_recipients cols=10';
END $$;

ALTER TABLE public.alert_recipients
  ADD COLUMN notify_rpc_contract_drift boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alert_recipients.notify_rpc_contract_drift
  IS '是否接收「RPC 定義／白名單與測試快照不一致」技術告警';

DO $$
DECLARE v_cols int; r record; v_bad int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 11 THEN RAISE EXCEPTION 'POSTCHECK FAILED: cols=%', v_cols; END IF;

  SELECT * INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients'
    AND column_name='notify_rpc_contract_drift';
  IF r IS NULL OR r.data_type <> 'boolean' OR r.is_nullable <> 'NO' OR r.column_default <> 'true' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: unexpected column def';
  END IF;

  SELECT count(*) INTO v_bad FROM public.alert_recipients
  WHERE notify_rpc_contract_drift IS NOT TRUE;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAILED: % rows not true', v_bad; END IF;
  RAISE NOTICE 'POSTCHECK OK: alert_recipients cols=11';
END $$;

-- ============ PART 2: get_rpc_contract（唯讀，建立即收權） ============
DO $$
BEGIN
  IF to_regprocedure('public.get_rpc_contract(text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK FAILED: get_rpc_contract already exists';
  END IF;
  RAISE NOTICE 'PRECHECK OK: get_rpc_contract not present';
END $$;

CREATE FUNCTION public.get_rpc_contract(p_names text[])
RETURNS TABLE(fn_name text, src_md5 text, src_len int, src_def text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.proname::text,
         md5(pg_get_functiondef(p.oid)),
         length(pg_get_functiondef(p.oid)),
         pg_get_functiondef(p.oid)
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = ANY(p_names)
$function$;

REVOKE ALL ON FUNCTION public.get_rpc_contract(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rpc_contract(text[]) TO service_role;

DO $$
DECLARE v_anon bool; v_auth bool; v_svc bool; v_acl text;
BEGIN
  SELECT proacl::text INTO v_acl FROM pg_proc
  WHERE oid = to_regprocedure('public.get_rpc_contract(text[])');
  IF v_acl LIKE '{=X/%' OR v_acl LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: PUBLIC 仍有 EXECUTE (acl=%)', v_acl;
  END IF;
  IF v_acl LIKE '%anon=X%' OR v_acl LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: anon/authenticated 仍有直接授權 (acl=%)', v_acl;
  END IF;

  v_anon := has_function_privilege('anon','public.get_rpc_contract(text[])','EXECUTE');
  v_auth := has_function_privilege('authenticated','public.get_rpc_contract(text[])','EXECUTE');
  v_svc  := has_function_privilege('service_role','public.get_rpc_contract(text[])','EXECUTE');
  IF v_anon OR v_auth OR NOT v_svc THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: privileges anon=% authenticated=% service_role=%', v_anon, v_auth, v_svc;
  END IF;
  RAISE NOTICE 'POSTCHECK OK: acl=% anon=% authenticated=% service_role=%', v_acl, v_anon, v_auth, v_svc;
END $$;

-- ============ PART 3: 每日排程（台北 05:20） ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rpc-contract-check-daily') THEN
    PERFORM cron.unschedule('rpc-contract-check-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'rpc-contract-check-daily',
  '20 21 * * *',
  $$
  select net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/rpc-contract-check',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname='rpc-contract-check-daily' AND schedule='20 21 * * *';
  IF v_n <> 1 THEN RAISE EXCEPTION 'POSTCHECK FAILED: cron job not registered'; END IF;
  RAISE NOTICE 'POSTCHECK OK: cron job registered';
END $$;

COMMIT;
