CREATE POLICY "Team inviters can view global user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NULL
  AND public.is_team_inviter(auth.uid())
);