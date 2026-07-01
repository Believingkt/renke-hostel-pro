
INSERT INTO public.accommodation_hotelnabe_config (accommodation_id, hotelnabe_hotel_code, sync_enabled)
VALUES ('8e3e8866-3cb0-4654-91f3-d9b09a543301', 'SIM-SX-999', true)
ON CONFLICT (accommodation_id) DO UPDATE
SET hotelnabe_hotel_code=EXCLUDED.hotelnabe_hotel_code, sync_enabled=true;

INSERT INTO public.hotelnabe_ari_push_queue
(accommodation_id, room_type_id, from_date, to_date, reason, status)
SELECT '8e3e8866-3cb0-4654-91f3-d9b09a543301',
       '4567bcac-8938-4bc0-ae4f-1267e8533f81',
       d::date, d::date, 'order_change', 'pending'
FROM generate_series('2026-12-30'::date, '2027-01-03'::date, interval '1 day') d;
