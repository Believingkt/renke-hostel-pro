# 2b 完整設計稿：OTA 修改信只改差異（施工用，取代 plan/2b-ota-modification-design.md 的摘要版）

基準 commit：GitHub main `fc59fa2aa35cd774871bee68ab123ad668b0874b`
狀態：使用者已核准施工（Build），**不含 Save to GitHub**；Save to GitHub 需使用者審查報告後另外核准。
分三批施工：2b-1 → 2b-2 → 2b-3，每批完成都停下等使用者審查。

---

## 0. 目標（白話）

奧丁丁（OTA）修改信目前會把訂單房間明細整批刪掉重建，房號與每間房價遺失；只改間數不會套用；信件金額 0 會把訂單金額改成 0；訂單更新與明細重建不在同一交易，失敗時留下「訂單已改、明細沒改」的半套資料（正式資料 60 天內 5 筆 `Inventory exceeded`）。

2b 改成：只改有差異的部分，訂單與明細在同一交易完成，任一步失敗整筆回滾。

---

## 1. 規格（使用者已決定）

1. **單一交易**：新增 SECURITY DEFINER 函式 `apply_ota_modification_v1`，同一交易依序 (a) `update_order_with_context` 更新 orders →(b) 需要時 `sync_order_rooms_v1` →(c) 回傳 conflicts。任何 RAISE 整筆回滾。不修改 `sync_order_rooms_v1`、`update_order_with_context` 與任何 trigger。
2. 只有日期、房型或間數有變時才動明細；只改人數或金額時只更新 orders（`p_sync_rooms = false`）。
3. **只改日期**：現有每一列原樣送入 sync（id、room_type_id、room_unit_id、room_price、template 不變）。sync 對保留列無條件 UPDATE，庫存 trigger（BEFORE INSERT OR UPDATE、無 WHEN）會在新日期重新驗證。房號衝突的列由 sync 設為 null：訂單照改、寄告警列出哪幾間被哪張訂單佔用。庫存不足：整筆回滾並告警。
4. **間數增加**：保留舊列，新增差額；新列房價 = 現有列 room_price 平均（四捨五入）；房號比照 rebuild 規則挑空房；template 沿用現有列。
5. **間數減少**：只刪差額；先刪 room_unit_id 為 null 的列，再依房號排序從最後一間刪起。
6. **房型變更**（單一房型整單換）：舊列全部移除，新房型依目標間數新增，房號比照 rebuild 規則，template 用 `resolveRoomTemplate` 對新房型重新解析。房價：信件金額有效時 = 信件金額 ÷ 間數，否則沿用舊列平均。
7. **金額**：
   - 比對基準是 `orders.total_price`（不比 final_price；正式資料大量 final_price=0）。
   - 信件金額 > 0 且與 total_price 不同：total_price、final_price 改成信件金額；已付款訂單 paid_amount 也改成信件金額。
   - 信件金額 0 或空白：不改任何金額欄位。
   - 間數或房型有變、但信件金額 0 或空白：明細照改、金額不動，寄告警請人工核對總金額。
8. **先後順序**：`owlting_email_orders_raw` 新增 `mail_sent_at timestamptz NULL`，ingest 寫 raw 時從 headers **行首**的 Date 解析（DKIM 的 h= 清單裡也有 `Date:`，不可抓錯）；解析失敗為 null，舊資料不回填。套用前，同一 OBE 若已有 ingest_outcome 為 order_created／order_updated／noop_modification、且時間嚴格較新的信，本封不套用，記 `stale_ignored`。兩邊都有 mail_sent_at 就比它，否則比 received_at。
9. **擋下（fail-closed）**：不套用、寫 staging 與 error_logs、寄告警，ingest_outcome 記 `modify_blocked`，ingest_outcome_detail 寫原因代碼。原因代碼完整清單見第 4 節。
10. **失敗**：庫存不足、備品不足、重複送出保護（23505）、ORDER_CHANGED 都是整筆回滾，ingest_outcome 維持 `apply_failed`，detail 寫 error_reason。
11. **告警**：沿用 `sendOrderRoomsAlertEmail` 與 `reportBackendError`，error_logs category = `owlting_modify_rooms`。告警內容格式：「未套用，需人工處理｜原因代碼｜OBE｜訂單｜信件修改內容（修改前→修改後）」。房號衝突告警比照 2a-2 未分配房號清單。
12. **業主通知**（owlting-change-notify，本批不改）：舊信（stale）不通知業主；其他擋下情況（含 stale_check_failed）照常通知；兩者都寄內部告警。
13. **房型比對**（同館範圍）：① 去空白、轉小寫後完全相同 → 採用；② 否則信件名稱剛好是「唯一一個」房型名稱的開頭（去空白後 startsWith）→ 採用；③ 多個符合 → room_type_ambiguous；都不符合 → room_type_unmatched。不使用「包含」比對。正式資料有房型「12 人 (含以下) 包區」「14 人包區」「16 人包區」「18 人包區」，parser 只抓得到「12」「14」。
14. 信件間數 > 20：擋下（quantity_out_of_range），不得默默改成 20。

---

## 2. 修改範圍

| 類型 | 項目 | 批次 |
|---|---|---|
| 新 migration | `supabase/migrations/20261017090000_apply_ota_modification_v1.sql` | 2b-1 |
| 新檔 | `docs/ota-modification/rollback_20261017090000.sql` | 2b-1 |
| 新檔（不部署） | 本機 Postgres 整合測試腳本與 SQL（目錄施工時決定，回報時寫明） | 2b-1 |
| 新檔 | `supabase/functions/_shared/syncOtaOrderRooms.ts`（純函式） | 2b-2 |
| 新檔 | `supabase/functions/_shared/syncOtaOrderRooms_test.ts` | 2b-2 |
| 修改 | `supabase/functions/_shared/owltingAutoOrder.ts`：只改 `applyModificationToExistingOrder`、`ApplyModificationResult`；`resolveRoomTemplate` 只在前面加 `export`，本體不動 | 2b-2 |
| 修改 | `supabase/functions/owlting-email-ingest/index.ts`：寫 mail_sent_at、舊信判斷、兩種新 outcome、業主通知條件 | 2b-3 |
| 資料表 | `owlting_email_orders_raw.mail_sent_at timestamptz NULL` | 2b-1 |
| 新 ingest_outcome 值 | `stale_ignored`、`modify_blocked`（欄位為 text，無 CHECK） | 2b-3 |
| error_logs | 新 category `owlting_modify_rooms` | 2b-2 |

## 3. 不會動到（git diff fc59fa2 必須為空）

