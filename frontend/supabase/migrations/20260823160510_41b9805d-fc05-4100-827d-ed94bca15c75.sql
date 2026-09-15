-- Q1: prevent public/anon from forging paid orders.
-- Keep every existing condition, only append payment_status / paid_amount limits.
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
    -- Q1 additions
    AND COALESCE(payment_status, 'unpaid') IN ('unpaid', 'pending_payment')
    AND COALESCE(paid_amount, 0) = 0
  );