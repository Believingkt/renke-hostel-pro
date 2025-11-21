-- Update notifications RLS policy to allow staff to insert
DROP POLICY IF EXISTS "Only admins can insert notifications" ON public.notifications;

CREATE POLICY "Staff can insert notifications in their accommodation"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));