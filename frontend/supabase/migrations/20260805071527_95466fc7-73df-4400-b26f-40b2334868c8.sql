CREATE OR REPLACE FUNCTION public.sync_teamcommission_role_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_role_type text;
  v_creator uuid;
  v_today date;
BEGIN
  IF NEW.accommodation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_role_type := NEW.role::text;
  IF v_role_type NOT IN ('am_manager', 'closer_manager') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_member_id
  FROM public.team_member_profiles
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_creator := COALESCE(auth.uid(), NEW.user_id);
  v_today := (now() AT TIME ZONE 'Asia/Taipei')::date;

  IF EXISTS (
    SELECT 1 FROM public.teamcommission_role_bindings
    WHERE role_type = v_role_type
      AND member_id = v_member_id
      AND effective_from = v_today
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teamcommission_role_bindings (role_type, member_id, effective_from, created_by)
  VALUES (v_role_type, v_member_id, v_today, v_creator);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_teamcommission_role_binding_trigger ON public.user_roles;
CREATE TRIGGER sync_teamcommission_role_binding_trigger
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_teamcommission_role_binding();