# 批次二（OwlTing）＋批次三（HotelNabe）補 context 設計稿（唯讀，未施工）

## 一、重新盤點（全 repo，只列真正寫入 public.orders 的地方）

### 批次二 OwlTing

| # | 檔案:行 | 動作 | 實際寫入欄位 |
|---|---|---|---|
| B1 | `_shared/owltingAutoOrder.ts:496` | UPDATE（修改通知自動更新） | check_in_date, check_out_date, guest_count, room_type_id, total_price, final_price, paid_amount, notes |
| B2 | `_shared/owltingAutoOrder.ts:244` | UPDATE（取消通知，`.in(ids)` 批次） | order_status, cancelled_at |
| B3 | `_shared/owltingAutoOrder.ts:153` | INSERT 自動鎖房單 | （建單，不改） |
| B4 | `owlting-fillup-submit/index.ts:287` | UPDATE（業主補齊 PII，補鎖房單） | room_type_id, check_in_date, check_out_date, guest_count, guest_name, guest_phone, guest_email, total_price, final_price, ota_channel, payment_status, paid_amount, is_pii_pending, notes |
| B5 | `owlting-fillup-submit/index.ts:526` | UPDATE（信件寄出旗標） | internal_email_sent, internal_email_sent_at |
| B6 | `owlting-fillup-submit/index.ts:321` | INSERT 新單 | （建單，不改） |
| B7 | `owlting-cm/index.ts:794` | UPDATE（OTA Cancel，依 `owlting_reservation_id` 批次） | order_status, cancelled_at |
| B8 | `owlting-cm/index.ts:814` | UPDATE（OTA Modify） | room_type_id, check_in_date, check_out_date, guest_count, total_price, final_price, guest_name, guest_phone, guest_email, notes, ota_channel |
| B9 | `owlting-cm/index.ts:843` | INSERT | （建單，不改） |
| B10 | `owlting-email-ingest/index.ts:552,569` | UPDATE（清掉「等待付款鎖房」標記） | notes |
| B11 | `owlting-cleanup-stale-pending/index.ts:70` | UPDATE（48h 自動取消） | order_status, cancelled_at, is_pii_pending, notes |
| B12 | `owlting-order-push/index.ts:495,544` | UPDATE（推送回寫） | owlting_sync_state（jsonb）、owlting_unique_id |
| B13 | `owlting-selfpush-link/index.ts:201` | UPDATE（回填 OBE） | owlting_reservation_id |

**與稍早盤點的差異（必須指出）**
- 稍早清單提到的 `owlting-change-notify`、`owlting-fillup-issue`、`owlting-fillup-remind` **完全沒有寫入 orders**，只動 `owlting_email_parsed_staging` / `owlting_fillup_tokens`。→ 本批次移出範圍。
- 稍早未列出的三處這次補上：`owlting-order-push`（B12）、`owlting-selfpush-link`（B13）、`owlting-fillup-submit` 的信件旗標（B5）。
- `owlting-ari-push`、`owlting-cm-snapshot`、`owlting-content`、`owlting-email-reparse-dates`、`owlting-fillup-validate` 對 orders 只有 SELECT。

### 批次三 HotelNabe

| # | 檔案:行 | 動作 | 實際寫入欄位 |
|---|---|---|---|
| H1 | `hotelnabe-order-receiver/index.ts:481-487`（`upsertHotelnabeOrder.updateById`，核心 `upsertHotelnabeOrderCore:447`） | UPDATE 整包 payload | order_source, ota_channel, hotelnabe_res_id, hotelnabe_last_modify, hotelnabe_sync_state, accommodation_id, room_type_id, package_id, check_in_date, check_out_date, guest_count, guest_name, guest_phone, guest_email, total_price, final_price, paid_amount, order_status, payment_status, cancelled_at, notes |
| H2 | `hotelnabe-order-receiver/index.ts:472-479` | INSERT | （建單，不改） |

