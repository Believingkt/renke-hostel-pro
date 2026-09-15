
ALTER TABLE public.kol_profiles
  ADD COLUMN IF NOT EXISTS kpi_qualified boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.kol_venues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text DEFAULT '民宿',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.kol_venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read kol_venues" ON public.kol_venues;
CREATE POLICY "authenticated can read kol_venues"
ON public.kol_venues FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "manager can manage kol_venues" ON public.kol_venues;
CREATE POLICY "manager can manage kol_venues"
ON public.kol_venues FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'scout_manager'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role, 'scout_manager'::public.app_role)
  )
);

DROP TRIGGER IF EXISTS update_kol_venues_updated_at ON public.kol_venues;
CREATE TRIGGER update_kol_venues_updated_at
BEFORE UPDATE ON public.kol_venues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
