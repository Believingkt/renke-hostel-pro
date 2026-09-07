-- =====================================================================
-- V5.5A.3 PAID ADD-ON AUDIT NOTE CONTENT — v2（migration，含正式施工安全包裝）
-- 本檔【不含】BEGIN / COMMIT：必須由 runner 以「單一 transaction」完整執行。
-- 若 runner 無法保證單一 transaction，POSTCHECK 會因 TEMP baseline 消失而 STOP。
-- 業務邏輯與已審查之 V5_5A3_AUDIT_NOTE_CONTENT.sql 逐字相同；v2 僅新增 precheck／postcheck。
-- 只 replace public.update_paid_order_addons_v3；不動 helper／其他函式／trigger／資料。
-- =====================================================================

DO $anc_precheck$
DECLARE
  v_sig text;
  v_h text;
  v_def text;
BEGIN
  -- (1) 目標 v3：exact signature 唯一、無 overload、內容為 Notes Hotfix v3
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'update_paid_order_addons_v3') <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v3 不是唯一一支（overload 或缺漏）';
  END IF;
  IF to_regprocedure('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v3 exact signature 不符';
  END IF;
  v_def := pg_get_functiondef(to_regprocedure('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)')::oid);
  IF v_def LIKE '%extra_addon_note%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：audit-note 版本似乎已安裝（重複安裝），停止';
  END IF;
  IF v_def NOT LIKE '%addon_note_changed%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：現行 v3 不是 Hotfix v3 版本（缺少 addon_note_changed）';
  END IF;

  IF md5(v_def) <> '663d33aa170825e6c1cdec7c8691cb7b' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：v3 definition drift（現值 %，預期 663d33aa170825e6c1cdec7c8691cb7b）', md5(v_def);
  END IF;
  IF encode(sha256(convert_to(v_def, 'UTF8')), 'hex') <> 'dbdfa35e3c944081cd42c3b4a7eb4844f4e17d30fe0bc078d2730f2418f285a5' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：v3 SHA-256 不符（%）', encode(sha256(convert_to(v_def, 'UTF8')), 'hex');
  END IF;
  IF v_def NOT LIKE '%PHASE3A_V5_5A3%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：v3 缺少 PHASE3A_V5_5A3 版本標記';
  END IF;
  -- (2) notes helper：必須存在、exact signature 唯一、為 Hotfix v3 版本、ACL 不變
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'notes_set_onsite_addon_v2') <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：notes_set_onsite_addon_v2 不是唯一一支（缺漏或 overload）';
  END IF;
  IF to_regprocedure('public.notes_set_onsite_addon_v2(text,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：notes_set_onsite_addon_v2 exact signature 不符';
  END IF;
  v_def := pg_get_functiondef(to_regprocedure('public.notes_set_onsite_addon_v2(text,integer,text,text)')::oid);
  IF md5(v_def) <> '23e852f9d33b046821268e9bdb542eda' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：helper MD5 不符（% ≠ 23e852f9d33b046821268e9bdb542eda）', md5(v_def);
  END IF;
  IF encode(sha256(convert_to(v_def, 'UTF8')), 'hex') <> '377138151097d95bdec0bbd23392293dfe50d9fd3b0d95dc9155997a7428fc9f' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：helper SHA-256 不符（%）', encode(sha256(convert_to(v_def, 'UTF8')), 'hex');
  END IF;
  IF has_function_privilege('public', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：PUBLIC 可執行 helper（ACL drift）';
  END IF;
  IF has_function_privilege('anon', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：anon 可執行 helper（ACL drift）';
  END IF;
  IF has_function_privilege('service_role', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：service_role 可執行 helper（ACL drift）';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：authenticated 無法執行 helper（ACL drift）';
  END IF;

  -- (3) 不變式基準（hardcoded 正式雜湊 + transaction-lifetime TEMP baseline）
  CREATE TEMP TABLE _anc_inv (sig text PRIMARY KEY, expected_md5 text NOT NULL, before_md5 text NOT NULL)
  ON COMMIT DROP;

  FOR v_sig, v_h IN
    SELECT * FROM (VALUES
      ('public.prevent_immutable_order_fields_change()', '8e9f4ff1fd6b96da2fd8042acb2155e3'),
      ('public.notes_set_onsite_addon(text,integer,text,text)', '5c2ef774c9274e96be5dc1cbc2be070d'),
      ('public.notes_strip_onsite_addon(text)', '23aeb30613c14b7e0aa20735daa98a6b'),
      ('public.notes_onsite_addon_block_count(text)', 'b0a09988f60f3595e184d61952511dbe'),
      ('public.notes_onsite_addon_amount(text)', '03268f5f3e49eb1c7f3fac6f3ad12160'),
      ('public.notes_onsite_addon_malformed(text)', '842ac4615050aee1508a8b386cc7da94'),
      ('public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)', 'dec6658792a4f7c9596c7b01925433b8'),
      ('public.update_paid_order_discount_v2(uuid,timestamp with time zone,text,text,integer,text,boolean,text,integer,boolean)', '9385225b9e6f2ee651c8b026bf0a4245'),
      ('public.calc_order_addon_total(numeric,numeric,jsonb,text)', 'e98e610799805c5e09dccaf62de3800e'),
      ('public.calc_team_commission_price(uuid)', '0f7c588c8ee6e059bf737f6907602b6f'),
      ('public.addon_name_normalize(text)', 'f6f43bf908039a91f15a4f5186ea8c27'),
      ('public.addon_name_canonical(text)', '64f93620679591358585aea1a694ba95'),
      ('public.resolve_addon_setting_id(uuid,text,text)', '9b467499d0e58ca6ee55e939b59fa397')
    ) AS t(sig, h)
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'PRECHECK 失敗：缺少函式或 signature 不符（%）', v_sig;
    END IF;
    IF md5(pg_get_functiondef(to_regprocedure(v_sig)::oid)) <> v_h THEN
      RAISE EXCEPTION 'PRECHECK 失敗：% definition drift（現值 %，預期 %）',
        v_sig, md5(pg_get_functiondef(to_regprocedure(v_sig)::oid)), v_h;
    END IF;
    INSERT INTO _anc_inv(sig, expected_md5, before_md5)
    VALUES (v_sig, v_h, md5(pg_get_functiondef(to_regprocedure(v_sig)::oid)));
  END LOOP;

  IF (SELECT count(*) FROM _anc_inv) <> 13 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：不變式基準筆數不符（% 筆，預期 13）', (SELECT count(*) FROM _anc_inv);
  END IF;

  -- 不得存在非預期 overload
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('prevent_immutable_order_fields_change','notes_set_onsite_addon',
                           'notes_strip_onsite_addon','notes_onsite_addon_block_count',
                           'notes_onsite_addon_amount','notes_onsite_addon_malformed',
                           'update_paid_order_addons_v2','update_paid_order_discount_v2',
                           'calc_order_addon_total','calc_team_commission_price',
                           'addon_name_normalize','addon_name_canonical','resolve_addon_setting_id')) <> 13 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：不變式函式出現非預期 overload 或缺漏';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'notes_set_onsite_addon%') <> 2 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：notes setter 家族出現非預期物件（partial state）';
  END IF;

  -- (4) 佣金／bonus trigger 完整集合
  CREATE TEMP TABLE _anc_trg
  ON COMMIT DROP
  AS
  SELECT c.relname::text AS tbl, t.tgname::text AS trg, p.oid::regprocedure::text AS fn,
         pg_get_triggerdef(t.oid) AS def, t.tgenabled::text AS enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                       'create_split_record_on_order','enforce_order_meta_commission_fields',
                       'prevent_immutable_order_fields_change');

  IF (SELECT count(*) FROM _anc_trg) <> 6 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：佣金／bonus trigger 基準筆數不符（% 筆，預期 6）', (SELECT count(*) FROM _anc_trg);
  END IF;
  IF EXISTS (SELECT 1 FROM _anc_trg WHERE enabled <> 'O') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：佣金／bonus trigger 非啟用狀態';
  END IF;

  -- (5) 物件總數基準（POSTCHECK 用於「沒有新增其他 DB 物件」比對）
  CREATE TEMP TABLE _anc_meta ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public')::bigint AS proc_count,
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S','p'))::bigint AS rel_count,
         (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal)::bigint AS trg_count;

  RAISE NOTICE 'PRECHECK OK — V5.5A.3 AUDIT NOTE CONTENT v2 migration';
END
$anc_precheck$;

CREATE OR REPLACE FUNCTION public.update_paid_order_addons_v3(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_settlement_handling text, p_confirmed boolean DEFAULT false, p_addon_plans jsonb DEFAULT NULL::jsonb, p_onsite_amount integer DEFAULT NULL::integer, p_onsite_note text DEFAULT NULL::text, p_paid_amount integer DEFAULT NULL::integer, p_reduce_acknowledged boolean DEFAULT false, p_risk_acknowledged boolean DEFAULT false, p_price_change_acknowledged boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- PHASE3A_V5_5A3
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_settle text := lower(btrim(COALESCE(p_settlement_handling, '')));
  v_addons jsonb;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_d jsonb;
  v_plan_ids uuid[] := ARRAY[]::uuid[];
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_key text;
  v_qty integer;
  v_setting record;
  v_agg jsonb := '{}'::jsonb;     -- addon_id → {count, lines, total, has_bad, price_diff, mult_diff, before_lines, requested, changed, new_mult}
  v_cur jsonb;
  v_mult integer;
  v_new_mult integer;
  v_req integer;
  v_changed_plan boolean;
  v_before_lines jsonb;
  v_extras jsonb;
  v_extras_prev jsonb;
  v_bad_line boolean;
  v_stored_count numeric;
  v_stored_price numeric;
  v_stored_total numeric;
  v_nights integer;
  v_line jsonb;
  v_price_corrections jsonb := '[]'::jsonb;
  v_merges jsonb := '[]'::jsonb;
  v_plan_changes jsonb := '[]'::jsonb;

  v_ts text;
  v_onsite_amount_old integer;
  v_onsite_note_old text;
  v_onsite_note_new text;
  v_onsite_note_after text;
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
  -- ---------- 基本輸入檢查 ----------
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
  IF p_addon_plans IS NOT NULL AND jsonb_typeof(p_addon_plans) <> 'array' THEN
    RAISE EXCEPTION 'addon plans must be a json array' USING ERRCODE = '22023';
  END IF;
  IF p_onsite_note IS NOT NULL
     AND (p_onsite_note ~ '【' OR p_onsite_note ~ '】' OR p_onsite_note LIKE '%🔒%') THEN
    RAISE EXCEPTION '現場加購備註不可包含區塊標記字元' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(public.get_staff_module_permission(v_uid, o.accommodation_id, 'orders'), 'hidden') <> 'editable' THEN
    RAISE EXCEPTION '權限不足：您對此館別的「訂單」模組沒有編輯權限' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '訂單已被其他人修改，請重新整理後再試' USING ERRCODE = '40001';
  END IF;

  IF o.payment_status NOT IN ('paid', 'fully_paid') THEN
    RAISE EXCEPTION '此訂單付款狀態為 %，不適用本流程（請使用一般訂單編輯）', o.payment_status USING ERRCODE = '22023';
  END IF;

  -- ---------- 高風險狀態（退款／取消）：確認制 ----------
  IF COALESCE(lower(o.refund_status), 'none') IN ('pending', 'pending_manual', 'processing', 'refunding', 'refunded')
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

  -- ---------- notes 現場加購 fail-safe ----------
  IF public.notes_onsite_addon_malformed(o.notes)
     OR public.notes_onsite_addon_block_count(o.notes) > 1 THEN
    RAISE EXCEPTION '此訂單備註中的現場加購格式異常（訂單 %），為保護資料未做任何修改', o.order_number
      USING ERRCODE = '22023';
  END IF;

  -- =====================================================================
  -- 加購方案
  -- =====================================================================
  IF p_addon_plans IS NULL THEN
    v_addons := COALESCE(o.custom_addon_details, '[]'::jsonb);      -- 不變更方案
  ELSE
    IF jsonb_typeof(COALESCE(o.custom_addon_details, '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION '此訂單的加購明細格式異常，為保護資料未做任何修改' USING ERRCODE = '22023';
    END IF;

    v_nights := GREATEST(1, COALESCE((o.check_out_date - o.check_in_date), 1));

    -- 1) 指令合法性
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_addon_plans) LOOP
      IF (v_item ->> 'addon_id') IS NULL THEN
        RAISE EXCEPTION '加購方案缺少識別碼，未做任何修改' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_id := (v_item ->> 'addon_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION '加購方案識別碼格式錯誤，未做任何修改' USING ERRCODE = '22023';
      END;
      IF v_id = ANY (v_plan_ids) THEN
        RAISE EXCEPTION '同一加購方案重複出現（%），未做任何修改', v_id USING ERRCODE = '22023';
      END IF;
      v_plan_ids := v_plan_ids || v_id;

      IF (v_item ->> 'quantity') IS NULL THEN
        RAISE EXCEPTION '加購方案缺少數量，未做任何修改' USING ERRCODE = '22023';
      END IF;
      v_qty := (v_item ->> 'quantity')::integer;
      IF v_qty < 0 THEN
        RAISE EXCEPTION '加購數量不得為負數' USING ERRCODE = '22023';
      END IF;

      SELECT s.id, s.addon_type, s.price_per_unit, s.unit_label, s.pricing_mode,
             s.min_quantity, s.max_quantity, s.enabled
        INTO v_setting
        FROM public.addon_settings s
       WHERE s.id = v_id AND s.accommodation_id = o.accommodation_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION '找不到此館別的加購方案（%），未做任何修改', v_id USING ERRCODE = '22023';
      END IF;
      IF COALESCE(v_setting.enabled, true) IS NOT TRUE THEN
        RAISE EXCEPTION '加購方案「%」已停用，不可調整數量（歷史紀錄仍保留）', v_setting.addon_type
          USING ERRCODE = '22023';
      END IF;
      IF COALESCE(v_setting.price_per_unit, 0) <= 0 THEN
        RAISE EXCEPTION '加購方案「%」目前單價不正確，未做任何修改', v_setting.addon_type USING ERRCODE = '22023';
      END IF;
      IF COALESCE(v_setting.pricing_mode, '') NOT IN ('per_night', 'per_stay') THEN
        RAISE EXCEPTION '加購方案「%」的計價方式未知（%），無法安全計算，未做任何修改',
          v_setting.addon_type, COALESCE(v_setting.pricing_mode, '(空)') USING ERRCODE = '22023';
      END IF;
      IF v_qty > 0 AND COALESCE(v_setting.max_quantity, 0) > 0 AND v_qty > v_setting.max_quantity THEN
        RAISE EXCEPTION '加購方案「%」數量超過上限 %', v_setting.addon_type, v_setting.max_quantity USING ERRCODE = '22023';
      END IF;
      IF v_qty > 0 AND COALESCE(v_setting.min_quantity, 0) > 0 AND v_qty < v_setting.min_quantity THEN
        RAISE EXCEPTION '加購方案「%」數量低於起訂量 %', v_setting.addon_type, v_setting.min_quantity USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- 2) 前置彙總（唯讀）：解析既有明細 → 逐方案累計數量與語意化 before_lines
    --    此階段【不】判定合併、不判定單價變動；僅收集事實。
    --    FINAL DATA-PRESERVATION CORRECTION #3：
    --      count / total / price_per_unit 必須是可解析、非負、且等於 trunc() 的整數；
    --      1.5 / 500.25 / NaN / Infinity / 非數字 一律視為 bad（只有「被明確修改」時才拒絕）。
    --    FINAL DATA-PRESERVATION CORRECTION #2：
    --      canonical 欄位集合以外的額外欄位逐筆保存於 extras；多筆之間不一致 → extras_conflict。
    FOR v_d IN SELECT * FROM jsonb_array_elements(COALESCE(o.custom_addon_details, '[]'::jsonb)) LOOP
      IF jsonb_typeof(v_d) <> 'object' THEN
        CONTINUE;                                                   -- 非物件 → 逐字保留
      END IF;
      v_id := public.resolve_addon_setting_id(o.accommodation_id, v_d ->> 'addon_id', v_d ->> 'addon_type');
      IF v_id IS NULL OR NOT (v_id = ANY (v_plan_ids)) THEN
        CONTINUE;                                                   -- 未列出／無法對應 → 逐字保留
      END IF;

      v_stored_count := NULL; v_stored_price := NULL; v_stored_total := NULL;
      v_bad_line := false;

      BEGIN
        v_stored_count := NULLIF(btrim(COALESCE(v_d ->> 'count', '')), '')::numeric;
      EXCEPTION WHEN others THEN v_stored_count := NULL;
      END;
      IF v_stored_count IS NULL
         OR v_stored_count = 'NaN'::numeric
         OR v_stored_count = 'Infinity'::numeric
         OR v_stored_count = '-Infinity'::numeric
         OR v_stored_count < 0
         OR v_stored_count <> trunc(v_stored_count) THEN
        v_stored_count := NULL; v_bad_line := true;
      END IF;

      BEGIN
        v_stored_total := NULLIF(btrim(COALESCE(v_d ->> 'total', '')), '')::numeric;
      EXCEPTION WHEN others THEN v_stored_total := NULL;
      END;
      IF v_stored_total IS NULL
         OR v_stored_total = 'NaN'::numeric
         OR v_stored_total = 'Infinity'::numeric
         OR v_stored_total = '-Infinity'::numeric
         OR v_stored_total < 0
         OR v_stored_total <> trunc(v_stored_total) THEN
        v_stored_total := NULL; v_bad_line := true;
      END IF;

      IF (v_d ? 'price_per_unit') AND NULLIF(btrim(COALESCE(v_d ->> 'price_per_unit', '')), '') IS NOT NULL THEN
        BEGIN
          v_stored_price := NULLIF(btrim(COALESCE(v_d ->> 'price_per_unit', '')), '')::numeric;
        EXCEPTION WHEN others THEN v_stored_price := NULL;
        END;
        IF v_stored_price IS NULL
           OR v_stored_price = 'NaN'::numeric
           OR v_stored_price = 'Infinity'::numeric
           OR v_stored_price = '-Infinity'::numeric
           OR v_stored_price < 0
           OR v_stored_price <> trunc(v_stored_price) THEN
          v_stored_price := NULL; v_bad_line := true;
        END IF;
      END IF;

      -- 反推歷史倍數（僅供 audit 與差異判定；無法還原時為 NULL，不在此中止）
      v_mult := NULL;
      IF v_stored_count IS NOT NULL AND v_stored_count > 0
         AND v_stored_price IS NOT NULL AND v_stored_price > 0
         AND v_stored_total IS NOT NULL AND v_stored_total > 0
         AND mod(v_stored_total, v_stored_price * v_stored_count) = 0 THEN
        v_mult := (v_stored_total / (v_stored_price * v_stored_count))::integer;
        IF v_mult < 1 THEN v_mult := NULL; END IF;
      END IF;

      -- canonical 欄位集合以外的額外欄位
      SELECT COALESCE(jsonb_object_agg(e.k, e.v), '{}'::jsonb) INTO v_extras
        FROM jsonb_each(v_d) AS e(k, v)
       WHERE e.k NOT IN ('addon_id', 'addon_type', 'count', 'price_per_unit',
                         'total', 'unit_label', 'pricing_mode');

      v_key := v_id::text;
      v_cur := v_agg -> v_key;
      IF v_cur IS NULL THEN
        v_cur := jsonb_build_object('count', 0, 'lines', 0, 'total', 0,
                                    'has_bad', false, 'before_lines', '[]'::jsonb,
                                    'extras', v_extras, 'extras_conflict', false);
      END IF;
      v_extras_prev := COALESCE(v_cur -> 'extras', '{}'::jsonb);

      v_cur := v_cur || jsonb_build_object(
        'count',  (v_cur ->> 'count')::integer + COALESCE(v_stored_count, 0)::integer,
        'lines',  (v_cur ->> 'lines')::integer + 1,
        'total',  (v_cur ->> 'total')::integer + COALESCE(v_stored_total, 0)::integer,
        'has_bad', ((v_cur ->> 'has_bad')::boolean) OR v_bad_line,
        'extras', v_extras_prev,
        'extras_conflict', ((v_cur ->> 'extras_conflict')::boolean)
                           OR (v_extras_prev IS DISTINCT FROM v_extras),
        'before_lines', (v_cur -> 'before_lines') || jsonb_build_array(jsonb_build_object(
            'quantity',       v_stored_count::integer,
            'price_per_unit', v_stored_price::integer,
            'multiplier',     v_mult,
            'subtotal',       v_stored_total::integer))
      );
      v_agg := jsonb_set(v_agg, ARRAY[v_key], v_cur, true);
    END LOOP;


    -- 3) 判定「使用者是否明確修改」：requested_quantity IS DISTINCT FROM old_total_quantity
    --    數量未改 → 完全 no-op（保留多筆、保留舊格式、舊單價、舊倍數，不要求價格確認）
    FOR v_key, v_cur IN SELECT * FROM jsonb_each(v_agg) LOOP
      SELECT (COALESCE(e.q ->> 'quantity', '0'))::integer INTO v_req
        FROM jsonb_array_elements(p_addon_plans) AS e(q)
       WHERE (e.q ->> 'addon_id')::uuid = v_key::uuid
       LIMIT 1;

      v_changed_plan := (v_req IS DISTINCT FROM (v_cur ->> 'count')::integer);

      SELECT s.id, s.addon_type, s.price_per_unit, s.unit_label, s.pricing_mode INTO v_setting
        FROM public.addon_settings s WHERE s.id = v_key::uuid;

      IF v_changed_plan AND (v_cur ->> 'has_bad')::boolean THEN
        RAISE EXCEPTION '加購方案「%」的既有明細數量或金額不是可解析的非負整數，無法安全重算，未做任何修改',
          v_setting.addon_type USING ERRCODE = '22023';
      END IF;

      -- FINAL DATA-PRESERVATION CORRECTION #2：多筆合併時額外欄位必須完全相同
      IF v_changed_plan AND (v_cur ->> 'extras_conflict')::boolean THEN
        RAISE EXCEPTION '加購方案「%」的多筆既有明細含有不一致的額外欄位，無法安全合併，未做任何修改',
          v_setting.addon_type USING ERRCODE = '22023';
      END IF;

      v_new_mult := CASE
        WHEN v_setting.pricing_mode = 'per_stay' THEN 1
        WHEN v_setting.pricing_mode = 'per_night' THEN v_nights
      END;
      IF v_changed_plan AND v_new_mult IS NULL THEN
        RAISE EXCEPTION '加購方案「%」的計價方式未知，無法安全計算，未做任何修改', v_setting.addon_type
          USING ERRCODE = '22023';
      END IF;

      v_cur := v_cur || jsonb_build_object('requested', v_req, 'changed', v_changed_plan,
                                           'new_mult', v_new_mult);
      v_agg := jsonb_set(v_agg, ARRAY[v_key], v_cur, true);

      CONTINUE WHEN NOT v_changed_plan;                              -- 數量未改 → 不再做任何判定

      -- 明確修改：一律改用目前單價與目前計價方式；有落差需明確確認
      v_before_lines := v_cur -> 'before_lines';
      -- 移除（requested = 0）不涉及重新定價，不要求單價變動確認

      IF v_req > 0 AND EXISTS (

        SELECT 1 FROM jsonb_array_elements(v_before_lines) AS l(x)
         WHERE (x ->> 'price_per_unit') IS DISTINCT FROM v_setting.price_per_unit::text
            OR (x ->> 'multiplier')     IS DISTINCT FROM v_new_mult::text
      ) THEN
        IF COALESCE(p_price_change_acknowledged, false) IS NOT TRUE THEN
          RAISE EXCEPTION '加購方案「%」的歷史單價／計價方式與目前設定（NT$% × %倍）不同。'
                          '確認要以目前單價與目前計價方式重算後再送出（未做任何修改）',
            v_setting.addon_type, v_setting.price_per_unit, v_new_mult USING ERRCODE = '22023';
        END IF;
        v_price_corrections := v_price_corrections || jsonb_build_array(jsonb_build_object(
          'addon_id', v_setting.id, 'name', v_setting.addon_type,
          'before_lines', v_before_lines,
          'price_after', v_setting.price_per_unit,
          'multiplier_after', v_new_mult,
          'pricing_mode_after', v_setting.pricing_mode));
      END IF;

      IF (v_cur ->> 'lines')::integer > 1 THEN
        v_merges := v_merges || jsonb_build_array(jsonb_build_object(
          'addon_id', v_setting.id, 'name', v_setting.addon_type,
          'lines_before', (v_cur ->> 'lines')::integer, 'lines_after',
          CASE WHEN v_req = 0 THEN 0 ELSE 1 END,
          'before_lines', v_before_lines,
          'quantity_before', (v_cur ->> 'count')::integer,
          'quantity_after', v_req));
      END IF;
    END LOOP;

    -- 4) 逐筆重建：未修改方案逐字保留；明確修改的方案由第一筆承載合併結果
    FOR v_d IN SELECT * FROM jsonb_array_elements(COALESCE(o.custom_addon_details, '[]'::jsonb)) LOOP
      v_id := NULL;
      IF jsonb_typeof(v_d) = 'object' THEN
        v_id := public.resolve_addon_setting_id(o.accommodation_id, v_d ->> 'addon_id', v_d ->> 'addon_type');
      END IF;

      IF v_id IS NULL OR NOT (v_id = ANY (v_plan_ids)) THEN
        v_out := v_out || jsonb_build_array(v_d);
        CONTINUE;
      END IF;

      v_key := v_id::text;
      v_cur := v_agg -> v_key;

      IF NOT (v_cur ->> 'changed')::boolean THEN
        v_out := v_out || jsonb_build_array(v_d);                    -- 數量未改 → 原樣保留（多筆仍多筆）
        CONTINUE;
      END IF;

      IF v_id = ANY (v_seen_ids) THEN
        CONTINUE;                                                    -- 已合併進第一筆
      END IF;
      v_seen_ids := v_seen_ids || v_id;

      v_qty := (v_cur ->> 'requested')::integer;
      v_new_mult := (v_cur ->> 'new_mult')::integer;

      SELECT s.id, s.addon_type, s.price_per_unit, s.unit_label, s.pricing_mode
        INTO v_setting
        FROM public.addon_settings s
       WHERE s.id = v_id AND s.accommodation_id = o.accommodation_id;

      IF v_qty = 0 THEN
        v_plan_changes := v_plan_changes || jsonb_build_array(jsonb_build_object(
          'addon_id', v_setting.id, 'name', v_setting.addon_type,
          'unit_label', v_setting.unit_label,
          'merged_lines', (v_cur ->> 'lines')::integer,
          'before_lines', v_cur -> 'before_lines',
          'price_per_unit_after', v_setting.price_per_unit,
          'multiplier_after', v_new_mult,
          'pricing_mode_after', v_setting.pricing_mode,
          'quantity_before', (v_cur ->> 'count')::integer, 'quantity_after', 0,
          'subtotal_before', (v_cur ->> 'total')::integer, 'subtotal_after', 0));
        CONTINUE;                                                    -- 明確移除
      END IF;

      -- FINAL DATA-PRESERVATION CORRECTION #1：
      -- 合併為一筆真正的「目前 canonical 明細」——canonical 欄位全部改寫成目前
      -- addon_settings 的值（addon_id / addon_type / unit_label / pricing_mode 一律
      -- 無條件寫入），金額 = 目前單價 × 數量 × 目前計價倍數。
      -- canonical 集合以外的額外欄位（extras）原樣保留；多筆合併時 extras 必須完全
      -- 相同（不同者已於判定階段 fail-closed），因此此處只保留一份。
      v_line := COALESCE(v_cur -> 'extras', '{}'::jsonb) || jsonb_build_object(
                  'addon_id',       v_setting.id,
                  'addon_type',     v_setting.addon_type,
                  'count',          v_qty,
                  'price_per_unit', v_setting.price_per_unit,
                  'pricing_mode',   v_setting.pricing_mode,
                  'total',          (v_setting.price_per_unit * v_qty * v_new_mult)::integer,
                  'unit_label',     v_setting.unit_label);
      v_out := v_out || jsonb_build_array(v_line);


      v_plan_changes := v_plan_changes || jsonb_build_array(jsonb_build_object(
        'addon_id', v_setting.id, 'name', v_setting.addon_type,
        'unit_label', v_setting.unit_label,
        'merged_lines', (v_cur ->> 'lines')::integer,
        'before_lines', v_cur -> 'before_lines',
        'price_per_unit_after', v_setting.price_per_unit,
        'multiplier_after', v_new_mult,
        'pricing_mode_after', v_setting.pricing_mode,
        'quantity_before', (v_cur ->> 'count')::integer, 'quantity_after', v_qty,
        'subtotal_before', (v_cur ->> 'total')::integer,
        'subtotal_after', (v_setting.price_per_unit * v_qty * v_new_mult)::integer));
    END LOOP;

    -- 5) 新增：訂單原本沒有的方案（quantity > 0）
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_addon_plans) LOOP
      v_id := (v_item ->> 'addon_id')::uuid;
      v_qty := (v_item ->> 'quantity')::integer;
      CONTINUE WHEN v_qty = 0 OR v_id = ANY (v_seen_ids) OR (v_agg ? v_id::text);

      SELECT s.id, s.addon_type, s.price_per_unit, s.unit_label, s.pricing_mode
        INTO v_setting
        FROM public.addon_settings s
       WHERE s.id = v_id AND s.accommodation_id = o.accommodation_id;

      v_new_mult := CASE
        WHEN v_setting.pricing_mode = 'per_stay' THEN 1
        WHEN v_setting.pricing_mode = 'per_night' THEN v_nights
      END;
      IF v_new_mult IS NULL THEN
        RAISE EXCEPTION '加購方案「%」的計價方式未知，無法安全計算，未做任何修改', v_setting.addon_type
          USING ERRCODE = '22023';
      END IF;

      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'addon_id',       v_setting.id,
        'addon_type',     v_setting.addon_type,
        'count',          v_qty,
        'price_per_unit', v_setting.price_per_unit,
        'pricing_mode',   v_setting.pricing_mode,
        'total',          (v_setting.price_per_unit * v_qty * v_new_mult)::integer,
        'unit_label',     v_setting.unit_label));

      v_plan_changes := v_plan_changes || jsonb_build_array(jsonb_build_object(
        'addon_id', v_setting.id, 'name', v_setting.addon_type,
        'unit_label', v_setting.unit_label,
        'merged_lines', 0,
        'before_lines', '[]'::jsonb,
        'price_per_unit_after', v_setting.price_per_unit,
        'multiplier_after', v_new_mult,
        'pricing_mode_after', v_setting.pricing_mode,
        'quantity_before', 0, 'quantity_after', v_qty,
        'subtotal_before', 0,
        'subtotal_after', (v_setting.price_per_unit * v_qty * v_new_mult)::integer));
    END LOOP;


    v_addons := v_out;
    IF v_addons = COALESCE(o.custom_addon_details, '[]'::jsonb) THEN
      v_addons := COALESCE(o.custom_addon_details, '[]'::jsonb);
      v_plan_changes := '[]'::jsonb;
      v_merges := '[]'::jsonb;
      v_price_corrections := '[]'::jsonb;
    END IF;
  END IF;

  -- =====================================================================
  -- notes 現場加購：byte-for-byte 保全
  -- 注意：改用 notes_set_onsite_addon_v2()（HOTFIX 2026-09-07）：完全不做 trim，
  -- 且區塊擺放方式保證 strip(new) 與 strip(old) byte-for-byte 相同。
  -- 本 RPC 不以任何 trim 掩蓋差異——重組後若「非加購內容」與原文有任何一個
  -- byte 不同（包含尾端空白被吃掉），一律 RAISE 並 0 mutation（fail-closed）。
  -- =====================================================================
  v_onsite_amount_old := public.notes_onsite_addon_amount(o.notes);
  v_onsite_note_old := (regexp_match(COALESCE(o.notes, ''),
    '【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】'))[1];
  v_onsite_note_new := COALESCE(p_onsite_note, COALESCE(v_onsite_note_old, ''));

  IF p_onsite_amount IS NULL AND p_onsite_note IS NULL THEN
    v_new_notes := o.notes;                                          -- 完全不碰 notes
  ELSIF COALESCE(p_onsite_amount, COALESCE(v_onsite_amount_old, 0)) = COALESCE(v_onsite_amount_old, 0)
        AND v_onsite_note_new IS NOT DISTINCT FROM COALESCE(v_onsite_note_old, '') THEN
    v_new_notes := o.notes;                                          -- no-op：不重新產生 timestamp
  ELSE
    v_ts := to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI');
    v_new_notes := public.notes_set_onsite_addon_v2(
      o.notes,
      COALESCE(p_onsite_amount, COALESCE(v_onsite_amount_old, 0)),
      v_onsite_note_new,
      v_ts);
    -- byte-for-byte：移除加購區塊後的其餘 notes 必須完全相同（不做任何 trim）
    IF COALESCE(public.notes_strip_onsite_addon(v_new_notes), '')
       IS DISTINCT FROM
       COALESCE(public.notes_strip_onsite_addon(o.notes), '') THEN
      RAISE EXCEPTION '備註重組無法逐字保留非加購內容，已中止（未做任何修改）' USING ERRCODE = '42501';
    END IF;
    -- 🔒 金額異動行必須逐行原樣存在
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(COALESCE(o.notes, ''), E'\n') AS l
       WHERE l LIKE '🔒[金額異動%' AND position(l IN COALESCE(v_new_notes, '')) = 0
    ) THEN
      RAISE EXCEPTION '備註重組會影響已鎖定的金額異動記錄，已中止（未做任何修改）' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ---------- 金額格式判定與差額 ----------
  v_old_addon := COALESCE(public.calc_order_addon_total(
    o.pet_plan_price, o.meal_plan_total, o.custom_addon_details, o.notes), 0)::integer;
  v_new_addon := COALESCE(public.calc_order_addon_total(
    o.pet_plan_price, o.meal_plan_total, v_addons, v_new_notes), 0)::integer;
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

  -- guard 通行旗標：沿用 v5.5A guard 既有的窄路徑 B（不新增放行條件）
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

  -- ---------- 變更紀錄（語意化；不含 raw JSON / raw notes） ----------
  v_changes := v_changes || jsonb_build_array(
    jsonb_build_object('field', 'addon_total', 'label', '加購總額',
                       'before', v_old_addon, 'after', v_new_addon));
  IF COALESCE(v_new_notes, '') IS DISTINCT FROM COALESCE(o.notes, '') THEN
    -- 以「與 before 相同的 parser」從實際寫回的 notes 取出現場加購備註文字
    v_onsite_note_after := (regexp_match(COALESCE(v_new_notes, ''),
      '【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】'))[1];
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'extra_addon_amount', 'label', '額外現場加購金額',
                         'before', COALESCE(v_onsite_amount_old, 0),
                         'after', COALESCE(public.notes_onsite_addon_amount(v_new_notes), 0)));
    IF COALESCE(v_onsite_note_after, '') IS DISTINCT FROM COALESCE(v_onsite_note_old, '') THEN
      v_changes := v_changes || jsonb_build_array(
        jsonb_build_object('field', 'extra_addon_note', 'label', '額外現場加購備註',
                           'before', v_onsite_note_old,
                           'after', v_onsite_note_after));
    END IF;
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
      'source', '/admin 修改已付款訂單額外加購（v5.5A.3）',
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
      'addon_line_changes', v_plan_changes,
      'addon_line_merges', v_merges,
      'price_corrections', v_price_corrections,
      'price_change_acknowledged', COALESCE(p_price_change_acknowledged, false),
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
    'addon_line_changes', v_plan_changes,
    'addon_line_merges', v_merges,
    'price_corrections', v_price_corrections,
    'risk', v_risk_kind, 'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id);
