-- 為 room_types 添加管理權限的 RLS policies
CREATE POLICY "Users with access can insert room types"
ON room_types
FOR INSERT
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can update room types"
ON room_types
FOR UPDATE
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id))
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can delete room types"
ON room_types
FOR DELETE
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- 為 room_photos 添加管理權限的 RLS policies
CREATE POLICY "Users with access can insert room photos"
ON room_photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM room_types
    WHERE room_types.id = room_photos.room_type_id
    AND user_has_access_to_accommodation(auth.uid(), room_types.accommodation_id)
  )
);

CREATE POLICY "Users with access can update room photos"
ON room_photos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM room_types
    WHERE room_types.id = room_photos.room_type_id
    AND user_has_access_to_accommodation(auth.uid(), room_types.accommodation_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM room_types
    WHERE room_types.id = room_photos.room_type_id
    AND user_has_access_to_accommodation(auth.uid(), room_types.accommodation_id)
  )
);

CREATE POLICY "Users with access can delete room photos"
ON room_photos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM room_types
    WHERE room_types.id = room_photos.room_type_id
    AND user_has_access_to_accommodation(auth.uid(), room_types.accommodation_id)
  )
);