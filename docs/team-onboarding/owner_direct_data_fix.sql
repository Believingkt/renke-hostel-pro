-- 業主自帶開關資料調整（請在 Supabase SQL Editor 依段落執行）
-- 範圍：只改天送幸福和苑 3 筆（102496、102662、102923）owner_direct → false
-- 良辰暖居、雲岫請改用「業主月結設定」頁面勾選，不在此 SQL 內

-- ============================================================
-- 步驟 1：備份所有 owner_direct = true 的訂單（刪開關前的完整紀錄）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.owner_direct_backup_20260601 AS
SELECT o.id AS order_id, o.accommodation_id, o.order_number, o.owner_direct, o.order_source, now() AS backed_up_at
FROM public.orders o
WHERE o.owner_direct = true;

ALTER TABLE public.owner_direct_backup_20260601 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_direct_backup_20260601 FROM anon, authenticated;

SELECT count(*) AS 備份筆數 FROM public.owner_direct_backup_20260601;

-- ============================================================
-- 步驟 2：天送 3 筆改回正常抽成（觸發器會自動重建 KOL 分潤紀錄）
-- ============================================================
BEGIN;

UPDATE public.orders o
SET owner_direct = false
FROM public.accommodation_info a
WHERE a.id = o.accommodation_id
  AND a.name = '天送幸福和苑'
  AND o.order_number IN ('102496', '102662', '102923')
  AND o.owner_direct = true;
-- 預期：UPDATE 3

SELECT o.order_number AS 訂單編號, o.owner_direct AS 開關, o.discount_code AS 折扣碼,
       c.commission_rate AS 分潤比例, c.commission_amount AS 分潤金額, c.settlement_status AS 結算狀態
FROM public.orders o
JOIN public.accommodation_info a ON a.id = o.accommodation_id
LEFT JOIN public.commission_records c ON c.order_id = o.id
WHERE a.name = '天送幸福和苑' AND o.order_number IN ('102496', '102662', '102923');
-- 確認無誤再執行 COMMIT；有疑問改執行 ROLLBACK
COMMIT;

-- ============================================================
-- 還原用（需要時才執行）：把這 3 筆的開關改回備份時的值
-- ============================================================
-- UPDATE public.orders o
-- SET owner_direct = b.owner_direct
-- FROM public.owner_direct_backup_20260601 b
-- WHERE b.order_id = o.id
--   AND b.order_number IN ('102496', '102662', '102923');