`hotelnabe-push-inventory`、`-worker`、`-backfill-inventory`、`-retrieve-rooms` 皆不寫 orders（只動庫存／log 表）。

## 二、欄位需求評估

現有白名單只有付款／訂單狀態／退款／押金／入住扣款／notes。兩批共有 **21 個欄位不在白名單內**，必須擴充：

```
room_type_id, package_id, check_in_date, check_out_date, guest_count,
guest_name, guest_phone, guest_email,
total_price, final_price, discount_amount,
ota_channel, owlting_reservation_id, owlting_unique_id, owlting_sync_state,
hotelnabe_res_id, hotelnabe_last_modify, hotelnabe_sync_state,
is_pii_pending, requires_owner_review, internal_email_sent, internal_email_sent_at
```

重疊／衝突檢查：
- 與金流批次重疊的只有 `payment_status`、`paid_amount`、`order_status`、`cancelled_at`、`notes`，語意一致（同欄位同型別），不衝突。
- 新欄位皆為新增，不改動既有 24 個欄位的定義；RPC 以 `pg_attribute` 動態取型別，jsonb（`owlting_sync_state`/`hotelnabe_sync_state`）與 boolean 都能正確 cast（測試 T4/T5/T3 已驗）。
- **刻意不入白名單**：`accommodation_id`、`order_number`、`order_source`（換館／換來源屬高風險，HotelNabe update 雖然帶 `order_source/accommodation_id`，但值恆等於原值，改法是從 patch 剔除）。

## 三、技術前提（與金流批次不同的三點）

1. **批次 UPDATE 不相容**：B2、B7 目前是一次 `.in(ids)` / `.eq(owlting_reservation_id)` 更新多筆；RPC 是單筆 `p_order_id`。改法為先 SELECT 出 id 清單，再逐筆呼叫 RPC（每筆各自產生一列 order_change_log）。
2. **INSERT 不走 RPC**：B3/B6/B9/H2 維持原樣，建單由既有 `zzz_order_change_log` 的 insert 分支記錄。
3. **HotelNabe 是整包 payload**：改法是在 `updateById` 前以白名單 pick 出可更新欄位，剔除 `accommodation_id`/`order_source`（值不變）。核心 `upsertHotelnabeOrderCore` 的介面不動，只換 live wrapper 的 `updateById` 實作，`upsert_test.ts` 不受影響。

## 四、Migration（若核准）

新增 `update_order_with_context` 的 `CREATE OR REPLACE`（同一 migration 內同時 `REVOKE ALL ... FROM PUBLIC, anon, authenticated` 並 `GRANT EXECUTE TO service_role`，postcheck 明確驗 anon/authenticated/PUBLIC 無權），僅擴充 `c_allowed` 陣列，其餘邏輯一字不動。

## 五、各呼叫端 diff（示意形狀，全部相同改法）

```diff
- await admin.from("orders").update(patch).eq("id", order.id);
+ await admin.rpc("update_order_with_context", {
+   p_order_id: order.id,
+   p_patch: patch,               // 移除 updated_at
+   p_source: "owlting_email_modify",
+   p_reason: `OBE ${input.obe_number} 修改通知自動更新`,
+   p_actor_label: "OwlTing 修改通知",
+   p_actor_type: "system",
+ });
```

各呼叫端 source / reason / actor_label（一律 `actor_type: "system"`）：

