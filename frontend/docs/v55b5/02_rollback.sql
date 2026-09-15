-- V5.5B.5 ROLLBACK — 還原 "Public can insert orders" 的 WITH CHECK
-- precheck 驗證目前為「修改後」版本 md5 = c2a8f8ec830e27b1317e8e713660c476
-- postcheck 驗證還原後 md5 = 2c9e9abb1e00e039588d1e35c940e138
-- 0 業務資料異動。

BEGIN;

DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_expr(polwithcheck, polrelid)) INTO v_md5
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders'
    AND pol.polname = 'Public can insert orders';
  IF v_md5 IS DISTINCT FROM 'c2a8f8ec830e27b1317e8e713660c476' THEN
    RAISE EXCEPTION 'V5.5B.5 ROLLBACK PRECHECK FAILED: md5=%', v_md5;
  END IF;
END $$;

ALTER POLICY "Public can insert orders" ON public.orders
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND guest_name IS NOT NULL
    AND (length(btrim(guest_name)) >= 1 AND length(btrim(guest_name)) <= 120)
    AND guest_phone IS NOT NULL
    AND (length(btrim(guest_phone)) >= 6 AND length(btrim(guest_phone)) <= 30)
    AND check_in_date IS NOT NULL
    AND check_out_date IS NOT NULL
    AND check_in_date < check_out_date
    AND guest_count IS NOT NULL
    AND guest_count >= 1 AND guest_count <= 30
    AND total_price IS NOT NULL AND total_price >= 0
    AND final_price IS NOT NULL AND final_price >= 0
    AND order_source = 'website'::text
    AND COALESCE(payment_status, 'unpaid'::text) = ANY (ARRAY['unpaid'::text, 'pending_payment'::text])
    AND COALESCE(paid_amount, 0) = 0
  );

DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_expr(polwithcheck, polrelid)) INTO v_md5
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders'
    AND pol.polname = 'Public can insert orders';
  IF v_md5 IS DISTINCT FROM '2c9e9abb1e00e039588d1e35c940e138' THEN
    RAISE EXCEPTION 'V5.5B.5 ROLLBACK POSTCHECK FAILED: md5=%', v_md5;
  END IF;
END $$;

COMMIT;
