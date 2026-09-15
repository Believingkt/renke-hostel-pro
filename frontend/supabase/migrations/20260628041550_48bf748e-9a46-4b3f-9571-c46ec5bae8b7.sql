UPDATE public.room_inventory_pricing rip
SET available_rooms = rt.room_count,
    updated_at = now()
FROM public.room_types rt
WHERE rip.room_type_id = rt.id
  AND rt.accommodation_id = '4ee31aca-5641-4d05-80e2-1c67626be83d'
  AND rip.available_rooms < rt.room_count;