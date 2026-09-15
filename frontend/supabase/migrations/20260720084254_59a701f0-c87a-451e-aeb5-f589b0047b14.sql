CREATE OR REPLACE FUNCTION public.get_staff_module_permission(
  _user_id uuid,
  _accommodation_id uuid,
  _module_key text
)
RETURNS public.module_permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level public.module_permission_level;
  v_has_admin boolean := false;
  v_has_staff boolean := false;
BEGIN
  IF _user_id IS NULL OR _accommodation_id IS NULL OR _module_key IS NULL THEN
    RETURN 'hidden'::public.module_permission_level;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  ) INTO v_has_admin;

  IF v_has_admin THEN
    RETURN 'editable'::public.module_permission_level;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
      AND role = 'staff'::public.app_role
  ) INTO v_has_staff;

  IF NOT v_has_staff THEN
    RETURN 'hidden'::public.module_permission_level;
  END IF;

  SELECT permission_level
    INTO v_level
  FROM public.staff_module_permissions
  WHERE user_id = _user_id
    AND accommodation_id = _accommodation_id
    AND module_key = _module_key;

  IF v_level IS NOT NULL THEN
    RETURN v_level;
  END IF;

  RETURN CASE _module_key
    WHEN 'orders'           THEN 'editable'
    WHEN 'kol_quota'        THEN 'hidden'
    WHEN 'reception'        THEN 'editable'
    WHEN 'room_price'       THEN 'editable'
    WHEN 'customers'        THEN 'editable'
    WHEN 'analytics'        THEN 'readonly'
    WHEN 'discount_codes'   THEN 'readonly'
    WHEN 'settlement'       THEN 'readonly'
    WHEN 'owner_settlement' THEN 'hidden'
    WHEN 'addon_center'     THEN 'editable'
    WHEN 'website_content'  THEN 'hidden'
    WHEN 'pricing'          THEN 'hidden'
    WHEN 'channel_manager'  THEN 'hidden'
    WHEN 'ai_training'      THEN 'hidden'
    WHEN 'accounts'         THEN 'hidden'
    ELSE 'hidden'
  END::public.module_permission_level;
END;
$$;