- `supabase/functions/_shared/owltingAutoOrder.ts` 中 `rebuildOrderRooms`、`autoCreatePendingOrder`、`markRebuildFailure`、`matchRoomTypeByName`、`resolveRoomTemplate` 的本體（檔案本身會改，這些函式以原始碼片段比對）
- `supabase/functions/_shared/owltingEchoGuard.ts`
- `supabase/functions/_shared/owltingEchoGuard_test.ts`
- `supabase/functions/_shared/owltingHtmlParser.ts`
- `supabase/functions/_shared/fillupRooms.ts`
- `supabase/functions/_shared/orderRoomsAlert.ts`
- `supabase/functions/_shared/orderContext.ts`
- `supabase/functions/_shared/resolveTemplateId.ts`
- `supabase/functions/owlting-change-notify/`（整個目錄）
- `supabase/functions/owlting-fillup-submit/`（整個目錄）
- `supabase/migrations/` 下所有既有檔案（只新增 20261017090000）
- 資料庫：`sync_order_rooms_v1`、`update_order_with_context`、`change_order_dates`、orders 與 order_rooms 上所有 trigger 與 trigger 函式

回報時執行：
```
git diff --stat fc59fa2 -- supabase/functions/_shared/owltingEchoGuard.ts supabase/functions/_shared/owltingEchoGuard_test.ts supabase/functions/_shared/owltingHtmlParser.ts supabase/functions/_shared/fillupRooms.ts supabase/functions/_shared/orderRoomsAlert.ts supabase/functions/_shared/orderContext.ts supabase/functions/_shared/resolveTemplateId.ts supabase/functions/owlting-change-notify supabase/functions/owlting-fillup-submit
git diff --stat --diff-filter=MD fc59fa2 -- supabase/migrations
```
兩者輸出都必須為空。owltingAutoOrder.ts 的五個函式，用「fc59fa2 版本與新版本各自擷取函式全文、比對 md5」證明不變（resolveRoomTemplate 只差 `export` 一字）。

---

## 4. 原因代碼完整清單

**modify_blocked（擋下，不套用）**
| 代碼 | 條件 |
|---|---|
| multiple_active_orders | 同一 OBE 有超過一張未取消訂單 |
| order_checked_in | 訂單狀態 checked_in |
| order_checked_out | 訂單狀態 checked_out |
| no_existing_rooms | 訂單沒有任何明細 |
| multi_room_type_rows | 明細有多個房型 |
| non_unit_quantity_rows | 明細有 quantity ≠ 1 的列 |
| order_room_type_mismatch | orders.room_type_id 非 null 且與明細房型不同 |
| room_type_unmatched | 信件房型比對不到 |
| room_type_ambiguous | 信件房型對到多個 |
| unreliable_diff | parser 狀態為 null／partial／no_sections／unparsable，且要改日期、房型或間數 |
| quantity_out_of_range | 信件間數 > 20 |
| stale_check_failed | 舊信判斷的查詢失敗（照常通知業主） |

**stale_ignored**：判定為舊信（不通知業主）。

**apply_failed 的 error_reason**：inventory_exceeded（含 `Room not available`）、amenity_exceeded、double_submit（23505）、order_changed、unknown。

---

## 5. 新 RPC 規格

```
public.apply_ota_modification_v1(
  p_order_id    uuid,
  p_patch       jsonb,     -- 傳給 update_order_with_context 的欄位；不可為空
  p_expect      jsonb,     -- 比對護欄：{check_in_date, check_out_date, room_type_id, total_price, order_status}，值一律用從資料庫讀到的原值
  p_source      text,      -- 'owlting_email_modify'
  p_reason      text,
  p_actor_label text,      -- 'OwlTing 修改通知'
  p_sync_rooms  boolean,   -- 是否呼叫 sync_order_rooms_v1
  p_rooms       jsonb      -- p_sync_rooms=true 時必填，非空陣列
) RETURNS jsonb  -- {ok, order_updated, synced, conflicts, sync}
SECURITY DEFINER, SET search_path = public
只允許 request.jwt.claims.role = service_role；REVOKE ALL FROM PUBLIC, anon, authenticated；GRANT EXECUTE TO service_role
```

正式庫實測指紋（算法：`md5(pg_get_functiondef(oid))`、`length(pg_get_functiondef(oid))`）：

| 函式 | def_md5 | def_len | prosecdef |
|---|---|---|---|
| `public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)` | 8cc1ae289015f64c2d16801600af8cb2 | 4767 | true |
| `public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)` | 7d7e88fcecddcab46c798c5916a1bed0 | 3508 | true |

（prosrc 的值 957646923f7e28e9fe7c75b50ed26643／4529、892e4b288fa45361989c8b7494093bc6／3111，**不要使用**。）

正式庫 order_rooms 上 5 支 trigger（使用者 2026-10-17 實查）：
```
trg_hotelnabe_enqueue_from_order_rooms  AFTER INSERT OR DELETE OR UPDATE ... fn_hotelnabe_enqueue_from_order_rooms()
trg_order_rooms_owlting_enqueue         AFTER INSERT OR DELETE OR UPDATE ... fn_order_rooms_owlting_enqueue()
trg_order_rooms_prevent_double_submit   BEFORE INSERT ... order_rooms_prevent_double_submit()
trg_validate_room_unit_no_conflict      BEFORE INSERT OR UPDATE OF room_unit_id ... validate_room_unit_no_conflict()
validate_order_rooms_inventory_trigger  BEFORE INSERT OR UPDATE ... validate_order_rooms_inventory()
```

---

## 6. Migration 全文（2b-1）

`supabase/migrations/20261017090000_apply_ota_modification_v1.sql`（不寫 BEGIN／COMMIT，比照最近慣例）：

