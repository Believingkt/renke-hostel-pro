-- =====================================================================
-- Phase 3A — v5.5A.3 PROPOSAL ONLY（尚未執行 / NOT EXECUTED）
-- 取代 v5.5A.2（審查 FAILED）。平台 migration runner 版本：本檔【不含】BEGIN / COMMIT（由 runner 以單一 transaction 執行）。
-- TEMP-TABLE SAFETY FIX：暫存基準表一律 CREATE TEMP ... ON COMMIT DROP；
-- 檔內不存在任何未限定 schema 的 DROP TABLE，清理只用 DROP TABLE IF EXISTS pg_temp.<name>。
--
-- A.3 修正項目（相對 A.2；含 2026-09-07 CORRECTION）：
--   1. 明確修改判定（CORRECTION #1）：先唯讀彙總每個方案所有可安全對應的既有明細，
--      取得 old_total_quantity；只有 requested_quantity IS DISTINCT FROM old_total_quantity
--      才視為使用者明確修改。數量相同 → 完全 no-op：多筆仍多筆、舊格式／舊單價／舊倍數
--      全部保留，不要求價格確認、不合併、不重算、不 UPDATE、不動 updated_at、不寫 audit。
--   2. LEGACY ADDON MERGE：既有明細沒有 addon_id 時，以「與前台 addonAliases.ts 完全
--      相同的四步規則」在資料庫端解析（addon_id → 完全同名 → 舊名別名表 → 正規化名稱）。
--      使用者確實改變合計數量時，多筆可唯一對應同一現行方案的明細合併為一筆 canonical 明細；
--      before 以各舊明細可信 total 分別加總並語意化記錄，不再因歷史單價／倍數不同而拒絕。
--      僅在目標舊明細缺少可解析的數量或小計時 fail-closed。
--   3. CURRENT-PRICE / PRICING-MODE CORRECTION（CORRECTION #2）：確實修改數量後，
--      一律以現行 addon_settings 單價與【現行計價方式】重算：
--      per_stay → 倍數 1；per_night → GREATEST(1, check_out_date - check_in_date)；
--      不得沿用歷史倍數。歷史單價或歷史倍數與現行不同時，必須
--      p_price_change_acknowledged = true，否則 0 mutation。
--   4. 其餘 A.2 既有安全底線全數保留：逐字保留未列出／無法對應明細、notes byte-for-byte、
--      語意化 audit（before_lines：各舊筆數量／單價／倍數／小計，不含 raw JSON）、
--      no-op 不 UPDATE、Level 0 exact-signature 不變式 precheck/postcheck、
--      佣金 trigger 完整集合 before/after 相等。

--
-- 正式資料庫唯讀盤點（2026-09-07，僅 SELECT）：
--   custom_addon_details 明細 129 筆 / 有 addon_id 69 筆（對得到本館設定 60 筆）
--   無 addon_id 60 筆（其中依名稱唯一對應 47 筆）/ 無法對應或名稱不唯一 22 筆
--   同一訂單同一現行方案對到多筆明細：0 筆（合併規則為前瞻性防護）
--   歷史單價與現行單價不同：0 筆（現行單價重算為前瞻性規則）
--   addon_settings.pricing_mode 實際值：per_night 26 筆、per_stay 13 筆（無其他值、無 NULL）
--
-- 版本標記（函式內含，供 rollback drift 檢查）：PHASE3A_V5_5A3
-- =====================================================================

