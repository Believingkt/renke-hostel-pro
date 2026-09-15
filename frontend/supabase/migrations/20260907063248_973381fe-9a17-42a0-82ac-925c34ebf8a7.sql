-- =====================================================================
-- PHASE 3A · v5.5A — ADDITIVE DB (NOTES-ADDON RPC)
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION 0 — PRECHECK（不符即 STOP，此時尚無任何 DDL）
-- ---------------------------------------------------------------------
DO $precheck$
DECLARE
  v_guard text;
  v_calc  text;
  v_hash  text;
  r       record;
  expected jsonb := jsonb_build_object(
    'enforce_order_meta_commission_fields', '',
    'sync_team_commission_price_from_order', '',
    'calc_team_commission_price', ''
  );
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_guard
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prevent_immutable_order_fields_change';
  IF v_guard IS DISTINCT FROM 'b1d3763d42a1c2f95a3e760d7658070e' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：guard 版本非 v5.4（md5=%），停止', v_guard;
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)) INTO v_calc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'calc_order_addon_total';
  IF v_calc IS DISTINCT FROM 'e98e610799805c5e09dccaf62de3800e' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：calc_order_addon_total 已被更動（md5=%），停止', v_calc;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'orders' AND t.tgname = 'trg_prevent_immutable_order_fields'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 trg_prevent_immutable_order_fields';
  END IF;

  -- LEVEL 0 不變式：以下函式在本檔案前後必須逐字相同
  DROP TABLE IF EXISTS _lvl0_before;
  CREATE TEMP TABLE _lvl0_before AS
  SELECT p.oid::regprocedure::text AS sig,
         encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS h
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN (
       'enforce_order_meta_commission_fields',
       'sync_team_commission_price_from_order',
       'calc_team_commission_price',
       'create_commission_record',
       'create_split_record_on_order',
       'calc_order_addon_total'
     );
  IF (SELECT count(*) FROM _lvl0_before) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：Level 0 函式清單為空，停止';
  END IF;
END
$precheck$;


