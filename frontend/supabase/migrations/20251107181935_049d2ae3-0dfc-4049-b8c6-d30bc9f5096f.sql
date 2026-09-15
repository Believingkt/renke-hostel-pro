-- Add RLS policies for accommodation_photos management by admins

-- Only admins can insert accommodation photos
CREATE POLICY "Only admins can insert accommodation photos"
ON public.accommodation_photos
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Only admins can update accommodation photos
CREATE POLICY "Only admins can update accommodation photos"
ON public.accommodation_photos
FOR UPDATE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Only admins can delete accommodation photos
CREATE POLICY "Only admins can delete accommodation photos"
ON public.accommodation_photos
FOR DELETE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);