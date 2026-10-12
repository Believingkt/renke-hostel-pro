-- V5.5C.3: 後台手動建單訂金上限放寬至訂單總額
--   * 條件：auth.uid() IS NOT NULL 且 user_has_access_to_accommodation(auth.uid(), NEW.accommodation_id)
--     （在該館有任何後台角色，含 staff；全域 super_admin 依該函式本身規則）→ 上限 = final_price
--   * 其他情況（anon、一般會員、service role / auth.uid() 為 NULL）→ 維持 FLOOR(final_price / 2)
--   * 其餘行為完全不變：bypass GUC、僅 INSERT、deposit_paid 須 bank_transfer、paid 清零訂金、
--     函式名稱／簽章／LANGUAGE／SECURITY（INVOKER）／search_path、trigger 名稱與順序皆不變。
-- ROLLBACK：直接執行 docs/v55c3/02_rollback.sql（由 20260612042726 原文逐字擷取）。

-- PRECHECK
DO $$
DECLARE
  v_def TEXT;
  v_secdef BOOLEAN;
  v_config TEXT[];
  v_trg INT;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    INTO v_def, v_secdef, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'validate_order_deposit_on_insert'
     AND p.pronargs = 0;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PRECHECK FAILED: public.validate_order_deposit_on_insert() not found';
  END IF;

  RAISE NOTICE 'PRECHECK def md5=% len=% prosecdef=% proconfig=%',
    md5(v_def), length(v_def), v_secdef, v_config;

  IF v_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PRECHECK FAILED: expected prosecdef=false, got %', v_secdef;
  END IF;

  IF v_config IS DISTINCT FROM ARRAY['search_path=public'] THEN
    RAISE EXCEPTION 'PRECHECK FAILED: expected proconfig={search_path=public}, got %', v_config;
  END IF;

  IF v_def NOT LIKE '%half_final%' OR v_def NOT LIKE '%必須小於或等於尾款%' THEN
    RAISE EXCEPTION 'PRECHECK FAILED: function body is not the expected pre-change baseline';
  END IF;

  IF v_def NOT LIKE '%app.bypass_inventory_check%'
     OR v_def NOT LIKE '%只有「匯款」付款方式可使用訂金 / 尾款拆分%' THEN
    RAISE EXCEPTION 'PRECHECK FAILED: baseline is missing bypass GUC or bank_transfer rule';
  END IF;

  SELECT count(*) INTO v_trg
    FROM pg_trigger
   WHERE tgrelid = 'public.orders'::regclass
     AND tgname = 'zzz_validate_order_deposit_on_insert';
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: expected 1 zzz_validate_order_deposit_on_insert trigger, got %', v_trg;
  END IF;
END $$;

-- APPLY
CREATE OR REPLACE FUNCTION public.validate_order_deposit_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  max_deposit NUMERIC;
  v_uid UUID;
  v_backoffice BOOLEAN := false;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.deposit_amount, 0) > 0 THEN
    -- 後台人員（在該館有任何角色）手動建單：訂金上限可到訂單總額
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
      v_backoffice := public.user_has_access_to_accommodation(v_uid, NEW.accommodation_id);
    END IF;

    IF v_backoffice THEN
      max_deposit := COALESCE(NEW.final_price, 0);
    ELSE
      max_deposit := FLOOR(COALESCE(NEW.final_price, 0) / 2);
    END IF;

    IF NEW.deposit_amount > max_deposit THEN
      RAISE EXCEPTION '訂金金額 (%) 必須小於或等於上限（%）', NEW.deposit_amount, max_deposit
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

-- POSTCHECK
DO $$
DECLARE
  v_def TEXT;
  v_secdef BOOLEAN;
  v_config TEXT[];
  v_trg INT;
  v_order TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    INTO v_def, v_secdef, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'validate_order_deposit_on_insert'
     AND p.pronargs = 0;

  RAISE NOTICE 'POSTCHECK def md5=% len=% prosecdef=% proconfig=%',
    md5(v_def), length(v_def), v_secdef, v_config;

  IF v_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: prosecdef changed to %', v_secdef;
  END IF;

  IF v_config IS DISTINCT FROM ARRAY['search_path=public'] THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: proconfig changed to %', v_config;
  END IF;

  IF v_def NOT LIKE '%user_has_access_to_accommodation%'
     OR v_def NOT LIKE '%必須小於或等於上限%'
     OR v_def LIKE '%必須小於或等於尾款%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: new deposit cap logic not in place';
  END IF;

  IF v_def NOT LIKE '%app.bypass_inventory_check%'
     OR v_def NOT LIKE '%只有「匯款」付款方式可使用訂金 / 尾款拆分%'
     OR v_def NOT LIKE '%TG_OP <> ''INSERT''%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: pre-existing rules were not preserved';
  END IF;

  SELECT count(*) INTO v_trg
    FROM pg_trigger
   WHERE tgrelid = 'public.orders'::regclass
     AND tgname = 'zzz_validate_order_deposit_on_insert';
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: trigger count = %', v_trg;
  END IF;

  SELECT string_agg(tgname, ' > ' ORDER BY tgname) INTO v_order
    FROM pg_trigger
   WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND (tgtype & 2) = 2;
  RAISE NOTICE 'POSTCHECK BEFORE-trigger order: %', v_order;
END $$;
