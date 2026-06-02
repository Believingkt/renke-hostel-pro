CREATE TABLE public.kol_commission_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  kol_id uuid REFERENCES public.kol_profiles(id) ON DELETE CASCADE,
  rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_commission_settings TO authenticated;
GRANT ALL ON public.kol_commission_settings TO service_role;

ALTER TABLE public.kol_commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY kol_commission_settings_select
ON public.kol_commission_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY kol_commission_settings_write
ON public.kol_commission_settings
FOR ALL
TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
);

CREATE INDEX idx_kol_commission_settings_acc ON public.kol_commission_settings(accommodation_id, effective_from DESC);
CREATE INDEX idx_kol_commission_settings_kol ON public.kol_commission_settings(kol_id);

INSERT INTO public.kol_commission_settings (accommodation_id, kol_id, rate, effective_from)
SELECT id, NULL, 5, '2025-01-01'
FROM public.accommodation_info;