CREATE OR REPLACE FUNCTION public.attach_trip_products_to_recent_order(
  p_items jsonb,
  p_trip_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.platform_members%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_product public.trip_products%ROWTYPE;
  v_product_id uuid;
  v_qty integer;
  v_existing jsonb;
  v_new_lines jsonb := '[]'::jsonb;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_total numeric := 0;
  v_member_phone text;
  v_member_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  SELECT * INTO v_member
  FROM public.platform_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
  END IF;

  v_member_phone := NULLIF(regexp_replace(COALESCE(v_member.phone, ''), '[^0-9]', '', 'g'), '');
  v_member_name := NULLIF(lower(regexp_replace(COALESCE(v_member.name, ''), '\s', '', 'g')), '');

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE COALESCE(o.order_status, '') NOT IN ('cancelled', 'canceled')
    AND o.check_out_date >= CURRENT_DATE
    AND (
      o.member_id = v_member.id
      OR (
        o.member_id IS NULL
        AND length(COALESCE(v_member_phone, '')) >= 8
        AND v_member_name IS NOT NULL
        AND regexp_replace(COALESCE(o.guest_phone, ''), '[^0-9]', '', 'g') = v_member_phone
        AND lower(regexp_replace(COALESCE(o.guest_name, ''), '\s', '', 'g')) = v_member_name
      )
    )
  ORDER BY
    CASE WHEN o.check_in_date <= CURRENT_DATE THEN 0 ELSE 1 END,
    CASE WHEN o.check_in_date <= CURRENT_DATE THEN o.check_in_date END DESC,
    CASE WHEN o.check_in_date > CURRENT_DATE THEN o.check_in_date END ASC,
    o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_active_stay');
  END IF;

  IF v_order.member_id IS NULL THEN
    UPDATE public.orders
    SET member_id = v_member.id,
        updated_at = now()
    WHERE id = v_order.id;
    v_order.member_id := v_member.id;
  END IF;

  v_existing := CASE
    WHEN jsonb_typeof(v_order.custom_addon_details) = 'array' THEN v_order.custom_addon_details
    ELSE '[]'::jsonb
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
      v_qty := (v_item->>'count')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END;

    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END IF;
    IF v_product_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'DUPLICATE_PRODUCT';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_product_id);

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_existing) line
      WHERE line->>'source' = 'trip_product'
        AND line->>'product_id' = v_product_id::text
    ) THEN
      RAISE EXCEPTION 'PRODUCT_ALREADY_ATTACHED';
    END IF;

    SELECT * INTO v_product
    FROM public.trip_products
    WHERE id = v_product_id AND is_active = true
    FOR UPDATE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
    END IF;
    IF v_product.stock IS NOT NULL AND v_product.stock < v_qty THEN
      RAISE EXCEPTION 'PRODUCT_OUT_OF_STOCK';
    END IF;

    v_new_lines := v_new_lines || jsonb_build_array(jsonb_build_object(
      'source', 'trip_product',
      'product_id', v_product.id,
      'addon_type', 'trip_' || v_product.id::text,
      'count', v_qty,
      'price_per_unit', COALESCE(v_product.price, 0),
      'pricing_mode', 'per_stay',
      'total', COALESCE(v_product.price, 0) * v_qty,
      'unit_label', '份',
      'name', v_product.name
    ));
    v_total := v_total + COALESCE(v_product.price, 0) * v_qty;
  END LOOP;

  FOREACH v_product_id IN ARRAY v_seen_ids LOOP
    SELECT (line->>'count')::integer INTO v_qty
    FROM jsonb_array_elements(p_items) line
    WHERE line->>'product_id' = v_product_id::text
    LIMIT 1;

    UPDATE public.trip_products
    SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - v_qty END,
        updated_at = now()
    WHERE id = v_product_id;
  END LOOP;

  UPDATE public.orders
  SET custom_addon_details = v_existing || v_new_lines,
      total_price = COALESCE(total_price, 0) + v_total,
      final_price = COALESCE(final_price, 0) + v_total,
      payment_status = CASE
        WHEN COALESCE(paid_amount, 0) >= COALESCE(final_price, 0) + v_total THEN 'paid'
        WHEN COALESCE(paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = now()
  WHERE id = v_order.id;

  IF p_trip_id IS NOT NULL THEN
    INSERT INTO public.order_meta (order_id, trip_id)
    VALUES (v_order.id, p_trip_id)
    ON CONFLICT (order_id) DO UPDATE SET trip_id = EXCLUDED.trip_id;

    UPDATE public.trips
    SET status = 'published', updated_at = now()
    WHERE id = p_trip_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'added_total', v_total,
    'outstanding', GREATEST(0, COALESCE(v_order.final_price, 0) + v_total - COALESCE(v_order.paid_amount, 0))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_trip_products_to_recent_order(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_trip_products_to_recent_order(jsonb, uuid) TO authenticated, service_role;