```sql
-- 20261017090000_apply_ota_modification_v1.sql
-- 目的：OTA（奧丁丁）修改信改為「只改差異」並在單一交易內完成：
--   新增 apply_ota_modification_v1（update_order_with_context → sync_order_rooms_v1 → 回傳 conflicts）
--   新增 owlting_email_orders_raw.mail_sent_at（信件 Date 標頭）
-- 不動：sync_order_rooms_v1、update_order_with_context、change_order_dates、order_rooms／orders 所有 trigger
-- 指紋算法：md5(pg_get_functiondef(oid)) / length(pg_get_functiondef(oid))（與每日 RPC 合約檢查一致）

-- ============================= PRECHECK =============================
DO $pre$
DECLARE
  v_sync oid := to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)');
  v_uowc oid := to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)');
  v_def text; v_secdef boolean; v_trg text;
BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'apply_ota_modification_v1') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：apply_ota_modification_v1 已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'owlting_email_orders_raw' AND column_name = 'mail_sent_at') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：owlting_email_orders_raw.mail_sent_at 已存在，疑似已套用過本 migration';
  END IF;

  IF v_sync IS NULL THEN RAISE EXCEPTION 'PRECHECK 失敗：sync_order_rooms_v1 不存在'; END IF;
  SELECT pg_get_functiondef(v_sync), p.prosecdef INTO v_def, v_secdef FROM pg_proc p WHERE p.oid = v_sync;
  IF md5(v_def) <> '8cc1ae289015f64c2d16801600af8cb2' OR length(v_def) <> 4767 OR v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'PRECHECK 失敗：sync_order_rooms_v1 與設計基準不符（md5 %, len %, secdef %）', md5(v_def), length(v_def), v_secdef;
  END IF;

  IF v_uowc IS NULL THEN RAISE EXCEPTION 'PRECHECK 失敗：update_order_with_context(8 參數) 不存在'; END IF;
  SELECT pg_get_functiondef(v_uowc), p.prosecdef INTO v_def, v_secdef FROM pg_proc p WHERE p.oid = v_uowc;
  IF md5(v_def) <> '7d7e88fcecddcab46c798c5916a1bed0' OR length(v_def) <> 3508 OR v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_order_with_context 與設計基準不符（md5 %, len %, secdef %）', md5(v_def), length(v_def), v_secdef;
  END IF;

  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：order_rooms trigger 數量不是 5';
  END IF;
  SELECT pg_get_triggerdef(t.oid) INTO v_trg FROM pg_trigger t
   WHERE t.tgrelid = 'public.order_rooms'::regclass AND t.tgname = 'validate_order_rooms_inventory_trigger' AND NOT t.tgisinternal;
  IF v_trg IS NULL OR position('BEFORE INSERT OR UPDATE ON public.order_rooms' in v_trg) = 0 OR position(' WHEN ' in v_trg) > 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：validate_order_rooms_inventory_trigger 定義非預期（%）', v_trg;
  END IF;
  SELECT pg_get_triggerdef(t.oid) INTO v_trg FROM pg_trigger t
   WHERE t.tgrelid = 'public.order_rooms'::regclass AND t.tgname = 'trg_validate_room_unit_no_conflict' AND NOT t.tgisinternal;
  IF v_trg IS NULL OR position('UPDATE OF room_unit_id' in v_trg) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：trg_validate_room_unit_no_conflict 定義非預期（%）', v_trg;
  END IF;
END
$pre$;

-- ============================== 主體 ==============================
CREATE FUNCTION public.apply_ota_modification_v1(
  p_order_id     uuid,
  p_patch        jsonb,
  p_expect       jsonb,
  p_source       text,
  p_reason       text,
  p_actor_label  text,
  p_sync_rooms   boolean,
  p_rooms        jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role text;
  v_n    integer;
  v_sync jsonb := NULL;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  IF p_order_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_order_id / p_patch required' USING ERRCODE = 'P0001';
  END IF;
  IF p_sync_rooms AND (p_rooms IS NULL OR jsonb_typeof(p_rooms) <> 'array' OR jsonb_array_length(p_rooms) = 0) THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_rooms required when p_sync_rooms' USING ERRCODE = 'P0001';
  END IF;

  v_n := public.update_order_with_context(
    p_order_id, p_patch, p_source, p_reason, p_actor_label, 'system', p_expect, NULL);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ORDER_CHANGED: 訂單在比對後已被修改或不存在' USING ERRCODE = 'P0001';
  END IF;

  IF p_sync_rooms THEN
    v_sync := public.sync_order_rooms_v1(p_order_id, NULL, p_rooms);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_updated', v_n,
    'synced', p_sync_rooms,
    'conflicts', coalesce(v_sync -> 'conflicts', '[]'::jsonb),
    'sync', v_sync
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)
  TO service_role;
COMMENT ON FUNCTION public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb) IS
  '2b：OTA 修改信單一交易套用（update_order_with_context → sync_order_rooms_v1 → conflicts）';

ALTER TABLE public.owlting_email_orders_raw ADD COLUMN mail_sent_at timestamptz NULL;
COMMENT ON COLUMN public.owlting_email_orders_raw.mail_sent_at IS
  '信件標頭 Date（headers 行首錨定解析）；解析失敗為 NULL；舊資料不回填';

-- ============================= POSTCHECK =============================
DO $post$
DECLARE
  v_sig  text := 'public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)';
  v_new  oid  := to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)');
  v_def  text;
BEGIN
  IF v_new IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_new) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：apply_ota_modification_v1 未建立或非 SECURITY DEFINER';
  END IF;
  IF NOT coalesce((SELECT 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = v_new), false) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：search_path 未設定';
  END IF;
  IF has_function_privilege('anon', v_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sig, 'EXECUTE')
     OR has_function_privilege('public', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：PUBLIC／anon／authenticated 仍可執行新函式';
  END IF;
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：service_role 無法執行新函式';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)')) INTO v_def;
  IF md5(v_def) <> '8cc1ae289015f64c2d16801600af8cb2' OR length(v_def) <> 4767 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：sync_order_rooms_v1 指紋改變';
  END IF;
  SELECT pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)')) INTO v_def;
  IF md5(v_def) <> '7d7e88fcecddcab46c798c5916a1bed0' OR length(v_def) <> 3508 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context 指紋改變';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'owlting_email_orders_raw'
                   AND column_name = 'mail_sent_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：mail_sent_at 欄位不正確';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：order_rooms trigger 數量改變';
  END IF;
END
$post$;

-- ============================== ROLLBACK ==============================
-- 執行 docs/ota-modification/rollback_20261017090000.sql 全文；順序：
--   (1) 先把 Edge Functions 回退到 fc59fa2 版（ingest 不再寫 mail_sent_at、不再呼叫新函式）
--   (2) DO 檢查 → DROP FUNCTION → DROP COLUMN → DO 檢查函式與欄位皆已不存在、兩支既有函式指紋不變
--   已寫入的 ingest_outcome = stale_ignored / modify_blocked 為 text 值，保留不影響。
```

`docs/ota-modification/rollback_20261017090000.sql`：

```sql
DO $pre$ BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='owlting_email_orders_raw' AND column_name='mail_sent_at') THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK：已是回滾後狀態';
  END IF;
END $pre$;
DROP FUNCTION IF EXISTS public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb);
ALTER TABLE public.owlting_email_orders_raw DROP COLUMN IF EXISTS mail_sent_at;
DO $post$ BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='owlting_email_orders_raw' AND column_name='mail_sent_at') THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK：仍有殘留';
  END IF;
  IF md5(pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)'))) <> '8cc1ae289015f64c2d16801600af8cb2'
     OR md5(pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)'))) <> '7d7e88fcecddcab46c798c5916a1bed0' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK：既有函式指紋改變';
  END IF;
END $post$;
```

---

## 7. TS 草稿

