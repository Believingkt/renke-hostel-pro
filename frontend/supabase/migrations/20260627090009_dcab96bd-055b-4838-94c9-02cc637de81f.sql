ALTER TABLE public.franchise_commission_settings
ADD COLUMN IF NOT EXISTS leader_override_rate numeric NOT NULL DEFAULT 0.035;