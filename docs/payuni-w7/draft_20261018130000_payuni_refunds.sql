-- ============================================================
-- PAYUNi W7：退款與取消（只新增，不改既有欄位／資料）
--   1. payment_transactions 新增 3 欄（退款列用）
--      parent_tx_id          退款列指向的原付款交易
--      refund_source         退款來源：admin / guest / member / system / payuni_backstage（業主在 PAYUNi 後台自行退款）
--      refund_pending_reason 原交易暫不能退的原因（例如「請款處理中」），供後台顯示與 sweep 重試
--   2. 新表 refund_bank_accounts：ATM 退款轉匯用的旅客帳戶（短期保存）
--      - 不存身分證字號／統編（UID）：只在送 /api/trade/offline/refund 當下由表單帶入，送完即丟
--      - RLS 開啟、沒有任何 policy，並 REVOKE anon / authenticated：只有 service role（Edge Function）能讀寫
--      - account_no 遮罩清理（由 payuni-trade-query 的 sweep 執行，不在本 migration）：
--          退款列確認 paid 時寫入 purge_after = 當下 + 30 天；
--          sweep 每輪執行
--            UPDATE refund_bank_accounts
--            SET account_no = repeat('*', greatest(length(account_no) - 4, 0)) || right(account_no, 4), purged_at = now()
--            WHERE purge_after <= now() AND purged_at IS NULL;
--          轉匯失敗：purge_after 維持 NULL（保留到旅客重填）；旅客重填時新增一列，舊列立即遮罩
-- 鎖與逾時：整支 BEGIN/COMMIT；lock_timeout 3s 拿不到鎖就整支放棄
--   ADD COLUMN（可為 NULL、無預設值，只改目錄）會短暫取得 payment_transactions 的 ACCESS EXCLUSIVE
--   refund_bank_accounts 的 FK 會短暫取得 orders、payment_transactions 的 SHARE ROW EXCLUSIVE（擋寫入、不擋讀取）
-- 重跑安全：全部 IF NOT EXISTS
-- rollback：docs/payuni-w7/rollback_20261018130000.sql
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS parent_tx_id uuid REFERENCES public.payment_transactions(id),
  ADD COLUMN IF NOT EXISTS refund_source text
    CHECK (refund_source IN ('admin', 'guest', 'member', 'system', 'payuni_backstage')),
  ADD COLUMN IF NOT EXISTS refund_pending_reason text;

COMMENT ON COLUMN public.payment_transactions.parent_tx_id IS 'kind=refund 時指向原付款交易';
COMMENT ON COLUMN public.payment_transactions.refund_source IS 'kind=refund 的發動來源；payuni_backstage = 業主在 PAYUNi 後台自行退款（代理商 Notify 補登）';
COMMENT ON COLUMN public.payment_transactions.refund_pending_reason IS '原交易暫不能退款的原因（例如請款處理中）';

CREATE TABLE IF NOT EXISTS public.refund_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  refund_tx_id uuid REFERENCES public.payment_transactions(id),
  bank_code text NOT NULL CHECK (bank_code ~ '^[0-9]{3}$'),
  bank_sub_code text CHECK (bank_sub_code ~ '^[0-9]{4}$'),
  account_no text NOT NULL,
  holder_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz,
  purged_at timestamptz
);

COMMENT ON TABLE public.refund_bank_accounts IS
  'PAYUNi ATM 退款轉匯帳戶（短期）。不存身分證字號／統編；退款完成 30 天後 account_no 由 sweep 遮罩為末 4 碼。只有 service role 可存取。';

ALTER TABLE public.refund_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.refund_bank_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.refund_bank_accounts TO service_role;

COMMIT;
