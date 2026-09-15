ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS faq_item_ids uuid[],
  ADD COLUMN IF NOT EXISTS booking_notice_keys text[];

COMMENT ON COLUMN public.group_buy_campaigns.faq_item_ids IS 'NULL = use accommodation default/all enabled items; empty array = intentionally hide section';
COMMENT ON COLUMN public.group_buy_campaigns.booking_notice_keys IS 'NULL = use accommodation default/all enabled items; empty array = intentionally hide section';