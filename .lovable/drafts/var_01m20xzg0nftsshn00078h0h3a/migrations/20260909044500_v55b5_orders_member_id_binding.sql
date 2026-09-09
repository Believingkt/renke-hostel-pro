-- V5.5B.5 — orders.member_id 身分綁定
-- 只改 "Public can insert orders" 的 WITH CHECK，追加「member_id 必須屬於呼叫者本人」。
-- 0 業務資料異動。

DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_expr(polwithcheck, polrelid)) INTO v_md5
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders'
    AND pol.polname = 'Public can insert orders';
  IF v_md5 IS DISTINCT FROM '2c9e9abb1e00e039588d1e35c940e138' THEN
    RAISE EXCEPTION 'V5.5B.5 PRECHECK FAILED: md5=%', v_md5;
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
    AND (
      member_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.platform_members pm
        WHERE pm.id = orders.member_id
          AND pm.user_id = auth.uid()
      )
    )
  );

DO $$
DECLARE v_expr text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders'
    AND pol.polname = 'Public can insert orders';
  IF v_expr NOT LIKE '%platform_members%'
     OR v_expr NOT LIKE '%order_source = ''website''%'
     OR v_expr NOT LIKE '%COALESCE(paid_amount, 0) = 0%' THEN
    RAISE EXCEPTION 'V5.5B.5 POSTCHECK FAILED: %', v_expr;
  END IF;
END $$;
