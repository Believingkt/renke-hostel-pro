CREATE OR REPLACE FUNCTION public.validate_order_deposit_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  half_final NUMERIC;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.deposit_amount, 0) > 0 THEN
    half_final := FLOOR(COALESCE(NEW.final_price, 0) / 2);

    IF NEW.deposit_amount > half_final THEN
      RAISE EXCEPTION '訂金金額 (%) 必須小於或等於尾款（上限 %）', NEW.deposit_amount, half_final
        USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(NEW.balance_payment_method, NEW.payment_method, '') <> 'bank_transfer'
       AND NEW.payment_status = 'deposit_paid' THEN
      RAISE EXCEPTION '只有「匯款」付款方式可使用訂金 / 尾款拆分'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    NEW.deposit_amount := 0;
    IF COALESCE(NEW.paid_amount, 0) < COALESCE(NEW.final_price, 0) THEN
      NEW.paid_amount := NEW.final_price;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