| 位置 | p_source | p_reason | p_actor_label |
|---|---|---|---|
| B1 | `owlting_email_modify` | OBE {obe} 修改通知自動更新 | OwlTing 修改通知 |
| B2 | `owlting_email_cancel` | OBE {obe} 取消通知 | OwlTing 取消通知 |
| B4 | `owlting_fillup_submit` | 業主補齊 PII（OBE {obe}） | 業主填單連結 |
| B5 | `owlting_fillup_submit` | 內部確認信已寄出 | 系統寄信 |
| B7 | `owlting_cm` | OTA Cancel（{uniqueId}） | OwlTing CM |
| B8 | `owlting_cm` | OTA Modify（{uniqueId}） | OwlTing CM |
| B10 | `owlting_email_ingest` | 成立通知抵達，清除等待付款鎖房標記 | OwlTing 信件解析 |
| B11 | `owlting_cleanup_stale` | 48h 未成立，自動釋放鎖房 | 系統排程 |
| B12 | `owlting_order_push` | 推送 {res_status} 成功回寫 | OwlTing 推送 |
| B13 | `owlting_selfpush_link` | 自動連結 OBE {obe} | OwlTing 自推比對 |
| H1 | `hotelnabe_receiver` | HotelNabe {resStatus}（ResID {id}） | HotelNabe 訂單接收 |

B2 / B7 額外把批次更新改為「先查 id → 逐筆 RPC」。

## 六、BEGIN…ROLLBACK 實測結果（正式訂單 KT3V68U2）

以擴充後白名單的暫時函式在單一交易內模擬，最後 ROLLBACK：

| # | 情境 | 實際輸出 |
|---|---|---|
| T1 | OwlTing 修改通知 | in=2026-09-25 out=2026-09-27 guests=3 total=4000 final=4000 paid=4000 notes=[T1 奧丁丁修改通知] |
| T2 | OwlTing 取消 | status=cancelled cancelled_taipei=2026-09-09 23:00 |
| T3 | 業主補單（含 boolean 欄位） | name=王小明 phone=0912345678 email=a@b.com ota=agoda pay=paid pii_pending=f review=t |
| T4 | 推送回寫（jsonb） | uid=UQ-T4 sync={"mode": "live", "last_action": "Commit"} |
| T5 | HotelNabe 整包更新 | res=HN-T5 lm_taipei=2026-09-09 22:00 sync={"res_status": "Commit"} status=confirmed pay=paid |
| T6 | 非白名單欄位 accommodation_id | OK 已攔截：`欄位不在白名單內 (accommodation_id)` |
| T7 | order_change_log | rows=5，sources = hotelnabe_receiver, owlting_cm, owlting_email_modify, owlting_fillup_submit, owlting_order_push；actor_labels 含 owner@example.com |

回滾後查證訂單原狀：`KT3V68U2 / 2026-09-21 / 2 人 / TSENG HSIUHUNG / confirmed / hotelnabe_res_id=(null)`，暫時函式殘留 0 支。

## 七、範圍界線
- 不移除任何 notes 文字（分類 A 仍延後）。
- 不改 INSERT 路徑、不改 order_rooms / order_meta / staging 寫入、不改前端。
- 批次二、批次三可分開核准；擴充白名單的 migration 為兩批共用，先核准的那一批一起帶。

## 八、B2／B7 錯誤處理設計（本次新增，順便修既有「錯誤被吞、假裝成功」）

### 8.1 現況缺陷（實際程式碼佐證）

| 位置 | 現況 | 缺陷 |
|---|---|---|
| `_shared/owltingAutoOrder.ts:229-255` | `cancelAutoPendingOrders` 先 SELECT 出 ids，批次 `.update().in("id", ids)` **完全不檢查 error**，直接 `return ids` | UPDATE 失敗（RLS／trigger／連線）時仍回傳整份 ids；`owlting-email-ingest:650-660` 依此寫下「已同步取消 PMS 訂單 N 筆」與 `recordOutcome(cancelled_count)`，是假成功 |
| `owlting-cm/index.ts:793-798` | Cancel 分支 `.update().eq(owlting_reservation_id)` 不檢查 error，也不檢查有無命中任何列，直接 `successItems.push()` | 即使 0 筆命中或 UPDATE 失敗，仍回 OwlTing `<Success/>`，OwlTing 不會重送 |

### 8.2 B2 新設計：`cancelAutoPendingOrders` 回傳結構化結果

回傳型別由 `string[]` 改為：

```ts
export interface CancelAutoResult {
  cancelled: string[];              // 實際 RPC 成功的 order id
  failed: Array<{ id: string; order_number?: string | null; error: string }>;
}
```

