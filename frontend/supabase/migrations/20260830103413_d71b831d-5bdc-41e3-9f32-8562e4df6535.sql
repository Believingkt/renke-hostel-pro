
-- addon_settings: pricing -> website_content
DROP POLICY IF EXISTS "Pricing editors can insert addon settings" ON public.addon_settings;
DROP POLICY IF EXISTS "Pricing editors can update addon settings" ON public.addon_settings;
DROP POLICY IF EXISTS "Pricing editors can delete addon settings" ON public.addon_settings;

CREATE POLICY "Website content editors can insert addon settings"
ON public.addon_settings FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'website_content'::text)
);

CREATE POLICY "Website content editors can update addon settings"
ON public.addon_settings FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'website_content'::text)
)
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'website_content'::text)
);

CREATE POLICY "Website content editors can delete addon settings"
ON public.addon_settings FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'website_content'::text)
);

-- accommodation_packages: pricing -> room_price
DROP POLICY IF EXISTS "Pricing editors can insert packages" ON public.accommodation_packages;
DROP POLICY IF EXISTS "Pricing editors can update packages" ON public.accommodation_packages;
DROP POLICY IF EXISTS "Pricing editors can delete packages" ON public.accommodation_packages;

CREATE POLICY "Room price editors can insert packages"
ON public.accommodation_packages FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);

CREATE POLICY "Room price editors can update packages"
ON public.accommodation_packages FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
)
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);

CREATE POLICY "Room price editors can delete packages"
ON public.accommodation_packages FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);

-- package_date_prices: pricing -> room_price
DROP POLICY IF EXISTS "Pricing editors can insert package date prices" ON public.package_date_prices;
DROP POLICY IF EXISTS "Pricing editors can update package date prices" ON public.package_date_prices;
DROP POLICY IF EXISTS "Pricing editors can delete package date prices" ON public.package_date_prices;

CREATE POLICY "Room price editors can insert package date prices"
ON public.package_date_prices FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);

CREATE POLICY "Room price editors can update package date prices"
ON public.package_date_prices FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
)
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);

CREATE POLICY "Room price editors can delete package date prices"
ON public.package_date_prices FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'room_price'::text)
);
