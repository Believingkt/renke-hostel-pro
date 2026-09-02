ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS child_age_rules jsonb,
  ADD COLUMN IF NOT EXISTS show_guest_selector boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_room_type_selector boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS included_guest_count integer;

ALTER TABLE public.group_buy_campaign_packages
  DROP CONSTRAINT IF EXISTS group_buy_campaign_packages_included_guest_count_check;
ALTER TABLE public.group_buy_campaign_packages
  ADD CONSTRAINT group_buy_campaign_packages_included_guest_count_check
  CHECK (included_guest_count IS NULL OR included_guest_count > 0);

COMMENT ON COLUMN public.group_buy_campaign_packages.child_age_rules IS
  'Per-package 兒童分齡規則（正式 SoT）。NULL = 過渡期 fallback 至 group_buy_campaigns.child_age_rules。';
COMMENT ON COLUMN public.group_buy_campaign_packages.show_guest_selector IS
  '團購頁是否顯示「入住人數」選擇器。OFF 時後端一律使用方案 included/max 人數作為固定人數。';
COMMENT ON COLUMN public.group_buy_campaign_packages.show_room_type_selector IS
  '團購頁是否顯示「入住房型」選擇器。OFF 時沿用既有 server 房型自動指派順序。';
COMMENT ON COLUMN public.group_buy_campaign_packages.included_guest_count IS
  '方案售價已包含的人數；NULL = 沿用 max_guests。用於 included-capacity 計價（包含人頭不再收兒童加價）。';
COMMENT ON COLUMN public.group_buy_campaigns.child_age_rules IS
  'DEPRECATED / FALLBACK ONLY：兒童分齡規則已改為 per-package（group_buy_campaign_packages.child_age_rules）。保留供尚未初始化的方案 fallback，勿新增依賴。';