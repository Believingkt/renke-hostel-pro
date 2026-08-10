DROP POLICY IF EXISTS "partnership_periods_select_authenticated" ON public.accommodation_partnership_periods;

CREATE POLICY "partnership_periods_select_scoped"
ON public.accommodation_partnership_periods FOR SELECT TO authenticated
USING (
  public.is_admin_or_super()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = auth.uid()
      AND ur2.role IN ('finance', 'am', 'am_manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.accommodation_id = accommodation_partnership_periods.accommodation_id
      AND ur.role IN ('hotel_admin', 'owner')
  )
);