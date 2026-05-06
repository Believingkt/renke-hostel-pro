CREATE TABLE public.room_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  nickname TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_type_id, unit_number)
);

CREATE INDEX idx_room_units_room_type ON public.room_units(room_type_id);
CREATE INDEX idx_room_units_accommodation ON public.room_units(accommodation_id);

ALTER TABLE public.room_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view room_units of their accommodation"
ON public.room_units FOR SELECT
USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Admins can insert room_units"
ON public.room_units FOR INSERT
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can update room_units"
ON public.room_units FOR UPDATE
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can delete room_units"
ON public.room_units FOR DELETE
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE TRIGGER update_room_units_updated_at
BEFORE UPDATE ON public.room_units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();