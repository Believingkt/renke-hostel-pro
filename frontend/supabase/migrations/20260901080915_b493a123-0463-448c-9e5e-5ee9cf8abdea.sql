CREATE OR REPLACE FUNCTION public.can_manage_scout_discount_codes()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_super()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'scout_manager'::app_role
      );
$$;

DROP POLICY IF EXISTS "Admins manage scout discount codes insert" ON public.scout_discount_codes;
DROP POLICY IF EXISTS "Admins manage scout discount codes update" ON public.scout_discount_codes;
DROP POLICY IF EXISTS "Admins manage scout discount codes delete" ON public.scout_discount_codes;

CREATE POLICY "Managers manage scout discount codes insert"
ON public.scout_discount_codes FOR INSERT TO authenticated
WITH CHECK (public.can_manage_scout_discount_codes());

CREATE POLICY "Managers manage scout discount codes update"
ON public.scout_discount_codes FOR UPDATE TO authenticated
USING (public.can_manage_scout_discount_codes())
WITH CHECK (public.can_manage_scout_discount_codes());

CREATE POLICY "Managers manage scout discount codes delete"
ON public.scout_discount_codes FOR DELETE TO authenticated
USING (public.can_manage_scout_discount_codes());