CREATE POLICY "Team members can view others' global closer/scout roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NULL
  AND role IN ('closer', 'scout')
  AND EXISTS (
    SELECT 1 FROM public.team_member_profiles
    WHERE user_id = auth.uid()
  )
);