-- PAYUNi 金流 W1：資料模型（只新增；唯一例外為 orders_payment_provider_check 重建以加入 'payuni'）
-- 敏感資料（登記名稱、統編／身分證字號、會員信箱、審核原因、設定）不放 accommodation_info（該表 anon 可讀），
-- 改放 accommodation_payuni_private；新表皆開 RLS 且不加 policy，僅 service role（edge function）可讀寫。

-- ---------- 1. accommodation_info：非敏感的 PAYUNi 狀態欄位 ----------
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS payuni_mer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS payuni_mer_status integer,
  ADD COLUMN IF NOT EXISTS payuni_member_status integer,
  ADD COLUMN IF NOT EXISTS payuni_payment_tools jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payuni_mer_eng_name text,
  ADD COLUMN IF NOT EXISTS payuni_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS payuni_status_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_provider_active text NOT NULL DEFAULT 'tappay'
    CONSTRAINT accommodation_info_payment_provider_active_check
    CHECK (payment_provider_active IN ('tappay', 'payuni', 'none'));

COMMENT ON COLUMN public.accommodation_info.payuni_mer_status IS 'PAYUNi 商店狀態：1 啟用 / 2 關閉 / 8 拒絕 / 9 審核中 / 91 待補資料 / 92 審核失敗 / 99 停用';
COMMENT ON COLUMN public.accommodation_info.payuni_member_status IS 'PAYUNi 會員狀態：1 / 5 / 8 / 9 / 92 / 99';
COMMENT ON COLUMN public.accommodation_info.payuni_payment_tools IS '各支付工具狀態，如 {"CREDIT":1,"ATM":1,"ForeignCard":9}';
COMMENT ON COLUMN public.accommodation_info.payment_provider_active IS '目前啟用的金流：tappay | payuni | none';

-- ---------- 2. accommodation_payuni_private：敏感建店資料（一館一列） ----------
CREATE TABLE IF NOT EXISTS public.accommodation_payuni_private (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id),
  payuni_legal_name text,
  payuni_ubn text,
  payuni_member_email text,
  payuni_status_reason text,
  payuni_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.accommodation_payuni_private IS 'PAYUNi 建店敏感資料（登記名稱、統編／身分證字號、會員信箱、審核原因、MerSetting/BackSetting）；僅 service role 可存取';

-- ---------- 3. payment_transactions ----------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id),
  provider text NOT NULL CHECK (provider IN ('payuni', 'tappay')),
  mer_id text,
  mer_trade_no text NOT NULL,
  provider_trade_no text,
  kind text NOT NULL CHECK (kind IN ('full', 'deposit', 'final', 'addon', 'refund', 'cancel')),
  payment_type integer,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'unknown', 'paid', 'failed', 'cancelled', 'refunded', 'partial_refunded', 'expired')),
  card_last4 text,
  card_first6 text,
  auth_code text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_id_idx ON public.payment_transactions (order_id);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_trade_no_idx ON public.payment_transactions (provider_trade_no);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_mer_trade_no_key ON public.payment_transactions (provider, mer_trade_no);
COMMENT ON COLUMN public.payment_transactions.mer_trade_no IS '送給 PAYUNi 的商店訂單編號（含後綴）';
COMMENT ON COLUMN public.payment_transactions.provider_trade_no IS 'PAYUNi TradeNo（UNi 序號）';
COMMENT ON COLUMN public.payment_transactions.payment_type IS '1 信用卡 / 2 ATM';

-- ---------- 4. payuni_notify_events ----------
CREATE TABLE IF NOT EXISTS public.payuni_notify_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('trade', 'agent')),
  notify_type text,
  mer_id text,
  trade_no text,
  execute_time text,
  hash_valid boolean NOT NULL,
  payload_raw jsonb NOT NULL,
  decrypted jsonb,
  processed boolean NOT NULL DEFAULT false,
  process_error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payuni_notify_events_mer_created_idx ON public.payuni_notify_events (mer_id, created_at DESC);
-- 冪等：可空欄位全部 coalesce；只套用在驗章通過的列，驗章失敗的照樣留存但不佔 key
CREATE UNIQUE INDEX IF NOT EXISTS payuni_notify_events_idempotency_key
  ON public.payuni_notify_events (source, coalesce(notify_type, ''), coalesce(mer_id, ''), coalesce(trade_no, ''), coalesce(execute_time, ''))
  WHERE hash_valid;
COMMENT ON COLUMN public.payuni_notify_events.payload_raw IS '外層四欄原文（含 EncryptInfo，供重放）';

-- ---------- 5. payuni_merchant_applications ----------
CREATE TABLE IF NOT EXISTS public.payuni_merchant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  mer_id text NOT NULL,
  request_snapshot jsonb NOT NULL,
  response_status text,
  response_message text,
  submitted_by uuid,
  created_at timestamptz DEFAULT now()
);
COMMENT ON COLUMN public.payuni_merchant_applications.request_snapshot IS '建店送出參數快照；不存 MCID、UBN 以外的身分證資料';

-- ---------- 6. RLS：新表一律開啟、不加 policy（僅 service role） ----------
ALTER TABLE public.accommodation_payuni_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payuni_notify_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payuni_merchant_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accommodation_payuni_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payment_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payuni_notify_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payuni_merchant_applications FROM PUBLIC, anon, authenticated;

-- ---------- 7. orders.payment_provider 允許 'payuni'（本輪唯一允許的 DROP） ----------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_provider_check
  CHECK (payment_provider IN ('manual', 'tappay', 'payuni'));
