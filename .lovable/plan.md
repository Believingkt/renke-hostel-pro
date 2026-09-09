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
