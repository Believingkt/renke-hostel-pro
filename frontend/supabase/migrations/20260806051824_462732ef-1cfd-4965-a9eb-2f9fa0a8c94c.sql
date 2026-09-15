
-- AM / AM manager access to LINE push targets
CREATE OR REPLACE FUNCTION public.is_am_team(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('am'::app_role, 'am_manager'::app_role)
  )
$$;

DROP POLICY IF EXISTS "line_push_targets scoped read" ON public.line_push_targets;
CREATE POLICY "line_push_targets scoped read"
ON public.line_push_targets
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR public.is_am_team(auth.uid())
  OR (accommodation_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(accommodation_ids) aid(aid)
    WHERE user_has_role(auth.uid(), aid.aid, 'hotel_admin'::app_role)
  ))
);

DROP POLICY IF EXISTS "line_push_targets scoped write" ON public.line_push_targets;
CREATE POLICY "line_push_targets scoped write"
ON public.line_push_targets
FOR ALL
USING (
  is_super_admin(auth.uid())
  OR public.is_am_team(auth.uid())
  OR (accommodation_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(accommodation_ids) aid(aid)
    WHERE user_has_role(auth.uid(), aid.aid, 'hotel_admin'::app_role)
  ))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR public.is_am_team(auth.uid())
  OR (accommodation_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(accommodation_ids) aid(aid)
    WHERE user_has_role(auth.uid(), aid.aid, 'hotel_admin'::app_role)
  ))
);

DROP POLICY IF EXISTS "line_event_types admin read" ON public.line_event_types;
CREATE POLICY "line_event_types admin read"
ON public.line_event_types
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR public.is_am_team(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'hotel_admin'::app_role
  )
);
