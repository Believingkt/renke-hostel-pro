ALTER TABLE public.order_meta
  ADD COLUMN IF NOT EXISTS team_commission_price_is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_meta.team_commission_price_is_manual IS
  'true = 分潤基準金額已由人工覆蓋，系統不再自動重算；false = 由系統自動計算（final_price − 全部增值服務金額）。';

-- 計算分潤基準金額：final_price − custom_addon_details 全部 total 加總（團隊佣金一律排除全部增值服務）
CREATE OR REPLACE FUNCTION public.calc_team_commission_price(_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE(o.final_price, 0) - COALESCE((
      SELECT SUM(COALESCE((elem->>'total')::numeric, 0))
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.custom_addon_details) = 'array'
             THEN o.custom_addon_details ELSE '[]'::jsonb END
      ) AS elem
    ), 0)
  )
  FROM public.orders o
  WHERE o.id = _order_id;
$$;

-- order_meta 新增/更新時，非人工覆蓋則自動填入系統計算值
CREATE OR REPLACE FUNCTION public.set_default_team_commission_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL
     AND COALESCE(NEW.team_commission_price_is_manual, false) = false
     AND NEW.team_commission_price IS NULL THEN
    NEW.team_commission_price := public.calc_team_commission_price(NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_meta_default_team_commission_price ON public.order_meta;
CREATE TRIGGER trg_order_meta_default_team_commission_price
BEFORE INSERT ON public.order_meta
FOR EACH ROW
EXECUTE FUNCTION public.set_default_team_commission_price();

-- 訂單金額或增值服務變動時，同步重算尚未被人工覆蓋的分潤基準金額
CREATE OR REPLACE FUNCTION public.sync_team_commission_price_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_meta om
  SET team_commission_price = public.calc_team_commission_price(NEW.id)
  WHERE om.order_id = NEW.id
    AND COALESCE(om.team_commission_price_is_manual, false) = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_team_commission_price ON public.orders;
CREATE TRIGGER trg_orders_sync_team_commission_price
AFTER UPDATE OF final_price, custom_addon_details ON public.orders
FOR EACH ROW
WHEN (
  NEW.final_price IS DISTINCT FROM OLD.final_price
  OR NEW.custom_addon_details IS DISTINCT FROM OLD.custom_addon_details
)
EXECUTE FUNCTION public.sync_team_commission_price_from_order();