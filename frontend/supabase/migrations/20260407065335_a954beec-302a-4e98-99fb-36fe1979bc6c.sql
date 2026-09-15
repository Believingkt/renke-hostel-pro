
CREATE TABLE public.order_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  room_price INTEGER NOT NULL DEFAULT 0,
  template_id UUID REFERENCES public.pricing_templates(id),
  template_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view order rooms" ON public.order_rooms
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
    AND user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
  ));

CREATE POLICY "Staff can insert order rooms" ON public.order_rooms
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
    AND user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
  ));

CREATE POLICY "Admins can update order rooms" ON public.order_rooms
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
    AND (user_has_role(auth.uid(), o.accommodation_id, 'super_admin') OR user_has_role(auth.uid(), o.accommodation_id, 'hotel_admin'))
  ));

CREATE POLICY "Admins can delete order rooms" ON public.order_rooms
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
    AND (user_has_role(auth.uid(), o.accommodation_id, 'super_admin') OR user_has_role(auth.uid(), o.accommodation_id, 'hotel_admin'))
  ));

CREATE POLICY "Public can insert order rooms for new bookings" ON public.order_rooms
  FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_rooms.order_id
  ));

CREATE POLICY "Public can view own order rooms" ON public.order_rooms
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_rooms.order_id
  ));