### 7-1 新檔 `supabase/functions/_shared/syncOtaOrderRooms.ts`（2b-2；純函式，不做 I/O）

```ts
// 2b：OTA 修改信只改差異 — 純函式（比對、產生明細、fail-closed、告警文字、先後判斷）
export interface ExistingRoom {
  id: string; room_type_id: string; quantity: number; room_price: number;
  room_unit_id: string | null; template_id: string | null; template_name: string | null;
}
export interface UnitLite { id: string; unit_number: string }
export interface PlanOrder {
  id: string; room_type_id: string | null; check_in_date: string; check_out_date: string;
  guest_count: number; total_price: number; payment_status: string; order_status: string;
}
export interface PlanMail {
  check_in_date: string | null; check_out_date: string | null; room_type_name: string | null;
  room_quantity: number | null; guest_count: number | null; total_amount: number | null;
  parser_diff_status: string | null;
}
export type BlockCode =
  | "multiple_active_orders" | "order_checked_in" | "order_checked_out" | "no_existing_rooms"
  | "multi_room_type_rows" | "non_unit_quantity_rows" | "order_room_type_mismatch"
  | "room_type_unmatched" | "room_type_ambiguous" | "unreliable_diff" | "stale_check_failed"
  | "quantity_out_of_range";
export interface DiffItem { field: string; label: string; before: string | number | null; after: string | number | null }
export type RoomsChange = "none" | "keep" | "resize" | "replace";
export interface Target { roomTypeId: string; qty: number; checkIn: string; checkOut: string }
export type Plan =
  | { kind: "blocked"; code: BlockCode }
  | { kind: "noop" }
  | { kind: "apply"; patch: Record<string, unknown>; diff: DiffItem[]; target: Target;
      roomsChange: RoomsChange; mailTotal: number | null; amountNeedsReview: boolean };

export const MAX_OTA_ROOMS = 20;
const UNRELIABLE = new Set([null, "partial", "no_sections", "unparsable"]);
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

// 同館房型比對：① 去空白小寫後完全相同 ② 否則「信件名稱剛好是唯一一個房型名稱的開頭」；不使用「包含」
export function matchRoomTypeForModification(
  roomTypes: { id: string; name: string }[],
  mailName: string,
): { ok: true; id: string } | { ok: false; code: "room_type_unmatched" | "room_type_ambiguous" } {
  const target = norm(mailName);
  if (!target) return { ok: false, code: "room_type_unmatched" };
  const exact = roomTypes.filter((t) => norm(t.name) === target);
  if (exact.length === 1) return { ok: true, id: exact[0].id };
  if (exact.length > 1) return { ok: false, code: "room_type_ambiguous" };
  const prefix = roomTypes.filter((t) => norm(t.name).startsWith(target));
  if (prefix.length === 1) return { ok: true, id: prefix[0].id };
  return { ok: false, code: prefix.length > 1 ? "room_type_ambiguous" : "room_type_unmatched" };
}

export function planOtaModification(i: {
  activeOrderCount: number; order: PlanOrder; rows: ExistingRoom[];
  roomTypes: { id: string; name: string }[]; mail: PlanMail;
}): Plan {
  const { order, rows, mail } = i;
  if (i.activeOrderCount > 1) return { kind: "blocked", code: "multiple_active_orders" };
  if (order.order_status === "checked_in") return { kind: "blocked", code: "order_checked_in" };
  if (order.order_status === "checked_out") return { kind: "blocked", code: "order_checked_out" };
  if (rows.length === 0) return { kind: "blocked", code: "no_existing_rooms" };
  if (new Set(rows.map((r) => r.room_type_id)).size > 1) return { kind: "blocked", code: "multi_room_type_rows" };
  if (rows.some((r) => r.quantity !== 1)) return { kind: "blocked", code: "non_unit_quantity_rows" };
  const curType = rows[0].room_type_id;
  if (order.room_type_id && order.room_type_id !== curType) return { kind: "blocked", code: "order_room_type_mismatch" };

  let targetType = curType;
  if (mail.room_type_name) {
    const m = matchRoomTypeForModification(i.roomTypes, mail.room_type_name);
    if (!m.ok) return { kind: "blocked", code: m.code };
    targetType = m.id;
  }
  const checkIn = mail.check_in_date ?? order.check_in_date;
  const checkOut = mail.check_out_date ?? order.check_out_date;
  const mq = Number(mail.room_quantity ?? 0);
  if (mq > MAX_OTA_ROOMS) return { kind: "blocked", code: "quantity_out_of_range" };
  const qty = mq > 0 ? mq : rows.length;
  const datesChanged = checkIn !== order.check_in_date || checkOut !== order.check_out_date;
  const typeChanged = targetType !== curType;
  const qtyChanged = qty !== rows.length;
  if ((datesChanged || typeChanged || qtyChanged) && UNRELIABLE.has(mail.parser_diff_status)) {
    return { kind: "blocked", code: "unreliable_diff" };
  }

  const patch: Record<string, unknown> = {};
  const diff: DiffItem[] = [];
  const push = (field: string, label: string, before: any, after: any) => diff.push({ field, label, before, after });
  if (checkIn !== order.check_in_date) { patch.check_in_date = checkIn; push("check_in_date", "入住日期", order.check_in_date, checkIn); }
  if (checkOut !== order.check_out_date) { patch.check_out_date = checkOut; push("check_out_date", "退房日期", order.check_out_date, checkOut); }
  const gc = Number(mail.guest_count ?? 0);
  if (gc > 0 && gc !== Number(order.guest_count)) { patch.guest_count = gc; push("guest_count", "人數", order.guest_count, gc); }
  if (typeChanged) {
    patch.room_type_id = targetType;
    const name = i.roomTypes.find((t) => t.id === targetType)?.name ?? targetType;
    push("room_type_id", "房型", curType, `${name}(${targetType})`);
  }
  if (qtyChanged) push("room_quantity", "房間數", rows.length, qty);
  const raw = Number(mail.total_amount);
  const mailTotal = mail.total_amount != null && Number.isFinite(raw) && Math.round(raw) > 0 ? Math.round(raw) : null;
  if (mailTotal != null && mailTotal !== Number(order.total_price)) {
    patch.total_price = mailTotal;
    patch.final_price = mailTotal;
    if (order.payment_status === "paid") patch.paid_amount = mailTotal;
    push("total_price", "金額", Number(order.total_price ?? 0), mailTotal);
  }
  if (diff.length === 0) return { kind: "noop" };
  const roomsChange: RoomsChange = typeChanged ? "replace" : qtyChanged ? "resize" : datesChanged ? "keep" : "none";
  return {
    kind: "apply", patch, diff, target: { roomTypeId: targetType, qty, checkIn, checkOut },
    roomsChange, mailTotal, amountNeedsReview: (typeChanged || qtyChanged) && mailTotal == null,
  };
}

export interface SyncRow {
  id: string | null; room_type_id: string; quantity: 1; room_price: number;
  room_unit_id: string | null; template_id: string | null; template_name: string | null;
}
const toRow = (r: ExistingRoom): SyncRow => ({
  id: r.id, room_type_id: r.room_type_id, quantity: 1, room_price: r.room_price,
  room_unit_id: r.room_unit_id, template_id: r.template_id, template_name: r.template_name,
});
const avgPrice = (rows: ExistingRoom[]) => Math.round(rows.reduce((s, r) => s + Number(r.room_price ?? 0), 0) / rows.length);

// units：目標房型啟用中的房號（已依 display_order、unit_number 排序）；busy：新日期被其他訂單佔用的房號
export function buildOtaRooms(i: {
  plan: Extract<Plan, { kind: "apply" }>; rows: ExistingRoom[]; units: UnitLite[]; busy: Set<string>;
  newTemplate: { template_id: string | null; template_name: string | null };
}): SyncRow[] {
  const { plan, rows, units, busy } = i;
  const pick = (taken: Set<string>) => {
    const u = units.find((x) => !busy.has(x.id) && !taken.has(x.id));
    if (u) taken.add(u.id);
    return u?.id ?? null;
  };
  if (plan.roomsChange === "keep") return rows.map(toRow);
  if (plan.roomsChange === "replace") {
    const price = plan.mailTotal != null ? Math.round(plan.mailTotal / plan.target.qty) : avgPrice(rows);
    const taken = new Set<string>();
    return Array.from({ length: plan.target.qty }, () => ({
      id: null, room_type_id: plan.target.roomTypeId, quantity: 1 as const, room_price: price,
      room_unit_id: pick(taken), ...i.newTemplate,
    }));
  }
  // resize
  if (plan.target.qty > rows.length) {
    const taken = new Set(rows.map((r) => r.room_unit_id).filter((x): x is string => !!x));
    const price = avgPrice(rows);
    const extra = Array.from({ length: plan.target.qty - rows.length }, () => ({
      id: null, room_type_id: rows[0].room_type_id, quantity: 1 as const, room_price: price,
      room_unit_id: pick(taken), template_id: rows[0].template_id, template_name: rows[0].template_name,
    }));
    return [...rows.map(toRow), ...extra];
  }
  const rank = (r: ExistingRoom) => (r.room_unit_id ? units.findIndex((u) => u.id === r.room_unit_id) : Number.MAX_SAFE_INTEGER);
  // 刪除順序：無房號者優先，其次房號排序最後一間；保留其餘
  const removeOrder = [...rows].sort((a, b) => rank(b) - rank(a));
  const removeIds = new Set(removeOrder.slice(0, rows.length - plan.target.qty).map((r) => r.id));
  return rows.filter((r) => !removeIds.has(r.id)).map(toRow);
}

export function classifyApplyError(msg: string, code?: string | null): string {
  if (/Inventory exceeded|Room not available/i.test(msg)) return "inventory_exceeded";
  if (/備品/.test(msg)) return "amenity_exceeded";
  if (code === "23505" || /重複寫入保護|重複送出/.test(msg)) return "double_submit";
  if (/ORDER_CHANGED/.test(msg)) return "order_changed";
  return "unknown";
}

export function formatNotApplied(i: {
  code: string; obe: string | null; orderNumber: string | null; mailChanges: string | null; diff: DiffItem[];
}): string {
  const changes = i.mailChanges || i.diff.map((d) => `${d.label}：${d.before ?? "—"} → ${d.after ?? "—"}`).join("；") || "（無法取得）";
  return `未套用，需人工處理｜原因代碼：${i.code}｜OBE：${i.obe ?? "—"}｜訂單：${i.orderNumber ?? "—"}｜信件修改內容：${changes}`;
}

export function formatRoomWarnings(i: {
  orderNumber: string; conflicts: { room_type_id: string; room_unit_id: string; conflict_order_number: string }[];
  newRowsWithoutUnit: { room_type_id: string }[]; typeName: (id: string) => string; unitNo: (id: string) => string;
  amountNeedsReview: boolean;
}): string | null {
  const items = [
    ...i.conflicts.map((c) => `${i.typeName(c.room_type_id)}（原指定 ${i.unitNo(c.room_unit_id)}，已被 ${c.conflict_order_number} 佔用）`),
    ...i.newRowsWithoutUnit.map((r) => `${i.typeName(r.room_type_id)}（無空房號）`),
  ];
  const parts: string[] = [];
  if (items.length) parts.push(`訂單 ${i.orderNumber} 已更新，但以下 ${items.length} 間未分配房號，請到訂單詳情手動安排：${items.join("、")}`);
  if (i.amountNeedsReview) parts.push(`訂單 ${i.orderNumber} 間數或房型已變更，但信件金額為 0 或空白，總金額未更新，請人工核對`);
  return parts.length ? parts.join("\n") : null;
}

// 只取「行首」的 Date 標頭，避開 DKIM 簽章 h= 清單裡的 Date:
export function parseMailSentAt(headers: unknown): string | null {
  if (typeof headers !== "string") return null;
  const m = headers.match(/^Date:[ \t]*([^\r\n]+)/im);
  if (!m) return null;
  const t = Date.parse(m[1].trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

type MailTime = { mail_sent_at: string | null; received_at: string };
// 兩邊都有 mail_sent_at 就比它，否則比 received_at；對方「嚴格較新」才算本封是舊信
export function isStaleMail(self: MailTime, others: MailTime[]): boolean {
  return others.some((o) => {
    const useSent = self.mail_sent_at && o.mail_sent_at;
    const a = Date.parse(useSent ? self.mail_sent_at! : self.received_at);
    const b = Date.parse(useSent ? o.mail_sent_at! : o.received_at);
    return b > a;
  });
}
```

