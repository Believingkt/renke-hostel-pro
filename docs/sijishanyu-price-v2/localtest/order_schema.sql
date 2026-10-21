-- 建單觸發器本機測試：補齊 validate_order_before_insert() 會讀到的欄位／表（只在本機 sjtest 用）
ALTER TABLE public.orders
  ADD COLUMN guest_name text, ADD COLUMN guest_phone text, ADD COLUMN check_out_date date,
  ADD COLUMN room_quantity int, ADD COLUMN room_type_id uuid, ADD COLUMN total_price numeric,
  ADD COLUMN discount_amount numeric, ADD COLUMN payment_status text, ADD COLUMN guest_count int,
  ADD COLUMN meal_plan_total numeric, ADD COLUMN pet_plan_price numeric, ADD COLUMN custom_addon_details jsonb,
  ADD COLUMN discount_code text;
ALTER TABLE public.room_types ADD COLUMN room_count int DEFAULT 1, ADD COLUMN capacity int, ADD COLUMN is_exclusive_package boolean DEFAULT false;
UPDATE public.room_types SET room_count = 2, capacity = 2 WHERE name LIKE '%雙人';
UPDATE public.room_types SET room_count = 2, capacity = 4 WHERE name LIKE '%四人';
UPDATE public.room_types SET room_count = 1, capacity = 30, is_exclusive_package = true WHERE name = '全區包棟';
CREATE TABLE public.public_holidays (accommodation_id uuid, holiday_date date, holiday_type text);
CREATE TABLE public.room_inventory_pricing (
  room_type_id uuid, date date, price numeric, price_2_meals numeric, price_3_meals numeric,
  available_rooms int, is_available boolean, pricing_template_id uuid, last_change_source text);
INSERT INTO public.room_inventory_pricing (room_type_id, date, price, available_rooms, is_available, last_change_source)
SELECT r.id, d::date, 4800, 2, true, 'manual'
FROM public.room_types r CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 60, '1 day') d
WHERE r.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