流程：

```diff
-    const ids = orders.map((o: any) => o.id);
-    const nowIso = new Date().toISOString();
-    await admin.from("orders").update({ order_status: "cancelled", cancelled_at: nowIso }).in("id", ids);
-    return ids;
+    const nowIso = new Date().toISOString();
+    const cancelled: string[] = [];
+    const failed: CancelAutoResult["failed"] = [];
+    for (const o of orders) {
+      try {
+        const { error } = await admin.rpc("update_order_with_context", {
+          p_order_id: o.id,
+          p_patch: { order_status: "cancelled", cancelled_at: nowIso },
+          p_source: "owlting_email_cancel",
+          p_reason: `OBE ${obeNumber} 取消通知`,
+          p_actor_label: "OwlTing 取消通知",
+          p_actor_type: "system",
+        });
+        if (error) throw new Error(error.message);
+        cancelled.push(o.id);
+      } catch (e) {
+        failed.push({ id: o.id, order_number: o.order_number ?? null, error: (e as Error).message });
+      }
+    }
+    if (failed.length > 0) {
+      await reportBackendError({
+        functionName: "owlting-email-ingest",
+        category: "owlting_auto_cancel",
+        step: "cancel_auto_pending_orders",
+        errorMessage: `OBE ${obeNumber}：${failed.length} 筆自動取消失敗`,
+        context: { obe_number: obeNumber, failed, cancelled_count: cancelled.length },
+      });
+    }
+    return { cancelled, failed };
```

- 迴圈**不中斷**：單筆失敗只記錄，繼續處理剩下的（部分完成是可接受的，但必須看得見）。
- 失敗寫入 `public.error_logs`（`_shared/errorReporter.ts` 既有 helper，`source='backend'`），HQ 系統健康監控查得到。
- SELECT 本身失敗 / catch 到例外時，回 `{ cancelled: [], failed: [] }` 並同樣寫一筆 error_logs（現況只有 `console.error`）。

呼叫端 `owlting-email-ingest/index.ts:650-660` 對應改法：

```diff
-        const cancelled = await cancelAutoPendingOrders(supabase, fields.obe_number);
-        if (cancelled.length > 0) {
-          await supabase.from("owlting_email_parsed_staging").update({
-            review_notes: `[auto-cancel] OwlTing 取消通知已同步取消 PMS 訂單 ${cancelled.length} 筆`,
-          }).eq("id", stagingRow.id);
-        }
-        await recordOutcome(supabase, inserted.id, "order_cancelled", {
-          obe_number: fields.obe_number, cancelled_count: cancelled.length,
-        });
+        const { cancelled, failed } = await cancelAutoPendingOrders(supabase, fields.obe_number);
+        if (cancelled.length > 0 || failed.length > 0) {
+          await supabase.from("owlting_email_parsed_staging").update({
+            review_notes: failed.length === 0
+              ? `[auto-cancel] OwlTing 取消通知已同步取消 PMS 訂單 ${cancelled.length} 筆`
+              : `[auto-cancel] 已取消 ${cancelled.length} 筆，失敗 ${failed.length} 筆需人工處理：${failed.map(f => f.order_number ?? f.id).join(", ")}`,
+          }).eq("id", stagingRow.id);
+        }
+        await recordOutcome(supabase, inserted.id, failed.length > 0 ? "apply_failed" : "order_cancelled", {
+          obe_number: fields.obe_number,
+          cancelled_count: cancelled.length,
+          failed_count: failed.length,
+          failed,
+        });
```

`recordOutcome` 在有失敗時改記 `apply_failed`，信件在 HQ 待處理清單就會浮出來，不會靜靜歸檔。

### 8.3 B7：部分成功時要回 OwlTing 什麼（需要你決定）