注意：`formatRoomWarnings` 的 conflicts 欄位名稱（room_type_id、room_unit_id、conflict_order_number）必須依 `sync_order_rooms_v1` 實際回傳的 conflicts 結構調整；施工時貼出 sync 第 116–137 行原文確認。

### 7-2 `supabase/functions/_shared/owltingAutoOrder.ts`（2b-2）

```diff
@@ import 區
 import { resolveTemplateId } from "./resolveTemplateId.ts";
+import { reportBackendError } from "./errorReporter.ts";
+import {
+  planOtaModification, buildOtaRooms, classifyApplyError, formatNotApplied, formatRoomWarnings,
+  type ExistingRoom,
+} from "./syncOtaOrderRooms.ts";
@@ 第 309 行（本體不變，只加 export）
-async function resolveRoomTemplate(
+export async function resolveRoomTemplate(
@@ 第 490–499 行
 export interface ApplyModificationResult {
   ok: boolean;
   order_id?: string;
   order_number?: string;
   updated_fields?: string[];
   diff?: OrderFieldDiff[];
   skipped_reason?: string;
+  /** skipped_reason = "modify_blocked" 時的原因代碼 */
+  blocked_code?: string;
+  /** 套用失敗分類：inventory_exceeded / amenity_exceeded / double_submit / order_changed / unknown */
+  error_reason?: string;
   error?: string;
 }
@@ 第 513–668 行：applyModificationToExistingOrder 本體整段替換為
+export async function applyModificationToExistingOrder(admin: any, input: { /* 參數同現行 */ }): Promise<ApplyModificationResult> {
+  const alert = async (orderId: string | null, orderNumber: string | null, step: string, text: string, accId: string | null, ctx: Record<string, unknown>) => {
+    await reportBackendError({ functionName: "owlting-email-ingest", category: "owlting_modify_rooms", step,
+      errorMessage: text, accommodationId: accId, context: { obe: input.obe_number, staging_id: input.staging_id, order_id: orderId, ...ctx } }).catch(() => {});
+    await sendOrderRoomsAlertEmail(admin, { orderNumber, orderId, obeNumber: input.obe_number, stagingId: input.staging_id, error: text }).catch(() => false);
+  };
+  try {
+    if (!input.obe_number) return { ok: false, skipped_reason: "no_obe_number" };
+    const { data: orders, error: ordErr } = await admin.from("orders")
+      .select("id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, guest_count, total_price, final_price, paid_amount, payment_status, order_status, notes")
+      .eq("owlting_reservation_id", input.obe_number).neq("order_status", "cancelled")
+      .order("created_at", { ascending: false });
+    if (ordErr) return { ok: false, error: ordErr.message };
+    if (!orders || orders.length === 0) return { ok: false, skipped_reason: "order_not_found" };
+    const order = orders[0];
+    const accId = input.accommodation_id ?? order.accommodation_id;
+
+    const [{ data: rows, error: rowsErr }, { data: roomTypes, error: rtErr }] = await Promise.all([
+      admin.from("order_rooms").select("id, room_type_id, quantity, room_price, room_unit_id, template_id, template_name")
+        .eq("order_id", order.id).order("created_at", { ascending: true }),
+      admin.from("room_types").select("id, name").eq("accommodation_id", accId),
+    ]);
+    if (rowsErr || rtErr) return { ok: false, error: (rowsErr ?? rtErr).message };
+    const existing = (rows ?? []) as ExistingRoom[];
+
+    const plan = planOtaModification({ activeOrderCount: orders.length, order, rows: existing, roomTypes: roomTypes ?? [],
+      mail: { check_in_date: input.check_in_date, check_out_date: input.check_out_date, room_type_name: input.room_type_name,
+              room_quantity: input.room_quantity, guest_count: input.guest_count, total_amount: input.total_amount,
+              parser_diff_status: input.parser_diff_status ?? null } });
+
+    if (plan.kind === "blocked") {
+      const text = formatNotApplied({ code: plan.code, obe: input.obe_number, orderNumber: order.order_number, mailChanges: input.change_summary ?? null, diff: [] });
+      await admin.from("owlting_email_parsed_staging").update({ auto_order_id: order.id, review_status: "pending_review",
+        auto_create_error: `modify_blocked:${plan.code}`, review_notes: `[需人工] ${text}` }).eq("id", input.staging_id);
+      await alert(order.id, order.order_number, "modify_blocked", text, accId, { code: plan.code });
+      return { ok: false, skipped_reason: "modify_blocked", blocked_code: plan.code, order_id: order.id, order_number: order.order_number };
+    }
+    if (plan.kind === "noop") {
+      // staging 更新內容照現行第 586–594 行原文保留
+      return { ok: true, order_id: order.id, order_number: order.order_number, updated_fields: [], diff: [], skipped_reason: "no_material_change" };
+    }
+
+    let rooms: any[] | null = null;
+    let units: { id: string; unit_number: string }[] = [];
+    if (plan.roomsChange !== "none") {
+      const { data: u, error: uErr } = await admin.from("room_units").select("id, unit_number")
+        .eq("room_type_id", plan.target.roomTypeId).eq("is_active", true)
+        .order("display_order", { ascending: true }).order("unit_number", { ascending: true });
+      if (uErr) return { ok: false, error: `room_units query failed: ${uErr.message}` };
+      units = u ?? [];
+      const needPick = plan.roomsChange === "replace" || (plan.roomsChange === "resize" && plan.target.qty > existing.length);
+      const busy = new Set<string>();
+      if (needPick && units.length) {
+        // 與 rebuildOrderRooms 第 391–398 行相同條件（排除本訂單、未取消、日期重疊）
+        const { data: c, error: cErr } = await admin.from("order_rooms")
+          .select("room_unit_id, order_id, orders!inner(order_status, check_in_date, check_out_date)")
+          .in("room_unit_id", units.map((x) => x.id)).neq("order_id", order.id)
+          .neq("orders.order_status", "cancelled").lt("orders.check_in_date", plan.target.checkOut).gt("orders.check_out_date", plan.target.checkIn);
+        if (cErr) return { ok: false, error: `order_rooms conflict query failed: ${cErr.message}` };
+        for (const x of c ?? []) if ((x as any).room_unit_id) busy.add((x as any).room_unit_id);
+      }
+      const newTemplate = plan.roomsChange === "replace"
+        ? await resolveRoomTemplate(admin, { accommodationId: accId, orderId: order.id, roomTypeId: plan.target.roomTypeId })
+        : { template_id: null, template_name: null };
+      rooms = buildOtaRooms({ plan, rows: existing, units, busy, newTemplate });
+    }
+
+    const summary = formatOrderDiff(plan.diff);
+    const stamp = new Date().toISOString().slice(0, 10);
+    const patch = { ...plan.patch, notes: `${order.notes ? `${order.notes}\n` : ""}[${stamp} 奧丁丁修改通知] 已依 OBE ${input.obe_number} 自動更新既有訂單：${summary}${input.change_summary ? `\n（信件差異：${input.change_summary}）` : ""}` };
+    const { data: rpc, error: rpcErr } = await admin.rpc("apply_ota_modification_v1", {
+      p_order_id: order.id, p_patch: patch,
+      p_expect: { check_in_date: order.check_in_date, check_out_date: order.check_out_date, room_type_id: order.room_type_id,
+                  total_price: order.total_price, order_status: order.order_status },
+      p_source: "owlting_email_modify", p_reason: `OBE ${input.obe_number} 修改通知自動更新`, p_actor_label: "OwlTing 修改通知",
+      p_sync_rooms: rooms !== null, p_rooms: rooms ?? [],
+    });
+    if (rpcErr) {
+      const reason = classifyApplyError(rpcErr.message ?? "", (rpcErr as any).code);
+      const text = `修改信套用失敗（整筆回滾，訂單未變更）｜原因：${reason}｜OBE：${input.obe_number}｜訂單：${order.order_number}｜修改內容：${summary}｜${rpcErr.message}`;
+      await admin.from("owlting_email_parsed_staging").update({ auto_order_id: order.id, review_status: "pending_review",
+        auto_create_error: `${reason}: ${rpcErr.message}`, review_notes: `[需人工] ${text}` }).eq("id", input.staging_id);
+      await alert(order.id, order.order_number, "apply_ota_modification_v1", text, accId, { reason, rooms });
+      return { ok: false, error: `${reason}: ${rpcErr.message}`, error_reason: reason, diff: plan.diff, order_id: order.id, order_number: order.order_number };
+    }
+
+    const conflicts = ((rpc as any)?.conflicts ?? []) as any[];
+    const warn = formatRoomWarnings({ orderNumber: order.order_number, conflicts,
+      newRowsWithoutUnit: (rooms ?? []).filter((r) => r.id === null && !r.room_unit_id),
+      typeName: (id) => (roomTypes ?? []).find((t: any) => t.id === id)?.name ?? "房型",
+      unitNo: (id) => units.find((x) => x.id === id)?.unit_number ?? "房號", amountNeedsReview: plan.amountNeedsReview });
+    if (warn) await alert(order.id, order.order_number, "post_apply_warning", warn, accId, { conflicts });
+
+    // staging 成功更新內容照現行第 653–662 行原文保留，review_notes 末尾附上 warn
+    return { ok: true, order_id: order.id, order_number: order.order_number, updated_fields: plan.diff.map((d) => d.label), diff: plan.diff };
+  } catch (e) {
+    return { ok: false, error: (e as Error).message };
+  }
+}
```

