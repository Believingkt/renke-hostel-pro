INSERT INTO public.owlting_credentials (accommodation_id, hotel_code, username, password_hash, is_active)
VALUES ('0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', 'LAKEZE-TEST-001', 'owlting_partner', 'managed-by-service-account', true)
ON CONFLICT (accommodation_id) DO UPDATE
  SET hotel_code = EXCLUDED.hotel_code,
      is_active = true,
      updated_at = now();

INSERT INTO public.room_types (accommodation_id, name, name_en, capacity, base_price, room_count, display_order, numeric_code)
VALUES
 ('0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', '測試雙人房', 'Test Double Room', 2, 2800, 2, 1, 9001),
 ('0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', '測試四人房', 'Test Quad Room',  4, 4800, 1, 2, 9002);

INSERT INTO public.pricing_templates (accommodation_id, template_name, room_type_id, weekday_price, weekend_price, available_rooms, display_order, numeric_code)
SELECT '0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', '標準方案', rt.id, 2800, 3800, 2, 1, 9101
FROM public.room_types rt WHERE rt.numeric_code=9001;

INSERT INTO public.pricing_templates (accommodation_id, template_name, room_type_id, weekday_price, weekend_price, available_rooms, display_order, numeric_code)
SELECT '0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', '早鳥方案', rt.id, 2500, 3500, 2, 2, 9102
FROM public.room_types rt WHERE rt.numeric_code=9001;

INSERT INTO public.pricing_templates (accommodation_id, template_name, room_type_id, weekday_price, weekend_price, available_rooms, display_order, numeric_code)
SELECT '0a3d6160-2e50-4a7d-a1c8-8558eb6d15f8', '家庭方案', rt.id, 4800, 5800, 1, 1, 9103
FROM public.room_types rt WHERE rt.numeric_code=9002;