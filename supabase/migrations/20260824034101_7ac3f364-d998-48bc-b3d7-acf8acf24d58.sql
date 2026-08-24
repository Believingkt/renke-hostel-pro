ALTER TABLE public.group_buy_campaigns
  ADD CONSTRAINT group_buy_campaigns_payment_method_required
  CHECK (
    COALESCE(enable_bank_transfer, true)
    OR COALESCE(enable_atm, false)
    OR COALESCE(enable_credit_card, false)
  );