-- 價格頁整合第 1 批：三項調查的唯讀 SQL（全部只有 SELECT）

-- ===== 調查 1：雲岫兩張專案對錯的官網訂單 =====
-- 1a. 找出訂單（建立日或入住日符合皆列出）與目前寫入的方案、專案、專案綁定的方案
SELECT o.order_number AS 訂單編號, o.created_at AS 建立時間, o.check_in_date AS 入住, o.check_out_date AS 退房,
       o.order_source AS 來源, o.payment_provider AS 金流, o.payment_method AS 付款方式,
       o.guest_count AS 人數, o.adult_count AS 大人,
       p.name AS 方案, t.template_name AS 寫入專案, tp.name AS 該專案綁定的方案,
       (SELECT string_agg(t2.template_name || '（建立 ' || t2.created_at::date || '）', '、')
          FROM public.pricing_templates t2 WHERE t2.default_package_id = o.package_id) AS 方案目前綁定的專案,
       o.final_price AS 實付, o.discount_code AS 折扣碼, o.id
FROM public.orders o
LEFT JOIN public.accommodation_packages p ON p.id = o.package_id
LEFT JOIN public.pricing_templates t ON t.id = o.pricing_template_id
LEFT JOIN public.accommodation_packages tp ON tp.id = t.default_package_id
WHERE o.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8'
  AND ((p.name LIKE '%16人%' AND t.template_name LIKE '%海景四人%' AND '2026-09-19' IN (o.created_at::date::text, o.check_in_date::text))
    OR (p.name LIKE '%14人%' AND t.template_name LIKE '%6人%' AND '2026-10-12' IN (o.created_at::date::text, o.check_in_date::text)))
ORDER BY o.created_at;

-- 1b. 這兩張訂單的異動紀錄：是否事後改過方案、人數、專案（pricing_template_id 只記「有變」）
WITH tgt AS (
  SELECT o.id FROM public.orders o
  JOIN public.accommodation_packages p ON p.id = o.package_id
  JOIN public.pricing_templates t ON t.id = o.pricing_template_id
  WHERE o.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8'
    AND ((p.name LIKE '%16人%' AND t.template_name LIKE '%海景四人%' AND '2026-09-19' IN (o.created_at::date::text, o.check_in_date::text))
      OR (p.name LIKE '%14人%' AND t.template_name LIKE '%6人%' AND '2026-10-12' IN (o.created_at::date::text, o.check_in_date::text)))
)
SELECT l.order_number AS 訂單編號, l.changed_at AS 時間, l.op AS 動作, l.source AS 來源, l.actor_type AS 身分, l.actor_label AS 操作者,
       f ->> 'field' AS 欄位,
       CASE WHEN f ->> 'field' = 'package_id'
            THEN (SELECT name FROM public.accommodation_packages WHERE id::text = f ->> 'from') ELSE f ->> 'from' END AS 原值,
       CASE WHEN f ->> 'field' = 'package_id'
            THEN (SELECT name FROM public.accommodation_packages WHERE id::text = f ->> 'to') ELSE f ->> 'to' END AS 新值
FROM public.order_change_log l
CROSS JOIN LATERAL jsonb_array_elements(l.changed_fields) f
WHERE l.order_id IN (SELECT id FROM tgt)
  AND f ->> 'field' IN ('__created', 'package_id', 'guest_count', 'adult_count', 'pricing_template_id', 'room_type_id',
                         'check_in_date', 'check_out_date', 'total_price', 'final_price', 'order_source')
ORDER BY l.order_number, l.changed_at;

-- 1c. 建單時前台送出的內容（信用卡一次付清才有草稿）：前台傳的方案、專案（找不到綁定專案時後端會用這個）
SELECT o.order_number AS 訂單編號, d.created_at AS 草稿時間, d.status AS 草稿狀態,
       d.order_payload ->> 'packageId' AS 前台方案id,
       (SELECT name FROM public.accommodation_packages WHERE id::text = d.order_payload ->> 'packageId') AS 前台方案,
       COALESCE(d.order_payload ->> 'pricingTemplateId', d.order_payload ->> 'pricing_template_id') AS 前台專案id,
       (SELECT template_name FROM public.pricing_templates
         WHERE id::text = COALESCE(d.order_payload ->> 'pricingTemplateId', d.order_payload ->> 'pricing_template_id')) AS 前台專案,
       d.order_payload ->> 'totalGuests' AS 前台人數
FROM public.pending_paid_order_drafts d
JOIN public.orders o ON o.id = d.order_id
WHERE o.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8'
  AND o.created_at::date IN ('2026-09-19', '2026-10-12')
ORDER BY d.created_at;

-- 1d. 雲岫：方案與專案綁定現況＋專案建立時間（看下單當時方案有沒有綁定專案）
SELECT p.name AS 方案, p.numeric_code AS 方案代碼, p.enabled AS 啟用, p.created_at::date AS 方案建立,
       t.template_name AS 綁定專案, t.numeric_code AS 專案代碼, t.created_at AS 專案建立, t.updated_at AS 專案更新
FROM public.accommodation_packages p
LEFT JOIN public.pricing_templates t ON t.default_package_id = p.id
WHERE p.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8'
ORDER BY p.display_order NULLS LAST, p.name;

