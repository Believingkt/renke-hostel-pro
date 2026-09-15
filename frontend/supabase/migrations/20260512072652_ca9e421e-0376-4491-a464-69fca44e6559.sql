
CREATE TABLE public.accommodation_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subtitle TEXT,
  guest_count INTEGER NOT NULL DEFAULT 2,
  guest_count_max INTEGER,
  original_price NUMERIC(10,2),
  sale_price NUMERIC(10,2) NOT NULL,
  room_allocation TEXT,
  applicable_tiers TEXT[] NOT NULL DEFAULT ARRAY['weekday','friday_sunday','weekend']::text[],
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_room_type_id UUID REFERENCES public.room_types(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_accommodation_packages_acc ON public.accommodation_packages(accommodation_id, enabled, display_order);

ALTER TABLE public.accommodation_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view packages"
  ON public.accommodation_packages FOR SELECT USING (true);

CREATE POLICY "Pricing editors can insert packages"
  ON public.accommodation_packages FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE POLICY "Pricing editors can update packages"
  ON public.accommodation_packages FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE POLICY "Pricing editors can delete packages"
  ON public.accommodation_packages FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE TRIGGER trg_accommodation_packages_updated_at
  BEFORE UPDATE ON public.accommodation_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
