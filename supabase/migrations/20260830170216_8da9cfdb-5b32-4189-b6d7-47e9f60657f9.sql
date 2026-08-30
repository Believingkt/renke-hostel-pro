CREATE OR REPLACE FUNCTION public.clear_order_room_pricing_template(
  _template_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acc_id uuid;
  _cleared integer;
BEGIN
  IF _template_id IS NULL THEN
    RAISE EXCEPTION 'template_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT pt.accommodation_id INTO _acc_id
  FROM public.pricing_templates pt
  WHERE pt.id = _template_id;

  IF _acc_id IS NULL THEN
    RAISE EXCEPTION 'pricing template not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_hotel_admin_of(_acc_id)
    OR public.staff_can_edit_module(_acc_id, 'room_price')
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.order_rooms orr
  SET template_id = NULL,
      template_name = NULL
  WHERE orr.template_id = _template_id
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = orr.order_id
        AND o.accommodation_id = _acc_id
    );

  GET DIAGNOSTICS _cleared = ROW_COUNT;
  RETURN _cleared;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_order_room_pricing_template(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_order_room_pricing_template(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_order_room_pricing_template(uuid) TO authenticated;