-- ---------------------------------------------------------------------
-- PRECHECK：exact signature + definition hash（drift 即 STOP）
-- hash 取自正式資料庫唯讀查詢（2026-09-07 覆核，與 A.2 相同）
-- ---------------------------------------------------------------------
DO $precheck$
DECLARE
  v_oid oid;
  v_h text;
  v_bad text;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prevent_immutable_order_fields_change';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 prevent_immutable_order_fields_change';
  END IF;
  IF pg_get_functiondef(v_oid) NOT LIKE '%PHASE3A_COMBINED_GUARD_v5_5A%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：guard 不是 v5.5A 版本（marker 不符），停止';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) <> '8e9f4ff1fd6b96da2fd8042acb2155e3' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：guard definition hash drift（%）', md5(pg_get_functiondef(v_oid));
  END IF;

  FOR v_bad, v_h IN
    SELECT * FROM (VALUES
      ('public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)', 'dec6658792a4f7c9596c7b01925433b8'),
      ('public.update_paid_order_discount(uuid,timestamp with time zone,text,text,integer,text,boolean,text)',                                   '6ce145890d4e1e53940e253c53fe3756'),
      ('public.calc_order_addon_total(numeric,numeric,jsonb,text)',                                                                              'e98e610799805c5e09dccaf62de3800e'),
      ('public.validate_discount_code(text,uuid,integer,uuid,date,uuid)',                                                                        '41c1d18a57999ae01cebc00700a143dd'),
      ('public.get_staff_module_permission(uuid,uuid,text)',                                                                                     '267297c681696446c1889af5e2ac9f86'),
      ('public.notes_onsite_addon_block_count(text)',                                                                                            'b0a09988f60f3595e184d61952511dbe'),
      ('public.notes_onsite_addon_amount(text)',                                                                                                 '03268f5f3e49eb1c7f3fac6f3ad12160'),
      ('public.notes_onsite_addon_malformed(text)',                                                                                              '842ac4615050aee1508a8b386cc7da94'),
      ('public.notes_strip_onsite_addon(text)',                                                                                                  '23aeb30613c14b7e0aa20735daa98a6b'),
      ('public.notes_set_onsite_addon(text,integer,text,text)',                                                                                  '5c2ef774c9274e96be5dc1cbc2be070d')
    ) AS t(sig, h)
  LOOP
    IF to_regprocedure(v_bad) IS NULL THEN
      RAISE EXCEPTION 'PRECHECK 失敗：缺少函式 %（signature 不符）', v_bad;
    END IF;
    IF md5(pg_get_functiondef(to_regprocedure(v_bad)::oid)) <> v_h THEN
      RAISE EXCEPTION 'PRECHECK 失敗：% definition drift（現值 %）',
        v_bad, md5(pg_get_functiondef(to_regprocedure(v_bad)::oid));
    END IF;
  END LOOP;

  -- v5.5A.3 目標函式不得已存在
  IF to_regprocedure('public.addon_name_normalize(text)') IS NOT NULL
     OR to_regprocedure('public.addon_name_canonical(text)') IS NOT NULL
     OR to_regprocedure('public.resolve_addon_setting_id(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)') IS NOT NULL
     OR to_regprocedure('public.update_paid_order_discount_v2(uuid,timestamp with time zone,text,text,integer,text,boolean,text,integer,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：v5.5A.3 目標函式已存在，請先確認狀態';
  END IF;

  FOREACH v_bad IN ARRAY ARRAY['id','accommodation_id','addon_type','enabled','price_per_unit',
                               'unit_label','pricing_mode','min_quantity','max_quantity'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='addon_settings' AND column_name = v_bad) THEN
      RAISE EXCEPTION 'PRECHECK 失敗：addon_settings 缺少欄位 %', v_bad;
    END IF;
  END LOOP;

  -- pricing_mode 實際值必須仍在已知集合內（新值出現即 STOP，避免倍數誤判）
  IF EXISTS (SELECT 1 FROM public.addon_settings
              WHERE COALESCE(pricing_mode, '') NOT IN ('per_night', 'per_stay')) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：addon_settings 出現未知的 pricing_mode，倍數規則需重新確認';
  END IF;

  IF NOT has_function_privilege('authenticated',
        'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)',
        'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 的 EXECUTE 已被回收，狀態與預期不符';
  END IF;

  -- Level 0 基準：逐支 exact signature（不得以 count 或 overload 掩蓋缺失）
  CREATE TEMP TABLE _lvl0_a3 (
    sig text PRIMARY KEY,
    h text NOT NULL
  ) ON COMMIT DROP;

  FOREACH v_bad IN ARRAY ARRAY[
    'public.enforce_order_meta_commission_fields()',
    'public.sync_team_commission_price_from_order()',
    'public.calc_team_commission_price(uuid)',
    'public.create_commission_record()',
    'public.create_split_record_on_order()',
    'public.calc_order_addon_total(numeric,numeric,jsonb,text)',
    'public.validate_discount_code(text,uuid,integer,uuid,date,uuid)',
    'public.prevent_immutable_order_fields_change()',
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)',
    'public.update_paid_order_discount(uuid,timestamp with time zone,text,text,integer,text,boolean,text)'
  ] LOOP
    IF to_regprocedure(v_bad) IS NULL THEN
      RAISE EXCEPTION 'PRECHECK 失敗：Level 0 函式缺少或簽名不符（%）', v_bad;
    END IF;
    INSERT INTO _lvl0_a3(sig, h)
    VALUES (to_regprocedure(v_bad)::oid::regprocedure::text,
            encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(v_bad)::oid), 'UTF8')), 'hex'));
  END LOOP;
  IF (SELECT count(*) FROM _lvl0_a3) <> 10 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：Level 0 基準筆數不符（% 筆）', (SELECT count(*) FROM _lvl0_a3);
  END IF;
  -- overload 防護：同名函式不得多於基準（避免新增 overload 掩蓋缺少的正本）
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('enforce_order_meta_commission_fields','sync_team_commission_price_from_order',
                           'calc_team_commission_price','create_commission_record','create_split_record_on_order',
                           'calc_order_addon_total','validate_discount_code','prevent_immutable_order_fields_change',
                           'update_paid_order_addons_v2','update_paid_order_discount')) <> 10 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：Level 0 函式出現非預期 overload 或缺漏';
  END IF;

  -- 佣金／guard trigger 完整基準（table / trigger / function / definition / enabled）
  CREATE TEMP TABLE _trg_a3
  ON COMMIT DROP
  AS
  SELECT c.relname::text AS tbl,
         t.tgname::text AS trg,
         p.oid::regprocedure::text AS fn,
         pg_get_triggerdef(t.oid) AS def,
         t.tgenabled::text AS enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                       'create_split_record_on_order','enforce_order_meta_commission_fields',
                       'prevent_immutable_order_fields_change');
  IF (SELECT count(*) FROM _trg_a3) <> 6 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：佣金／guard trigger 基準筆數不符（% 筆，預期 6）',
      (SELECT count(*) FROM _trg_a3);
  END IF;
  IF EXISTS (SELECT 1 FROM _trg_a3 WHERE enabled <> 'O') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：佣金／guard trigger 於安裝前即非啟用狀態';
  END IF;

