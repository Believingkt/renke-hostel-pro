CREATE OR REPLACE FUNCTION public.apply_template_to_user(_user_id uuid, _accommodation_id uuid, _template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tpl_perms jsonb;
  k text;
  v text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.is_hotel_admin_of(auth.uid(), _accommodation_id)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT permissions INTO tpl_perms
  FROM public.permission_templates
  WHERE id = _template_id AND accommodation_id = _accommodation_id;

  IF tpl_perms IS NULL THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  DELETE FROM public.staff_module_permissions
  WHERE user_id = _user_id AND accommodation_id = _accommodation_id;

  FOR k, v IN SELECT * FROM jsonb_each_text(tpl_perms)
  LOOP
    INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level)
    VALUES (_user_id, _accommodation_id, k, v)
    ON CONFLICT (user_id, accommodation_id, module_key)
    DO UPDATE SET permission_level = EXCLUDED.permission_level, updated_at = now();
  END LOOP;

  UPDATE public.user_roles
  SET role = 'staff'::public.app_role, template_id = _template_id
  WHERE user_id = _user_id AND accommodation_id = _accommodation_id;
END;
$function$;