END;
$function$;

DO $anc_postcheck$
DECLARE
  v_sig text;
  v_h text;
  v_n integer;
  v_def text;
BEGIN
  -- baseline 必須仍在同一 transaction 內存活（runner 未保證單一 transaction 即 STOP）
  IF to_regclass('pg_temp._anc_inv') IS NULL
     OR to_regclass('pg_temp._anc_trg') IS NULL
     OR to_regclass('pg_temp._anc_meta') IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：TEMP baseline 已消失，無法確認單一 transaction，停止';
  END IF;
  IF (SELECT count(*) FROM _anc_inv) <> 13 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：TEMP baseline 筆數異常';
  END IF;

  -- 13 支不變式函式：before / after 與 hardcoded 皆須相同
  FOR v_sig, v_h IN SELECT sig, before_md5 FROM _anc_inv LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'POSTCHECK 失敗：不變式函式消失（%）', v_sig;
    END IF;
    IF md5(pg_get_functiondef(to_regprocedure(v_sig)::oid)) <> v_h THEN
      RAISE EXCEPTION 'POSTCHECK 失敗：% 於本次作業中被修改（% → %）',
        v_sig, v_h, md5(pg_get_functiondef(to_regprocedure(v_sig)::oid));
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM _anc_inv WHERE expected_md5 <> before_md5) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：不變式基準與 hardcoded 期望值不一致';
  END IF;

  -- trigger 完整集合：雙向 EXCEPT = 0
  SELECT count(*) INTO v_n FROM (
    SELECT tbl, trg, fn, def, enabled FROM _anc_trg
    EXCEPT
    SELECT c.relname::text, t.tgname::text, p.oid::regprocedure::text,
           pg_get_triggerdef(t.oid), t.tgenabled::text
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                         'create_split_record_on_order','enforce_order_meta_commission_fields',
                         'prevent_immutable_order_fields_change')
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：佣金／bonus trigger 有缺少或被修改（% 筆）', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT c.relname::text, t.tgname::text, p.oid::regprocedure::text,
           pg_get_triggerdef(t.oid), t.tgenabled::text
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                         'create_split_record_on_order','enforce_order_meta_commission_fields',
                         'prevent_immutable_order_fields_change')
    EXCEPT
    SELECT tbl, trg, fn, def, enabled FROM _anc_trg
  ) d2;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：佣金／bonus trigger 有新增或被改綁（% 筆）', v_n;
  END IF;

  -- helper：definition / owner / 屬性 / ACL 完全不變（本次不得觸碰）
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'notes_set_onsite_addon_v2') <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：notes_set_onsite_addon_v2 不是唯一一支';
  END IF;
  v_def := pg_get_functiondef(to_regprocedure('public.notes_set_onsite_addon_v2(text,integer,text,text)')::oid);
  IF md5(v_def) <> '23e852f9d33b046821268e9bdb542eda' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：helper definition 被改動（%）', md5(v_def);
  END IF;
  IF encode(sha256(convert_to(v_def, 'UTF8')), 'hex') <> '377138151097d95bdec0bbd23392293dfe50d9fd3b0d95dc9155997a7428fc9f' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：helper SHA-256 不符（%）', encode(sha256(convert_to(v_def, 'UTF8')), 'hex');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.notes_set_onsite_addon_v2(text,integer,text,text)')::oid
                  AND provolatile = 'i' AND prosecdef = false
                  AND proconfig @> ARRAY['search_path=pg_catalog, public']) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：helper volatility／security／search_path 不符預期';
  END IF;
  IF pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = to_regprocedure('public.notes_set_onsite_addon_v2(text,integer,text,text)')::oid)) <> 'postgres' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：helper owner 不是 postgres';
  END IF;
  IF has_function_privilege('public', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.notes_set_onsite_addon_v2(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：helper ACL 與預期不符';
  END IF;

  -- 新版 v3：exact signature 唯一 + hardcoded hash
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'update_paid_order_addons_v3') <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v3 出現 overload';
  END IF;
  IF to_regprocedure('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 exact signature 不符';
  END IF;
  v_def := pg_get_functiondef(to_regprocedure('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)')::oid);
  IF md5(v_def) <> '06f8ab36fe2d7708e4f196ba9078a8ec' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 MD5 不符（% ≠ 06f8ab36fe2d7708e4f196ba9078a8ec），drift → rollback', md5(v_def);
  END IF;
  IF encode(sha256(convert_to(v_def, 'UTF8')), 'hex') <> '8014d67eb2278b1fce6a7f1c1844d23f524b5eb4441b01e3c91aeab4a5864c73' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 SHA-256 不符（%），drift → rollback', encode(sha256(convert_to(v_def, 'UTF8')), 'hex');
  END IF;
  IF v_def NOT LIKE '%PHASE3A_V5_5A3%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 缺少版本標記';
  END IF;
  IF v_def NOT LIKE '%public.notes_set_onsite_addon_v2(%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 未使用 byte-preserving setter';
  END IF;
  IF v_def LIKE '%public.notes_set_onsite_addon(%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v3 仍呼叫舊 setter';
  END IF;
  IF v_def NOT LIKE '%''field'', ''extra_addon_note''%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：新 v3 未寫入 extra_addon_note';
  END IF;
  IF v_def LIKE '%addon_note_changed%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：新 v3 仍會寫入 addon_note_changed';
  END IF;
  IF v_def NOT LIKE '%v_onsite_note_old := (regexp_match(COALESCE(o.notes%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：before 來源不是舊 notes parser';
  END IF;
  IF v_def NOT LIKE '%v_onsite_note_after := (regexp_match(COALESCE(v_new_notes%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：after 來源不是 v_new_notes parser';
  END IF;
  IF v_def NOT LIKE '%IF COALESCE(v_onsite_note_after, '''') IS DISTINCT FROM COALESCE(v_onsite_note_old, '''') THEN%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：缺少「before／after 相同不 append」守則';
  END IF;

  -- 沒有新增其他 DB 物件
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public') <> (SELECT proc_count FROM _anc_meta) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：public schema 函式數量改變（新增／刪除物件）';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','S','p')) <> (SELECT rel_count FROM _anc_meta) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：public schema 資料物件數量改變';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal) <> (SELECT trg_count FROM _anc_meta) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：trigger 總數改變';
  END IF;

  RAISE NOTICE 'POSTCHECK OK — V5.5A.3 AUDIT NOTE CONTENT v2 installed';
END
$anc_postcheck$;