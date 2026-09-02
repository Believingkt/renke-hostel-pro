ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS child_tier_visibility jsonb;

COMMENT ON COLUMN public.group_buy_campaign_packages.child_tier_visibility IS
  'Group-buy only display override: {"infant":bool,"toddler":bool,"child":bool}. NULL = all visible. Never writes back to accommodation_info.child_age_rules.';