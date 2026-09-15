CREATE TABLE public.group_buy_venue_intros (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  description text,
  facilities text[] NOT NULL DEFAULT '{}',
  check_in_notice text,
  phone text,
  address text,
  gallery_urls text[] NOT NULL DEFAULT '{}',
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.group_buy_venue_intros TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_venue_intros TO authenticated;
GRANT ALL ON public.group_buy_venue_intros TO service_role;

ALTER TABLE public.group_buy_venue_intros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view group buy venue intros"
ON public.group_buy_venue_intros FOR SELECT
USING (true);

CREATE POLICY "Admins can manage group buy venue intros"
ON public.group_buy_venue_intros FOR ALL
TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id))
WITH CHECK (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE TRIGGER update_group_buy_venue_intros_updated_at
BEFORE UPDATE ON public.group_buy_venue_intros
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();