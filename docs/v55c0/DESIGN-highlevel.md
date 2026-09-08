# V5.5C.0 — 訂單通用變更記錄（order_change_log）高層架構提案

狀態：唯讀＋設計階段。未建立任何 DB 物件、未修改任何程式碼。

## 一、新表 schema（草案）

```
public.order_change_log
  id              uuid pk default gen_random_uuid()
  order_id        uuid not null            -- FK orders(id) on delete cascade
  accommodation_id uuid not null           -- 由 trigger 從 NEW.accommodation_id 帶入，RLS 用
  actor_type      text not null            -- 'user' | 'system' | 'unknown'
  actor_id        uuid null                -- user 時為 auth.uid()
  actor_email     text null                -- 快照，避免 join profiles
  actor_label     text null                -- system 時流程名，如 'owlting_webhook'
  reason          text null                -- 來源自行設定的原因文字
  source          text null                -- 呼叫端識別，如 'admin.OrderDetail.inline_edit'
  changed_at      timestamptz not null default now()
  changed_fields  jsonb not null           -- [{field, from, to}] 或 {field, changed:true}
  txid            bigint default txid_current()   -- 同交易多次 UPDATE 可收斂
```

索引：`(order_id, changed_at desc)`、`(accommodation_id, changed_at desc)`。

### orders 欄位分類草案（共 98 欄）

(a) 完整記錄 before/after：
order_number, accommodation_id, room_type_id, customer_id, check_in_date, check_out_date,
guest_count, adult_count, child_count, toddler_count, infant_count, pet_count,
meal_plan, package_id, display_room_type_name, order_status, payment_status, refund_status,
room_assigned, lock_whole_building, owner_direct, requires_owner_review, is_pii_pending,
total_price, discount_amount, final_price, deposit_amount, paid_amount, refunded_amount,
deposit_required_amount, deposit_charged_amount, deposit_refunded_amount, deposit_status,
deposit_method, booking_deposit_amount, booking_deposit_percentage,
payment_method, deposit_payment_method, balance_payment_method, payment_provider,
discount_code, order_source, ota_channel, order_date, room_quantity,
cancellation_fee_amount, cancellation_fee_percent, refund_fee_amount,
pet_plan_price, meal_plan_total, currency_at_booking, member_id, import_project,
room_charge_status, room_charge_scheduled_date,
confirmed_at, checked_in_at, checked_out_at, cancelled_at, refunded_at,
deposit_charged_at, deposit_refunded_at, payment_link_created_at,
group_buy_payment_deadline_at, atm_expire_at, internal_email_sent, internal_email_sent_at

(b) 只記「有變動」、不記值：
guest_name, guest_phone, guest_email, guest_address, guest_gender, guest_nationality,
notes, meal_plan_details, custom_addon_details, group_buy_booking_notice_snapshot,
owlting_sync_state, hotelnabe_sync_state, exchange_rate_snapshot,
atm_vacc_no, atm_vacc_bank_code, atm_rec_trade_id, atm_bank_transaction_id,
room_charge_rec_trade_id, refund_rec_trade_id, room_charge_error

(c) 完全不追蹤：
id, created_at, updated_at, idempotency_key, dedupe_key, owlting_unique_id,
owlting_reservation_id, hotelnabe_res_id, hotelnabe_last_modify,
auto_created_from_email_id, room_charge_at

分類邏輯：金額／狀態／日期／關聯 → 全記；個資、自由文字、raw JSON、金流交易識別碼 → 只記「有變動」；純技術欄位與同步時間戳 → 不記（否則每次同步都會刷出雜訊）。

## 二、trigger 與 context

3. `trg_order_change_log AFTER INSERT OR UPDATE ON orders FOR EACH ROW`（UPDATE 時 `WHEN (OLD.* IS DISTINCT FROM NEW.*)`）。
   內部用 `to_jsonb(OLD)` / `to_jsonb(NEW)` 逐 key 比對，依 (a)/(b)/(c) 白名單決定寫值或只寫 `changed:true`；無任何被追蹤欄位變動就 return，不寫列。全程 EXCEPTION handler 包起來，寫入失敗只 RAISE WARNING，永不讓 UPDATE 失敗。

4. context key 命名（皆 transaction-local，`set_config(key, val, true)`）：
   - `app.actor_type`、`app.actor_label`、`app.reason`、`app.source`
   呼叫慣例：前端經 RPC `set_order_change_context(p_source, p_reason, p_actor_label)`；Edge Function 先呼叫同一支 RPC 再做 UPDATE（需同交易，故建議搬進 RPC 或用 `rpc` + 單一 SQL 函式包裝）。
   預設值：未設定 context 時 → `auth.uid()` 有值就 `actor_type='user'`、`source='unmarked'`；`auth.uid()` 為 NULL 就 `actor_type='unknown'`、`actor_label='unmarked_system'`、`reason='未標記來源，待補'`。

