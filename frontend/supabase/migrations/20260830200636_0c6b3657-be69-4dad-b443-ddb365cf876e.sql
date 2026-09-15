-- Phase 3C-4: order_rooms structural write ownership = orders module
-- Atomic: create Admin INSERT + swap broad Staff I/U/D for orders-editable Staff I/U/D.

CREATE POLICY "Admins can insert order rooms"
ON public.order_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND (
        public.user_has_role(auth.uid(), o.accommodation_id, 'super_admin'::app_role)
        OR public.user_has_role(auth.uid(), o.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS "Staff can insert order rooms" ON public.order_rooms;
DROP POLICY IF EXISTS "Staff can update order rooms" ON public.order_rooms;
DROP POLICY IF EXISTS "Staff can delete order rooms" ON public.order_rooms;

CREATE POLICY "Staff orders editors can insert order rooms"
ON public.order_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);

CREATE POLICY "Staff orders editors can update order rooms"
ON public.order_rooms
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);

CREATE POLICY "Staff orders editors can delete order rooms"
ON public.order_rooms
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);