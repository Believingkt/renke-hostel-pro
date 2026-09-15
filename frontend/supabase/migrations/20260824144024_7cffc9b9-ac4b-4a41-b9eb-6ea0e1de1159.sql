ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS manual_refund_fee_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.booking_settings
  ADD CONSTRAINT booking_settings_manual_refund_fee_amount_nonneg
  CHECK (manual_refund_fee_amount >= 0);

COMMENT ON COLUMN public.booking_settings.manual_refund_fee_amount IS
  '此館人工銀行退款（ATM／銀行匯款）時，每次退款作業預設扣除的退款處理費。信用卡原卡退刷不適用。';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_fee_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_refund_fee_amount_nonneg
  CHECK (refund_fee_amount >= 0);

COMMENT ON COLUMN public.orders.refund_fee_amount IS
  '此訂單累計實際扣除的退款處理費（交易歷史快照，不隨館別設定變動）。settledRefund = refunded_amount + refund_fee_amount。';