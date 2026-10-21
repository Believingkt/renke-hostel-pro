-- 建單觸發器（validate_order_before_insert，正式函式原文）帶 enabled = false 方案時的實際行為
\set ON_ERROR_STOP 0
CREATE FUNCTION pg_temp.try_order(p_label text, p_room uuid, p_pkg uuid, p_tpl uuid, p_in date) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_final numeric;
BEGIN
  INSERT INTO public.orders (order_number, accommodation_id, order_source, guest_name, guest_phone, check_in_date, check_out_date,
    room_type_id, package_id, pricing_template_id, room_quantity, guest_count, total_price, final_price, pet_plan_price)
  VALUES ('T-' || p_label, 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'website', '測試', '0912345678', p_in, p_in + 1,
    p_room, p_pkg, p_tpl, 1, 2, 0, 0, 0)
  RETURNING final_price INTO v_final;
  DELETE FROM public.orders WHERE order_number = 'T-' || p_label;
  RETURN p_label || '｜建單成功（沒被擋），final_price=' || v_final;
EXCEPTION WHEN OTHERS THEN
  RETURN p_label || '｜被擋：' || SQLERRM;
END $$;

SELECT pg_temp.try_order('O1 單間方案 雙人房(山景) enabled=false（帶 package_id）', '6c72fc3e-9183-4788-a03d-bc043a2823e8',
  (SELECT id FROM public.accommodation_packages WHERE name = '雙人房(山景)'), NULL, :'tday');
SELECT pg_temp.try_order('O2 單間方案 四人房(樹景) enabled=false（帶 package_id）', 'c4c80422-f4c2-47f0-9aef-dc1a663046a9',
  (SELECT id FROM public.accommodation_packages WHERE name = '四人房(樹景)'), NULL, :'tday');
SELECT pg_temp.try_order('O3 對照：8人包棟 enabled=true', '69e8fa0f-27b4-4259-b3dd-8525d61e014c',
  (SELECT id FROM public.accommodation_packages WHERE name = '8人包棟'), NULL, :'tday');
SELECT pg_temp.try_order('O4 專案路徑：雙人房(山景)專案、不帶 package_id', '6c72fc3e-9183-4788-a03d-bc043a2823e8',
  NULL, 'a247bcaf-74df-49e6-a1e1-d12b1d681263', :'tday');
SELECT 'O5 對照：直接停用方案改 enabled=false 後的 8人包棟' AS note;
UPDATE public.accommodation_packages SET enabled = false WHERE name = '8人包棟';
SELECT pg_temp.try_order('O5 8人包棟 改成 enabled=false', '69e8fa0f-27b4-4259-b3dd-8525d61e014c',
  (SELECT id FROM public.accommodation_packages WHERE name = '8人包棟'), NULL, :'tday');
UPDATE public.accommodation_packages SET enabled = true WHERE name = '8人包棟';
