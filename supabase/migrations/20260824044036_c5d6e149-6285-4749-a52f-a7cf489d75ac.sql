CREATE POLICY "Staff can update order rooms"
ON public.order_rooms
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_rooms.order_id
    AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_rooms.order_id
    AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
));