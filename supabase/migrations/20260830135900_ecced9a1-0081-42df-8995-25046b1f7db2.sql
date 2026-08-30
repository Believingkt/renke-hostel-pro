DROP POLICY IF EXISTS "Admins can manage external mappings" ON public.external_hotel_mappings;

CREATE POLICY "Admins can insert external mappings"
ON public.external_hotel_mappings
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);

CREATE POLICY "Admins can update external mappings"
ON public.external_hotel_mappings
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);

CREATE POLICY "Admins can delete external mappings"
ON public.external_hotel_mappings
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);