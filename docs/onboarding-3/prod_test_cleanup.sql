-- 上架精靈正式庫測試：清理腳本（只刪測試館 ea55e271-15f8-4e63-9c4f-69fbd2022bc5 在「這輪測試開始後」建立的資料）
-- 用法：把下方 _wz_param 的時間換成測試開始時間（prod_test_step1_readonly.sql 執行的時間），在 SQL Editor 整段執行
-- 安全條件：測試館必須未開賣、訂單數 = 0，否則整段中止，不刪任何資料
BEGIN;
CREATE TEMP TABLE _wz_param AS SELECT timestamptz '2026-10-20 10:00+08' AS t;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5') THEN
    RAISE EXCEPTION '測試館已有訂單，中止清理';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND is_active = false) THEN
    RAISE EXCEPTION '測試館不存在或已開賣，中止清理';
  END IF;
END $$;

CREATE TEMP TABLE _wz_rt AS SELECT id FROM public.room_types
  WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);
CREATE TEMP TABLE _wz_pkg AS SELECT id FROM public.accommodation_packages
  WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);

DELETE FROM public.package_date_prices WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);
DELETE FROM public.room_inventory_pricing WHERE room_type_id IN (SELECT id FROM _wz_rt) OR (created_at >= (SELECT t FROM _wz_param)
  AND room_type_id IN (SELECT id FROM public.room_types WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'));
-- 方案刪除時，既有 trigger 會連同自動建立的專案一起刪（方案無訂單、無 OTA 對應）
DELETE FROM public.accommodation_packages WHERE id IN (SELECT id FROM _wz_pkg);
DELETE FROM public.pricing_templates WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);
DELETE FROM public.room_types WHERE id IN (SELECT id FROM _wz_rt);
-- 送審／退回狀態改回 pending（auth.uid() 為 NULL，guard trigger 放行）
UPDATE public.accommodation_onboarding_steps
SET status = 'pending', submitted_at = NULL, submitted_by = NULL, returned_at = NULL, returned_by = NULL, return_reason = NULL
WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key = 'final_check';

-- 清理後檢查：與測試前快照比對
SELECT 'room_types' AS t, count(*) FROM public.room_types WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'accommodation_packages', count(*) FROM public.accommodation_packages WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'pricing_templates', count(*) FROM public.pricing_templates WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'package_date_prices', count(*) FROM public.package_date_prices WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'orders（必須 0）', count(*) FROM public.orders WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5';
COMMIT;
