-- Add category field to room_amenities to support categorized facilities per room
ALTER TABLE public.room_amenities
ADD COLUMN IF NOT EXISTS category TEXT;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Only admins can insert room amenities" ON public.room_amenities;
DROP POLICY IF EXISTS "Only admins can update room amenities" ON public.room_amenities;
DROP POLICY IF EXISTS "Only admins can delete room amenities" ON public.room_amenities;

-- Only admins can insert room amenities
CREATE POLICY "Only admins can insert room amenities" 
ON public.room_amenities 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM room_types rt
    WHERE rt.id = room_amenities.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
        user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);

-- Only admins can update room amenities
CREATE POLICY "Only admins can update room amenities" 
ON public.room_amenities 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1
    FROM room_types rt
    WHERE rt.id = room_amenities.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
        user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);

-- Only admins can delete room amenities
CREATE POLICY "Only admins can delete room amenities" 
ON public.room_amenities 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1
    FROM room_types rt
    WHERE rt.id = room_amenities.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role) OR
        user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);