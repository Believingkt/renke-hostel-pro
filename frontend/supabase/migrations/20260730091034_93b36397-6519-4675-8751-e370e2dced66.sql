CREATE OR REPLACE FUNCTION public.set_order_exchange_rate_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 方案 A：trigger 不再自動猜測幣別。
  -- currency_at_booking / exchange_rate_snapshot 改由使用者主動選擇幣別時
  -- （前端 setOrderDisplayCurrency）寫入；未選擇則維持 NULL。
  RETURN NEW;
END;
$$;