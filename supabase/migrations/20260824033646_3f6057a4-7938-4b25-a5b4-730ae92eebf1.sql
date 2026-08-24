ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS enable_bank_transfer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.group_buy_campaigns.enable_bank_transfer IS '是否開放銀行匯款（人工對帳，訂金制）。與 enable_atm / enable_credit_card 各自獨立，三者不可同時為 false。';