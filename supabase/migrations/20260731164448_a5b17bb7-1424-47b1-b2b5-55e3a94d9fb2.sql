CREATE OR REPLACE FUNCTION public.create_commission_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_discount_code public.discount_codes;
  v_commission_amount numeric;
  v_exempt_sources jsonb;
  v_month date;
  v_addon_total numeric := 0;
  v_commission_base numeric;
BEGIN
  -- 非台幣訂單不建立分潤記錄（null 視為台幣）
  IF NEW.currency_at_booking IS NOT NULL AND NEW.currency_at_booking <> 'TWD' THEN
    DELETE FROM public.commission_records WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 業主自帶訂單不建立分潤記錄
  IF COALESCE(NEW.owner_direct, false) = true THEN
    DELETE FROM public.commission_records WHERE order_id = NEW.id;
    RETURN NEW;
  END IF;

  -- 免抽成來源判斷（以 order_date 月初為基準的生效版本）
  IF NEW.order_source IS NOT NULL THEN
    v_month := date_trunc('month', COALESCE(NEW.order_date, now()))::date;

    SELECT to_jsonb(r.exempt_order_sources) INTO v_exempt_sources
    FROM public.owner_settlement_pricing_rules r
    WHERE r.accommodation_id = NEW.accommodation_id
      AND r.effective_from <= v_month
    ORDER BY r.effective_from DESC, r.created_at DESC
    LIMIT 1;

    IF v_exempt_sources IS NULL THEN
      SELECT s.setting_value -> 'exempt_order_sources' INTO v_exempt_sources
      FROM public.system_settings s
      WHERE s.setting_key = 'owner_settlement_config:' || NEW.accommodation_id::text
      LIMIT 1;
    END IF;

    IF v_exempt_sources IS NULL THEN
      SELECT s.setting_value -> 'exempt_order_sources' INTO v_exempt_sources
      FROM public.system_settings s
      WHERE s.setting_key = 'owner_settlement_config'
      LIMIT 1;
    END IF;

    IF v_exempt_sources IS NOT NULL
       AND jsonb_typeof(v_exempt_sources) = 'array'
       AND v_exempt_sources ? NEW.order_source THEN
      DELETE FROM public.commission_records WHERE order_id = NEW.id;
      RETURN NEW;
    END IF;
  END IF;

  -- 加購項目總額（全額歸業主，不列入分潤基礎）
  IF NEW.custom_addon_details IS NOT NULL
     AND jsonb_typeof(NEW.custom_addon_details) = 'array' THEN
    SELECT COALESCE(SUM(COALESCE((elem ->> 'total')::numeric, 0)), 0)
      INTO v_addon_total
    FROM jsonb_array_elements(NEW.custom_addon_details) AS elem
    WHERE jsonb_typeof(elem) = 'object'
      AND (elem ->> 'total') ~ '^-?[0-9]+(\.[0-9]+)?$';
  END IF;

  v_commission_base := GREATEST(COALESCE(NEW.final_price, 0) - COALESCE(v_addon_total, 0), 0);

  -- 只在訂單有折扣碼時處理
  IF NEW.discount_code IS NOT NULL THEN
    SELECT * INTO v_discount_code
    FROM public.discount_codes
    WHERE code = NEW.discount_code
      AND accommodation_id = NEW.accommodation_id;

    IF v_discount_code.commission_rate > 0 THEN
      v_commission_amount := ROUND((v_commission_base * v_discount_code.commission_rate / 100)::numeric, 0);

      IF EXISTS (
        SELECT 1 FROM public.commission_records WHERE order_id = NEW.id
      ) THEN
        UPDATE public.commission_records
        SET
          discount_code_id = v_discount_code.id,
          order_total = NEW.total_price,
          discount_amount = NEW.discount_amount,
          commission_rate = v_discount_code.commission_rate,
          commission_amount = v_commission_amount
        WHERE order_id = NEW.id;
      ELSE
        INSERT INTO public.commission_records (
          accommodation_id,
          discount_code_id,
          order_id,
          order_total,
          discount_amount,
          commission_rate,
          commission_amount,
          settlement_status
        ) VALUES (
          NEW.accommodation_id,
          v_discount_code.id,
          NEW.id,
          NEW.total_price,
          NEW.discount_amount,
          v_discount_code.commission_rate,
          v_commission_amount,
          'pending'
        );
      END IF;
    ELSE
      DELETE FROM public.commission_records WHERE order_id = NEW.id;
    END IF;
  ELSE
    DELETE FROM public.commission_records WHERE order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS create_commission_on_order_updated ON public.orders;
CREATE TRIGGER create_commission_on_order_updated
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  old.discount_code IS DISTINCT FROM new.discount_code
  OR old.discount_amount IS DISTINCT FROM new.discount_amount
  OR old.final_price IS DISTINCT FROM new.final_price
  OR old.total_price IS DISTINCT FROM new.total_price
  OR old.custom_addon_details IS DISTINCT FROM new.custom_addon_details
  OR old.owner_direct IS DISTINCT FROM new.owner_direct
  OR old.order_source IS DISTINCT FROM new.order_source
  OR old.currency_at_booking IS DISTINCT FROM new.currency_at_booking
  OR old.order_status IS DISTINCT FROM new.order_status
  OR old.accommodation_id IS DISTINCT FROM new.accommodation_id
  OR old.order_date IS DISTINCT FROM new.order_date
)
EXECUTE FUNCTION public.create_commission_record();