先講清楚 OwlTing CM 的重送語意：本函式回 `<Success/>` → 對方視為整批已受理，不重送；回 `<Errors><Error Type="13" Code="450">` → 對方視為整批失敗，會依其重試策略重送**整包** XML（同一包可能含多筆 reservation，含已成功的那幾筆）。目前程式碼在 insert 失敗時就是走 errorResponse 並 `return`（第 865 行），也就是「整批失敗」語意，且已成功的前幾筆不會回滾。

不論選哪案，共同改法（無爭議部分）：Cancel 與 Modify 分支都改成呼叫 RPC、檢查 error、檢查命中筆數（0 筆命中視為失敗），失敗者收進 `failedItems: Array<{uniqueId, reason}>`，並一律寫 `error_logs` + `owlting_cm_logs`（`status='error'` 或新增 `partial`）。差別只在最後回什麼。

| 方案 | 回應 | OwlTing 端影響 | 風險 |
|---|---|---|---|
| **A. 全成功回應＋失敗另記（建議）** | 仍回 `<Success/>`，僅含成功的 `HotelReservation` 項；失敗筆寫 error_logs + CM log(`partial`) + 寄告警信給 alert_recipients | 不重送。失敗筆完全靠我們人工補救 | 若沒人看告警，訂單會漏掉；但不會產生重複建單 |
| **B. 回整批錯誤（errorResponse）** | 有任一筆失敗就回 `Error 450`，訊息列出失敗的 uniqueId | OwlTing 會重送整包。已成功處理的筆數靠既有 `owlting_reservation_id` 去重（Commit/Modify 有查 dup；Cancel 為冪等）不會重複建單 | 重送可能反覆失敗形成迴圈；Modify 會再跑一次覆寫（值相同，影響小） |
| **C. 逐筆回應（Warnings）** | 回 `<Success/>` + `<Warnings>`，每筆失敗一則 Warning | OTA 規範上 Warning 通常不觸發重送，等同 A，但語意更誠實 | OwlTing 是否解析 `<Warnings>` 未經證實，可能被忽略；需與對方確認 |

**我的建議是 A**，理由：Cancel／Modify 屬冪等操作，最怕的不是漏一次重送，而是回錯誤導致整包反覆重送、把已成功的 Modify 一再覆寫並灌爆 `order_change_log`；失敗量在現行流量下極低，改以「告警 + error_logs + CM log partial」讓人工在數分鐘內介入即可。若你要求「絕不能靠人工」，則選 B。

C 需要先向 OwlTing 確認 Warnings 行為，不建議在本批次採用。

**請你指定 A / B / C，我再把 B7 的最終 diff 補齊。**

### 8.4 測試補充（核准後執行）

除既有 7 組，另補：
- 逐筆迴圈中「第 2 筆刻意失敗（傳入非白名單欄位）」→ 驗證第 1、3 筆仍成功、failed 清單含第 2 筆、error_logs 產生 1 筆。
- B2 回傳結構驗證：cancelled.length 與實際 `order_status='cancelled'` 筆數一致。
- B7 依你選定方案，驗證最終 SOAP 回應字串與 `owlting_cm_logs.status`。

## 九、B7 定案（方案 A）＋ 告警管道設計 ＋ 補充測試實測結果

### 9.1 B7 定案

採 **方案 A**：即使有部分筆失敗，仍回 `<Success/>`（只列成功的 `HotelReservation`），OwlTing 不重送；失敗筆改由三個管道留痕：`error_logs`、`owlting_cm_logs.status='partial'`、告警信。

### 9.2 告警管道：需要新增類別 `notify_owlting_sync_failure`

**不沿用 `notify_order_rooms_failure`。** 理由：
- `notify_order_rooms_failure` 的語意是「訂單房型明細（order_rooms）重建失敗」，收件人是要去核對房號／房型明細的人。
- 本次是「OTA 同步（OwlTing 取消／CM Modify／Cancel）部分失敗」，要處理的是「這筆 OTA 訂單在 PMS 沒有被正確取消／更新」，處理動作、急迫性、負責人都不同；混在同一個開關會讓兩者無法分別訂閱。

