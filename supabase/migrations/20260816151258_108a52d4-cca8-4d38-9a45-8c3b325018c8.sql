CREATE OR REPLACE FUNCTION public.am_manages_accommodation(_user_id uuid, _accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_member_profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.is_active, true)
      AND _accommodation_id = ANY (COALESCE(p.am_managed_accommodation_ids, ARRAY[]::uuid[]))
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('am'::app_role, 'am_manager'::app_role)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.am_manages_accommodation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_manages_accommodation(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS kol_reciprocal_quota_am_select ON public.kol_reciprocal_monthly_quotas;
DROP POLICY IF EXISTS kol_reciprocal_quota_am_insert ON public.kol_reciprocal_monthly_quotas;
DROP POLICY IF EXISTS kol_reciprocal_quota_am_update ON public.kol_reciprocal_monthly_quotas;
DROP POLICY IF EXISTS kol_reciprocal_quota_am_delete ON public.kol_reciprocal_monthly_quotas;

CREATE POLICY kol_reciprocal_quota_am_select ON public.kol_reciprocal_monthly_quotas
FOR SELECT TO authenticated
USING (public.am_manages_accommodation(auth.uid(), accommodation_id));

CREATE POLICY kol_reciprocal_quota_am_insert ON public.kol_reciprocal_monthly_quotas
FOR INSERT TO authenticated
WITH CHECK (public.am_manages_accommodation(auth.uid(), accommodation_id));

CREATE POLICY kol_reciprocal_quota_am_update ON public.kol_reciprocal_monthly_quotas
FOR UPDATE TO authenticated
USING (public.am_manages_accommodation(auth.uid(), accommodation_id))
WITH CHECK (public.am_manages_accommodation(auth.uid(), accommodation_id));

CREATE POLICY kol_reciprocal_quota_am_delete ON public.kol_reciprocal_monthly_quotas
FOR DELETE TO authenticated
USING (public.am_manages_accommodation(auth.uid(), accommodation_id));