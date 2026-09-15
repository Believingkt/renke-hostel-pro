-- =====================================================================
-- PHASE 3A · STEP 1 (PAID DISCOUNT) + PAID-ORDER ADDON — COMBINED v5.4
-- SETTLED-ORDER ADJUSTMENT USES CONFIRMATION, NOT BLOCKING
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION 0 — PRECHECK
-- ---------------------------------------------------------------------
DO $precheck$
DECLARE
  v_src_sha text;
  v_owner text;
  v_secdef boolean;
  v_config text;
  v_acl text;
  v_trg int;
  v_cols int;
  v_fn text;
  v_sha text;
  v_actual text;
BEGIN
  IF to_regprocedure('public.prevent_immutable_order_fields_change()') IS NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard function 不存在';
  END IF;

  SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         COALESCE(array_to_string(p.proconfig, ','), ''),
         COALESCE(p.proacl::text, '')
    INTO v_src_sha, v_owner, v_secdef, v_config, v_acl
  FROM pg_proc p
  WHERE p.oid = 'public.prevent_immutable_order_fields_change()'::regprocedure;

  IF v_src_sha <> '35cb3a97b31cc548ee1f220b7667eae67db53dbe1f501427f7c89b112b50838b' THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard 本文已漂移（現=%）', v_src_sha;
  END IF;
  IF v_owner <> 'postgres' OR v_secdef IS NOT TRUE OR v_config <> 'search_path=public' THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard owner/security/search_path 不符（%/%/%）', v_owner, v_secdef, v_config;
  END IF;
  IF position('authenticated=X/postgres' IN v_acl) = 0
     OR position('anon=X/postgres' IN v_acl) = 0
     OR position('service_role=X/postgres' IN v_acl) = 0 THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard ACL 不符（%）', v_acl;
  END IF;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.orders'::regclass
    AND tgname = 'trg_prevent_immutable_order_fields'
    AND NOT tgisinternal
    AND tgenabled = 'O'
    AND pg_get_triggerdef(oid) =
        'CREATE TRIGGER trg_prevent_immutable_order_fields BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION prevent_immutable_order_fields_change()';
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'PHASE3A STOP: trg_prevent_immutable_order_fields 定義／啟用狀態不符';
  END IF;

  IF to_regprocedure('public.get_staff_module_permission(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.validate_discount_code(text,uuid,integer,uuid,date,uuid)') IS NULL
     OR to_regprocedure('public.calc_order_addon_total(numeric,numeric,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: 依賴的既有 function 簽章不符';
  END IF;

  IF to_regprocedure('public.calc_team_commission_price(uuid)') IS NULL
     OR to_regprocedure('public.enforce_order_meta_commission_fields()') IS NULL
     OR to_regprocedure('public.sync_team_commission_price_from_order()') IS NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: commission 物件缺失，環境與預期不符';
  END IF;

  IF to_regprocedure('public.update_paid_order_discount(uuid,timestamptz,text,text,integer,text,boolean,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: update_paid_order_discount 已存在（僅支援全新安裝）';
  END IF;
  IF to_regprocedure('public.update_paid_order_addons(uuid,timestamptz,text,text,jsonb,integer,integer,boolean,text,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: update_paid_order_addons 已存在（僅支援全新安裝）';
  END IF;

  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audit_logs'
    AND column_name IN ('id','accommodation_id','user_id','user_email','action_type',
                        'action_category','entity_type','entity_id','entity_name',
                        'details','created_at');
  IF v_cols <> 11 THEN
    RAISE EXCEPTION 'PHASE3A STOP: audit_logs 欄位與預期不符（找到 % 欄）', v_cols;
  END IF;

  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders'
    AND column_name IN ('id','accommodation_id','payment_status','order_status','refund_status',
                        'refunded_amount','refunded_at','paid_amount','total_price','discount_amount',
                        'discount_code','final_price','updated_at','room_type_id','check_in_date',
                        'pet_plan_price','meal_plan_total','custom_addon_details','notes','order_number');
  IF v_cols <> 20 THEN
    RAISE EXCEPTION 'PHASE3A STOP: orders 欄位與預期不符（找到 % 欄）', v_cols;
  END IF;

  FOR v_fn, v_sha IN
    SELECT * FROM (VALUES
      ('enforce_order_meta_commission_fields',  'e492e382f4efd120eb20afedc6070e168ea39830e8fbce0461e6795f534ccb6a'),
      ('sync_team_commission_price_from_order', '141b3513f713727341cd154c8d20d2948c65c17aee47e355cf6371dee5bc338e'),
      ('calc_team_commission_price',            '21cbc331716d569592733ee2553e5069ff2587263b36466972dcd75a8d97bd7c'),
      ('create_commission_record',              '84895ab58a432679d535734317b71e5ea38f65bd6a1930deda7c1329290649b0'),
      ('create_split_record_on_order',          '5c69973df5162f63b5854e25d02e8641767df605e97983418c70fab64048a1b8'),
      ('calc_order_addon_total',                '401aeb1be7085196f276bc63818c971c6a50745c0262a95bead8a2195bfcdcab'),
      ('get_staff_module_permission',           '16c79785dc16a8dcc64635a9fe0de34a7f7f180b76eaf1d27a84b438cabc560b'),
      ('validate_discount_code',                '9ff35b93bf940d4f92a730d1a583b8925fb74342ad6df5902eb7fba22a6975a2')
    ) AS t(fn, sha)
  LOOP
    SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') INTO v_actual
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn
     LIMIT 1;
    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'PHASE3A STOP: 受保護 function % 不存在', v_fn;
    END IF;
    IF v_actual <> v_sha THEN
      RAISE EXCEPTION 'PHASE3A STOP: 受保護 function % 已與 baseline 不同（% <> %）', v_fn, v_actual, v_sha;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgenabled = 'O'
    AND tgname IN ('create_commission_on_order_confirmed',
                   'create_commission_on_order_updated',
                   'create_split_record_trigger');
  IF v_trg <> 3 THEN
    RAISE EXCEPTION 'PHASE3A STOP: 獎金 trigger binding 與 baseline 不符（找到 %）', v_trg;
  END IF;
END
$precheck$;


-- ---------------------------------------------------------------------
-- SECTION 1 — COMBINED CANONICAL GUARD
-- MARKER: PHASE3A_COMBINED_GUARD_v5_4
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MARKER: PHASE3A_COMBINED_GUARD_v5_4
DECLARE
  is_super_admin_user boolean := false;
  is_hotelnabe boolean := false;
  old_line text;
  old_addon numeric;
  new_addon numeric;
  old_includes_addon boolean;
  old_room_fee numeric;
  new_room_fee numeric;
  discount_changed boolean := false;
  addon_changed boolean := false;
  rpc_discount_ok boolean := false;
  rpc_addon_ok boolean := false;
  v_reason text;
  v_new jsonb;
  v_old jsonb;
  v_diff_keys text[];
  v_key text;
  v_addon_delta numeric;
  v_paid_delta numeric;
  v_declared_paid_delta numeric;
  v_settle text;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    ) INTO is_super_admin_user;
  END IF;

  is_hotelnabe := COALESCE(OLD.order_source, '') = 'hotelnabe'
                  OR COALESCE(NEW.order_source, '') = 'hotelnabe';

  old_addon := COALESCE(public.calc_order_addon_total(
    OLD.pet_plan_price, OLD.meal_plan_total, OLD.custom_addon_details, OLD.notes), 0);
  new_addon := COALESCE(public.calc_order_addon_total(
    NEW.pet_plan_price, NEW.meal_plan_total, NEW.custom_addon_details, NEW.notes), 0);

  old_includes_addon := abs(
      COALESCE(OLD.final_price, 0)
      - (COALESCE(OLD.total_price, 0) - COALESCE(OLD.discount_amount, 0))
    ) <= 1;

  discount_changed :=
    NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR COALESCE(NEW.discount_code, '') IS DISTINCT FROM COALESCE(OLD.discount_code, '');

  addon_changed :=
    NEW.custom_addon_details IS DISTINCT FROM OLD.custom_addon_details
    OR NEW.pet_plan_price IS DISTINCT FROM OLD.pet_plan_price;

  -- 窄路徑 A：已結清訂單的折扣變更
  IF auth.uid() IS NOT NULL
     AND OLD.payment_status IN ('fully_paid', 'paid')
     AND NOT is_hotelnabe
     AND discount_changed THEN

    IF COALESCE(current_setting('app.paid_discount_rpc', true), '') <> 'on'
       OR COALESCE(current_setting('app.paid_discount_order', true), '') IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'discount changes on settled orders must go through public.update_paid_order_discount()'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(
         public.get_staff_module_permission(auth.uid(), OLD.accommodation_id, 'orders'),
         'hidden'
       ) <> 'editable' THEN
      RAISE EXCEPTION 'insufficient permission to change discount on a settled order'
        USING ERRCODE = '42501';
    END IF;

    v_reason := btrim(COALESCE(current_setting('app.paid_discount_reason', true), ''));
    IF length(v_reason) < 2 THEN
      RAISE EXCEPTION 'a reason is required to change discount on a settled order'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(current_setting('app.paid_discount_confirmed', true), '') <> 'on' THEN
      RAISE EXCEPTION 'settled-order discount change requires an explicit second confirmation'
        USING ERRCODE = '42501';
    END IF;
    v_settle := btrim(COALESCE(current_setting('app.paid_discount_settlement', true), ''));
    IF v_settle NOT IN ('collected', 'refunded', 'offset', 'pending', 'data_only') THEN
      RAISE EXCEPTION 'a settlement-handling選項 is required for a settled-order discount change'
        USING ERRCODE = '42501';
    END IF;

    v_new := to_jsonb(NEW) - 'discount_amount' - 'discount_code' - 'final_price' - 'updated_at';
    v_old := to_jsonb(OLD) - 'discount_amount' - 'discount_code' - 'final_price' - 'updated_at';

    IF v_new IS DISTINCT FROM v_old THEN
      SELECT array_agg(k) INTO v_diff_keys FROM (
        SELECT n.key AS k FROM jsonb_each(v_new) n
          WHERE NOT (v_old ? n.key) OR (v_old -> n.key) IS DISTINCT FROM n.value
        UNION
        SELECT o.key FROM jsonb_each(v_old) o WHERE NOT (v_new ? o.key)
      ) d;
      RAISE EXCEPTION 'only discount fields may change in a settled-order discount update (offending fields: %)',
        array_to_string(COALESCE(v_diff_keys, ARRAY[]::text[]), ',')
        USING ERRCODE = '42501';
    END IF;

    rpc_discount_ok := true;
  END IF;

  -- 窄路徑 B：已付款訂單的額外加購變更
  IF auth.uid() IS NOT NULL
     AND OLD.payment_status IN ('fully_paid', 'paid')
     AND NOT is_hotelnabe
     AND addon_changed THEN

    IF COALESCE(current_setting('app.paid_addon_rpc', true), '') <> 'on'
       OR COALESCE(current_setting('app.paid_addon_order', true), '') IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'addon changes on paid orders must go through public.update_paid_order_addons()'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(
         public.get_staff_module_permission(auth.uid(), OLD.accommodation_id, 'orders'),
         'hidden'
       ) <> 'editable' THEN
      RAISE EXCEPTION 'insufficient permission to change addons on a paid order'
        USING ERRCODE = '42501';
    END IF;

    v_reason := btrim(COALESCE(current_setting('app.paid_addon_reason', true), ''));
    IF length(v_reason) < 2 THEN
      RAISE EXCEPTION 'a reason is required to change addons on a paid order'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(current_setting('app.paid_addon_confirmed', true), '') <> 'on' THEN
      RAISE EXCEPTION 'paid-order addon change requires an explicit second confirmation'
        USING ERRCODE = '42501';
    END IF;
    v_settle := btrim(COALESCE(current_setting('app.paid_addon_settlement', true), ''));
    IF v_settle NOT IN ('collected', 'refunded', 'offset', 'pending', 'data_only') THEN
      RAISE EXCEPTION 'a settlement-handling選項 is required for a paid-order addon change'
        USING ERRCODE = '42501';
    END IF;

    v_new := to_jsonb(NEW) - 'custom_addon_details' - 'pet_plan_price'
                           - 'total_price' - 'final_price'
                           - 'paid_amount' - 'updated_at';
    v_old := to_jsonb(OLD) - 'custom_addon_details' - 'pet_plan_price'
                           - 'total_price' - 'final_price'
                           - 'paid_amount' - 'updated_at';

    IF v_new IS DISTINCT FROM v_old THEN
      SELECT array_agg(k) INTO v_diff_keys FROM (
        SELECT n.key AS k FROM jsonb_each(v_new) n
          WHERE NOT (v_old ? n.key) OR (v_old -> n.key) IS DISTINCT FROM n.value
        UNION
        SELECT o.key FROM jsonb_each(v_old) o WHERE NOT (v_new ? o.key)
      ) d;
      RAISE EXCEPTION 'only addon fields may change in a paid-order addon update (offending fields: %)',
        array_to_string(COALESCE(v_diff_keys, ARRAY[]::text[]), ',')
        USING ERRCODE = '42501';
    END IF;

    IF discount_changed THEN
      RAISE EXCEPTION 'discount may not change in a paid-order addon update' USING ERRCODE = '42501';
    END IF;

    v_addon_delta := new_addon - old_addon;
    IF v_addon_delta < 0
       AND COALESCE(current_setting('app.paid_addon_reduce_ack', true), '') <> 'on' THEN
      RAISE EXCEPTION 'reducing addons on a paid order requires an explicit high-risk acknowledgement'
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(NEW.final_price, 0) - COALESCE(OLD.final_price, 0) IS DISTINCT FROM v_addon_delta THEN
      RAISE EXCEPTION 'final_price delta must equal the addon delta on a paid-order addon update'
        USING ERRCODE = '42501';
    END IF;

    v_paid_delta := COALESCE(NEW.paid_amount, 0) - COALESCE(OLD.paid_amount, 0);
    BEGIN
      v_declared_paid_delta := COALESCE(
        NULLIF(btrim(COALESCE(current_setting('app.paid_addon_paid_delta', true), '')), ''),
        '0')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid declared paid_amount delta on a paid-order addon update'
        USING ERRCODE = '42501';
    END;
    IF v_paid_delta IS DISTINCT FROM v_declared_paid_delta THEN
      RAISE EXCEPTION 'paid_amount may only change by the amount explicitly entered by the operator'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'payment_status may not change in a paid-order addon update'
        USING ERRCODE = '42501';
    END IF;

    rpc_addon_ok := true;
  END IF;

  IF NOT is_super_admin_user THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number is immutable and cannot be changed';
    END IF;

    IF NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
      RAISE EXCEPTION 'accommodation_id is immutable and cannot be changed';
    END IF;

    IF OLD.idempotency_key IS NOT NULL
       AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key cannot be changed once set';
    END IF;

    IF OLD.payment_status IN ('fully_paid', 'paid') AND NOT is_hotelnabe THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        old_room_fee := COALESCE(OLD.total_price, 0)
                        - CASE WHEN old_includes_addon THEN old_addon ELSE 0 END;
        new_room_fee := COALESCE(NEW.total_price, 0)
                        - CASE WHEN old_includes_addon THEN new_addon ELSE 0 END;
        IF old_room_fee IS DISTINCT FROM new_room_fee THEN
          RAISE EXCEPTION 'total_price cannot be changed after payment';
        END IF;
      END IF;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT rpc_discount_ok THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
      IF COALESCE(NEW.discount_code, '') IS DISTINCT FROM COALESCE(OLD.discount_code, '') AND NOT rpc_discount_ok THEN
        RAISE EXCEPTION 'discount_code cannot be changed after payment';
      END IF;
    END IF;
  END IF;

  IF OLD.notes IS NOT NULL THEN
    FOR old_line IN
      SELECT line FROM regexp_split_to_table(OLD.notes, E'\n') AS line
      WHERE line LIKE '🔒[金額異動%'
    LOOP
      IF NEW.notes IS NULL OR position(old_line IN NEW.notes) = 0 THEN
        RAISE EXCEPTION '已鎖定的金額異動記錄不可刪除或修改：%', old_line;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.prevent_immutable_order_fields_change() OWNER TO postgres;


-- ---------------------------------------------------------------------
-- SECTION 2 — NARROW RPC A：已結清訂單折扣
-- ---------------------------------------------------------------------
CREATE FUNCTION public.update_paid_order_discount(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_mode text,
  p_discount_amount integer DEFAULT NULL,
  p_discount_code text DEFAULT NULL,
  p_confirmed boolean DEFAULT false,
  p_settlement_handling text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_code text := NULLIF(upper(btrim(COALESCE(p_discount_code, ''))), '');
  v_new_discount integer;
  v_new_code text;
  v_new_final integer;
  v_room_fee integer;
  v_template_ids uuid[];
  v_room_type_ids uuid[];
  v_template_id uuid;
  v_room_type_id uuid;
  v_valid record;
  v_rows int;
  v_audit_id uuid;
  v_after public.orders%ROWTYPE;
  v_old_discount integer;
  v_old_code text;
  v_old_final integer;
  v_settle text := lower(btrim(COALESCE(p_settlement_handling, '')));
  v_paid integer;
  v_diff integer;
  v_diff_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('manual', 'none', 'code') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION '請填寫修改原因' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION '尚未完成二次確認，未做任何修改' USING ERRCODE = '22023';
  END IF;
  IF v_settle NOT IN ('collected', 'refunded', 'offset', 'pending', 'data_only') THEN
    RAISE EXCEPTION '請選擇差額處理方式（已完成收款／已完成退款或返還／已完成折抵或其他處理／尚待處理／純資料校正）'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(
       public.get_staff_module_permission(v_uid, o.accommodation_id, 'orders'),
       'hidden'
     ) <> 'editable' THEN
    RAISE EXCEPTION '權限不足：您對此館別的「訂單」模組沒有編輯權限' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
     OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '訂單已被其他人修改，請重新整理後再試' USING ERRCODE = '40001';
  END IF;

  IF COALESCE(lower(o.refund_status), 'none') IN ('pending', 'pending_manual', 'processing', 'refunding', 'refunded')
     OR lower(COALESCE(o.payment_status, '')) IN ('refunded', 'partial_refunded')
     OR COALESCE(o.refunded_amount, 0) > 0
     OR o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION '此訂單已退款或退款處理中，無法修改折扣' USING ERRCODE = '42501';
  END IF;
  IF lower(COALESCE(o.order_status, '')) = 'cancelled'
     AND (COALESCE(o.paid_amount, 0) > 0
          OR lower(COALESCE(o.payment_status, '')) IN ('paid', 'fully_paid', 'partial_paid', 'deposit_paid')) THEN
    RAISE EXCEPTION '已取消且曾付款的訂單無法修改折扣' USING ERRCODE = '42501';
  END IF;

  v_old_discount := COALESCE(o.discount_amount, 0);
  v_old_code := NULLIF(upper(btrim(COALESCE(o.discount_code, ''))), '');
  v_old_final := COALESCE(o.final_price, 0);

  v_room_fee := GREATEST(
    0,
    COALESCE(o.total_price, 0)::integer
    - CASE WHEN abs(COALESCE(o.final_price, 0) - (COALESCE(o.total_price, 0) - COALESCE(o.discount_amount, 0))) <= 1
             THEN COALESCE(public.calc_order_addon_total(
                    o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer
             ELSE 0
      END
  );

  IF v_mode = 'none' THEN
    v_new_discount := 0;
    v_new_code := NULL;

  ELSIF v_mode = 'manual' THEN
    IF p_discount_amount IS NULL OR p_discount_amount < 0 THEN
      RAISE EXCEPTION '折扣金額不得為負數' USING ERRCODE = '22023';
    END IF;
    v_new_discount := p_discount_amount;
    v_new_code := NULL;

  ELSE -- code
    IF v_code IS NULL THEN
      RAISE EXCEPTION '請輸入折扣碼' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(DISTINCT r.template_id) FILTER (WHERE r.template_id IS NOT NULL),
           array_agg(DISTINCT r.room_type_id) FILTER (WHERE r.room_type_id IS NOT NULL)
      INTO v_template_ids, v_room_type_ids
    FROM public.order_rooms r
    WHERE r.order_id = o.id;

    IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION '此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(array_length(v_room_type_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION '此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額' USING ERRCODE = '22023';
    END IF;

    v_template_id := CASE WHEN COALESCE(array_length(v_template_ids, 1), 0) = 1 THEN v_template_ids[1] END;
    v_room_type_id := COALESCE(
      CASE WHEN COALESCE(array_length(v_room_type_ids, 1), 0) = 1 THEN v_room_type_ids[1] END,
      o.room_type_id
    );

    SELECT * INTO v_valid
    FROM public.validate_discount_code(
      v_code, o.accommodation_id, v_room_fee, v_room_type_id, o.check_in_date, v_template_id
    );

    IF NOT COALESCE(v_valid.is_valid, false) THEN
      RAISE EXCEPTION '折扣碼無效：%', COALESCE(v_valid.message, '請確認代碼或有效期限') USING ERRCODE = '22023';
    END IF;

    v_new_discount := CASE
      WHEN v_valid.discount_type = 'percentage'
        THEN round(v_room_fee * (v_valid.discount_value::numeric / 100))::integer
      ELSE v_valid.discount_value::integer
    END;
    v_new_code := v_code;
  END IF;

  IF v_new_discount > COALESCE(o.total_price, 0) THEN
    RAISE EXCEPTION '折扣金額不得大於訂單總額' USING ERRCODE = '22023';
  END IF;

  v_new_final := COALESCE(o.final_price, 0) + (v_old_discount - v_new_discount);

  IF v_new_discount = v_old_discount
     AND v_new_code IS NOT DISTINCT FROM v_old_code
     AND v_new_final = v_old_final THEN
    RETURN jsonb_build_object(
      'changed', false,
      'order_id', o.id,
      'discount_amount', v_old_discount,
      'discount_code', v_old_code,
      'final_price', v_old_final,
      'updated_at', o.updated_at,
      'audit_log_id', NULL
    );
  END IF;

  v_paid := COALESCE(o.paid_amount, 0)::integer;
  v_diff := v_new_final - v_paid;
  v_diff_note := CASE
    WHEN v_diff > 0 THEN '目前應收金額比已付金額多 NT$' || v_diff::text || '。請確認差額是否已另外收取，或仍待處理。'
    WHEN v_diff < 0 THEN '目前已付金額比應收金額多 NT$' || abs(v_diff)::text || '。請確認差額是否已退款、折抵或另行處理。'
    ELSE '調整後應收與已付金額一致。'
  END;

  PERFORM set_config('app.paid_discount_rpc', 'on', true);
  PERFORM set_config('app.paid_discount_order', o.id::text, true);
  PERFORM set_config('app.paid_discount_reason', v_reason, true);
  PERFORM set_config('app.paid_discount_confirmed', 'on', true);
  PERFORM set_config('app.paid_discount_settlement', v_settle, true);

  UPDATE public.orders
     SET discount_amount = v_new_discount,
         discount_code = v_new_code,
         final_price = v_new_final,
         updated_at = now()
   WHERE id = o.id
     AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '折扣更新失敗（影響 % 筆），可能是權限不足或資料已變更', v_rows USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    o.accommodation_id,
    v_uid,
    auth.jwt() ->> 'email',
    'update',
    'order',
    'order',
    o.id::text,
    o.order_number,
    jsonb_build_object(
      'type', 'paid_discount_edit',
      'source', '/admin 修改已結清折扣',
      'reason', v_reason,
      'mode', v_mode,
      'confirmed', true,
      'settlement_handling', v_settle,
      'paid_amount', v_paid,
      'difference', v_diff,
      'difference_note', v_diff_note,
      'changes', jsonb_build_array(
        jsonb_build_object('field', 'discount_amount', 'label', '折扣金額',
                           'before', v_old_discount, 'after', v_new_discount),
        jsonb_build_object('field', 'discount_code', 'label', '折扣碼',
                           'before', v_old_code, 'after', v_new_code),
        jsonb_build_object('field', 'final_price', 'label', '實收金額',
                           'before', v_old_final, 'after', v_new_final)
      )
    )
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION '變更紀錄寫入失敗，已取消本次折扣修改' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_after FROM public.orders WHERE id = o.id;
  IF v_after.discount_amount IS DISTINCT FROM v_new_discount
     OR NULLIF(upper(btrim(COALESCE(v_after.discount_code, ''))), '') IS DISTINCT FROM v_new_code
     OR v_after.final_price IS DISTINCT FROM v_new_final THEN
    RAISE EXCEPTION '折扣更新未落地，已回滾' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE id = v_audit_id) THEN
    RAISE EXCEPTION '變更紀錄未落地，已回滾' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.paid_discount_rpc', 'off', true);
  PERFORM set_config('app.paid_discount_order', '', true);
  PERFORM set_config('app.paid_discount_reason', '', true);
  PERFORM set_config('app.paid_discount_confirmed', 'off', true);
  PERFORM set_config('app.paid_discount_settlement', '', true);

  RETURN jsonb_build_object(
    'changed', true,
    'order_id', o.id,
    'discount_amount', v_after.discount_amount,
    'discount_code', v_after.discount_code,
    'final_price', v_after.final_price,
    'paid_amount', v_after.paid_amount,
    'difference', v_diff,
    'difference_note', v_diff_note,
    'settlement_handling', v_settle,
    'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id
  );
END;
$fn$;

ALTER FUNCTION public.update_paid_order_discount(uuid, timestamptz, text, text, integer, text, boolean, text)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_paid_order_discount(uuid, timestamptz, text, text, integer, text, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_paid_order_discount(uuid, timestamptz, text, text, integer, text, boolean, text)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- SECTION 3 — NARROW RPC B：已付款訂單額外加購（legacy-preserving）
-- ---------------------------------------------------------------------
CREATE FUNCTION public.update_paid_order_addons(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_payment_mode text,
  p_addons jsonb,
  p_pet_plan_price integer DEFAULT NULL,
  p_paid_amount integer DEFAULT NULL,
  p_confirmed boolean DEFAULT false,
  p_settlement_handling text DEFAULT NULL,
  p_reduce_acknowledged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_mode text := lower(btrim(COALESCE(p_payment_mode, '')));
  v_addons jsonb;
  v_pet integer;
  v_old_addon integer;
  v_new_addon integer;
  v_delta integer;
  v_format text;
  v_canonical_match boolean;
  v_legacy_match boolean;
  v_new_total integer;
  v_new_final integer;
  v_new_paid integer;
  v_new_status text;
  v_rows int;
  v_audit_id uuid;
  v_after public.orders%ROWTYPE;
  v_changes jsonb := '[]'::jsonb;
  v_items_before jsonb;
  v_items_after jsonb;
  v_settle text := lower(btrim(COALESCE(p_settlement_handling, '')));
  v_paid_delta integer;
  v_diff integer;
  v_diff_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF v_mode = '' THEN
    v_mode := 'collected';
  END IF;
  IF v_mode NOT IN ('collected', 'outstanding') THEN
    RAISE EXCEPTION 'invalid payment mode: %', p_payment_mode USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION '請填寫修改原因' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION '尚未完成二次確認，未做任何修改' USING ERRCODE = '22023';
  END IF;
  IF v_settle NOT IN ('collected', 'refunded', 'offset', 'pending', 'data_only') THEN
    RAISE EXCEPTION '請選擇差額處理方式（已完成收款／已完成退款或返還／已完成折抵或其他處理／尚待處理／純資料校正）'
      USING ERRCODE = '22023';
  END IF;
  IF p_paid_amount IS NOT NULL AND p_paid_amount < 0 THEN
    RAISE EXCEPTION '已付金額不得為負數' USING ERRCODE = '22023';
  END IF;
  v_addons := COALESCE(p_addons, '[]'::jsonb);
  IF jsonb_typeof(v_addons) <> 'array' THEN
    RAISE EXCEPTION 'addons must be a json array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(
       public.get_staff_module_permission(v_uid, o.accommodation_id, 'orders'),
       'hidden'
     ) <> 'editable' THEN
    RAISE EXCEPTION '權限不足：您對此館別的「訂單」模組沒有編輯權限' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL
     OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '訂單已被其他人修改，請重新整理後再試' USING ERRCODE = '40001';
  END IF;

  IF o.payment_status NOT IN ('paid', 'fully_paid') THEN
    RAISE EXCEPTION '此訂單付款狀態為 %，不適用本流程', o.payment_status USING ERRCODE = '22023';
  END IF;

  IF COALESCE(lower(o.refund_status), 'none') IN ('pending', 'pending_manual', 'processing', 'refunding', 'refunded')
     OR lower(COALESCE(o.payment_status, '')) IN ('refunded', 'partial_refunded')
     OR COALESCE(o.refunded_amount, 0) > 0
     OR o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION '此訂單已退款或退款處理中，無法修改加購' USING ERRCODE = '42501';
  END IF;
  IF lower(COALESCE(o.order_status, '')) = 'cancelled' THEN
    RAISE EXCEPTION '已取消的訂單無法修改加購' USING ERRCODE = '42501';
  END IF;

  v_pet := COALESCE(p_pet_plan_price, COALESCE(o.pet_plan_price, 0)::integer);
  IF v_pet < 0 THEN
    RAISE EXCEPTION '寵物加購金額不得為負數' USING ERRCODE = '22023';
  END IF;

  v_old_addon := COALESCE(public.calc_order_addon_total(
    o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer;
  v_new_addon := COALESCE(public.calc_order_addon_total(
    v_pet, o.meal_plan_total, v_addons, o.notes), 0)::integer;
  v_delta := v_new_addon - v_old_addon;

  v_canonical_match := abs(COALESCE(o.final_price, 0)
                           - (COALESCE(o.total_price, 0) - COALESCE(o.discount_amount, 0))) <= 1;
  v_legacy_match := abs(COALESCE(o.final_price, 0)
                        - (COALESCE(o.total_price, 0) + v_old_addon - COALESCE(o.discount_amount, 0))) <= 1;

  IF v_canonical_match AND (v_old_addon = 0 OR NOT v_legacy_match) THEN
    v_format := 'canonical';
  ELSIF v_legacy_match AND NOT v_canonical_match THEN
    v_format := 'legacy';
  ELSE
    v_format := 'ambiguous';
  END IF;

  IF v_format = 'ambiguous' THEN
    RAISE EXCEPTION '此訂單的金額格式無法判定（訂單 %），為保護資料未做任何修改，請人工確認後處理', o.order_number
      USING ERRCODE = '22023';
  END IF;

  IF v_delta < 0 AND COALESCE(p_reduce_acknowledged, false) IS NOT TRUE THEN
    RAISE EXCEPTION '此操作會降低訂單應收金額。請確認相關退款、折抵或結算已完成後再送出'
      USING ERRCODE = '22023';
  END IF;

  IF v_addons IS NOT DISTINCT FROM COALESCE(o.custom_addon_details, '[]'::jsonb)
     AND v_pet = COALESCE(o.pet_plan_price, 0)::integer THEN
    RETURN jsonb_build_object(
      'changed', false,
      'order_id', o.id,
      'format', v_format,
      'addon_total', v_old_addon,
      'total_price', o.total_price,
      'final_price', o.final_price,
      'paid_amount', o.paid_amount,
      'payment_status', o.payment_status,
      'updated_at', o.updated_at,
      'audit_log_id', NULL
    );
  END IF;

  v_new_total := CASE
    WHEN v_format = 'legacy' THEN COALESCE(o.total_price, 0)::integer
    ELSE COALESCE(o.total_price, 0)::integer + v_delta
  END;
  v_new_final := COALESCE(o.final_price, 0)::integer + v_delta;

  v_new_paid := CASE
    WHEN p_paid_amount IS NOT NULL THEN p_paid_amount
    WHEN v_mode = 'collected' THEN COALESCE(o.paid_amount, 0)::integer + v_delta
    ELSE COALESCE(o.paid_amount, 0)::integer
  END;
  v_paid_delta := v_new_paid - COALESCE(o.paid_amount, 0)::integer;

  v_new_status := o.payment_status;

  v_diff := v_new_final - v_new_paid;
  v_diff_note := CASE
    WHEN v_diff > 0 THEN '目前應收金額比已付金額多 NT$' || v_diff::text || '。請確認差額是否已另外收取，或仍待處理。'
    WHEN v_diff < 0 THEN '目前已付金額比應收金額多 NT$' || abs(v_diff)::text || '。請確認差額是否已退款、折抵或另行處理。'
    ELSE '調整後應收與已付金額一致。'
  END;

  PERFORM set_config('app.paid_addon_rpc', 'on', true);
  PERFORM set_config('app.paid_addon_order', o.id::text, true);
  PERFORM set_config('app.paid_addon_reason', v_reason, true);
  PERFORM set_config('app.paid_addon_confirmed', 'on', true);
  PERFORM set_config('app.paid_addon_settlement', v_settle, true);
  PERFORM set_config('app.paid_addon_paid_delta', v_paid_delta::text, true);
  IF v_delta < 0 THEN
    PERFORM set_config('app.paid_addon_reduce_ack', 'on', true);
  END IF;

  UPDATE public.orders
     SET custom_addon_details = v_addons,
         pet_plan_price = v_pet,
         total_price = v_new_total,
         final_price = v_new_final,
         paid_amount = v_new_paid,
         payment_status = v_new_status,
         updated_at = now()
   WHERE id = o.id
     AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '加購更新失敗（影響 % 筆），可能是權限不足或資料已變更', v_rows USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'addon_type', e ->> 'addon_type',
           'count', e ->> 'count',
           'price_per_unit', e ->> 'price_per_unit',
           'total', e ->> 'total')), '[]'::jsonb)
    INTO v_items_before
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(COALESCE(o.custom_addon_details, '[]'::jsonb)) = 'array'
              THEN COALESCE(o.custom_addon_details, '[]'::jsonb) ELSE '[]'::jsonb END) e;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'addon_type', e ->> 'addon_type',
           'count', e ->> 'count',
           'price_per_unit', e ->> 'price_per_unit',
           'total', e ->> 'total')), '[]'::jsonb)
    INTO v_items_after
  FROM jsonb_array_elements(v_addons) e;

  v_changes := v_changes || jsonb_build_array(
    jsonb_build_object('field', 'addon_items', 'label', '加購項目',
                       'before', v_items_before, 'after', v_items_after),
    jsonb_build_object('field', 'addon_total', 'label', '加購總額',
                       'before', v_old_addon, 'after', v_new_addon));

  IF v_new_total IS DISTINCT FROM COALESCE(o.total_price, 0)::integer THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'total_price', 'label', '訂單總額',
                         'before', o.total_price, 'after', v_new_total));
  END IF;
  IF v_new_final IS DISTINCT FROM COALESCE(o.final_price, 0)::integer THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'final_price', 'label', '應收金額',
                         'before', o.final_price, 'after', v_new_final));
  END IF;
  IF v_new_paid IS DISTINCT FROM COALESCE(o.paid_amount, 0)::integer THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'paid_amount', 'label', '已收金額',
                         'before', o.paid_amount, 'after', v_new_paid));
  END IF;
  IF v_new_status IS DISTINCT FROM o.payment_status THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'payment_status', 'label', '付款狀態',
                         'before', o.payment_status, 'after', v_new_status));
  END IF;

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    o.accommodation_id,
    v_uid,
    auth.jwt() ->> 'email',
    'update',
    'order',
    'order',
    o.id::text,
    o.order_number,
    jsonb_build_object(
      'type', 'paid_addon_edit',
      'source', '/admin 修改已付款訂單額外加購',
      'reason', v_reason,
      'payment_mode', v_mode,
      'amount_format', v_format,
      'confirmed', true,
      'settlement_handling', v_settle,
      'reduce_acknowledged', (v_delta < 0),
      'difference', v_diff,
      'difference_note', v_diff_note,
      'changes', v_changes
    )
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION '變更紀錄寫入失敗，已取消本次加購修改' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_after FROM public.orders WHERE id = o.id;
  IF v_after.total_price IS DISTINCT FROM v_new_total
     OR v_after.final_price IS DISTINCT FROM v_new_final
     OR v_after.paid_amount IS DISTINCT FROM v_new_paid
     OR v_after.payment_status IS DISTINCT FROM v_new_status THEN
    RAISE EXCEPTION '加購更新未落地，已回滾' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE id = v_audit_id) THEN
    RAISE EXCEPTION '變更紀錄未落地，已回滾' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.paid_addon_rpc', 'off', true);
  PERFORM set_config('app.paid_addon_order', '', true);
  PERFORM set_config('app.paid_addon_reason', '', true);
  PERFORM set_config('app.paid_addon_confirmed', 'off', true);
  PERFORM set_config('app.paid_addon_settlement', '', true);
  PERFORM set_config('app.paid_addon_paid_delta', '0', true);
  PERFORM set_config('app.paid_addon_reduce_ack', 'off', true);

  RETURN jsonb_build_object(
    'changed', true,
    'order_id', o.id,
    'format', v_format,
    'payment_mode', v_mode,
    'addon_total', v_new_addon,
    'total_price', v_after.total_price,
    'final_price', v_after.final_price,
    'paid_amount', v_after.paid_amount,
    'payment_status', v_after.payment_status,
    'difference', v_diff,
    'difference_note', v_diff_note,
    'settlement_handling', v_settle,
    'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id
  );
