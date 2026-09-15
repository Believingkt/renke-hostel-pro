CREATE TABLE public.platform_brand_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text not null,
  label text,
  link_url text,
  scopes text[] not null default '{admin,team,hq}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.platform_brand_partners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_brand_partners TO authenticated;
GRANT ALL ON public.platform_brand_partners TO service_role;

ALTER TABLE public.platform_brand_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active brand partners"
ON public.platform_brand_partners FOR SELECT
USING (is_active = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage brand partners"
ON public.platform_brand_partners FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_platform_brand_partners_updated_at
BEFORE UPDATE ON public.platform_brand_partners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();