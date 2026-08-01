CREATE TABLE public.package_date_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.accommodation_packages(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sale_price NUMERIC(10,2) NOT NULL,
  original_price NUMERIC(10,2),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (package_id, date)
);

CREATE INDEX idx_package_date_prices_acc_date ON public.package_date_prices(accommodation_id, date);

GRANT SELECT ON public.package_date_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_date_prices TO authenticated;
GRANT ALL ON public.package_date_prices TO service_role;

ALTER TABLE public.package_date_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view package date prices"
  ON public.package_date_prices FOR SELECT USING (true);

CREATE POLICY "Pricing editors can insert package date prices"
  ON public.package_date_prices FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE POLICY "Pricing editors can update package date prices"
  ON public.package_date_prices FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE POLICY "Pricing editors can delete package date prices"
  ON public.package_date_prices FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR staff_can_edit_module(accommodation_id, 'pricing'::text)
  );

CREATE TRIGGER trg_package_date_prices_updated_at
  BEFORE UPDATE ON public.package_date_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();