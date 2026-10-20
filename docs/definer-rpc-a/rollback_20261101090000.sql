-- 20261101090000 rollback：19 支 A 類函式的 PUBLIC／anon／authenticated／service_role 執行權，還原成 precheck 第 4 段（rollback_line）記錄的原狀
-- 下方「還原段」預填值＝附件正式庫清單（anon、authenticated 可執行）＋ service_role，且不含 PUBLIC；
-- 上線前務必以正式庫 precheck 第 4 段輸出的 19 行整段覆蓋「還原段」（原本有 PUBLIC 的才會出現 PUBLIC）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 歸零段（不要改）：先清掉四個對象的執行權，再依原狀補回
REVOKE EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_error_logs() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_monitoring_logs() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.consume_trip_product_stock(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_group_buy_campaign(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.gbp_vault_delete(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.increment_member_push_badge(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.seed_app_review_account(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_accommodation_ai_api_key(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_accommodation_api_key(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_owlting_service_account(text, text) FROM PUBLIC, anon, authenticated, service_role;

-- 還原段 BEGIN（以 precheck 第 4 段 rollback_line 的 19 行覆蓋）
GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, hotelnabe_ari_push_reason) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acquire_group_buy_payment_hold(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_room_inventory_pricing(jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_error_logs() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_monitoring_logs() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_trip_product_stock(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_group_buy_payment_draft(uuid, jsonb, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_buy_campaign(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gbp_save_accommodation_oauth_client_secret(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gbp_vault_delete(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_member_push_badge(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scan_stuck_group_buy_paid_drafts(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_app_review_account(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_accommodation_ai_api_key(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_accommodation_api_key(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_owlting_service_account(text, text) TO anon, authenticated, service_role;
-- 還原段 END

COMMIT;
