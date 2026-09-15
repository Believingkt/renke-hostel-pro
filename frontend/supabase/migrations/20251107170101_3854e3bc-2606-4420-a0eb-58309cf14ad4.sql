-- Fix RLS policies to restrict write access to admin roles only
-- This prevents staff users from modifying critical data

-- accommodation_facilities: Only admins can write
DROP POLICY IF EXISTS "Users with access can insert facilities" ON accommodation_facilities;
DROP POLICY IF EXISTS "Users with access can update facilities" ON accommodation_facilities;
DROP POLICY IF EXISTS "Users with access can delete facilities" ON accommodation_facilities;

CREATE POLICY "Only admins can insert facilities"
ON accommodation_facilities FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update facilities"
ON accommodation_facilities FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can delete facilities"
ON accommodation_facilities FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- customers: Only admins can write
DROP POLICY IF EXISTS "Users with access can insert customers" ON customers;
DROP POLICY IF EXISTS "Users with access can update customers" ON customers;
DROP POLICY IF EXISTS "Users with access can delete customers" ON customers;

CREATE POLICY "Only admins can insert customers"
ON customers FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update customers"
ON customers FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can delete customers"
ON customers FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- faqs: Only admins can write
DROP POLICY IF EXISTS "Users with access can insert faqs" ON faqs;
DROP POLICY IF EXISTS "Users with access can update faqs" ON faqs;
DROP POLICY IF EXISTS "Users with access can delete faqs" ON faqs;

CREATE POLICY "Only admins can insert faqs"
ON faqs FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update faqs"
ON faqs FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can delete faqs"
ON faqs FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- location_info: Only admins can write
DROP POLICY IF EXISTS "Users with access can insert location" ON location_info;
DROP POLICY IF EXISTS "Users with access can update location" ON location_info;

CREATE POLICY "Only admins can insert location"
ON location_info FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update location"
ON location_info FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- booking_settings: Only admins can write
DROP POLICY IF EXISTS "Users with access can update booking settings" ON booking_settings;

CREATE POLICY "Only admins can update booking settings"
ON booking_settings FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- accommodation_info: Only admins can write
DROP POLICY IF EXISTS "Users with access can update accommodation info" ON accommodation_info;

CREATE POLICY "Only admins can update accommodation info"
ON accommodation_info FOR UPDATE
USING (
  user_has_role(auth.uid(), id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), id, 'hotel_admin'::app_role)
);

-- room_types: Only admins can write
DROP POLICY IF EXISTS "Users with access can insert room types" ON room_types;
DROP POLICY IF EXISTS "Users with access can update room types" ON room_types;
DROP POLICY IF EXISTS "Users with access can delete room types" ON room_types;

CREATE POLICY "Only admins can insert room types"
ON room_types FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update room types"
ON room_types FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can delete room types"
ON room_types FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- room_photos: Only admins can write (via JOIN to room_types)
DROP POLICY IF EXISTS "Users with access can insert room photos" ON room_photos;
DROP POLICY IF EXISTS "Users with access can update room photos" ON room_photos;
DROP POLICY IF EXISTS "Users with access can delete room photos" ON room_photos;

CREATE POLICY "Only admins can insert room photos"
ON room_photos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM room_types rt
    WHERE rt.id = room_type_id
    AND (
      user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
      user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
    )
  )
);

CREATE POLICY "Only admins can update room photos"
ON room_photos FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM room_types rt
    WHERE rt.id = room_type_id
    AND (
      user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
      user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
    )
  )
);

CREATE POLICY "Only admins can delete room photos"
ON room_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM room_types rt
    WHERE rt.id = room_type_id
    AND (
      user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
      user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
    )
  )
);