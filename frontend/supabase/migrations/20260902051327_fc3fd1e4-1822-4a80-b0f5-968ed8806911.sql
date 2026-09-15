ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS group_buy_payment_deadline_at timestamptz NULL;

COMMENT ON COLUMN public.orders.group_buy_payment_deadline_at IS
'團購 ATM 新制：本地商業付款期限（絕對時間，建單時寫入一次即固定）。NULL = 舊制訂單，沿用 atm_expire_at 生命週期。與 atm_expire_at（TapPay provider 真實 VA 期限）為兩個不同概念，不得互相覆蓋。';