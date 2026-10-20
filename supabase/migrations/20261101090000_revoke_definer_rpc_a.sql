-- 20261101090000：收回 A 類 SECURITY DEFINER 函式的 PUBLIC／anon／authenticated 執行權限（不改任何函式內容）
-- A 類 18 支：只由 service role edge function、pg_cron（postgres）或其他 SECURITY DEFINER 函式／觸發器內部呼叫 → 收回 PUBLIC、anon、authenticated
-- _hotelnabe_enqueue_days：依核准只收回 PUBLIC、anon，保留 authenticated（觸發器改 DEFINER 列 B 類方案）
-- 所有 19 支明確 GRANT service_role；其餘 9 支（B 類 1、C 類 8）不動
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
DECLARE
  c_all CONSTANT text[] := ARRAY[
    'public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)',
    'public.acquire_group_buy_payment_hold(jsonb)',
    'public.bulk_upsert_room_inventory_pricing(jsonb, text)',
    'public.bulk_upsert_room_inventory_pricing(jsonb)',
    'public.cleanup_old_error_logs()',
    'public.cleanup_old_monitoring_logs()',
    'public.consume_trip_product_stock(jsonb)',
    'public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb)',
    'public.delete_group_buy_campaign(uuid)',
    'public.gbp_save_accommodation_oauth_client_secret(uuid, text)',
    'public.gbp_vault_delete(text)',
    'public.import_ryoan_order_bypass(jsonb, jsonb, jsonb)',
    'public.increment_member_push_badge(uuid, integer)',
    'public.recalc_course_profit_payouts(date)',
    'public.scan_stuck_group_buy_paid_drafts(integer)',
    'public.seed_app_review_account(uuid, text)',
    'public.verify_accommodation_ai_api_key(text)',
    'public.verify_accommodation_api_key(text)',
    'public.verify_owlting_service_account(text, text)'];
  c_full CONSTANT text[] := ARRAY['acquire_group_buy_payment_hold', 'bulk_upsert_room_inventory_pricing', 'cleanup_old_error_logs', 'cleanup_old_monitoring_logs', 'consume_trip_product_stock', 'convert_group_buy_payment_draft', 'delete_group_buy_campaign', 'gbp_save_accommodation_oauth_client_secret', 'gbp_vault_delete', 'import_ryoan_order_bypass', 'increment_member_push_badge', 'recalc_course_profit_payouts', 'scan_stuck_group_buy_paid_drafts', 'seed_app_review_account', 'verify_accommodation_ai_api_key', 'verify_accommodation_api_key', 'verify_owlting_service_account'];
  v_sig text;
  v_bad text;
BEGIN
  FOREACH v_sig IN ARRAY c_all LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'PRECHECK 失敗：函式不存在 %', v_sig;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig)) THEN
      RAISE EXCEPTION 'PRECHECK 失敗：% 不是 SECURITY DEFINER', v_sig;
    END IF;
  END LOOP;
  -- 不可有 SECURITY INVOKER 函式（含觸發器函式）呼叫要收回 authenticated 的 17 個函式名；否則館員操作會以自身身分呼叫而失敗
  SELECT string_agg(DISTINCT p.oid::regprocedure::text || '→' || n.nm, ', ') INTO v_bad
  FROM pg_proc p CROSS JOIN unnest(c_full) AS n(nm)
  WHERE p.pronamespace = 'public'::regnamespace AND NOT p.prosecdef AND p.proname <> n.nm AND p.prosrc ~ ('\m' || n.nm || '\M');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：有 SECURITY INVOKER 函式呼叫 A 類函式：%', v_bad;
  END IF;
  SELECT string_agg(DISTINCT pol.polname || '→' || n.nm, ', ') INTO v_bad
  FROM pg_policy pol CROSS JOIN unnest(c_full) AS n(nm)
  WHERE COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ ('\m' || n.nm || '\M');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：有 RLS policy 引用 A 類函式：%', v_bad;
  END IF;
END
$pre$;

REVOKE EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_error_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_monitoring_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_trip_product_stock(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_group_buy_campaign(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gbp_vault_delete(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_member_push_badge(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_app_review_account(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_accommodation_ai_api_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_accommodation_api_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_owlting_service_account(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_error_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_monitoring_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_trip_product_stock(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_buy_campaign(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_vault_delete(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_member_push_badge(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_app_review_account(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_accommodation_ai_api_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_accommodation_api_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_owlting_service_account(text, text) TO service_role;

-- 收回後確認：呼叫 A 類函式的 SECURITY DEFINER 函式（觸發器、convert→acquire 等），其擁有者仍可執行目標函式
DO $post$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT p.oid::regprocedure::text || '→' || t.oid::regprocedure::text, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_proc t ON t.pronamespace = 'public'::regnamespace AND t.oid <> p.oid
    AND t.proname IN ('_hotelnabe_enqueue_days', 'acquire_group_buy_payment_hold', 'bulk_upsert_room_inventory_pricing', 'cleanup_old_error_logs', 'cleanup_old_monitoring_logs', 'consume_trip_product_stock', 'convert_group_buy_payment_draft', 'delete_group_buy_campaign', 'gbp_save_accommodation_oauth_client_secret', 'gbp_vault_delete', 'import_ryoan_order_bypass', 'increment_member_push_badge', 'recalc_course_profit_payouts', 'scan_stuck_group_buy_paid_drafts', 'seed_app_review_account', 'verify_accommodation_ai_api_key', 'verify_accommodation_api_key', 'verify_owlting_service_account')
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prosrc ~ ('\m' || t.proname || '\M')
    AND NOT has_function_privilege(p.proowner, t.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：DEFINER 呼叫者的擁有者無法執行目標函式：%', v_bad;
  END IF;
  IF has_function_privilege('anon', 'public.bulk_upsert_room_inventory_pricing(jsonb, text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.seed_app_review_account(uuid, text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.gbp_vault_delete(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：授權未如預期';
  END IF;
END
$post$;

COMMIT;
