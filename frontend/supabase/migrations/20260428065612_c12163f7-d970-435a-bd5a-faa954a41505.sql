UPDATE public.room_inventory_pricing
SET price = 36700, updated_at = now()
WHERE room_type_id = 'b5d32bd5-88da-4ff1-90a6-afe65f4b1cd0'
  AND date = '2026-04-10'
  AND pricing_template_id IS NULL
  AND price = 65100;