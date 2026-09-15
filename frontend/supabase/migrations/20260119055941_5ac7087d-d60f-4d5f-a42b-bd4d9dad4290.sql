-- Harden SECURITY DEFINER RPC to prevent user/role enumeration
-- This function bypasses RLS by design, so it must enforce authorization internally.

CREATE OR REPLACE FUNCTION public.get_user_accommodations(_user_id uuid)
RETURNS TABLE(accommodation_id uuid, role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.accommodation_id, ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND (
      -- Users can only query their own accommodations
      _user_id = auth.uid()
      -- Super admins can query any user's accommodations
      OR EXISTS (
        SELECT 1
        FROM public.user_roles me
        WHERE me.user_id = auth.uid()
          AND me.role = 'super_admin'::public.app_role
      )
    );
$$;

-- Reduce attack surface: only authenticated callers may execute this RPC
REVOKE ALL ON FUNCTION public.get_user_accommodations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_accommodations(uuid) TO authenticated;