-- 1e. 全館掃描：官網訂單「寫入專案綁定的方案 ≠ 訂單方案」（近 365 天），看是否不只這兩張
SELECT a.name AS 館別, count(*) AS 筆數,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.order_change_log l, jsonb_array_elements(l.changed_fields) f
                                      WHERE l.order_id = o.id AND f ->> 'field' = 'package_id' AND l.op = 'update')) AS 其中事後改過方案,
       string_agg(o.order_number, '、' ORDER BY o.created_at DESC) FILTER (WHERE o.created_at >= now() - interval '60 days') AS 近60天訂單編號
FROM public.orders o
JOIN public.accommodation_info a ON a.id = o.accommodation_id
JOIN public.pricing_templates t ON t.id = o.pricing_template_id
WHERE o.created_at >= now() - interval '365 days'
  AND o.package_id IS NOT NULL
  AND t.default_package_id IS DISTINCT FROM o.package_id
  AND o.order_source NOT IN ('manual', 'owlting', 'hotelnabe', 'group_buy')
GROUP BY a.name
ORDER BY 筆數 DESC;

-- ===== 調查 2：前台與後端日型判斷不一致的假日資料（今天以後） =====
-- 前台 BookingFlow 讀假日沒過濾類型（任何類型都算假日價）；後端只把 holiday、compensatory_day_off 當假日
SELECT a.name AS 館別, h.holiday_date AS 日期,
       to_char(h.holiday_date, 'Dy') AS 星期, h.holiday_type AS 類型, h.holiday_name AS 名稱, h.is_custom AS 館別自訂,
       '假日' AS 前台日型,
       CASE WHEN EXTRACT(DOW FROM h.holiday_date) IN (0, 5) THEN '旺日' ELSE '平日' END AS 後端日型
FROM public.public_holidays h
JOIN public.accommodation_info a ON a.id = h.accommodation_id
WHERE h.holiday_date >= CURRENT_DATE
  AND h.holiday_type NOT IN ('holiday', 'compensatory_day_off')
  AND EXTRACT(DOW FROM h.holiday_date) <> 6
  AND NOT EXISTS (SELECT 1 FROM public.public_holidays h2
                  WHERE h2.accommodation_id = h.accommodation_id AND h2.holiday_date = h.holiday_date
                    AND h2.holiday_type IN ('holiday', 'compensatory_day_off'))
ORDER BY a.name, h.holiday_date;

-- 2b. 彙總：各類型 × 星期的筆數（今天以後），確認補班日是否都在星期六
SELECT h.holiday_type AS 類型, to_char(h.holiday_date, 'Dy') AS 星期, count(*) AS 筆數, count(DISTINCT h.accommodation_id) AS 館數,
       min(h.holiday_date) AS 最早, max(h.holiday_date) AS 最晚
FROM public.public_holidays h
WHERE h.holiday_date >= CURRENT_DATE
GROUP BY 1, 2, EXTRACT(DOW FROM h.holiday_date)
ORDER BY 1, EXTRACT(DOW FROM h.holiday_date);

-- ===== 調查 3：一個方案、多個專案的館（四季山宿、奧莉薇雅、櫻家小築） =====
WITH acc AS (
  SELECT id, name FROM public.accommodation_info
  WHERE name LIKE '%四季山宿%' OR name LIKE '%奧莉薇雅%' OR name LIKE '%櫻家小築%'
)
SELECT acc.name AS 館別,
       (SELECT string_agg(p.name || CASE WHEN p.enabled THEN '' ELSE '（停用）' END, '、') FROM public.accommodation_packages p WHERE p.accommodation_id = acc.id) AS 方案,
       t.template_name AS 專案, t.project_name AS 專案名稱欄, t.numeric_code AS 代碼, t.display_order AS 排序,
       (SELECT p.name FROM public.accommodation_packages p WHERE p.id = t.default_package_id) AS 綁定方案,
       (SELECT string_agg(rt.name, '、') FROM public.room_types rt WHERE rt.id = t.room_type_id OR rt.id = ANY (t.room_type_ids)) AS 房型,
       t.weekday_price AS 平日, t.peak_price AS 旺日, t.weekend_price AS 假日,
       CASE WHEN jsonb_typeof(t.season_segments) = 'array' THEN jsonb_array_length(t.season_segments) ELSE 0 END AS 季節區段數,
       (SELECT count(*) FROM public.orders o WHERE o.pricing_template_id = t.id AND o.created_at >= now() - interval '365 days'
          AND o.order_source NOT IN ('manual', 'owlting', 'hotelnabe', 'group_buy')) AS 近一年官網訂單,
       (SELECT count(*) FROM public.orders o WHERE o.pricing_template_id = t.id AND o.created_at >= now() - interval '365 days'
          AND o.order_source = 'manual') AS 近一年後台訂單,
       (SELECT max(o.created_at)::date FROM public.orders o WHERE o.pricing_template_id = t.id) AS 最後訂單日,
       (SELECT count(*) FROM public.discount_codes dc WHERE dc.is_active AND dc.applicable_pricing_template_ids ? t.id::text) AS 有效折扣碼數,
       (SELECT count(*) FROM public.room_inventory_pricing r WHERE r.pricing_template_id = t.id AND r.date >= CURRENT_DATE) AS 未來專案單日價
FROM acc
JOIN public.pricing_templates t ON t.accommodation_id = acc.id
ORDER BY acc.name, 近一年官網訂單 DESC, t.display_order NULLS LAST;
