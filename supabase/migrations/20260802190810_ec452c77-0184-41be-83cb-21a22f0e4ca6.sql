CREATE TABLE public.trip_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'attraction',
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  description jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_url text,
  price numeric NOT NULL DEFAULT 0,
  lat double precision,
  lng double precision,
  open_hours jsonb,
  available_slots jsonb,
  stock int,
  duration_min int,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trip_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_products TO authenticated;
GRANT ALL ON public.trip_products TO service_role;

ALTER TABLE public.trip_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active trip products"
  ON public.trip_products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins and owners can manage trip products"
  ON public.trip_products FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_super() OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_admin_or_super() OR public.is_super_admin(auth.uid())
  );

CREATE INDEX idx_trip_products_type_active ON public.trip_products (type, is_active);

CREATE TRIGGER update_trip_products_updated_at
  BEFORE UPDATE ON public.trip_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_url text,
  owner_id uuid,
  scenario text,
  match_score int,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  share_slug text UNIQUE,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own trips"
  ON public.trips FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Anyone can view published or shared trips"
  ON public.trips FOR SELECT
  USING (status = 'published' OR share_slug IS NOT NULL);

CREATE POLICY "Owners can insert own trips"
  ON public.trips FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update own trips"
  ON public.trips FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete own trips"
  ON public.trips FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX idx_trips_owner ON public.trips (owner_id);

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();