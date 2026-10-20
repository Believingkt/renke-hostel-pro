-- 緊急：收回 update_order_with_context 與 change_order_dates 的對外執行權限（不修改任何函式內容）
-- update_order_with_context：只留 service_role（以及擁有者 postgres）；所有呼叫端皆為 edge function service role，
--   或 SECURITY DEFINER 函式 apply_ota_modification_v1 內部呼叫（以擁有者 postgres 身分檢查權限，不受影響）。
-- change_order_dates：收回 PUBLIC 與 anon；authenticated、service_role 維持（函式內權限檢查另於下一支 migration 處理）。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)';
  END IF;
  IF to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 change_order_dates(uuid, date, date, text, text, text)';
  END IF;
END
$pre$;

REVOKE EXECUTE ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.change_order_dates(uuid, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_order_dates(uuid, date, date, text, text, text) TO authenticated, service_role;

DO $post$
BEGIN
  IF has_function_privilege('anon', 'public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context 授權不符預期';
  END IF;
  IF has_function_privilege('anon', 'public.change_order_dates(uuid, date, date, text, text, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.change_order_dates(uuid, date, date, text, text, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.change_order_dates(uuid, date, date, text, text, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：change_order_dates 授權不符預期';
  END IF;
END
$post$;

COMMIT;
