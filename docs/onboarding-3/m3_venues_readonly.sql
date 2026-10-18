-- 上架精靈 M3：正式庫唯讀驗證（套用 20261018120000 前後都可以跑；只有 SELECT）
-- 第 1 段（套用前）：預測每間館的判斷結果
--   規則：套用當下已存在的館，除了測試館 ea55e271-15f8-4e63-9c4f-69fbd2022bc5，一律視為「曾開賣」
--         回填時間 = 最早一筆訂單 created_at；沒有訂單 = 套用 migration 的時間
--   只有「從未開賣」的館（first_activated_at 為 NULL）在總部第一次核准時會被 M3 硬擋
SELECT a.name,
       a.id,
       a.is_active                                         AS 目前開賣中,
       (SELECT count(*) FROM public.orders o WHERE o.accommodation_id = a.id) AS 訂單數,
       (SELECT min(o.created_at) FROM public.orders o WHERE o.accommodation_id = a.id) AS 最早訂單時間,
       CASE WHEN a.id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' THEN '從未開賣（測試館）' ELSE '曾開賣' END AS 判斷,
       CASE WHEN a.id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' THEN '首次核准會被硬擋（須送審＋紅色全過）'
            ELSE '暫停／重新開賣都不受影響' END AS M3影響,
       CASE WHEN a.id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' THEN '不回填（NULL）'
            WHEN EXISTS (SELECT 1 FROM public.orders o WHERE o.accommodation_id = a.id) THEN '最早訂單時間'
            ELSE '套用 migration 的時間' END AS 回填來源
FROM public.accommodation_info a
ORDER BY a.is_active DESC, a.name;

-- 第 2 段：總數（預期：開賣中 16、停用 4〔3 間舊館＋測試館〕、會被硬擋 1）
SELECT count(*) AS 全部館數,
       count(*) FILTER (WHERE is_active) AS 開賣中,
       count(*) FILTER (WHERE NOT is_active) AS 停用,
       count(*) FILTER (WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5') AS 會被硬擋
FROM public.accommodation_info;

-- 第 3 段（套用 20261018120000 之後才跑）：實際回填結果，「會被硬擋」應只有測試館
-- SELECT name, is_active, first_activated_at, first_activated_at IS NULL AS 會被硬擋
-- FROM public.accommodation_info ORDER BY first_activated_at IS NULL DESC, name;
