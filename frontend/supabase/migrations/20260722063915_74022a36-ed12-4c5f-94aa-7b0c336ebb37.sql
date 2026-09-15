CREATE POLICY "Finance can view all accommodations"
ON public.accommodation_info
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));