-- helper：是否為團隊管理員（全域 admin 或 super_admin）
CREATE OR REPLACE FUNCTION public.is_team_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN ('super_admin','admin')
  );
$$;

CREATE POLICY "Team admins can insert global user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  accommodation_id IS NULL
  AND public.is_team_admin(auth.uid())
);

CREATE POLICY "Team admins can delete global user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  accommodation_id IS NULL
  AND public.is_team_admin(auth.uid())
);

CREATE POLICY "Team admins can update global user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  accommodation_id IS NULL
  AND public.is_team_admin(auth.uid())
)
WITH CHECK (
  accommodation_id IS NULL
  AND public.is_team_admin(auth.uid())
);