`reportBackendError` 參數格式比照 `fillupRooms.ts` 第 77–84 行。

### 7-3 `supabase/functions/owlting-email-ingest/index.ts`（2b-3）

```diff
@@ import 區
+import { parseMailSentAt, isStaleMail, formatNotApplied } from "../_shared/syncOtaOrderRooms.ts";
+import { reportBackendError } from "../_shared/errorReporter.ts";
+import { sendOrderRoomsAlertEmail } from "../_shared/orderRoomsAlert.ts";
@@ 第 72–82 行 IngestOutcome
-  | "pms_echo_mismatch";
+  | "pms_echo_mismatch"
+  | "stale_ignored"
+  | "modify_blocked";
@@ 第 249–276 行 raw insert
+  const mailSentAt = parseMailSentAt(rawPayload.headers);
   const { data: inserted, error: insertErr } = await supabase
     .from("owlting_email_orders_raw")
     .insert({
       ...
       processed_at: status === "parsed" ? null : new Date().toISOString(),
+      mail_sent_at: mailSentAt,
     })
-    .select("id")
+    .select("id, received_at")
     .single();
@@ 第 461 行之後、第 464 行之前（不使用「if (」開頭，以免影響 echoGuard 的接線測試）
+      let skipApply = false;
+      let skipOwnerNotify = false;
+      const wantsApply = !!stagingRow?.id && isModified && !isNoopModification && !!fields.obe_number && !ownerBlocksAuto;
+      if (wantsApply) {
+        const { data: prevMails, error: prevErr } = await supabase.from("owlting_email_orders_raw")
+          .select("id, mail_sent_at, received_at").eq("obe_number", fields.obe_number).neq("id", inserted.id)
+          .in("ingest_outcome", ["order_created", "order_updated", "noop_modification"]);
+        const code = prevErr ? "stale_check_failed"
+          : isStaleMail({ mail_sent_at: mailSentAt, received_at: (inserted as any).received_at }, prevMails ?? []) ? "stale" : null;
+        skipApply = code !== null;
+        skipOwnerNotify = code === "stale";   // 只有確定是舊信才不通知業主；stale_check_failed 照常通知
+        if (code) {
+          const text = formatNotApplied({ code, obe: fields.obe_number, orderNumber: null, mailChanges: changeSummary || null, diff: [] });
+          await supabase.from("owlting_email_parsed_staging").update({ review_status: "pending_review", auto_create_error: code, review_notes: `[需人工] ${text}` }).eq("id", stagingRow!.id);
+          await recordOutcome(supabase, inserted.id, code === "stale" ? "stale_ignored" : "modify_blocked", { obe_number: fields.obe_number, reason_code: code, mail_sent_at: mailSentAt, diff_status: diffStatus });
+          await reportBackendError({ functionName: "owlting-email-ingest", category: "owlting_modify_rooms", step: code, errorMessage: text, accommodationId: resolvedAccId, context: { staging_id: stagingRow!.id, raw_id: inserted.id } }).catch(() => {});
+          await sendOrderRoomsAlertEmail(supabase, { orderNumber: null, orderId: null, obeNumber: fields.obe_number, stagingId: stagingRow!.id, error: text }).catch(() => false);
+        }
+      }
       if (
         stagingRow?.id &&
         isModified &&
         !isNoopModification &&
         fields.obe_number &&
-        !ownerBlocksAuto
+        !ownerBlocksAuto &&
+        !skipApply
       ) {
@@ 第 529 行（新增分支，放在通用 !modRes.ok 之前）
+        } else if (!modRes.ok && modRes.skipped_reason === "modify_blocked") {
+          await recordOutcome(supabase, inserted.id, "modify_blocked", {
+            obe_number: fields.obe_number, order_number: modRes.order_number, reason_code: modRes.blocked_code, diff_status: diffStatus,
+          });
         } else if (!modRes.ok) {
           ...
           await recordOutcome(supabase, inserted.id, "apply_failed", {
             obe_number: fields.obe_number,
             reason: modRes.skipped_reason ?? modRes.error ?? "modification_apply_failed",
+            error_reason: modRes.error_reason ?? null,
             diff_status: diffStatus,
           });
@@ 第 559–565 行 業主通知條件
         !isNoopModification &&
         !ownerBlocksAuto &&
+        !skipOwnerNotify &&
         (fields.message_type === "cancelled" || fields.message_type === "modified")
```

