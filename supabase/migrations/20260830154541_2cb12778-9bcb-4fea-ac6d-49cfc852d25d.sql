CREATE OR REPLACE FUNCTION public.upsert_customer_for_order(
  _accommodation_id uuid,
  _name             text,
  _phone            text,
  _email            text DEFAULT NULL,
  _gender           text DEFAULT NULL,
  _nationality      text DEFAULT NULL,
  _first_order_date date DEFAULT NULL
)
RETURNS TABLE (customer_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_match_cnt  int;
  v_id         uuid;
  v_visit      int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.is_hotel_admin_of(_accommodation_id)
    OR public.staff_can_edit_module(_accommodation_id, 'orders')
  ) THEN
    RAISE EXCEPTION 'forbidden: orders module edit permission required for accommodation %', _accommodation_id
      USING ERRCODE = '42501';
  END IF;

  IF _accommodation_id IS NULL OR _phone IS NULL OR btrim(_phone) = '' THEN
    RAISE EXCEPTION 'invalid input: accommodation_id and phone are required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_match_cnt
  FROM public.customers c
  WHERE c.accommodation_id = _accommodation_id
    AND c.phone = _phone;

  IF v_match_cnt > 1 THEN
    RAISE EXCEPTION 'duplicate customer phone in accommodation: % (matches=%)', _phone, v_match_cnt
      USING ERRCODE = '21000';
  END IF;

  IF v_match_cnt = 1 THEN
    SELECT c.id, c.visit_count INTO v_id, v_visit
    FROM public.customers c
    WHERE c.accommodation_id = _accommodation_id
      AND c.phone = _phone;

    UPDATE public.customers c
       SET name        = _name,
           email       = _email,
           gender      = _gender,
           nationality = _nationality,
           visit_count = COALESCE(c.visit_count, 0) + 1,
           updated_at  = now()
     WHERE c.id = v_id;

    customer_id := v_id;
    action := 'updated';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.customers (
    accommodation_id, name, phone, email, gender, nationality, visit_count, first_order_date
  ) VALUES (
    _accommodation_id, _name, _phone, _email, _gender, _nationality, 1, _first_order_date
  )
  RETURNING id INTO v_id;

  customer_id := v_id;
  action := 'created';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_customer_for_order(uuid, text, text, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_customer_for_order(uuid, text, text, text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer_for_order(uuid, text, text, text, text, text, date) TO service_role;