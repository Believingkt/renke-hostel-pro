CREATE TABLE IF NOT EXISTS public.scout_discount_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discount_code text NOT NULL,
  scout_id uuid REFERENCES public.team_member_profiles(id),
  closer_id uuid REFERENCES public.team_member_profiles(id),
  commission_type text NOT NULL DEFAULT 'scout_self',
  scout_rate numeric DEFAULT 0.05,
  closer_rate numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scout_discount_codes TO authenticated;
GRANT ALL ON public.scout_discount_codes TO service_role;

ALTER TABLE public.scout_discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage scout discount codes select" ON public.scout_discount_codes;
DROP POLICY IF EXISTS "Admins manage scout discount codes insert" ON public.scout_discount_codes;
DROP POLICY IF EXISTS "Admins manage scout discount codes update" ON public.scout_discount_codes;
DROP POLICY IF EXISTS "Admins manage scout discount codes delete" ON public.scout_discount_codes;

CREATE POLICY "Admins manage scout discount codes select"
ON public.scout_discount_codes FOR SELECT TO authenticated
USING (public.is_admin_or_super());

CREATE POLICY "Admins manage scout discount codes insert"
ON public.scout_discount_codes FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins manage scout discount codes update"
ON public.scout_discount_codes FOR UPDATE TO authenticated
USING (public.is_admin_or_super());

CREATE POLICY "Admins manage scout discount codes delete"
ON public.scout_discount_codes FOR DELETE TO authenticated
USING (public.is_admin_or_super());

DROP TRIGGER IF EXISTS update_scout_discount_codes_updated_at ON public.scout_discount_codes;
CREATE TRIGGER update_scout_discount_codes_updated_at
BEFORE UPDATE ON public.scout_discount_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.accommodation_commission_settings
  ADD COLUMN IF NOT EXISTS closer_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_rate numeric DEFAULT 0;