5. `trg_log_order_deposit_change`：改為不直接依賴 `auth.uid()`，改用同一支 actor 解析函式（user / system / unknown 三態），並保留現有寫 audit_logs 的行為，讓 service role 觸發時不再有 NULL user_id 造成 insert 失敗的風險。

## 三、補 context 的建議順序

1. 金流／退款 Edge Function（tappay webhook、refund、room charge）
2. OwlTing 自動建單與修改（owltingAutoOrder / owlting-fillup-submit）
3. HotelNabe 同步
4. 已結清折扣／加購 RPC（v2 / v3）
5. /admin OrderDetail、OrderPriceEditDialog、Reception
6. 團購、KOL、批次與報表類

## 四、RLS

- SELECT：`orders=editable` 或 `readonly`（`get_staff_module_permission(uid, accommodation_id, 'orders') in ('editable','readonly')`）、或該館 hotel_admin、或 super_admin。
- INSERT/UPDATE/DELETE：一律不開放（只有 SECURITY DEFINER trigger 寫入）。
- GRANT SELECT to authenticated；GRANT ALL to service_role。

## 五、風險

8. orders 上現有 30 個 trigger，AFTER trigger 依名稱字母序執行，新 trigger 命名建議 `zzz_order_change_log`，確保最後執行、不影響既有順序。每列成本為一次 jsonb 比對 + 最多一次 insert，量級（每日數十筆更新）可忽略。
9. 同交易多次 UPDATE 的已知情形：已結清折扣／加購 RPC 內部會先改金額再改 notes；OwlTing 修改流程會先更新 orders 再重建 order_rooms（後者不影響）。因此以 `txid + order_id` 收斂顯示，或於 RPC 明確設定同一 reason，即可避免看起來重複。

## 六、既有三區塊資料來源（已查證）

- 付款狀態變更 → `OrderNotificationHistory.tsx:180` 讀 `payment_status_history`（本次不動）
- 押金異動紀錄 → 同檔 `:192` 讀 `audit_logs` `entity_type='order_deposit'`（本次不動）
- 變更紀錄 → `OrderAuditLogCard.tsx:59-64` 讀 `audit_logs` `entity_type in ('order','order_meta')`

## 七、A（notes 自動文字）與 B（變更紀錄）

11. 寫入者：
- `🔒[金額異動 ...]`：前端 `src/pages/OrderDetail.tsx`（兩處）、`src/components/orders/OrderPriceEditDialog.tsx`，以及 DB RPC `update_paid_order_addons_v2 / v3`。
- `【額外現場加購備註 ...】…【額外現場加購備註END】`：DB 函式 `notes_set_onsite_addon_v2`，由 `update_paid_order_addons_v3` 呼叫。
- 保護者：`prevent_immutable_order_fields_change`（🔒 行不得刪改）——即 Notes Hotfix v3 / Audit Note Content v2 同一套。

12. 是同一次寫入事件的兩份輸出：v3 在同一交易內同時 append notes 行與寫 audit_logs（`extra_addon_note` 等 field 級 diff）；前端金額修改同樣是「append notes 行 + 寫 audit_logs price_edit」。

13. 三項查證：
- 移除自動 append 會直接牴觸現行 `prevent_immutable_order_fields_change`：舊資料裡既有的 🔒 行仍必須逐字保留，所以只能「不再新增」，不能回頭清除既有行，否則所有含舊 🔒 行的訂單都會存檔失敗。
- **外部曝露（重要）**：`supabase/functions/owlting-order-push/index.ts:448` 直接把 `order.notes` 全文（含 🔒 金額異動行與加購備註區塊）併入推給 OwlTing 的 Comments；`src/pages/MemberOrderDetail.tsx:110-124` 的 `extractGuestNotes` 只過濾以 `[` 開頭的行，`🔒[金額異動 …]` 與 `【額外現場加購備註 …】` 都**不會**被濾掉，會顯示在客人自己的訂單頁。查無客人信件模板讀 notes。這是獨立於本次整合、可優先處理的曝露問題。
- 是的，notes append 包在 `update_paid_order_addons_v3`（經 `notes_set_onsite_addon_v2`）與 `update_paid_order_discount_v2` 同一交易內；要停止新增就必須改這兩支已上線 RPC。

14. 整合方案：
- 頁面：底部單一「變更紀錄」時間軸，資料來源 = 新 `order_change_log`（全欄位自動）＋ 既有 `audit_logs`（order / order_meta，保留歷史），依時間合併；notes 欄位只顯示人寫的內容。
- 分三階段：(1) 建表＋trigger＋唯讀合併顯示；(2) 停止新增 notes 自動文字（改兩支 RPC 與三處前端），既有行照舊保留、前端顯示時濾除；(3) 修 OwlTing 推送與會員頁的 notes 過濾（可提前獨立做）。
- 風險：主要在 (2)，動到已上線 RPC 與 immutable 規則；(1) 幾乎零風險。
- 工作量估：(1) 中、(2) 中、(3) 小。
