-- 20261107090000 precheck（唯讀，套用 migration 前在正式庫執行）
-- P1 網紅碼：正常＝3 列（AMILE77、KWYTMIO、MIE20），每列 is_active = true、discount_type = percentage、discount_value = 30、tpl_count = 9
SELECT d.id, d.code, d.is_active, d.discount_type, d.discount_value, d.valid_from, d.valid_until, jsonb_array_length(d.applicable_pricing_template_ids) AS tpl_count FROM public.discount_codes d WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20') ORDER BY d.code;
-- P2 四季 flags：正常＝0 列
SELECT * FROM public.accommodation_info_flags f WHERE f.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P3 四季方案：正常＝只有 1 列 id 90df31ce-c89a-4f73-b5e1-62db8276f2f2（24人包棟、numeric_code 1001、enabled true、sale_price 46300、original_price 61800）
SELECT p.id, p.name, p.numeric_code, p.enabled, p.sale_price, p.original_price, p.tier_prices, p.applicable_tiers, p.guest_count, p.included_guest_count, p.guest_count_max, p.room_type_ids, p.subtitle, p.room_allocation FROM public.accommodation_packages p WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P4 四季專案：正常＝13 列、default_package_id 全部是 NULL、numeric_code 1101～1113
SELECT t.id, t.template_name, t.project_name, t.numeric_code, t.default_package_id, t.room_type_ids, t.display_order, t.weekday_price, t.peak_price, t.weekend_price FROM public.pricing_templates t WHERE t.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' ORDER BY t.numeric_code;
-- P5 未來方案單日價、未來日型例外：正常＝future_pdp 0、future_overrides 0
SELECT (SELECT count(*) FROM public.package_date_prices d JOIN public.accommodation_packages p ON p.id = d.package_id WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND d.date >= CURRENT_DATE) AS future_pdp, (SELECT count(*) FROM public.accommodation_day_tier_overrides o WHERE o.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND o.date >= CURRENT_DATE) AS future_overrides;
-- P6 KOL 訂單快照：正常＝3 列；請保留這份結果，套用後 postcheck Q5 必須逐欄完全相同（含 updated_at）
SELECT o.order_number, o.order_source, o.final_price, o.pricing_template_id, o.package_id, o.check_in_date, o.order_status, o.updated_at FROM public.orders o WHERE o.order_number IN ('DM3A89R8', 'QW9M94K4', 'NE6Y99A5') ORDER BY 1;
-- P7 四季 OTA 設定（奧丁丁／旭海）：正常＝0 列
SELECT 'owlting' AS channel, c.sync_enabled FROM public.accommodation_owlting_config c WHERE c.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' UNION ALL SELECT 'hotelnabe', h.sync_enabled FROM public.accommodation_hotelnabe_config h WHERE h.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
-- P8 雲岫 flags（比照用，不判斷）：參考值 new_price_ui_enabled true、price_sync_mode package_original
SELECT f.new_price_ui_enabled, f.new_order_dialog_enabled, f.price_sync_mode, f.auto_template_enabled, f.has_franchise, f.has_starlink FROM public.accommodation_info_flags f WHERE f.accommodation_id = '7690a606-6bac-4cd5-a3e7-2fa754b318e8';
-- P9 四季房型：正常＝5 列，id 依序為 4074200a…、69e8fa0f…、6c72fc3e…、beffbc83…、c4c80422…
SELECT r.id, r.name FROM public.room_types r WHERE r.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' ORDER BY r.id;
-- P10 備份表與同名方案：正常＝backup_exists false、same_name 0
SELECT to_regclass('public.sijishanyu_price_v2_backup_20261107') IS NOT NULL AS backup_exists, (SELECT count(*) FROM public.accommodation_packages p WHERE p.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND p.name IN ('雙人房(山景)', '雙人房(樹景)', '四人房(山景)', '四人房(樹景)', '8人包棟', '10人包棟', '12人包棟', '14人包棟', '16人包棟', '18人包棟', '20人包棟', '22人包棟', '26人包棟', '28人包棟', '30人包棟')) AS same_name;
