ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS exchange_rate_snapshot numeric,
  ADD COLUMN IF NOT EXISTS currency_at_booking text;

COMMENT ON COLUMN public.orders.exchange_rate_snapshot IS
  '建單當下 accommodation_info.secondary_currency_rate 的快照（numeric）。NULL 代表該館未設第二幣別，或為方案 B 的歷史訂單（未 backfill）→ 計算時 fallback 使用館別現值。';
COMMENT ON COLUMN public.orders.currency_at_booking IS
  '建單當下 accommodation_info.secondary_currency 的快照（如 JPY）。NULL 視為純台幣訂單；歷史訂單一律 NULL（方案 B）。';

CREATE OR REPLACE FUNCTION public.set_order_exchange_rate_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
  v_rate numeric;
BEGIN
  -- 僅在 INSERT 時填入；UPDATE 不觸發，避免既有訂單快照被覆寫。
  IF NEW.accommodation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ai.secondary_currency, ai.secondary_currency_rate
    INTO v_currency, v_rate
  FROM public.accommodation_info ai
  WHERE ai.id = NEW.accommodation_id;

  IF v_currency IS NOT NULL AND btrim(v_currency) <> '' THEN
    NEW.currency_at_booking := upper(btrim(v_currency));
    NEW.exchange_rate_snapshot := v_rate;
  END IF;
  -- 無第二幣別 → 兩欄維持 NULL（純台幣訂單，無需快照）

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_order_exchange_rate_snapshot() IS
  '建單當下匯率快照：BEFORE INSERT 時由 accommodation_info 讀取 secondary_currency / secondary_currency_rate 寫入訂單，避免日後館別匯率調整回溯影響歷史訂單金額。方案 B：歷史訂單不 backfill，業主月結遇 NULL 時 fallback 使用館別現值。';

DROP TRIGGER IF EXISTS set_order_exchange_rate_snapshot ON public.orders;
CREATE TRIGGER set_order_exchange_rate_snapshot
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_exchange_rate_snapshot();