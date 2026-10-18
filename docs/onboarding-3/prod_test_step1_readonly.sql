-- 上架精靈正式庫測試：第 1 步唯讀檢查（只用測試館 ea55e271-15f8-4e63-9c4f-69fbd2022bc5；只有 SELECT）
-- 前提：20261018120000～120002 已套用（本檔第 6 列會讀新欄位 first_activated_at）
-- 每一列都必須為 true 才可以開始測試
SELECT '測試館存在且未開賣' AS item, EXISTS (SELECT 1 FROM public.accommodation_info WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND is_active = false) AS ok
UNION ALL SELECT '測試館訂單數 = 0', NOT EXISTS (SELECT 1 FROM public.orders WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5')
UNION ALL SELECT '未開 OwlTing 同步', NOT EXISTS (SELECT 1 FROM public.accommodation_owlting_config WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND sync_enabled)
UNION ALL SELECT '未開 Hotelnabe 同步', NOT EXISTS (SELECT 1 FROM public.accommodation_hotelnabe_config WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND sync_enabled)
UNION ALL SELECT '沒有 OwlTing 房型對應群組', NOT EXISTS (SELECT 1 FROM public.owlting_room_type_groups WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5')
UNION ALL SELECT 'first_activated_at 為 NULL（從未開賣）', (SELECT first_activated_at IS NULL FROM public.accommodation_info WHERE id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5')
UNION ALL SELECT '館別開關已開（new_price_ui / auto_template / package_original）', EXISTS (SELECT 1 FROM public.accommodation_info_flags WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND new_price_ui_enabled AND auto_template_enabled AND price_sync_mode = 'package_original');

-- 測試前快照：請把下面兩段結果存下來
-- (a) 資料筆數（清理後應回到這些數字）
SELECT 'room_types' AS t, count(*) FROM public.room_types WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'accommodation_packages', count(*) FROM public.accommodation_packages WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'pricing_templates', count(*) FROM public.pricing_templates WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'package_date_prices', count(*) FROM public.package_date_prices WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'room_inventory_pricing', count(*) FROM public.room_inventory_pricing r JOIN public.room_types t ON t.id = r.room_type_id WHERE t.accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'
UNION ALL SELECT 'final_check', count(*) FROM public.accommodation_onboarding_steps WHERE accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key = 'final_check';

-- (b) 送審狀態原貌（整段 JSON 複製到清理腳本的 prev；沒有資料時為 NULL）
SELECT now() AS 測試開始時間,
       (SELECT to_jsonb(s) FROM public.accommodation_onboarding_steps s
        WHERE s.accommodation_id = 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND s.step_key = 'final_check') AS prev;
