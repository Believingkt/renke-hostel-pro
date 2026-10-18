-- 上架精靈正式庫測試：清理腳本（只處理測試館 ea55e271-15f8-4e63-9c4f-69fbd2022bc5）
-- 用法：把下方 _wz_param 的兩個值換成 prod_test_step1_readonly.sql (b) 的「測試開始時間」與「prev」（prev 為 NULL 就留 NULL），在 SQL Editor 整段執行
-- 1. 刪除測試開始後建立的房型、方案（含自動建立的專案）、季節價、庫存
-- 2. 送審狀態恢復成測試前的樣子（測試前沒有資料就刪除）；updated_at 會由既有 trigger 改成清理當下時間
-- 3. 安全條件：測試館必須未開賣、訂單數 = 0，否則整段中止；結束前再確認 is_active = false
BEGIN;
CREATE TEMP TABLE _wz_param AS
SELECT timestamptz '2026-10-20 10:00+08' AS t,
       NULL::jsonb AS prev;

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

DELETE FROM public.package_date_prices
WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);
DELETE FROM public.room_inventory_pricing
WHERE room_type_id IN (SELECT id FROM _wz_rt)
   OR (created_at >= (SELECT t FROM _wz_param)
       AND room_type_id IN (SELECT id FROM public.room_types WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'));
-- 方案刪除時，既有 trigger 會連同自動建立的專案一起刪
DELETE FROM public.accommodation_packages WHERE id IN (SELECT id FROM _wz_pkg);
DELETE FROM public.pricing_templates
WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND created_at >= (SELECT t FROM _wz_param);
DELETE FROM public.room_types WHERE id IN (SELECT id FROM _wz_rt);

-- 送審狀態恢復原貌（SQL Editor 執行時 auth.uid() 為 NULL，guard trigger 放行）
DELETE FROM public.accommodation_onboarding_steps
WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key = 'final_check'
  AND (SELECT prev FROM _wz_param) IS NULL;
UPDATE public.accommodation_onboarding_steps s
SET status = p.status, confirmed_by = p.confirmed_by, confirmed_at = p.confirmed_at, note = p.note,
    submitted_at = p.submitted_at, submitted_by = p.submitted_by, returned_at = p.returned_at,
    returned_by = p.returned_by, return_reason = p.return_reason
FROM jsonb_populate_record(NULL::public.accommodation_onboarding_steps, (SELECT prev FROM _wz_param)) p
WHERE (SELECT prev FROM _wz_param) IS NOT NULL
  AND s.accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND s.step_key = 'final_check';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND is_active = false) THEN
    RAISE EXCEPTION '測試館不是未開賣狀態，整段取消';
  END IF;
END $$;

-- 清理後檢查：筆數應與測試前快照 (a) 相同；送審狀態應與 prev 相同
SELECT 'room_types' AS t, count(*)::text FROM public.room_types WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'accommodation_packages', count(*)::text FROM public.accommodation_packages WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'pricing_templates', count(*)::text FROM public.pricing_templates WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'package_date_prices', count(*)::text FROM public.package_date_prices WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'room_inventory_pricing', count(*)::text FROM public.room_inventory_pricing r JOIN public.room_types t ON t.id = r.room_type_id WHERE t.accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'final_check', COALESCE((SELECT status FROM public.accommodation_onboarding_steps WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key = 'final_check'), '（無資料）')
UNION ALL SELECT 'is_active（必須 false）', (SELECT is_active::text FROM public.accommodation_info WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5')
UNION ALL SELECT 'orders（必須 0）', count(*)::text FROM public.orders WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5';
COMMIT;
