ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.orders.payment_provider IS
  '處理付款的系統：manual（人工／銀行匯款）、tappay。與 payment_method（付款工具）語意不同，不可混用。';

-- Backfill（保守：無法安全辨識者一律留在 manual，不依 payment_method 自由文字猜測）
UPDATE public.orders SET payment_provider = 'manual' WHERE order_source = 'group_buy';

UPDATE public.orders
SET payment_provider = 'tappay'
WHERE order_source IS DISTINCT FROM 'group_buy'
  AND (
    atm_rec_trade_id IS NOT NULL
    OR room_charge_rec_trade_id IS NOT NULL
    OR refund_rec_trade_id IS NOT NULL
  );

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_provider_check
  CHECK (payment_provider IN ('manual', 'tappay'));

ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'manual_bank_transfer';

COMMENT ON COLUMN public.group_buy_campaigns.payment_method IS
  '此團購活動的收款方式：manual_bank_transfer（人工銀行匯款，目前唯一啟用）、tappay（保留，尚未啟用）。';

ALTER TABLE public.group_buy_campaigns
  ADD CONSTRAINT group_buy_campaigns_payment_method_check
  CHECK (payment_method IN ('manual_bank_transfer', 'tappay'));