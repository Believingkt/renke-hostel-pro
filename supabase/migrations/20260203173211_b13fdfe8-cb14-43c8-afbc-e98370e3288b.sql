-- Add DELETE policy for accommodation_info to allow super_admin to delete accommodations
CREATE POLICY "Super admins can delete accommodation info"
ON public.accommodation_info
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'super_admin'::app_role
  )
);