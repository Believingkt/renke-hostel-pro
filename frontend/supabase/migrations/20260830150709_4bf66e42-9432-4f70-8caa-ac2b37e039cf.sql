DROP POLICY IF EXISTS "Members can insert addon sales for their accommodation" ON public.addon_sales;
DROP POLICY IF EXISTS "Members can update addon sales of their accommodation" ON public.addon_sales;
DROP POLICY IF EXISTS "Members can delete addon sales of their accommodation" ON public.addon_sales;

CREATE POLICY "Addon center editors can insert addon sales"
ON public.addon_sales
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);

CREATE POLICY "Addon center editors can update addon sales"
ON public.addon_sales
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);

CREATE POLICY "Addon center editors can delete addon sales"
ON public.addon_sales
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);