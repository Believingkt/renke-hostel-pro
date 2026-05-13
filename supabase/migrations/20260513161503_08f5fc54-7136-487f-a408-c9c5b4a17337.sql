DROP POLICY IF EXISTS "Public can read enabled mappings" ON public.external_hotel_mappings;

CREATE POLICY "Staff can read accommodation mappings"
ON public.external_hotel_mappings
FOR SELECT
TO authenticated
USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));