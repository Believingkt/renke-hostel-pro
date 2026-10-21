-- 20261107090000 precheck（唯讀）
-- P1 網紅碼：正常＝3 列、is_active true、discount_type percentage、discount_value 30（七折）、tpl_count 9
SELECT d.id, d.code, d.is_active, d.discount_type, d.discount_value, d.valid_from, d.valid_until, jsonb_array_length(d.applicable_pricing_template_ids) AS tpl_count FROM public.discount_codes d WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20') ORDER BY d.code;
-- P2 flags：正常 0 列
SELECT * FROM public.accommodation_info_flags f WHERE f.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P3 方案：正常只有 90df31ce 一列（舊價 46300／61800）
SELECT p.id, p.name, p.numeric_code, p.enabled, p.sale_price, p.original_price, p.tier_prices, p.applicable_tiers, p.guest_count, p.included_guest_count, p.guest_count_max, p.room_type_ids, p.subtitle, p.room_allocation FROM public.accommodation_packages p WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P4 專案：正常 13 列、default_package_id 全 NULL、numeric_code 1101～1113
SELECT t.id, t.template_name, t.project_name, t.numeric_code, t.default_package_id, t.room_type_ids, t.display_order, t.weekday_price, t.peak_price, t.weekend_price FROM public.pricing_templates t WHERE t.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' ORDER BY t.numeric_code;
-- P5 未來 package_date_prices、日型例外：正常都是 0
SELECT (SELECT count(*) FROM public.package_date_prices d JOIN public.accommodation_packages p ON p.id = d.package_id WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND d.date >= CURRENT_DATE) AS future_pdp, (SELECT count(*) FROM public.accommodation_day_tier_overrides o WHERE o.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND o.date >= CURRENT_DATE) AS future_overrides;
-- P6 KOL 訂單（移轉前快照）
SELECT o.order_number, o.order_source, o.final_price, o.pricing_template_id, o.package_id, o.check_in_date, o.order_status, o.updated_at FROM public.orders o WHERE o.order_number IN ('DM3A89R8', 'QW9M94K4', 'NE6Y99A5') ORDER BY 1;
-- P7 四季有沒有接 OTA（有的話，新方案代碼會出現在奧丁丁／旭海的方案清單）
SELECT 'owlting' AS channel, c.sync_enabled FROM public.accommodation_owlting_config c WHERE c.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' UNION ALL SELECT 'hotelnabe', h.sync_enabled FROM public.accommodation_hotelnabe_config h WHERE h.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P8 雲岫 flags（比照用）
SELECT f.new_price_ui_enabled, f.new_order_dialog_enabled, f.price_sync_mode, f.auto_template_enabled, f.has_franchise, f.has_starlink FROM public.accommodation_info_flags f WHERE f.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8';
