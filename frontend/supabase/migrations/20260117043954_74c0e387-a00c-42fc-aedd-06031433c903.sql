-- Tighten anonymous/public order INSERT policy to avoid permissive `WITH CHECK (true)`
-- while keeping the public booking flow working.
ALTER POLICY "Public can insert orders" ON public.orders
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND guest_name IS NOT NULL
    AND length(btrim(guest_name)) BETWEEN 1 AND 120
    AND guest_phone IS NOT NULL
    AND length(btrim(guest_phone)) BETWEEN 6 AND 30
    AND check_in_date IS NOT NULL
    AND check_out_date IS NOT NULL
    AND check_in_date < check_out_date
    AND guest_count IS NOT NULL
    AND guest_count >= 1
    AND guest_count <= 30
    AND total_price IS NOT NULL
    AND total_price >= 0
    AND final_price IS NOT NULL
    AND final_price >= 0
    AND order_source = 'website'
  );
