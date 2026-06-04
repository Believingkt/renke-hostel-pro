
-- INSERT: scout_manager can add scout role records (global)
CREATE POLICY "scout_manager_insert_scout_role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND role = 'scout'::app_role
  AND accommodation_id IS NULL
);

-- UPDATE: scout_manager can update scout role records (global)
CREATE POLICY "scout_manager_update_scout_role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND role = 'scout'::app_role
  AND accommodation_id IS NULL
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND role = 'scout'::app_role
  AND accommodation_id IS NULL
);

-- DELETE: scout_manager can delete scout role records (global)
CREATE POLICY "scout_manager_delete_scout_role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND role = 'scout'::app_role
  AND accommodation_id IS NULL
);

-- Trigger: when actor is scout_manager (and NOT a higher-privilege admin),
-- enforce that any user_roles mutation only touches scout role + accommodation_id IS NULL
CREATE OR REPLACE FUNCTION public.enforce_scout_manager_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role app_role;
  target_acc uuid;
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

  -- Only enforce when actor is scout_manager
  IF NOT user_has_team_role(auth.uid(), 'scout_manager'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_role := OLD.role;
    target_acc := OLD.accommodation_id;
  ELSE
    target_role := NEW.role;
    target_acc := NEW.accommodation_id;
    -- For UPDATE, also block changing OLD row from non-scout context
    IF TG_OP = 'UPDATE' AND (OLD.role <> 'scout'::app_role OR OLD.accommodation_id IS NOT NULL) THEN
      RAISE EXCEPTION 'scout_manager 僅能操作 scout 角色（全域）的記錄';
    END IF;
  END IF;

  IF target_role <> 'scout'::app_role OR target_acc IS NOT NULL THEN
    RAISE EXCEPTION 'scout_manager 僅能操作 scout 角色（全域）的記錄';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_scout_manager_user_roles ON public.user_roles;
CREATE TRIGGER trg_enforce_scout_manager_user_roles
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_scout_manager_user_roles();