變數名稱（resolvedAccId、diffStatus、changeSummary、stagingRow、rawPayload）以現行程式實際名稱為準；不一致時回報並照實際名稱調整。

---

## 8. 測試計畫

### 2b-1：本機 PostgreSQL 15 最小資料庫整合測試

- 環境：建立 anon、authenticated、service_role 角色，`auth.uid()` stub；以 `set_config('request.jwt.claims','{"role":"service_role"}',true)` 模擬 service role。
- 結構：只建立相關表（orders、order_rooms、room_units、room_types、room_inventory_pricing、pricing_templates、order_change_log、備品相關表等），欄位以 migration 原文為準。
- 函式與 trigger：`sync_order_rooms_v1`、`update_order_with_context`、`set_order_change_context`、`validate_order_rooms_inventory`、`validate_room_unit_no_conflict`、`order_rooms_prevent_double_submit`、`zzz_order_change_log`、備品 trigger，一律**從各自最新的 migration 原文逐字複製**，回報時列出每一支取自哪個檔案哪幾行。HotelNabe 與奧丁丁推送兩支 trigger 換成空函式（回報寫明）。
- 指紋：若本機 PG 15 的 pg_get_functiondef md5 與正式庫不同，只在「本機測試用副本」把 precheck／postcheck 的指紋換成本機實測值；正式 migration 檔不得修改。回報列出兩邊的值、兩邊 PG 版本、副本與正式檔的 diff。
- 案例（每個都附實際輸出）：
  1. migration precheck／postcheck 實際執行輸出；重跑一次 migration 必須被 precheck 擋下。
  2. **只改日期、新日期有空房 → 成功**：1 間可售的別墅（比照 A7），訂單本身佔著這唯一一間，改到另一個空日期；驗證成功，且房號、房價、template、明細 id 都沒變。並貼出 `validate_order_rooms_inventory` 第 249–270 行原文，說明更新某一列時，該列本身不會被重複計算。
  3. 同上，但用多間房型（比照 B1 四人房 7～8 間），訂單佔 4 間，改到其他 4 間都空的日期 → 成功。
  4. **只改日期、新日期已滿房 → 整筆回滾**：回傳 Inventory exceeded 或 Room not available；前後 `md5(orders 整列::text)` 相同；order_rooms 內容 md5 相同；order_change_log 沒有新增。
  5. 只改日期、某一間原房號在新日期被別的訂單佔用 → 訂單照改、該列房號變 null、回傳 conflicts 結構（貼出實際 JSON）。
  6. p_expect 不符 → ORDER_CHANGED，整筆不變。
  7. p_expect.total_price：先查出 orders.total_price 的實際型別；分別用 48000 與 48000.00 各跑一次，如實記錄結果。
  8. p_expect.room_type_id 為 null 時比對成功；訂單為 null、p_expect 帶 uuid 時回 ORDER_CHANGED。
  9. 間數增加（新增列）、間數減少（刪除列）、房型變更（整批換），經新 RPC 實際執行各一次。
  10. 權限：SET ROLE anon、authenticated 執行 → permission denied；request.jwt.claims 不是 service_role → NOT_AUTHORIZED；service_role 可以執行。
  11. rollback 檔實際執行，執行後函式與欄位都不存在、兩支既有函式指紋不變。
