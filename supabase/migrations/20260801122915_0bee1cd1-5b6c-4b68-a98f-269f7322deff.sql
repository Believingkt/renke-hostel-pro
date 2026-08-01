ALTER TABLE public.owner_settlement_pricing_rules
  ADD COLUMN IF NOT EXISTS commission_excluded_addon_types text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.owner_settlement_pricing_rules.commission_excluded_addon_types IS
  '此版本設定為「不列入平台服務費抽成」的 addon_type 清單；不在此陣列內的項目一律視為列入抽成。僅影響業主月結，不影響團隊佣金。';