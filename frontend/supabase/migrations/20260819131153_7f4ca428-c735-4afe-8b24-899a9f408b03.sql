UPDATE public.orders o
SET custom_addon_details = COALESCE((
      SELECT jsonb_agg(line)
      FROM jsonb_array_elements(o.custom_addon_details) line
      WHERE NOT (line->>'source' = 'trip_product' AND line->>'product_id' = 'a1111111-1111-4111-8111-111111111101')
    ), '[]'::jsonb),
    updated_at = now()
WHERE o.order_number = 'MC9S84W2'
  AND jsonb_typeof(o.custom_addon_details) = 'array';