CREATE OR REPLACE FUNCTION public.update_team_order_marketing_info(
  p_order_id uuid,
  p_traffic_source text,
  p_booking_method text,
  p_ad_id text,
  p_closer_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta public.order_meta%ROWTYPE;
  v_authorized boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_meta
  FROM public.order_meta
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_META_NOT_FOUND';
  END IF;

  -- Authorization mirrors production order_meta_update USING, evaluated on the OLD row.
  v_authorized :=
    public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
    OR public.user_has_team_role(auth.uid(), 'closer_manager'::app_role)
    OR (v_meta.filled_by = auth.uid())
    OR (v_meta.closer_id = auth.uid())
    OR (v_meta.scout_id = auth.uid())
    OR (v_meta.video_creator_id = auth.uid())
    OR (v_meta.accommodation_id IS NOT NULL
        AND public.user_has_access_to_accommodation(auth.uid(), v_meta.accommodation_id));

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Target validation: must match the same membership contract as
  -- get_team_role_members('closer') / ('closer_manager').
  -- Deliberately NOT user_has_team_role(), whose super_admin wildcard would
  -- accept any super_admin as a valid closer target.
  IF p_closer_id IS NOT NULL AND p_closer_id IS DISTINCT FROM v_meta.closer_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.team_member_profiles tmp ON tmp.user_id = ur.user_id
      WHERE ur.user_id = p_closer_id
        AND ur.accommodation_id IS NULL
        AND ur.role IN ('closer'::app_role, 'closer_manager'::app_role)
    ) THEN
      RAISE EXCEPTION 'INVALID_CLOSER_TARGET';
    END IF;
  END IF;

  UPDATE public.order_meta
  SET traffic_source = p_traffic_source,
      booking_method = p_booking_method,
      ad_id = p_ad_id,
      closer_id = p_closer_id,
      updated_at = now()
  WHERE order_id = p_order_id;

  RETURN p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_team_order_marketing_info(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_team_order_marketing_info(uuid, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_team_order_marketing_info(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_order_marketing_info(uuid, text, text, text, uuid) TO service_role;