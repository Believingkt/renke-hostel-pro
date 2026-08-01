ALTER TABLE public.owner_settlement_pricing_rules
ADD COLUMN IF NOT EXISTS commission_excluded_addon_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];