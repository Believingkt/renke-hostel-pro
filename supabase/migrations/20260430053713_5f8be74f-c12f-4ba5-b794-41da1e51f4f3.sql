-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.staff_can_edit_module(_accommodation_id uuid, _module_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR _accommodation_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.get_staff_module_permission(auth.uid(), _accommodation_id, _module_key)
         = 'editable'::public.module_permission_level;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_module(_accommodation_id uuid, _module_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_level public.module_permission_level;
BEGIN
  IF auth.uid() IS NULL OR _accommodation_id IS NULL THEN
    RETURN false;
  END IF;

  v_level := public.get_staff_module_permission(auth.uid(), _accommodation_id, _module_key);
  RETURN v_level IN ('editable'::public.module_permission_level, 'readonly'::public.module_permission_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_can_edit_module_for_room_type(_room_type_id uuid, _module_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acc uuid;
BEGIN
  IF _room_type_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT accommodation_id INTO v_acc FROM public.room_types WHERE id = _room_type_id;
  IF v_acc IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.staff_can_edit_module(v_acc, _module_key);
END;
$$;

-- ============================================================================
-- WEBSITE CONTENT MODULE
-- ============================================================================

-- about_features
DROP POLICY IF EXISTS "Staff can insert about_features" ON public.about_features;
DROP POLICY IF EXISTS "Staff can update about_features" ON public.about_features;
DROP POLICY IF EXISTS "Staff can delete about_features" ON public.about_features;
CREATE POLICY "Website content editors can insert about_features" ON public.about_features
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update about_features" ON public.about_features
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete about_features" ON public.about_features
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- about_section
DROP POLICY IF EXISTS "Staff can insert about_section" ON public.about_section;
DROP POLICY IF EXISTS "Staff can update about_section" ON public.about_section;
DROP POLICY IF EXISTS "Staff can delete about_section" ON public.about_section;
CREATE POLICY "Website content editors can insert about_section" ON public.about_section
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update about_section" ON public.about_section
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete about_section" ON public.about_section
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- accommodation_facilities
DROP POLICY IF EXISTS "Only admins can insert facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Only admins can update facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Only admins can delete facilities" ON public.accommodation_facilities;
CREATE POLICY "Website content editors can insert facilities" ON public.accommodation_facilities
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update facilities" ON public.accommodation_facilities
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete facilities" ON public.accommodation_facilities
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- accommodation_info (uses id as accommodation id)
DROP POLICY IF EXISTS "Only admins can update accommodation info" ON public.accommodation_info;
DROP POLICY IF EXISTS "Admins can update accommodation info" ON public.accommodation_info;
CREATE POLICY "Website content editors can update accommodation info" ON public.accommodation_info
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(id, 'website_content')
  );

-- booking_info_sections
DROP POLICY IF EXISTS "Admins can manage booking info sections" ON public.booking_info_sections;
CREATE POLICY "Website content editors can insert booking info sections" ON public.booking_info_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update booking info sections" ON public.booking_info_sections
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete booking info sections" ON public.booking_info_sections
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- booking_settings
DROP POLICY IF EXISTS "Only admins can insert booking settings" ON public.booking_settings;
DROP POLICY IF EXISTS "Only admins can update booking settings" ON public.booking_settings;
CREATE POLICY "Website content editors can insert booking settings" ON public.booking_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update booking settings" ON public.booking_settings
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- custom_sections
DROP POLICY IF EXISTS "Admins can manage custom sections" ON public.custom_sections;
CREATE POLICY "Website content editors can insert custom sections" ON public.custom_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update custom sections" ON public.custom_sections
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete custom sections" ON public.custom_sections
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- faqs (drop redundant duplicates and consolidate)
DROP POLICY IF EXISTS "Only admins can insert faqs" ON public.faqs;
DROP POLICY IF EXISTS "Only admins can update faqs" ON public.faqs;
DROP POLICY IF EXISTS "Only admins can delete faqs" ON public.faqs;
DROP POLICY IF EXISTS "Users with access can insert FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Users with access can update FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Users with access can delete FAQs" ON public.faqs;
CREATE POLICY "Website content editors can insert faqs" ON public.faqs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update faqs" ON public.faqs
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete faqs" ON public.faqs
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- location_info
DROP POLICY IF EXISTS "Only admins can insert location" ON public.location_info;
DROP POLICY IF EXISTS "Only admins can update location" ON public.location_info;
DROP POLICY IF EXISTS "Users with access can insert location info" ON public.location_info;
DROP POLICY IF EXISTS "Users with access can update location info" ON public.location_info;
CREATE POLICY "Website content editors can insert location info" ON public.location_info
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update location info" ON public.location_info
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- reviews
DROP POLICY IF EXISTS "Users can manage reviews for their accommodations" ON public.reviews;
CREATE POLICY "Website content editors can insert reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can update reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );
CREATE POLICY "Website content editors can delete reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'website_content')
  );

-- ============================================================================
-- ROOM TYPES (pricing module)
-- ============================================================================

-- room_types
DROP POLICY IF EXISTS "Only admins can insert room types" ON public.room_types;
DROP POLICY IF EXISTS "Only admins can update room types" ON public.room_types;
DROP POLICY IF EXISTS "Only admins can delete room types" ON public.room_types;
CREATE POLICY "Pricing editors can insert room types" ON public.room_types
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );
CREATE POLICY "Pricing editors can update room types" ON public.room_types
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );
CREATE POLICY "Pricing editors can delete room types" ON public.room_types
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );

