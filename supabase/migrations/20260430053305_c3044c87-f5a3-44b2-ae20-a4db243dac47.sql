-- 重建 accommodation_photos 的寫入權限，納入擁有 website_content editable 的 staff
DROP POLICY IF EXISTS "Only admins can insert accommodation photos" ON public.accommodation_photos;
DROP POLICY IF EXISTS "Only admins can update accommodation photos" ON public.accommodation_photos;
DROP POLICY IF EXISTS "Only admins can delete accommodation photos" ON public.accommodation_photos;

CREATE POLICY "Admins or website_content editors can insert accommodation photos"
ON public.accommodation_photos
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR get_staff_module_permission(auth.uid(), accommodation_id, 'website_content') = 'editable'::module_permission_level
);

CREATE POLICY "Admins or website_content editors can update accommodation photos"
ON public.accommodation_photos
FOR UPDATE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR get_staff_module_permission(auth.uid(), accommodation_id, 'website_content') = 'editable'::module_permission_level
);

CREATE POLICY "Admins or website_content editors can delete accommodation photos"
ON public.accommodation_photos
FOR DELETE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR get_staff_module_permission(auth.uid(), accommodation_id, 'website_content') = 'editable'::module_permission_level
);