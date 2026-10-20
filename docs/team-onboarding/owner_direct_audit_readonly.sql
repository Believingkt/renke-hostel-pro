-- 唯讀查詢：業主自帶開關（owner_direct）影響盤點。全部只有 SELECT，不會修改資料。
-- 免抽成來源判斷邏輯與 create_commission_record() 觸發器一致：
--   館別規則（effective_from <= 訂單日期月初，取最新）→ 館別舊設定 → 全域舊設定

-- ============================================================
-- 查詢 1：只靠開關才不抽成的訂單明細（預期 20 筆）
-- ============================================================
WITH o AS (
  SELECT o.*, date_trunc('month', COALESCE(o.order_date, now()))::date AS rule_month
  FROM public.orders o
  WHERE o.owner_direct = true
),
ex AS (
  SELECT o.id,
    COALESCE(
      (SELECT to_jsonb(r.exempt_order_sources) FROM public.owner_settlement_pricing_rules r
        WHERE r.accommodation_id = o.accommodation_id AND r.effective_from <= o.rule_month
        ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config:' || o.accommodation_id::text LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config' LIMIT 1),
      '[]'::jsonb
    ) AS srcs
  FROM o
)
SELECT
  a.name                                   AS 館別,
  o.order_number                           AS 訂單編號,
  o.guest_name                             AS 旅客,
  o.order_date::date                       AS 訂單日期,
  o.check_in_date                          AS 入住,
  o.check_out_date                         AS 退房,
  o.final_price                            AS 金額,
  o.currency_at_booking                    AS 幣別,
  o.order_status                           AS 訂單狀態,
  o.order_source                           AS 目前來源,
  o.discount_code                          AS 折扣碼,
  ex.srcs                                  AS 該館免抽成來源清單,
  EXISTS (SELECT 1 FROM public.closer_commission_snapshots c WHERE c.order_id = o.id) AS 有成交獎金快照
FROM o
JOIN ex ON ex.id = o.id
JOIN public.accommodation_info a ON a.id = o.accommodation_id
WHERE o.order_source IS NULL OR NOT (ex.srcs ? o.order_source)
ORDER BY a.name, o.order_date;


-- ============================================================
-- 查詢 2：開關打開、但來源不是「業主自帶」的訂單明細（天送 22 筆，其他館一併列出）
-- 「來源本身就免抽成」= 是 → 就算拿掉開關也不會變抽成
-- ============================================================
WITH o AS (
  SELECT o.*, date_trunc('month', COALESCE(o.order_date, now()))::date AS rule_month
  FROM public.orders o
  WHERE o.owner_direct = true
    AND o.order_source IS DISTINCT FROM 'owner_provided'
),
ex AS (
  SELECT o.id,
    COALESCE(
      (SELECT to_jsonb(r.exempt_order_sources) FROM public.owner_settlement_pricing_rules r
        WHERE r.accommodation_id = o.accommodation_id AND r.effective_from <= o.rule_month
        ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config:' || o.accommodation_id::text LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config' LIMIT 1),
      '[]'::jsonb
    ) AS srcs
  FROM o
)
SELECT
  a.name                                   AS 館別,
  o.order_number                           AS 訂單編號,
  o.guest_name                             AS 旅客,
  o.order_date::date                       AS 訂單日期,
  o.check_in_date                          AS 入住,
  o.final_price                            AS 金額,
  o.order_status                           AS 訂單狀態,
  o.order_source                           AS 目前來源,
  COALESCE(ex.srcs ? o.order_source, false) AS 來源本身就免抽成
FROM o
JOIN ex ON ex.id = o.id
JOIN public.accommodation_info a ON a.id = o.accommodation_id
ORDER BY a.name, 來源本身就免抽成, o.order_date;


-- ============================================================
-- 查詢 3：模擬「把只靠開關的訂單來源改成業主自帶 + 該館免抽成清單補上業主自帶」
-- 後，每館每月免抽成金額會不會變。只列出「會變」的訂單；
-- 查不到任何資料 = 已結算月份金額完全對得上。
-- ============================================================
WITH o AS (
  SELECT o.*, date_trunc('month', COALESCE(o.order_date, now()))::date AS rule_month
  FROM public.orders o
),
ex AS (
  SELECT o.id,
    COALESCE(
      (SELECT to_jsonb(r.exempt_order_sources) FROM public.owner_settlement_pricing_rules r
        WHERE r.accommodation_id = o.accommodation_id AND r.effective_from <= o.rule_month
        ORDER BY r.effective_from DESC, r.created_at DESC LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config:' || o.accommodation_id::text LIMIT 1),
      (SELECT s.setting_value -> 'exempt_order_sources' FROM public.system_settings s
        WHERE s.setting_key = 'owner_settlement_config' LIMIT 1),
      '[]'::jsonb
    ) AS srcs
  FROM o
),
sim AS (
  SELECT o.*, ex.srcs,
    (COALESCE(o.owner_direct, false) OR COALESCE(ex.srcs ? o.order_source, false)) AS before_exempt,
    CASE WHEN COALESCE(o.owner_direct, false) AND NOT COALESCE(ex.srcs ? o.order_source, false)
         THEN 'owner_provided' ELSE o.order_source END AS new_source,
    CASE WHEN ex.srcs ? 'owner_provided' THEN ex.srcs ELSE ex.srcs || '["owner_provided"]'::jsonb END AS new_srcs
  FROM o JOIN ex ON ex.id = o.id
)
SELECT
  a.name                                   AS 館別,
  to_char(s.rule_month, 'YYYY-MM')         AS 月份,
  s.order_number                           AS 訂單編號,
  s.final_price                            AS 金額,
  s.order_source                           AS 目前來源,
  s.owner_direct                           AS 目前開關,
  s.before_exempt                          AS 現在免抽成,
  COALESCE(s.new_srcs ? s.new_source, false) AS 調整後免抽成
FROM sim s
JOIN public.accommodation_info a ON a.id = s.accommodation_id
WHERE s.before_exempt IS DISTINCT FROM COALESCE(s.new_srcs ? s.new_source, false)
ORDER BY a.name, s.rule_month, s.order_number;
