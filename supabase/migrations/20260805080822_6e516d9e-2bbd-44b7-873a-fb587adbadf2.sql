-- 1. user_roles policies for closer_manager / am_manager
CREATE POLICY closer_manager_insert_closer_role ON public.user_roles
  FOR INSERT WITH CHECK (user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND role = 'closer'::app_role AND accommodation_id IS NULL);
CREATE POLICY closer_manager_update_closer_role ON public.user_roles
  FOR UPDATE USING (user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND role = 'closer'::app_role AND accommodation_id IS NULL)
  WITH CHECK (user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND role = 'closer'::app_role AND accommodation_id IS NULL);
CREATE POLICY closer_manager_delete_closer_role ON public.user_roles
  FOR DELETE USING (user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND role = 'closer'::app_role AND accommodation_id IS NULL);

CREATE POLICY am_manager_insert_am_role ON public.user_roles
  FOR INSERT WITH CHECK (user_has_team_role(auth.uid(), 'am_manager'::app_role) AND role = 'am'::app_role AND accommodation_id IS NULL);
CREATE POLICY am_manager_update_am_role ON public.user_roles
  FOR UPDATE USING (user_has_team_role(auth.uid(), 'am_manager'::app_role) AND role = 'am'::app_role AND accommodation_id IS NULL)
  WITH CHECK (user_has_team_role(auth.uid(), 'am_manager'::app_role) AND role = 'am'::app_role AND accommodation_id IS NULL);
CREATE POLICY am_manager_delete_am_role ON public.user_roles
  FOR DELETE USING (user_has_team_role(auth.uid(), 'am_manager'::app_role) AND role = 'am'::app_role AND accommodation_id IS NULL);

-- 2. team_member_profiles UPDATE policies
CREATE POLICY team_profiles_update_closer_manager ON public.team_member_profiles
  FOR UPDATE USING (
    user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = team_member_profiles.user_id AND ur.role = 'closer'::app_role)
  ) WITH CHECK (
    user_has_team_role(auth.uid(), 'closer_manager'::app_role) AND user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = team_member_profiles.user_id AND ur.role = 'closer'::app_role)
  );
CREATE POLICY team_profiles_update_am_manager ON public.team_member_profiles
  FOR UPDATE USING (
    user_has_team_role(auth.uid(), 'am_manager'::app_role) AND user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = team_member_profiles.user_id AND ur.role = 'am'::app_role)
  ) WITH CHECK (
    user_has_team_role(auth.uid(), 'am_manager'::app_role) AND user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = team_member_profiles.user_id AND ur.role = 'am'::app_role)
  );

-- 3a. generic user_roles trigger function
CREATE OR REPLACE FUNCTION public.enforce_manager_scoped_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_role app_role;
  target_acc uuid;
  allowed app_role[] := ARRAY[]::app_role[];
  err text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip enforcement when actor has higher privilege
  IF user_has_team_role(auth.uid(), 'super_admin'::app_role)
     OR user_has_team_role(auth.uid(), 'admin'::app_role)
     OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Build the allowed child-role set from the actor's manager roles
  IF user_has_team_role(auth.uid(), 'scout_manager'::app_role) THEN
    allowed := allowed || 'scout'::app_role;
  END IF;
  IF user_has_team_role(auth.uid(), 'closer_manager'::app_role) THEN
    allowed := allowed || 'closer'::app_role;
  END IF;
  IF user_has_team_role(auth.uid(), 'am_manager'::app_role) THEN
    allowed := allowed || 'am'::app_role;
  END IF;

  -- Actor is not a scoped manager -> not restricted by this trigger
  IF array_length(allowed, 1) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  err := '主管僅能操作 ' || array_to_string(allowed, '/') || ' 角色（全域）的記錄';

  IF TG_OP = 'DELETE' THEN
    target_role := OLD.role;
    target_acc := OLD.accommodation_id;
  ELSE
    target_role := NEW.role;
    target_acc := NEW.accommodation_id;
    IF TG_OP = 'UPDATE' AND (NOT (OLD.role = ANY (allowed)) OR OLD.accommodation_id IS NOT NULL) THEN
      RAISE EXCEPTION '%', err;
    END IF;
  END IF;

  IF NOT (target_role = ANY (allowed)) OR target_acc IS NOT NULL THEN
    RAISE EXCEPTION '%', err;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3b. generic team_member_profiles trigger function
CREATE OR REPLACE FUNCTION public.enforce_manager_scoped_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF user_has_team_role(auth.uid(), 'super_admin'::app_role)
     OR user_has_team_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NOT (user_has_team_role(auth.uid(), 'scout_manager'::app_role)
          OR user_has_team_role(auth.uid(), 'closer_manager'::app_role)
          OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.managed_venue IS DISTINCT FROM OLD.managed_venue THEN
    RAISE EXCEPTION '主管僅能修改顯示名稱與團隊機制開關';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_scout_manager_user_roles ON public.user_roles;
CREATE TRIGGER trg_enforce_manager_scoped_user_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manager_scoped_user_roles();

DROP TRIGGER IF EXISTS trg_enforce_scout_manager_profile_update ON public.team_member_profiles;
CREATE TRIGGER trg_enforce_manager_scoped_profile_update
  BEFORE UPDATE ON public.team_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_manager_scoped_profile_update();

-- 4. is_team_inviter
CREATE OR REPLACE FUNCTION public.is_team_inviter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN ('super_admin','admin','scout_manager','closer_manager','am_manager')
  );
$function$;

-- 5. Team members can view team roles
DROP POLICY IF EXISTS "Team members can view team roles" ON public.user_roles;
CREATE POLICY "Team members can view team roles" ON public.user_roles
  FOR SELECT USING (
    user_has_any_team_role(auth.uid())
    AND role = ANY (ARRAY['scout'::app_role, 'scout_manager'::app_role, 'admin'::app_role, 'super_admin'::app_role, 'hotel_admin'::app_role, 'franchise_manager'::app_role, 'closer'::app_role, 'am'::app_role, 'am_manager'::app_role, 'closer_manager'::app_role])
  );