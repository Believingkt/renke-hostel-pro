UPDATE public.room_inventory_pricing rip
SET available_rooms = 3, updated_at = now(), last_change_source = 'manual_restore_cancelled_order'
WHERE rip.date = '2026-08-30'
  AND rip.pricing_template_id IS NULL
  AND rip.room_type_id IN ('b415b602-7cca-4f35-829e-2b9cc0cd0bac','c483aafb-a22f-4252-a61d-c8f6878bf8f5')
  AND rip.available_rooms = 0;