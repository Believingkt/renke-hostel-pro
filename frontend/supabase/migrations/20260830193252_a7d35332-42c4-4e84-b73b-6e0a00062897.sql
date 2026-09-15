DROP POLICY IF EXISTS "order_meta_insert" ON public.order_meta;

CREATE POLICY "order_meta_insert"
ON public.order_meta
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role)
  OR (
    (
      public.user_has_team_role(auth.uid(), 'closer'::public.app_role)
      OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role)
      OR public.user_has_team_role(auth.uid(), 'scout'::public.app_role)
      OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role)
      OR public.user_has_team_role(auth.uid(), 'franchise_internal'::public.app_role)
      OR public.user_has_team_role(auth.uid(), 'franchise_external'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_meta.order_id
        AND o.accommodation_id IS NOT NULL
        AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
        AND (
          order_meta.accommodation_id IS NULL
          OR order_meta.accommodation_id = o.accommodation_id
        )
    )
  )
);