新增類別的完整配套（含 UI，避免今天「只加 DB 欄位、畫面上勾不到」的坑）：

1. **Migration**：`ALTER TABLE public.alert_recipients ADD COLUMN notify_owlting_sync_failure boolean NOT NULL DEFAULT true;`（比照 `notify_order_rooms_failure`，precheck 驗欄位指紋、postcheck 驗欄位數／型別／無 NULL）。
2. **UI**：`src/components/headquarters/SystemHealthMonitor.tsx`
   - `AlertRecipient` 型別加 `notify_owlting_sync_failure: boolean`（第 34-37 行區塊）
   - 新增收件人 `insert({...})` 加 `notify_owlting_sync_failure: true`（第 112-115 行區塊）
   - 表頭加一欄「OTA 同步告警」、表格加一顆 `Switch`（比照第 290-291 行寫法，`handleToggle` 為泛用欄位更新，不需改邏輯）
   - `CardDescription` 文案補上「OTA 同步失敗」
3. **告警信**：新增 `supabase/functions/_shared/owltingSyncAlert.ts`，完全比照 `_shared/orderRoomsAlert.ts`（同一支 Resend、同一張 `alert_recipients`），收件條件 `is_active = true AND notify_owlting_sync_failure = true`；內容含 OBE／UniqueID、失敗訂單編號清單、錯誤訊息、CM log id。
4. **既有收件人**：目前 `alert_recipients` 只有 1 筆有效收件人（`sakithebest@gmail.com`，四個開關皆為 true）。因為新欄位 `DEFAULT true`，這位收件人會自動訂閱新類別，**不需要另外詢問**；若日後不想收，畫面上可自行關掉。這件事已納入設計考量，不需你現在處理。

### 9.3 §8.4 補充測試實測結果（正式資料庫，BEGIN…ROLLBACK）

交易內建立暫時函式 `pg_temp.__t_uowc`（＝擴充白名單後的 RPC），對三筆正式訂單 `KV6Y62N2`／`XJ7V52Q9`／`VP8A27F9` 跑逐筆取消迴圈，**第 2 筆刻意注入非白名單欄位 `accommodation_id` 製造失敗**：

| # | 測試 | 實際輸出 |
|---|---|---|
| T-A | 迴圈不中斷 | `ok=KV6Y62N2,XJ7V52Q9 / failed=VP8A27F9(欄位不在白名單內 (accommodation_id))` |
| T-B | B2 回傳結構一致 | `returned_cancelled=2 actual_cancelled=2 failed_still_active=1` |
| T-C | order_change_log 只為成功筆產生 | `rows=2 sources=owlting_email_cancel actors=OwlTing 取消通知 taipei=2026-09-10 01:20` |
| T-D | B7 方案 A 的 SOAP 回應 | `<Success/><HotelReservations>` 僅含 KV6Y62N2、XJ7V52Q9 兩筆 `HotelReservation`，失敗筆不出現 |
| T-E | `owlting_cm_logs` | `status=partial err=partial_failed=VP8A27F9: 欄位不在白名單內 (accommodation_id)`（該表 status 無 CHECK 約束，`partial` 可直接寫入） |
| T-F | `error_logs` | `rows=1 ctx={"failed": [{"error": "欄位不在白名單內 (accommodation_id)", "order_number": "VP8A27F9"}]}` |

**回滾後查證**：`XJ7V52Q9=confirmed, VP8A27F9=confirmed, KV6Y62N2=confirmed`；`order_change_log(owlting_email_cancel)` 0 筆、`owlting_cm_logs(echo-test)` 0 筆、`error_logs(owlting_cm_partial)` 0 筆、`__t_uowc` 殘留 0 支。正式資料 0 異動。

重點結論：失敗筆**不會被誤標成功**（T-B 明確顯示它仍是未取消狀態且進入 failed 清單），這正是今天要修掉的「錯誤被吞、假裝成功」問題。
