ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS owner_direct boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.owner_direct IS '業主自帶客：勾選後該訂單不計入平台抽成';

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'owner_settlement_config',
  jsonb_build_object(
    'commission_rate', 15,
    'marketing_fee_base', 48000,
    'marketing_fee_per_extra_property', 3000
  ),
  '業主月結設定：抽成比例(%)、第一棟行銷費、每多一棟加收金額'
)
ON CONFLICT (setting_key) DO NOTHING;
