-- OrderMeta Security P0.2 DRAFT — NOT APPLIED
-- Fix: public.order_meta INSERT cross-scope write gap
-- Contract:
--   * authorization scope is ALWAYS derived from order_meta.order_id -> public.orders.accommodation_id
--   * NEW.scout_id / NEW.closer_id / NEW.video_creator_id / NEW.filled_by / NEW.accommodation_id
--     are attacker-controlled payload and are NEVER used as authorization evidence
--   * payload accommodation_id may only be NULL or equal to the target order's accommodation_id
--   * SELECT / UPDATE / DELETE policies are intentionally untouched

DROP POLICY IF EXISTS "order_meta_insert" ON public.order_meta;

CREATE POLICY "order_meta_insert"
ON public.order_meta
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = public.order_meta.order_id
      AND (
        -- global privileged (unchanged behaviour)
        public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
        OR public.user_has_team_role(auth.uid(), 'finance'::public.app_role)
        -- team roles: only inside an accommodation the caller already has a role in
        OR (
          (
            public.user_has_team_role(auth.uid(), 'closer'::public.app_role)
            OR public.user_has_team_role(auth.uid(), 'closer_manager'::public.app_role)
            OR public.user_has_team_role(auth.uid(), 'scout'::public.app_role)
            OR public.user_has_team_role(auth.uid(), 'scout_manager'::public.app_role)
            OR public.user_has_team_role(auth.uid(), 'franchise_internal'::public.app_role)
            OR public.user_has_team_role(auth.uid(), 'franchise_external'::public.app_role)
          )
          AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
        )
      )
      -- payload accommodation must not disagree with the real order
      AND (
        public.order_meta.accommodation_id IS NULL
        OR public.order_meta.accommodation_id = o.accommodation_id
      )
  )
);