-- ---------------------------------------------------------------------
-- SECTION 1 — NOTES 現場加購 PARSER / SERIALIZER（純函式，不寫任何資料）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notes_onsite_addon_block_count(_notes text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT CASE WHEN _notes IS NULL THEN 0 ELSE (
    SELECT count(*)::int FROM regexp_matches(
      _notes, '【額外現場加購金額[^】]*】\s*\d+\s*【額外現場加購金額END】', 'g')
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.notes_onsite_addon_amount(_notes text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT COALESCE((
    (regexp_match(_notes, '【額外現場加購金額[^】]*】\s*(\d+)\s*【額外現場加購金額END】'))[1]
  )::int, 0);
$$;

CREATE OR REPLACE FUNCTION public.notes_onsite_addon_malformed(_notes text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT CASE
    WHEN _notes IS NULL THEN false
    ELSE (
      (SELECT count(*) FROM regexp_matches(_notes, '【額外現場加購金額', 'g'))
        <> 2 * public.notes_onsite_addon_block_count(_notes)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.notes_strip_onsite_addon(_notes text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT CASE WHEN _notes IS NULL THEN NULL ELSE
    regexp_replace(
      regexp_replace(
        regexp_replace(
          _notes,
          '【額外現場加購金額[^】]*】\s*\d+\s*【額外現場加購金額END】\n?', '', 'g'),
        '【(加購備註|額外現場加購備註)[^】]*】[\s\S]*?【(加購備註|額外現場加購備註)END】\n?', '', 'g'),
      '^【(加購備註|額外現場加購備註)[^】]*】.*$\n?', '', 'ng')
  END;
$$;

CREATE OR REPLACE FUNCTION public.notes_set_onsite_addon(
  _notes text, _amount integer, _note text, _ts text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  base text;
  note_trim text := btrim(COALESCE(_note, ''));
  out_text text;
BEGIN
  base := COALESCE(public.notes_strip_onsite_addon(_notes), '');
  base := regexp_replace(base, '\s+$', '');          -- 只去尾端空白，前面逐字保留
  out_text := base;
  IF note_trim <> '' THEN
    out_text := CASE WHEN out_text = '' THEN '' ELSE out_text || E'\n' END
      || '【額外現場加購備註 ' || _ts || '】' || E'\n' || note_trim || E'\n' || '【額外現場加購備註END】';
  END IF;
  IF COALESCE(_amount, 0) > 0 THEN
    out_text := CASE WHEN out_text = '' THEN '' ELSE out_text || E'\n' END
      || '【額外現場加購金額 ' || _ts || '】' || E'\n' || _amount::text || E'\n' || '【額外現場加購金額END】';
  END IF;
  RETURN out_text;
END;
$$;

REVOKE ALL ON FUNCTION public.notes_onsite_addon_block_count(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notes_onsite_addon_amount(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notes_onsite_addon_malformed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notes_strip_onsite_addon(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notes_set_onsite_addon(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notes_onsite_addon_block_count(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notes_onsite_addon_amount(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notes_onsite_addon_malformed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notes_strip_onsite_addon(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notes_set_onsite_addon(text, integer, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- SECTION 2 — GUARD v5.5A（僅放寬窄路徑 B 的 notes allowlist，不新增封鎖）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MARKER: PHASE3A_COMBINED_GUARD_v5_5A
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
  notes_only_onsite boolean := false;
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

  -- v5.5A：偵測範圍與 v5.4 相同（notes 型加購的封鎖留到 v5.5B）
  addon_changed :=
    NEW.custom_addon_details IS DISTINCT FROM OLD.custom_addon_details
    OR NEW.pet_plan_price IS DISTINCT FROM OLD.pet_plan_price;

  -- notes 是否「只有現場加購區塊」不同（拿掉區塊後逐字相同）
  notes_only_onsite :=
    regexp_replace(COALESCE(public.notes_strip_onsite_addon(NEW.notes), ''), '\s+$', '')
    = regexp_replace(COALESCE(public.notes_strip_onsite_addon(OLD.notes), ''), '\s+$', '');

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

  -- 窄路徑 B：已付款訂單的額外加購變更（v5.5A：容許「只有現場加購區塊」的 notes 變更）
  IF auth.uid() IS NOT NULL
     AND OLD.payment_status IN ('fully_paid', 'paid')
     AND NOT is_hotelnabe
     AND (addon_changed
          OR (COALESCE(current_setting('app.paid_addon_rpc', true), '') = 'on'
              AND NEW.notes IS DISTINCT FROM OLD.notes)) THEN

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

    -- notes 只有在「非現場加購內容逐字相同」時才可變更
    IF NEW.notes IS DISTINCT FROM OLD.notes AND NOT notes_only_onsite THEN
      RAISE EXCEPTION 'only the on-site addon block may change in a paid-order addon update'
        USING ERRCODE = '42501';
    END IF;

    v_new := to_jsonb(NEW) - 'custom_addon_details' - 'pet_plan_price'
                           - 'total_price' - 'final_price'
                           - 'paid_amount' - 'updated_at' - 'notes';
    v_old := to_jsonb(OLD) - 'custom_addon_details' - 'pet_plan_price'
                           - 'total_price' - 'final_price'
                           - 'paid_amount' - 'updated_at' - 'notes';

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

    -- meal_plan_total 不在 RPC 可編輯清單內
    IF NEW.meal_plan_total IS DISTINCT FROM OLD.meal_plan_total THEN
      RAISE EXCEPTION 'meal_plan_total may not change in a paid-order addon update' USING ERRCODE = '42501';
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


-- ---------------------------------------------------------------------
-- SECTION 3 — 專用 RPC：public.update_paid_order_addons_v2(...)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_paid_order_addons_v2(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_settlement_handling text,
  p_confirmed boolean DEFAULT false,
  p_addons jsonb DEFAULT NULL,             -- NULL = 不變更 custom_addon_details
  p_pet_plan_price integer DEFAULT NULL,   -- NULL = 不變更
  p_onsite_amount integer DEFAULT NULL,    -- NULL = 不變更；0 = 刪除現場加購金額
  p_onsite_note text DEFAULT NULL,         -- NULL = 不變更；'' = 刪除現場加購備註
  p_paid_amount integer DEFAULT NULL,      -- NULL = 不變更（不自動收款、不自動退款）
  p_reduce_acknowledged boolean DEFAULT false,
  p_risk_acknowledged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_settle text := lower(btrim(COALESCE(p_settlement_handling, '')));
  v_addons jsonb;
  v_pet integer;
  v_ts text;
  v_onsite_amount_old integer;
  v_onsite_note_old text;
  v_new_notes text;
  v_old_addon integer;
  v_new_addon integer;
  v_delta integer;
  v_format text;
  v_canonical_match boolean;
  v_legacy_match boolean;
  v_new_total integer;
  v_new_final integer;
  v_new_paid integer;
  v_paid_delta integer;
  v_rows int;
  v_audit_id uuid;
  v_after public.orders%ROWTYPE;
  v_changes jsonb := '[]'::jsonb;
  v_diff integer;
  v_diff_note text;
  v_risky boolean := false;
  v_risk_kind text := 'none';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
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
  IF p_onsite_amount IS NOT NULL AND p_onsite_amount < 0 THEN
    RAISE EXCEPTION '現場加購金額不得為負數' USING ERRCODE = '22023';
  END IF;
  IF p_addons IS NOT NULL AND jsonb_typeof(p_addons) <> 'array' THEN
    RAISE EXCEPTION 'addons must be a json array' USING ERRCODE = '22023';
  END IF;
  IF p_onsite_note IS NOT NULL
     AND (p_onsite_note ~ '【' OR p_onsite_note ~ '】' OR p_onsite_note LIKE '%🔒%') THEN
    RAISE EXCEPTION '現場加購備註不可包含區塊標記字元' USING ERRCODE = '22023';
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

  -- v5.5：退款／已取消不再永久阻擋，改為高風險二次確認
  IF COALESCE(lower(o.refund_status), 'none') IN ('pending', 'pending_manual', 'processing', 'refunding', 'refunded')
     OR lower(COALESCE(o.payment_status, '')) IN ('refunded', 'partial_refunded')
     OR COALESCE(o.refunded_amount, 0) > 0
     OR o.refunded_at IS NOT NULL THEN
    v_risky := true; v_risk_kind := 'refund';
  END IF;
  IF lower(COALESCE(o.order_status, '')) = 'cancelled' THEN
    v_risky := true;
    v_risk_kind := CASE WHEN v_risk_kind = 'refund' THEN 'refund_and_cancelled' ELSE 'cancelled' END;
  END IF;
  IF v_risky AND COALESCE(p_risk_acknowledged, false) IS NOT TRUE THEN
    RAISE EXCEPTION '此訂單已退款／退款處理中或已取消，需完成高風險確認才能修改加購（未做任何修改）'
      USING ERRCODE = '22023';
  END IF;

  -- notes 現場加購 fail-safe
  IF public.notes_onsite_addon_malformed(o.notes)
     OR public.notes_onsite_addon_block_count(o.notes) > 1 THEN
    RAISE EXCEPTION '此訂單備註中的現場加購格式異常（訂單 %），為保護資料未做任何修改', o.order_number
      USING ERRCODE = '22023';
  END IF;

  v_addons := COALESCE(p_addons, COALESCE(o.custom_addon_details, '[]'::jsonb));
  v_pet := COALESCE(p_pet_plan_price, COALESCE(o.pet_plan_price, 0)::integer);
  IF v_pet < 0 THEN
    RAISE EXCEPTION '寵物加購金額不得為負數' USING ERRCODE = '22023';
  END IF;

  v_onsite_amount_old := public.notes_onsite_addon_amount(o.notes);
  v_onsite_note_old := (regexp_match(COALESCE(o.notes, ''),
    '【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】'))[1];

  IF p_onsite_amount IS NULL AND p_onsite_note IS NULL THEN
    v_new_notes := o.notes;                                  -- notes 完全不動
  ELSE
    v_ts := to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI');
    v_new_notes := public.notes_set_onsite_addon(
      o.notes,
      COALESCE(p_onsite_amount, v_onsite_amount_old),
      COALESCE(p_onsite_note, COALESCE(v_onsite_note_old, '')),
      v_ts);
    -- 逐字保全證明：拿掉現場加購區塊後必須完全相同（僅忽略尾端空白，內容一字不改）
    IF regexp_replace(COALESCE(public.notes_strip_onsite_addon(v_new_notes), ''), '\s+$', '')
       IS DISTINCT FROM
       regexp_replace(COALESCE(public.notes_strip_onsite_addon(o.notes), ''), '\s+$', '') THEN
      RAISE EXCEPTION '備註重組時偵測到非加購內容變動，已中止（未做任何修改）' USING ERRCODE = '42501';
    END IF;
    -- 🔒 金額異動鎖定行必須逐字保留
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(COALESCE(o.notes, ''), E'\n') AS l
       WHERE l LIKE '🔒[金額異動%' AND position(l IN COALESCE(v_new_notes, '')) = 0
    ) THEN
      RAISE EXCEPTION '備註重組會影響已鎖定的金額異動記錄，已中止（未做任何修改）' USING ERRCODE = '42501';
    END IF;
    -- 內容其實沒變（金額與加購備註都相同）→ 備註原樣保留，不重寫時間戳
    IF COALESCE(public.notes_onsite_addon_amount(v_new_notes), 0)
         = COALESCE(v_onsite_amount_old, 0)
       AND btrim(COALESCE((regexp_match(COALESCE(v_new_notes, ''),
             '【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】'))[1], ''))
         = btrim(COALESCE(v_onsite_note_old, '')) THEN
      v_new_notes := o.notes;
    END IF;
  END IF;

  v_old_addon := COALESCE(public.calc_order_addon_total(
    o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer;
  v_new_addon := COALESCE(public.calc_order_addon_total(
    v_pet, o.meal_plan_total, v_addons, v_new_notes), 0)::integer;
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

  -- no-op：完全不 UPDATE、不寫變更紀錄
  IF v_addons IS NOT DISTINCT FROM COALESCE(o.custom_addon_details, '[]'::jsonb)
     AND v_pet = COALESCE(o.pet_plan_price, 0)::integer
     AND COALESCE(v_new_notes, '') IS NOT DISTINCT FROM COALESCE(o.notes, '')
     AND p_paid_amount IS NULL THEN
    RETURN jsonb_build_object(
      'changed', false, 'order_id', o.id, 'format', v_format,
      'addon_total', v_old_addon, 'total_price', o.total_price,
      'final_price', o.final_price, 'paid_amount', o.paid_amount,
      'payment_status', o.payment_status, 'updated_at', o.updated_at,
      'risk', v_risk_kind, 'audit_log_id', NULL);
  END IF;

  v_new_total := CASE
    WHEN v_format = 'legacy' THEN COALESCE(o.total_price, 0)::integer
    ELSE COALESCE(o.total_price, 0)::integer + v_delta
  END;
  v_new_final := COALESCE(o.final_price, 0)::integer + v_delta;
  v_new_paid := COALESCE(p_paid_amount, COALESCE(o.paid_amount, 0)::integer);
  v_paid_delta := v_new_paid - COALESCE(o.paid_amount, 0)::integer;

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
         notes = v_new_notes,
         total_price = v_new_total,
         final_price = v_new_final,
         paid_amount = v_new_paid,
         updated_at = now()
   WHERE id = o.id
     AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '加購更新失敗（影響 % 筆），可能是權限不足或資料已變更', v_rows USING ERRCODE = '42501';
  END IF;

  v_changes := v_changes || jsonb_build_array(
    jsonb_build_object('field', 'addon_total', 'label', '加購總額',
                       'before', v_old_addon, 'after', v_new_addon));
  IF v_addons IS DISTINCT FROM COALESCE(o.custom_addon_details, '[]'::jsonb) THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'custom_addon_details', 'label', '加購項目',
                         'before', COALESCE(o.custom_addon_details, '[]'::jsonb), 'after', v_addons));
  END IF;
  IF v_pet IS DISTINCT FROM COALESCE(o.pet_plan_price, 0)::integer THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'pet_plan_price', 'label', '寵物加購',
                         'before', o.pet_plan_price, 'after', v_pet));
  END IF;
  IF COALESCE(v_new_notes, '') IS DISTINCT FROM COALESCE(o.notes, '') THEN
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'extra_addon_amount', 'label', '額外現場加購金額',
                         'before', v_onsite_amount_old,
                         'after', public.notes_onsite_addon_amount(v_new_notes)),
      jsonb_build_object('field', 'addon_note', 'label', '額外現場加購備註',
                         'before', COALESCE(v_onsite_note_old, ''),
                         'after', COALESCE(p_onsite_note, COALESCE(v_onsite_note_old, ''))));
  END IF;
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

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    o.accommodation_id, v_uid, auth.jwt() ->> 'email',
    'update', 'order', 'order', o.id::text, o.order_number,
    jsonb_build_object(
      'type', 'paid_addon_edit',
      'source', '/admin 修改已付款訂單額外加購（v5.5）',
      'reason', v_reason,
      'amount_format', v_format,
      'confirmed', true,
      'settlement_handling', v_settle,
      'reduce_acknowledged', (v_delta < 0),
      'risk_state', v_risk_kind,
      'risk_acknowledged', COALESCE(p_risk_acknowledged, false),
      'payment_status_before', o.payment_status,
      'payment_status_after', o.payment_status,
      'refund_status', o.refund_status,
      'order_status', o.order_status,
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
     OR v_after.payment_status IS DISTINCT FROM o.payment_status THEN
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
    'changed', true, 'order_id', o.id, 'format', v_format,
    'addon_total', v_new_addon, 'total_price', v_after.total_price,
    'final_price', v_after.final_price, 'paid_amount', v_after.paid_amount,
    'payment_status', v_after.payment_status, 'difference', v_diff,
    'difference_note', v_diff_note, 'settlement_handling', v_settle,
    'risk', v_risk_kind, 'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamptz, text, text, boolean, jsonb, integer, integer, text, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamptz, text, text, boolean, jsonb, integer, integer, text, integer, boolean, boolean)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------
-- SECTION 4 — POSTCHECK（不符即整包 rollback）
-- ---------------------------------------------------------------------
DO $postcheck$
DECLARE
  v_bad text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_paid_order_addons_v2') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 未建立';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'prevent_immutable_order_fields_change'
       AND pg_get_functiondef(p.oid) LIKE '%PHASE3A_COMBINED_GUARD_v5_5A%') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：guard 未更新為 v5.5A';
  END IF;

  -- Level 0 不變式
  SELECT string_agg(b.sig, ', ') INTO v_bad
    FROM _lvl0_before b
    JOIN pg_proc p ON p.oid::regprocedure::text = b.sig
   WHERE encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') IS DISTINCT FROM b.h;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：Level 0 函式被更動（%）', v_bad;
  END IF;
  DROP TABLE IF EXISTS _lvl0_before;
END
$postcheck$;