END;
$fn$;

ALTER FUNCTION public.update_paid_order_addons(uuid, timestamptz, text, text, jsonb, integer, integer, boolean, text, boolean)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_paid_order_addons(uuid, timestamptz, text, text, jsonb, integer, integer, boolean, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_paid_order_addons(uuid, timestamptz, text, text, jsonb, integer, integer, boolean, text, boolean)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- SECTION 4 — POSTCHECK
-- ---------------------------------------------------------------------
DO $postcheck$
DECLARE
  v_trg int;
  v_fn text;
  v_sha text;
  v_actual text;
BEGIN
  IF to_regprocedure('public.update_paid_order_discount(uuid,timestamptz,text,text,integer,text,boolean,text)') IS NULL
     OR to_regprocedure('public.update_paid_order_addons(uuid,timestamptz,text,text,jsonb,integer,integer,boolean,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'PHASE3A STOP: RPC 未建立';
  END IF;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.orders'::regclass
    AND tgname = 'trg_prevent_immutable_order_fields'
    AND NOT tgisinternal
    AND tgenabled = 'O';
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard trigger binding／enabled state 遺失';
  END IF;

  IF (SELECT prosecdef FROM pg_proc
        WHERE oid = 'public.prevent_immutable_order_fields_change()'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard 不再是 SECURITY DEFINER';
  END IF;

  IF (SELECT position('PHASE3A_COMBINED_GUARD_v5_4' IN prosrc) FROM pg_proc
        WHERE oid = 'public.prevent_immutable_order_fields_change()'::regprocedure) = 0 THEN
    RAISE EXCEPTION 'PHASE3A STOP: guard marker 缺失';
  END IF;

  IF (SELECT prosecdef FROM pg_proc
        WHERE oid = 'public.update_paid_order_discount(uuid,timestamptz,text,text,integer,text,boolean,text)'::regprocedure) IS NOT FALSE
     OR (SELECT prosecdef FROM pg_proc
        WHERE oid = 'public.update_paid_order_addons(uuid,timestamptz,text,text,jsonb,integer,integer,boolean,text,boolean)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PHASE3A STOP: RPC 必須是 SECURITY INVOKER';
  END IF;

  FOR v_fn, v_sha IN
    SELECT * FROM (VALUES
      ('enforce_order_meta_commission_fields',  'e492e382f4efd120eb20afedc6070e168ea39830e8fbce0461e6795f534ccb6a'),
      ('sync_team_commission_price_from_order', '141b3513f713727341cd154c8d20d2948c65c17aee47e355cf6371dee5bc338e'),
      ('calc_team_commission_price',            '21cbc331716d569592733ee2553e5069ff2587263b36466972dcd75a8d97bd7c'),
      ('create_commission_record',              '84895ab58a432679d535734317b71e5ea38f65bd6a1930deda7c1329290649b0'),
      ('create_split_record_on_order',          '5c69973df5162f63b5854e25d02e8641767df605e97983418c70fab64048a1b8'),
      ('calc_order_addon_total',                '401aeb1be7085196f276bc63818c971c6a50745c0262a95bead8a2195bfcdcab'),
      ('get_staff_module_permission',           '16c79785dc16a8dcc64635a9fe0de34a7f7f180b76eaf1d27a84b438cabc560b'),
      ('validate_discount_code',                '9ff35b93bf940d4f92a730d1a583b8925fb74342ad6df5902eb7fba22a6975a2')
    ) AS t(fn, sha)
  LOOP
    SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') INTO v_actual
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn
     LIMIT 1;
    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'PHASE3A STOP: 受保護 function % 不存在', v_fn;
    END IF;
    IF v_actual <> v_sha THEN
      RAISE EXCEPTION 'PHASE3A STOP: 受保護 function % 已與 baseline 不同（% <> %）', v_fn, v_actual, v_sha;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgenabled = 'O'
    AND tgname IN ('create_commission_on_order_confirmed',
                   'create_commission_on_order_updated',
                   'create_split_record_trigger');
  IF v_trg <> 3 THEN
    RAISE EXCEPTION 'PHASE3A STOP: 獎金 trigger binding 與 baseline 不符（找到 %）', v_trg;
  END IF;
END
$postcheck$;