-- room_amenities (via room_type_id)
DROP POLICY IF EXISTS "Only admins can insert room amenities" ON public.room_amenities;
DROP POLICY IF EXISTS "Only admins can update room amenities" ON public.room_amenities;
DROP POLICY IF EXISTS "Only admins can delete room amenities" ON public.room_amenities;
CREATE POLICY "Pricing editors can insert room amenities" ON public.room_amenities
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );
CREATE POLICY "Pricing editors can update room amenities" ON public.room_amenities
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );
CREATE POLICY "Pricing editors can delete room amenities" ON public.room_amenities
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );

-- room_photos (via room_type_id)
DROP POLICY IF EXISTS "Only admins can insert room photos" ON public.room_photos;
DROP POLICY IF EXISTS "Only admins can update room photos" ON public.room_photos;
DROP POLICY IF EXISTS "Only admins can delete room photos" ON public.room_photos;
CREATE POLICY "Pricing editors can insert room photos" ON public.room_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );
CREATE POLICY "Pricing editors can update room photos" ON public.room_photos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );
CREATE POLICY "Pricing editors can delete room photos" ON public.room_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'pricing')
        )
    )
  );

-- addon_settings (pricing module — addons)
DROP POLICY IF EXISTS "Only admins can insert addon settings" ON public.addon_settings;
DROP POLICY IF EXISTS "Only admins can update addon settings" ON public.addon_settings;
DROP POLICY IF EXISTS "Only admins can delete addon settings" ON public.addon_settings;
CREATE POLICY "Pricing editors can insert addon settings" ON public.addon_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );
CREATE POLICY "Pricing editors can update addon settings" ON public.addon_settings
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );
CREATE POLICY "Pricing editors can delete addon settings" ON public.addon_settings
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing')
  );

-- ============================================================================
-- ROOM PRICE / INVENTORY MODULE (room_price)
-- ============================================================================

-- room_inventory_pricing (via room_type_id)
DROP POLICY IF EXISTS "Only admins can insert room inventory pricing" ON public.room_inventory_pricing;
DROP POLICY IF EXISTS "Only admins can update room inventory pricing" ON public.room_inventory_pricing;
DROP POLICY IF EXISTS "Only admins can delete room inventory pricing" ON public.room_inventory_pricing;
CREATE POLICY "Room price editors can insert inventory" ON public.room_inventory_pricing
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'room_price')
        )
    )
  );
CREATE POLICY "Room price editors can update inventory" ON public.room_inventory_pricing
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'room_price')
        )
    )
  );
CREATE POLICY "Room price editors can delete inventory" ON public.room_inventory_pricing
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_types rt
      WHERE rt.id = room_type_id
        AND (
          user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
          OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
          OR staff_can_edit_module(rt.accommodation_id, 'room_price')
        )
    )
  );

-- pricing_rules
DROP POLICY IF EXISTS "Only admins can insert pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Only admins can update pricing rules" ON public.pricing_rules;
DROP POLICY IF EXISTS "Only admins can delete pricing rules" ON public.pricing_rules;
CREATE POLICY "Room price editors can insert pricing rules" ON public.pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can update pricing rules" ON public.pricing_rules
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can delete pricing rules" ON public.pricing_rules
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );

-- pricing_templates
DROP POLICY IF EXISTS "Only admins can insert pricing templates" ON public.pricing_templates;
DROP POLICY IF EXISTS "Only admins can update pricing templates" ON public.pricing_templates;
DROP POLICY IF EXISTS "Only admins can delete pricing templates" ON public.pricing_templates;
CREATE POLICY "Room price editors can insert pricing templates" ON public.pricing_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can update pricing templates" ON public.pricing_templates
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can delete pricing templates" ON public.pricing_templates
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );

-- pricing_template_applications
DROP POLICY IF EXISTS "Only admins can insert template applications" ON public.pricing_template_applications;
DROP POLICY IF EXISTS "Only admins can delete template applications" ON public.pricing_template_applications;
DROP POLICY IF EXISTS "Only admins can view template applications" ON public.pricing_template_applications;
CREATE POLICY "Room price viewers can view template applications" ON public.pricing_template_applications
  FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_view_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can insert template applications" ON public.pricing_template_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can delete template applications" ON public.pricing_template_applications
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );

-- public_holidays
DROP POLICY IF EXISTS "Only admins can insert public holidays" ON public.public_holidays;
DROP POLICY IF EXISTS "Only admins can update public holidays" ON public.public_holidays;
DROP POLICY IF EXISTS "Only admins can delete public holidays" ON public.public_holidays;
CREATE POLICY "Room price editors can insert public holidays" ON public.public_holidays
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can update public holidays" ON public.public_holidays
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );
CREATE POLICY "Room price editors can delete public holidays" ON public.public_holidays
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'room_price')
  );

-- ============================================================================
-- DISCOUNT CODES MODULE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Admins can update discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Admins can delete discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Admins can view all discount codes" ON public.discount_codes;
CREATE POLICY "Discount code viewers can view discount codes" ON public.discount_codes
  FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_view_module(accommodation_id, 'discount_codes')
  );
CREATE POLICY "Discount code editors can insert discount codes" ON public.discount_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'discount_codes')
  );
CREATE POLICY "Discount code editors can update discount codes" ON public.discount_codes
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'discount_codes')
  );
CREATE POLICY "Discount code editors can delete discount codes" ON public.discount_codes
  FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'discount_codes')
  );

-- ============================================================================
-- ANALYTICS MODULE (read-only for staff with permission)
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view their accommodation analytics" ON public.page_analytics;
CREATE POLICY "Analytics viewers can view page analytics" ON public.page_analytics
  FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_view_module(accommodation_id, 'analytics')
  );

-- ============================================================================
-- SETTLEMENT MODULE
-- ============================================================================

DROP POLICY IF EXISTS "Hotel admins can request settlement" ON public.split_records;
CREATE POLICY "Settlement editors can request settlement" ON public.split_records
  FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'settlement')
  );