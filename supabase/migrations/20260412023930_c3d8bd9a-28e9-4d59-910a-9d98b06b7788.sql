-- Allow staff to delete order rooms in their accommodation
CREATE POLICY "Staff can delete order rooms"
ON public.order_rooms
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_rooms.order_id
    AND user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
  )
);
