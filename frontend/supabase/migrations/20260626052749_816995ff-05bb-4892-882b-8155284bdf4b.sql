CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
  ) INTO v_is_super_admin;

  IF NEW.user_id = auth.uid()
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Cannot modify your own role';
  END IF;

  IF NEW.user_id = auth.uid()
     AND NEW.role = 'super_admin'::app_role
     AND OLD.role IS DISTINCT FROM 'super_admin'::app_role THEN
    RAISE EXCEPTION 'Cannot elevate your own role to super_admin';
  END IF;

  RETURN NEW;
END;
$function$;