END
$precheck$;



-- =====================================================================
-- A0. 名稱解析輔助函式（與前台 src/lib/addonAliases.ts 同一套規則）
--     四步：addon_id → 完全同名 → 舊名別名表 → 正規化名稱
-- =====================================================================
CREATE OR REPLACE FUNCTION public.addon_name_normalize(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- PHASE3A_V5_5A3
  SELECT COALESCE(
    NULLIF(regexp_replace(
             btrim(regexp_replace(COALESCE(p_name, ''), '[[:space:]　]', '', 'g')),
             '(服務|費用|費|方案)$', ''), ''),
    btrim(regexp_replace(COALESCE(p_name, ''), '[[:space:]　]', '', 'g'))
  );
$function$;

CREATE OR REPLACE FUNCTION public.addon_name_canonical(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- PHASE3A_V5_5A3
  -- 舊名別名表：必須與 src/lib/addonAliases.ts 的 LEGACY_ADDON_NAME_ALIASES 完全一致
  SELECT public.addon_name_normalize(
    COALESCE(
      (SELECT a.new_name FROM (VALUES
         ('加床服務', '加床'),
         ('加床費',   '加床'),
         ('寵物服務', '寵物'),
         ('寵物費',   '寵物'),
         ('寵物方案', '寵物'),
         ('早餐服務', '早餐'),
         ('餐食方案', '餐食'),
         ('烤肉服務', '烤肉'),
         ('包棟服務', '包棟')
       ) AS a(old_name, new_name)
       WHERE a.old_name = btrim(COALESCE(p_name, ''))),
      p_name
    )
  );
$function$;

-- 回傳唯一命中的 addon_settings.id；0 筆或多筆（歧義）皆回傳 NULL（fail-closed 由呼叫端處理）
CREATE OR REPLACE FUNCTION public.resolve_addon_setting_id(
  p_accommodation_id uuid,
  p_addon_id text,
  p_addon_type text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
-- PHASE3A_V5_5A3
DECLARE
  v_id uuid;
  v_cnt int;
BEGIN
  IF p_accommodation_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- (1) addon_id
  IF COALESCE(btrim(p_addon_id), '') <> '' THEN
    BEGIN
      SELECT s.id INTO v_id FROM public.addon_settings s
       WHERE s.accommodation_id = p_accommodation_id AND s.id = p_addon_id::uuid;
    EXCEPTION WHEN others THEN
      v_id := NULL;                                  -- 非 uuid 格式 → 續往名稱比對
    END;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF COALESCE(btrim(p_addon_type), '') = '' THEN
    RETURN NULL;
  END IF;

  -- (2) 完全同名
  SELECT count(*), (array_agg(s.id))[1] INTO v_cnt, v_id FROM public.addon_settings s
   WHERE s.accommodation_id = p_accommodation_id AND s.addon_type = btrim(p_addon_type);
  IF v_cnt = 1 THEN RETURN v_id; END IF;
  IF v_cnt > 1 THEN RETURN NULL; END IF;

  -- (3) 舊名別名表 → 完全同名
  SELECT count(*), (array_agg(s.id))[1] INTO v_cnt, v_id FROM public.addon_settings s
   WHERE s.accommodation_id = p_accommodation_id
     AND s.addon_type = public.addon_name_canonical(p_addon_type);
  IF v_cnt = 1 THEN RETURN v_id; END IF;
  IF v_cnt > 1 THEN RETURN NULL; END IF;

  -- (4) 正規化名稱
  SELECT count(*), (array_agg(s.id))[1] INTO v_cnt, v_id FROM public.addon_settings s
   WHERE s.accommodation_id = p_accommodation_id
     AND public.addon_name_normalize(s.addon_type) = public.addon_name_canonical(p_addon_type);
  IF v_cnt = 1 THEN RETURN v_id; END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.addon_name_normalize(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.addon_name_canonical(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_addon_setting_id(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.addon_name_normalize(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.addon_name_canonical(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_addon_setting_id(uuid, text, text) TO authenticated;


-- =====================================================================
-- B1. public.update_paid_order_addons_v3   （PHASE3A_V5_5A3）
--
--   p_addon_plans = [{"addon_id": uuid, "quantity": int}, ...]
--     * 只有明確列出的方案會被調整；未列出／無法對應的既有明細一律逐字保留
--     * 移除方案必須明確送 quantity = 0
--     * 同一 addon_id 重複出現 → 拒絕
--     * 停用／非本館／找不到的方案 → 拒絕調整（既有明細仍保留）
--
--   明確修改判定：
--     requested_quantity IS DISTINCT FROM old_total_quantity 才算「使用者明確修改」。
--     數量未改 → 完全 no-op（多筆仍多筆、舊 addon_type／unit_label／pricing_mode／
--     舊單價／舊倍數／舊格式全部原樣保留，不要求價格確認、不合併、不 UPDATE、
--     不寫 audit；歷史格式異常也不自動改寫）。
--
--   既有明細對應（LEGACY ADDON MERGE）：
--     以 public.resolve_addon_setting_id() 四步規則解析（與前台 addonAliases.ts 相同）；
--     同一現行方案對到多筆既有明細，且數量確有變動 → 合併為一筆 canonical 明細。
--
--   CANONICAL 明細（FINAL DATA-PRESERVATION CORRECTION #1）：
--     明確修改後重建的明細一律採用目前 addon_settings：
--       addon_id / addon_type / unit_label / pricing_mode = 目前設定（pricing_mode 無條件寫入）
--       count = requested quantity
--       price_per_unit = 目前單價
--       total = 目前單價 × requested quantity × 目前倍數
--
--   額外欄位保全（CORRECTION #2）：
--     canonical 欄位集合 = {addon_id, addon_type, count, price_per_unit, total,
--     unit_label, pricing_mode}。集合以外的額外欄位：單筆轉換原樣保留；多筆合併
--     時所有明細額外欄位必須完全相同才保留一份，否則 fail-closed、0 mutation。
--
--   整數驗證（CORRECTION #3）：
--     被明確修改的目標明細，其 count / total（及有值的 price_per_unit）必須可解析、
--     非負、且等於 trunc()；1.5 / 500.25 / NaN / Infinity / 非數字 一律 fail-closed。
--
--   單價（CURRENT-PRICE CORRECTION）：
--     一律採用 public.addon_settings 現行單價，忽略 client 送來的任何金額欄位。
--     既有單價／倍數 ≠ 現行時，必須 p_price_change_acknowledged = true，否則 0 mutation。
--
--   倍數（multiplier）：
--     重建一律用目前 pricing_mode：'per_stay' → 1；'per_night' → GREATEST(1, 住宿晚數)；
--     其他值 → fail-closed。歷史倍數（反推值）僅供 audit 與差異判定。
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_paid_order_addons_v3(
  p_order_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_reason text,
  p_settlement_handling text,
  p_confirmed boolean DEFAULT false,
  p_addon_plans jsonb DEFAULT NULL::jsonb,
  p_onsite_amount integer DEFAULT NULL::integer,
  p_onsite_note text DEFAULT NULL::text,
  p_paid_amount integer DEFAULT NULL::integer,
  p_reduce_acknowledged boolean DEFAULT false,
  p_risk_acknowledged boolean DEFAULT false,
  p_price_change_acknowledged boolean DEFAULT false
)
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
  -- 注意：notes_set_onsite_addon() 內部會做 '\s+$' 尾端空白清除。
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
    v_new_notes := public.notes_set_onsite_addon(
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
    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('field', 'extra_addon_amount', 'label', '額外現場加購金額',
                         'before', COALESCE(v_onsite_amount_old, 0),
                         'after', COALESCE(public.notes_onsite_addon_amount(v_new_notes), 0)),
      jsonb_build_object('field', 'addon_note_changed', 'label', '額外現場加購備註是否更動',
                         'before', NULL,
                         'after', (v_onsite_note_new IS DISTINCT FROM COALESCE(v_onsite_note_old, ''))));
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

REVOKE ALL ON FUNCTION public.update_paid_order_addons_v3(uuid, timestamp with time zone, text, text, boolean, jsonb, integer, text, integer, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_paid_order_addons_v3(uuid, timestamp with time zone, text, text, boolean, jsonb, integer, text, integer, boolean, boolean, boolean) TO authenticated;



-- =====================================================================
-- B2. public.update_paid_order_discount_v2
--     PHASE3A_V5_5A3
--
--   * 僅接受 payment_status IN ('paid','fully_paid')
--     （unpaid / deposit_paid / pending_payment / refunded / partial_refunded
--       一律不適用本流程，維持一般訂單編輯）
--   * payment_status 仍為 paid 但退款中／已退款欄位有值 → 高風險確認制
--   * payment_status 仍為 paid 但訂單已取消 → 高風險確認制
--   * mode = 'code_override'：後端重新驗證折扣碼、計算標準折扣，
--     並接受人工調整後的實際折扣金額（不得為負、不得超過折扣規則上限），
--     折扣碼保留、audit 同時記錄 standard / applied / override
--   * 不寫 used_count、不建立 coupon_usages、不改折扣碼活動設定
--   * manual / none / code 三種模式的行為與 update_paid_order_discount 相同
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_paid_order_discount_v2(
  p_order_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_reason text,
  p_mode text,
  p_discount_amount integer DEFAULT NULL::integer,
  p_discount_code text DEFAULT NULL::text,
  p_confirmed boolean DEFAULT false,
  p_settlement_handling text DEFAULT NULL::text,
  p_applied_discount_amount integer DEFAULT NULL::integer,
  p_risk_acknowledged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
-- PHASE3A_V5_5A3
DECLARE
  o public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_mode text := lower(btrim(COALESCE(p_mode, '')));
  v_code text := NULLIF(upper(btrim(COALESCE(p_discount_code, ''))), '');
  v_standard integer;
  v_new_discount integer;
  v_new_code text;
  v_new_final integer;
  v_room_fee integer;
  v_cap integer;
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
  v_override boolean := false;
  v_risky boolean := false;
  v_risk_kind text := 'none';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('manual', 'none', 'code', 'code_override') THEN
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

  IF COALESCE(public.get_staff_module_permission(v_uid, o.accommodation_id, 'orders'), 'hidden') <> 'editable' THEN
    RAISE EXCEPTION '權限不足：您對此館別的「訂單」模組沒有編輯權限' USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '訂單已被其他人修改，請重新整理後再試' USING ERRCODE = '40001';
  END IF;

  -- 僅適用已付清訂單
  IF lower(COALESCE(o.payment_status, '')) NOT IN ('paid', 'fully_paid') THEN
    RAISE EXCEPTION '此訂單付款狀態為 %，不適用「修改已結清折扣」，請使用一般訂單編輯',
      COALESCE(o.payment_status, '(空)') USING ERRCODE = '22023';
  END IF;

  -- 高風險：退款中／已退款欄位有值，或訂單已取消 → 確認制
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
    RAISE EXCEPTION '此訂單已退款／退款處理中或已取消，需完成高風險確認才能修改折扣（未做任何修改）'
      USING ERRCODE = '22023';
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

  ELSE -- code / code_override：後端一律重新驗證折扣碼並計算標準金額
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

    v_standard := CASE
      WHEN v_valid.discount_type = 'percentage'
        THEN round(v_room_fee * (v_valid.discount_value::numeric / 100))::integer
      ELSE v_valid.discount_value::integer
    END;
    v_new_code := v_code;

    IF v_mode = 'code' THEN
      v_new_discount := v_standard;
    ELSE
      IF p_applied_discount_amount IS NULL OR p_applied_discount_amount < 0 THEN
        RAISE EXCEPTION '實際套用折扣金額不得為空或負數' USING ERRCODE = '22023';
      END IF;
      -- 上限沿用正式折扣規則：折扣基準為房費，且不得大於訂單總額
      v_cap := LEAST(v_room_fee, COALESCE(o.total_price, 0)::integer);
      IF p_applied_discount_amount > v_cap THEN
        RAISE EXCEPTION '實際套用折扣金額不得大於折扣基準（房費 NT$%）', v_cap USING ERRCODE = '22023';
      END IF;
      v_new_discount := p_applied_discount_amount;
      v_override := (v_new_discount IS DISTINCT FROM v_standard);
    END IF;
  END IF;

  IF v_new_discount > COALESCE(o.total_price, 0) THEN
    RAISE EXCEPTION '折扣金額不得大於訂單總額' USING ERRCODE = '22023';
  END IF;

  v_new_final := COALESCE(o.final_price, 0) + (v_old_discount - v_new_discount);

  IF v_new_discount = v_old_discount
     AND v_new_code IS NOT DISTINCT FROM v_old_code
     AND v_new_final = v_old_final THEN
    RETURN jsonb_build_object(
      'changed', false, 'order_id', o.id,
      'discount_amount', v_old_discount, 'discount_code', v_old_code,
      'standard_discount_amount', v_standard, 'manual_override', v_override,
      'final_price', v_old_final, 'risk', v_risk_kind,
      'updated_at', o.updated_at, 'audit_log_id', NULL);
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
    o.accommodation_id, v_uid, auth.jwt() ->> 'email',
    'update', 'order', 'order', o.id::text, o.order_number,
    jsonb_build_object(
      'type', 'paid_discount_edit',
      'source', '/admin 修改已結清折扣（v5.5A.3）',
      'reason', v_reason,
      'mode', v_mode,
      'confirmed', true,
      'settlement_handling', v_settle,
      'risk_state', v_risk_kind,
      'risk_acknowledged', COALESCE(p_risk_acknowledged, false),
      'payment_status', o.payment_status,
      'refund_status', o.refund_status,
      'order_status', o.order_status,
      'paid_amount', v_paid,
      'difference', v_diff,
      'difference_note', v_diff_note,
      'standard_discount_amount', v_standard,
      'applied_discount_amount', v_new_discount,
      'manual_override', v_override,
      'changes', jsonb_build_array(
        jsonb_build_object('field', 'discount_code', 'label', '折扣碼',
                           'before', v_old_code, 'after', v_new_code),
        jsonb_build_object('field', 'standard_discount_amount', 'label', '系統計算標準折扣',
                           'before', NULL, 'after', v_standard),
        jsonb_build_object('field', 'discount_amount', 'label', '實際套用折扣',
                           'before', v_old_discount, 'after', v_new_discount),
        jsonb_build_object('field', 'final_price', 'label', '應收金額',
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
    'changed', true, 'order_id', o.id,
    'discount_amount', v_after.discount_amount,
    'discount_code', v_after.discount_code,
    'standard_discount_amount', v_standard,
    'applied_discount_amount', v_new_discount,
    'manual_override', v_override,
    'final_price', v_after.final_price,
    'paid_amount', v_after.paid_amount,
    'difference', v_diff,
    'difference_note', v_diff_note,
    'settlement_handling', v_settle,
    'risk', v_risk_kind,
    'updated_at', v_after.updated_at,
    'audit_log_id', v_audit_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.update_paid_order_discount_v2(uuid, timestamp with time zone, text, text, integer, text, boolean, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_paid_order_discount_v2(uuid, timestamp with time zone, text, text, integer, text, boolean, text, integer, boolean) TO authenticated;

-- 注意：本階段【不】回收 update_paid_order_addons_v2 的 EXECUTE。
-- 回收時機＝新前端已發布 + caller 歸零 + 受控 smoke 通過 + v5.5B 另行授權。


-- ---------------------------------------------------------------------
-- POSTCHECK（與上方 DDL 同一 transaction；由 runner 一併執行）
-- ---------------------------------------------------------------------

DO $postcheck$
DECLARE
  v_bad text;
  v_h text;
  v_n int;
BEGIN
  -- (0) 暫存基準必須仍在同一 transaction 內（temp table 使用 ON COMMIT DROP）
  IF to_regclass('pg_temp._lvl0_a3') IS NULL OR to_regclass('pg_temp._trg_a3') IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：precheck 暫存基準不存在，本 migration 必須在單一 transaction 內執行';
  END IF;

  -- (1) A.3 新增函式：exact signature + exact definition hash（sha256）
  FOR v_bad, v_h IN
    SELECT * FROM (VALUES
      ('public.addon_name_normalize(text)',
       'b081318d3b96c9e37e670f7e8f85e5235ca9e01c57b2bf11c311be1529d79409'),
      ('public.addon_name_canonical(text)',
       '6a05f7b81bb416bf21e4a50e2227232f53d4470f6da4c4a5a5bcabf5cc10c753'),
      ('public.resolve_addon_setting_id(uuid,text,text)',
       '42810c7fc1955aa6a1bb69f62232733862fddbf2896d316d6b776e7daa8c661b'),
      ('public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)',
       'f099c489b93b9d39c074bbaae38b1bb0e565220023be044a0ae438976d5b2e39'),
      ('public.update_paid_order_discount_v2(uuid,timestamp with time zone,text,text,integer,text,boolean,text,integer,boolean)',
       'e311fb42daa4c7548b6d9e557d666137db993e9d4c926e4e6628bb2a7d1e4f6f')
    ) AS t(sig, h)
  LOOP
    IF to_regprocedure(v_bad) IS NULL THEN
      RAISE EXCEPTION 'POSTCHECK 失敗：A.3 函式未建立或簽名不符（%）', v_bad;
    END IF;
    IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(v_bad)::oid), 'UTF8')), 'hex') <> v_h THEN
      RAISE EXCEPTION 'POSTCHECK 失敗：% definition hash 不符（現值 %）',
        v_bad,
        encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(v_bad)::oid), 'UTF8')), 'hex');
    END IF;
  END LOOP;

  -- (2) Level 0：所有獎金／折扣／guard 函式 definition hash 與 precheck 完全相同
  SELECT count(*) INTO v_n
    FROM _lvl0_a3 b
    JOIN (SELECT p.oid::regprocedure::text AS sig,
                 encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS h
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public') a ON a.sig = b.sig
   WHERE a.h <> b.h;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：Level 0 函式 definition drift（% 筆）', v_n;
  END IF;
  IF (SELECT count(*) FROM _lvl0_a3 b
       WHERE to_regprocedure(b.sig) IS NULL) > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：Level 0 函式消失';
  END IF;
  IF (SELECT count(*) FROM _lvl0_a3) <> 10 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：Level 0 基準筆數不符';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('enforce_order_meta_commission_fields','sync_team_commission_price_from_order',
                           'calc_team_commission_price','create_commission_record','create_split_record_on_order',
                           'calc_order_addon_total','validate_discount_code','prevent_immutable_order_fields_change',
                           'update_paid_order_addons_v2','update_paid_order_discount')) <> 10 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：Level 0 函式出現新增 overload 或缺漏';
  END IF;

  -- (3) 佣金／guard trigger：before / after 完整集合相等（缺少、增加、改綁、停用皆 STOP）
  SELECT count(*) INTO v_n FROM (
    SELECT tbl, trg, fn, def, enabled FROM _trg_a3
    EXCEPT
    SELECT c.relname::text, t.tgname::text, p.oid::regprocedure::text,
           pg_get_triggerdef(t.oid), t.tgenabled::text
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                         'create_split_record_on_order','enforce_order_meta_commission_fields',
                         'prevent_immutable_order_fields_change')
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：佣金／guard trigger 有缺少或被修改（% 筆）', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT c.relname::text AS tbl, t.tgname::text AS trg, p.oid::regprocedure::text AS fn,
           pg_get_triggerdef(t.oid) AS def, t.tgenabled::text AS enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND p.proname IN ('sync_team_commission_price_from_order','create_commission_record',
                         'create_split_record_on_order','enforce_order_meta_commission_fields',
                         'prevent_immutable_order_fields_change')
    EXCEPT
    SELECT tbl, trg, fn, def, enabled FROM _trg_a3
  ) d2;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：佣金／guard trigger 有新增或被改綁（% 筆）', v_n;
  END IF;


  -- (4) 本 migration 僅建立函式：不得存在 A.3 相關的資料異動
  IF to_regprocedure('public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：v5.5A 既有 RPC 遺失';
  END IF;
  IF NOT has_function_privilege('authenticated',
        'public.update_paid_order_addons_v3(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,text,integer,boolean,boolean,boolean)',
        'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：addons_v3 未授權 authenticated 執行';
  END IF;

  DROP TABLE IF EXISTS pg_temp._lvl0_a3;
  DROP TABLE IF EXISTS pg_temp._trg_a3;
  RAISE NOTICE 'POSTCHECK OK — PHASE3A_V5_5A3 installed';
END
$postcheck$;