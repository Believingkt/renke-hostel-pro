DROP POLICY IF EXISTS "Sales roles can view discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Sales roles can view scoped discount codes" ON public.discount_codes;

CREATE OR REPLACE FUNCTION public.user_can_access_accommodation(_accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _accommodation_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.current_user_accommodation_ids() a
       WHERE a = _accommodation_id
     )
$$;

CREATE POLICY "Sales roles can view scoped discount codes"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'admin')
  OR public.user_has_team_role(auth.uid(), 'super_admin')
  OR (
    public.is_sales_role(auth.uid())
    AND (
      public.user_can_access_accommodation(accommodation_id)
      OR EXISTS (
        SELECT 1
        FROM public.scout_discount_codes sdc
        JOIN public.team_member_profiles tmp
          ON tmp.id IN (sdc.scout_id, sdc.closer_id)
        WHERE sdc.discount_code = discount_codes.code
          AND tmp.user_id = auth.uid()
      )
    )
  )
);