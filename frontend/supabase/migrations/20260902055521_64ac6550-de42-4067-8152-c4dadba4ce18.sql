ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS child_age_rules jsonb;

COMMENT ON COLUMN public.group_buy_campaigns.child_age_rules IS
  'Group-buy own child age rules (campaign-level SoT, shared by all packages). NULL = fallback to accommodation general rules (legacy behavior). Never written back to accommodation_info.child_age_rules.';

COMMENT ON COLUMN public.group_buy_campaign_packages.child_tier_visibility IS
  'DEPRECATED / UNUSED - superseded by group_buy_campaigns.child_age_rules (campaign-level). Not read at runtime.';