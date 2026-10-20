-- rollback 20261025090000_drop_owner_direct：恢復 orders.owner_direct、依備份還原開關值、還原相關函式與觸發器
BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS owner_direct boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orders.owner_direct IS '業主自帶客：勾選後該訂單不計入平台抽成';

-- 先停用分潤觸發器再還原開關，避免還原過程重算分潤
ALTER TABLE public.orders DISABLE TRIGGER create_commission_on_order_updated;
UPDATE public.orders o
SET owner_direct = b.owner_direct
FROM public.owner_direct_backup_20260601 b
WHERE b.order_id = o.id;
ALTER TABLE public.orders ENABLE TRIGGER create_commission_on_order_updated;

-- log_order_change：稽核欄位清單加回 owner_direct
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.log_order_change()'::regprocedure);
  IF v_def !~ '\mowner_direct\M' THEN
    v_new := replace(v_def, '''requires_owner_review'',', '''owner_direct'',''requires_owner_review'',');
    IF v_new = v_def THEN RAISE EXCEPTION 'log_order_change 還原失敗：找不到 requires_owner_review'; END IF;
    EXECUTE v_new;
  END IF;
END $$;

-- create_commission_record() 與觸發器（20260731164448 原版）
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

-- update_order_fields_v1（20260911073711 原版）
CREATE OR REPLACE FUNCTION public.update_order_fields_v1(p_order_id uuid, p_patch jsonb, p_source text, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $function$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    'order_status','payment_status','order_source','owner_direct',
    'order_date','confirmed_at','checked_in_at','checked_out_at','cancelled_at',
    'check_in_date','check_out_date','room_type_id','package_id',
    'display_room_type_name','room_quantity','lock_whole_building',
    'guest_name','guest_phone','guest_email','guest_count',
    'adult_count','child_count','toddler_count','infant_count',
    'pet_count','pet_plan_price','meal_plan','meal_plan_total','meal_plan_details',
    'custom_addon_details','total_price','discount_amount','discount_code',
    'final_price','deposit_amount','paid_amount','customer_id','member_id','notes',
    'guest_gender','guest_address','guest_nationality',
    'deposit_payment_method','balance_payment_method'
  ];
  v_key text; v_type text; v_sets text[] := '{}'; v_n integer;
  v_old public.orders%ROWTYPE;
  v_is_atm boolean;
  v_is_card boolean;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: p_order_id 不可為 NULL'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: 需要登入'; END IF;

  -- 取消防護：團購、信用卡與 ATM 已付款訂單不得由通用欄位更新直接改成 cancelled
  IF (p_patch ? 'order_status') AND p_patch->>'order_status' = 'cancelled' THEN
    SELECT * INTO v_old FROM public.orders WHERE id = p_order_id;
    IF FOUND AND v_old.order_status IS DISTINCT FROM 'cancelled' THEN
      v_is_atm := coalesce(v_old.balance_payment_method in ('atm','ATM','atm_transfer'), false)
               or coalesce(v_old.payment_method in ('atm','ATM','atm_transfer'), false)
               or coalesce(v_old.deposit_payment_method in ('atm','ATM','atm_transfer'), false);

      v_is_card := coalesce(v_old.balance_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or coalesce(v_old.payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or coalesce(v_old.deposit_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or v_old.room_charge_rec_trade_id is not null;

      IF v_old.order_source = 'group_buy'
         OR (NOT v_is_atm AND v_is_card)
         OR (v_is_atm AND coalesce(v_old.paid_amount,0) > 0
             AND coalesce(v_old.refund_status,'none') <> 'refunded') THEN
        RAISE EXCEPTION 'ORDER_CANCEL_BLOCKED: 此訂單必須使用專屬取消流程';
      END IF;
    END IF;
  END IF;

  PERFORM public.set_order_change_context(p_source, p_reason, NULL, 'user');

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_fields_v1: 欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type);
  END LOOP;
  IF array_length(v_sets, 1) IS NULL THEN RETURN 0; END IF;

  EXECUTE format('UPDATE public.orders SET %s, updated_at = now() WHERE id = $2',
                 array_to_string(v_sets, ', ')) USING p_patch, p_order_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'update_order_fields_v1: 無權限或訂單不存在'; END IF;
  RETURN v_n;
END;
$function$;

-- ACL 維持原樣：authenticated/service_role/sandbox_exec 可執行
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO sandbox_exec_dmafqwfynatdvnaeovhz;
COMMIT;