- 回報寫明本機最小副本與正式庫的差異（省略了哪些表、trigger、RLS）。

### 2b-2：Deno 單元測試 `syncOtaOrderRooms_test.ts`

- 第 9 節情境表每一列一個案例。
- `matchRoomTypeForModification`：「12 人 (含以下) 包區」「14 人包區」「16 人包區」「18 人包區」；「12」→ 12 人 (含以下) 包區；「14」→ 14 人包區；同館另加「12 人房」時「12」→ ambiguous；「1」→ ambiguous；「20」→ unmatched；「12人(含以下)包區」→ 完全相同；「人包區」→ unmatched。
- 間數 21 → quantity_out_of_range；20 → 通過。
- `parseMailSentAt`：正常 Date；DKIM `h=...:Date:...` 不誤判；`\r\n`；沒有 Date；格式錯誤。
- `isStaleMail`：兩邊都有寄送時間；一邊 null 改用 received_at；時間相同不算舊信。
- `classifyApplyError`：四種原因各一筆加 unknown。
- `buildOtaRooms`：減少時刪除順序；增加時不重複挑已保留房號；房型變更兩種房價規則。

### 2b-3：回歸

- `deno test supabase/functions/_shared/owltingEchoGuard_test.ts` 全數通過（含 ingest 接線的原始碼檢查）。
- `autoCreatePendingOrder` 新增兩項：① 假 admin 跑一次，送進 sync 的是 `id:null` 的 N 列；② 第 3 節五個函式全文與 fc59fa2 版本相同。
- 第 3 節 git diff 指令輸出為空。
- 全套 Deno 測試以 fc59fa2 為基準比對，失敗清單逐字相同（新測試除外）。

---

## 9. 情境前後對照

| 情境 | 現行 | 2b 之後 |
|---|---|---|
| 只改日期 | 整批重建，房號重挑，房價平均 | 原樣送入 sync，新日期重新驗證；房號、房價保留；order_updated |
| 日期改、原房號被佔用 | 重挑或留空，不告警 | 訂單照改，衝突列房號清空，告警列出被哪張訂單佔用 |
| 日期改、庫存或備品不足 | 半套資料，apply_failed | 整筆回滾，apply_failed（inventory_exceeded／amenity_exceeded），告警 |
| 間數增加 | 不套用或整批重建 | 保留舊列、新增差額（平均房價、自動挑房號、沿用 template） |
| 間數減少 | 同上 | 先刪無房號，再從房號最後一間刪 |
| 房型變更 | 整批重建 | 舊列移除、依新房型建立、template 重新解析 |
| 只改人數 | 整批重建 | 只更新 orders |
| 只改金額 | 整批重建（比 final_price） | 比 total_price，只更新 orders |
| 金額 0 | 金額改成 0 | 不改金額 |
| 金額空白 | 不改金額但仍重建 | 不改金額 |
| 間數或房型改、金額 0 或空白 | 整批重建 | 明細照改、金額不動、告警請人工核對 |
| 舊信晚到 | 照樣套用 | stale_ignored，不通知業主，告警 |
| 同一封重複 | noop，業主重複通知 | 時間相同不算舊信 → noop（業主重複通知不在本批） |
| 第 4 節各種擋下 | 多數照樣套用 | modify_blocked，照常通知業主，告警 |
| 比對後訂單被別人改過 | 覆蓋 | apply_failed:order_changed |
| 重複送出保護 | 不會撞到 | apply_failed:double_submit |

---

## 10. 回報格式（每批）

- 修改檔案清單與每個檔案的完整 diff；新檔全文
- 所有測試的實際執行指令與完整輸出
- 第 3 節 git diff 指令輸出（必須為空）
- 白話說明本批前後差異
- 工作區狀態：`git log --format="%h %ci %an %s" fc59fa2..HEAD` 與 `git status --porcelain`

本批過程中若發現與本文件不符、或需要修改第 3 節清單內的任何東西，先停下回報，不得自行處理。
