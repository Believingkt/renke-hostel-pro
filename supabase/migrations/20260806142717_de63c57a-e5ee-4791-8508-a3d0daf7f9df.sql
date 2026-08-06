CREATE TABLE public.traveler_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  customer_key text NOT NULL,
  display_name text NULL,
  email text NULL,
  phone text NULL,
  bound_identities jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_needs text[] NOT NULL DEFAULT '{}',
  interest_tags text[] NOT NULL DEFAULT '{}',
  consumption jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX traveler_profiles_customer_key_uidx ON public.traveler_profiles (customer_key);
CREATE INDEX traveler_profiles_user_id_idx ON public.traveler_profiles (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traveler_profiles TO authenticated;
GRANT ALL ON public.traveler_profiles TO service_role;

ALTER TABLE public.traveler_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view traveler profiles"
ON public.traveler_profiles FOR SELECT TO authenticated
USING (
  public.is_admin_or_super()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','hotel_admin','super_admin','admin')
  )
);

CREATE POLICY "Admins can insert traveler profiles"
ON public.traveler_profiles FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can update traveler profiles"
ON public.traveler_profiles FOR UPDATE TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can delete traveler profiles"
ON public.traveler_profiles FOR DELETE TO authenticated
USING (public.is_admin_or_super());

CREATE TRIGGER update_traveler_profiles_updated_at
BEFORE UPDATE ON public.traveler_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();