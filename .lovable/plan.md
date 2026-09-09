# notes 稽核文字整合評估 ＋ 批次一（金流）補 context 設計

**設計階段，未施工。** 以下皆為查證與設計內容。

---

## 一、盤點：所有會往 `orders.notes` 寫入 🔒 / 【】格式文字的位置

### 後端 Edge Functions

| # | 檔案:行號 | 文字格式範例 | 已呼叫 context？ |
|---|---|---|---|
| 1 | `_shared/tappayWebhookProcessor.ts:230` | `🔒 2026-09-09 12:00 TapPay 退款成功 NT$3,000（交易 xxx）` | 否 |
| 2 | `tappay-notify/index.ts:404,416` | `[3DS Webhook] … - 付款成功 NT$3000 (rec_trade_id: …, auth_code: …)` | 否 |
| 3 | `tappay-notify/index.ts:578,585` | `[3DS Webhook] … - 付款失敗 (rec_trade_id: …, verified_status: …)` | 否 |
| 4 | `tappay-refund-notify/index.ts:201,211` | `[退款 Webhook] … - 退款成功 NT$1,000 (rec_trade_id: …, refund_id: …)` | 否 |
| 5 | `tappay-refund-notify/index.ts:262,269` | `[退款 Webhook] … - 退款失敗 …（status, msg）` | 否 |
| 6 | `tappay-sync-refund/index.ts:207,216` | `[TapPay 同步] … 退款累計 NT$… [TAPPAY_SYNC_REFUNDED:3000]` | 否 |
| 7 | `_shared/latePayment.ts:131` | `🔒 {逾期付款說明}` | 否 |
| 8 | `charge-room-on-checkin/index.ts:103` | `🔒 … 入住日自動扣款成功 NT$5,000（TapPay 交易 xxx）` | 否 |
| 9 | `charge-room-on-checkin/index.ts:118` | `🔒 … 入住日自動扣款失敗：{msg}（請於現場改收款）` | 否 |
| 10 | `cancel-order-with-refund/index.ts:158,280` | `🔒 [ts] user@x 取消訂單` ／ `🔒 [ts] 取消政策：…／距入住 N 天／…` | 否 |
| 11 | `change-order-dates/index.ts:279,281` | `🔒 [ts] 改期：A → B｜C → D｜操作：X｜備註：Y` | 否 |
| 12 | `payment-audit-resolve/index.ts:106` | `🔒 {stamp} {處理內容}（處理人：user@x）` | 否 |
| 13 | `member-order-manage/index.ts:147,148,194-246,353,389,426,430,435,514,553` | `🔒 … 會員於前台自行取消訂單（email）` ／ `🔒 取消政策（…）：… 退款比例 N%` ／ `🔒 已收取取消手續費 NT$…（TapPay …）` ／ `🔒 … 會員自行改期：…` | 否 |
| 14 | `public-order-cancel/index.ts:118,119` | `🔒 … 客人於付款狀態頁自行取消訂單（未扣款）` ／ `🔒 取消政策（…）：…` | 否 |
| 15 | `group-buy-cancel-refund/index.ts:327,328,503` | `【退款】ts 由 X 執行原信用卡退刷 NT$…` ／ `【取消】ts 由 X 取消訂單` | 否 |
| 16 | `group-buy-expire-orders/index.ts:73` | `【系統】逾期未匯款自動取消（期限 24 小時）` | 否 |

`charge-deposit`、`refund-deposit`、`bind-deposit-card` **不寫 notes**（只改 `deposit_*` 欄位），但仍屬批次一補 context 範圍。

### 前端

| # | 檔案:行號 | 文字格式範例 | 已呼叫 context？ |
|---|---|---|---|
| 17 | `src/pages/OrderDetail.tsx:1229,1541` | `🔒[金額異動 ts by user] 總金額 A→B、…` | 否 |
| 18 | `src/pages/OrderDetail.tsx:1545` | `【金額修改】{原因}` | 否 |
| 19 | `src/pages/OrderDetail.tsx:1065,1071,1082` | `【額外現場加購備註 ts】…【…END】`／`【額外現場加購金額 ts】…`／`【包區房間配置】雙人房 2 間` | 否 |
| 20 | `src/components/orders/OrderPriceEditDialog.tsx:443,448` | `🔒[金額異動 …]` ／ `【金額修改】…` | 否 |
| 21 | `src/components/orders/PaymentStatusDialog.tsx:59,60` | `【付款狀態變更】未付款 → 已付訂金：{原因}` | 否 |
| 22 | `src/components/orders/OrderStatusDialog.tsx:57,58` | `【訂單狀態變更】待確認 → 已確認：{原因}` | 否 |
| 23 | `src/components/orders/OrderSourceDialog.tsx:95` | `【來源變更】官網 → 人工` | 否 |
| 24 | `src/components/orders/PaidAmountEditDialog.tsx:281` | `【額外現場加購金額】3000【額外現場加購金額END】` | 否 |
| 25 | `src/components/orders/OrderManualReviewCard.tsx:122,134,149,154,157` | `🔒 [ts] 客服核准改期：…｜操作：X` 等 5 種 | 否 |
| 26 | `src/components/orders/CreateOrderDialog.tsx:1535-1558` | `【包區房間配置】雙人房 2 間、四人房 1 間` | 否（建單） |
| 27 | `src/components/orders/CreateHoldOrderDialog.tsx:353` | `【保留單】待補客人資訊` | 否（建單） |
| 28 | `src/components/orders/ImportOrdersDialog.tsx:270,271,320` | `【訂單類型：X】`／`【專案：Y】`／`【其他營收：3000】` | 否（匯入） |
| 29 | `src/pages/BookingFlow.tsx:3715` | `[系統自動取消] 並發下訂庫存複驗失敗：…` | 否 |

### 補 context 現況

**全 repo 查無任何呼叫端呼叫 `set_order_change_context()`。** 目前只有 3 處出現該名稱：migration `20260909071053`（定義）、`src/integrations/supabase/types.ts:14200`（自動產生型別）、`docs/v55c0/*`（設計文件）。也就是 **40 支全部都還沒補**。

---

## 二、分類：純內部稽核 vs 客人/OTA 需要看到

判斷依據是既有白名單 `src/utils/guestNotesWhitelist.ts` 與 `supabase/functions/_shared/owltingNotesWhitelist.ts`（兩份同規則、有 parity 測試）：
- `LINE_RES` 會剝除：行首 `🔒`、`【付款狀態變更】`、行首 `[標籤]`、含 `rec_trade_id`、`【取消】`、`取消政策：`、`退款處理：`、`原因：` 等。
- `BLOCK_RES` 會整塊剝除：`【額外現場加購備註/金額…END】`。
- **未被剝除（客人／OTA 看得到）**：`【退款】`、`【系統】`、`【金額修改】`、`【訂單狀態變更】`、`【來源變更】`、`【包區/包棟房間配置】`（刻意保留）、`【保留單】`、`【訂單類型/專案/其他營收】`。

### 分類 A — 純內部稽核，且欄位已被 `order_change_log` 完整覆蓋 → 可評估移除
- #11 `change-order-dates` 改期行（`check_in_date`/`check_out_date` 已追蹤，操作者已在 log 的 actor）
- #23 `OrderSourceDialog`【來源變更】（`order_source` 已追蹤）— 但此行客人看得到，移除等於「客人少看到一行」，屬安全方向
- #17/#20 `🔒[金額異動 …]`（total/final/discount/paid 皆已追蹤）— 惟「原因」文字不在 log 內，需搭配 context 的 `reason` 一併帶入才可移除
- #21 `【付款狀態變更】`（`payment_status` 已追蹤；同樣需把 reason 帶進 context）

### 分類 B — 內部用，但內容不是 `orders` 欄位或屬資料載體 → **不可移除**
- #1〜#9 全部金流 webhook／扣款行：`rec_trade_id`、`auth_code`、`refund_id`、TapPay 錯誤訊息、`[TAPPAY_SYNC_REFUNDED:n]`（此標記還被 `tappay-sync-refund:23` 反向解析）
- #7 逾期付款說明、#12 人工審核處理內容與處理人
- #19/#24 `【額外現場加購備註/金額】`、`【包區房間配置】`：`OrderDetail.tsx:632,671,3293` 會**回讀解析**，屬結構化資料載體
- #25 客服人工審核 5 種說明（核准改期／人數／重新計價／結案／客服說明）

### 分類 C — 客人／OTA 需要看到 → **不可動**
- #10 取消政策與退款說明、#13/#14 會員與訪客自助取消的政策、退款比例、手續費說明
- #15 團購【退款】/【取消】、#16【系統】逾期自動取消
- #18 `【金額修改】{原因}`、#22`【訂單狀態變更】`（含原因，屬對客說明）
- #26〜#29 建單／保留單／匯入／庫存複驗自動取消的說明文字

**先不動任何一項，等你確認分類後再談移除。**

---

## 三、批次一（金流）補 context — 技術前提與完整 diff

### 阻擋點（必須先解決）
`set_order_change_context()` 用 `set_config(..., is_local => true)`，是**交易內有效**。Edge Function 透過 PostgREST 呼叫 `rpc()` 與 `.update()` 是**兩個獨立交易**（且 Supavisor 可能換連線），所以「先 rpc 再 update」拿不到 context。

**建議做法（批次一同時要做的一支 migration）**：新增一支把「設 context + 更新訂單」包在同一交易的 RPC。

```sql
CREATE OR REPLACE FUNCTION public.update_order_with_context(
  p_order_id uuid, p_patch jsonb,
  p_source text, p_reason text DEFAULT NULL,
  p_actor_label text DEFAULT NULL, p_actor_type text DEFAULT 'system'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.set_order_change_context(p_source, p_reason, p_actor_label, p_actor_type);
  UPDATE public.orders o SET
    payment_status = COALESCE(p_patch->>'payment_status', o.payment_status),
    paid_amount    = COALESCE((p_patch->>'paid_amount')::numeric, o.paid_amount),
    refunded_amount= COALESCE((p_patch->>'refunded_amount')::numeric, o.refunded_amount),
    payment_method = COALESCE(p_patch->>'payment_method', o.payment_method),
    balance_payment_method = COALESCE(p_patch->>'balance_payment_method', o.balance_payment_method),
    deposit_status = COALESCE(p_patch->>'deposit_status', o.deposit_status),
    deposit_method = COALESCE(p_patch->>'deposit_method', o.deposit_method),
    deposit_charged_amount = COALESCE((p_patch->>'deposit_charged_amount')::numeric, o.deposit_charged_amount),
    deposit_refunded_amount= COALESCE((p_patch->>'deposit_refunded_amount')::numeric, o.deposit_refunded_amount),
    notes          = COALESCE(p_patch->>'notes', o.notes),
    updated_at     = now()
  WHERE o.id = p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text) TO service_role;
```

### 各呼叫端 diff（10 個檔案、14 個寫入點）

所有改動形狀一致，以 `tappay-notify` 為例：

```diff
- await supabase.from('orders').update(updatePayload).eq('id', order.id);
+ await supabase.rpc('update_order_with_context', {
+   p_order_id: order.id,
+   p_patch: updatePayload,
+   p_source: isAtm ? 'tappay_atm_webhook' : 'tappay_3ds_webhook',
+   p_reason: `付款成功 NT$${amount}`,
+   p_actor_label: 'TapPay',
+   p_actor_type: 'system',
+ });
```

各點的 source / reason / actor 對照：

| 檔案:行號 | p_source | p_reason | actor_label / type |
|---|---|---|---|
| `tappay-notify:409` | `tappay_3ds_webhook`／`tappay_atm_webhook` | `付款成功 NT${amount}` | TapPay / system |
| `tappay-notify:582` | `tappay_3ds_webhook` | `付款失敗（verified_status: …）` | TapPay / system |
| `tappay-refund-notify:207` | `tappay_refund_webhook` | `退款成功 NT${refundAmount}` | TapPay / system |
| `tappay-refund-notify:265` | `tappay_refund_webhook` | `退款失敗（{msg}）` | TapPay / system |
| `tappay-sync-refund:212` | `tappay_sync_refund` | `退款累計同步 NT${total}` | TapPay 同步 / system |
| `_shared/tappayWebhookProcessor.ts`（`orderPatch` 套用處） | `tappay_webhook` | 依 eventType：`退款成功`／`退款失敗`／`請款成功` 等 | TapPay / system |
| `_shared/latePayment.ts:131` 之更新 | `late_payment_failsafe` | `逾期付款保險機制` | 系統 / system |
| `charge-room-on-checkin:94` | `checkin_auto_charge` | `入住日自動扣款成功 NT${amount}` | 系統排程 / system |
| `charge-room-on-checkin:114` | `checkin_auto_charge` | `入住日自動扣款失敗：{msg}` | 系統排程 / system |
| `charge-room-on-checkin:151,171` | `checkin_auto_charge` | 同上（狀態同步） | 系統排程 / system |
| `charge-deposit:115`（成功） | `deposit_charge` | `押金扣款成功 NT${amount}` | 觸發別 `scheduled` → system；`manual` → 操作者 email / human |
| `charge-deposit:126`（失敗） | `deposit_charge` | `押金扣款失敗：{msg}` | 同上 |
| `refund-deposit:116` | `deposit_refund` | `押金退款 NT${amount}` | 操作者 email / human |
| `bind-deposit-card:136` | `deposit_bind_card` | `綁卡成功（末四碼 {last4}）` | 客人 / guest |

`cancel-order-with-refund:241,309` 也屬金流批次，同形狀改為 `update_order_with_context`，`p_source='admin_cancel_refund'`、`p_reason` 用既有取消原因、`p_actor_label` 用 `userEmail`、`p_actor_type='human'`。

### 其餘批次（僅列清單，本次不設計）
- 批次二 OwlTing：`owlting-change-notify`、`owlting-fillup-issue`、`owlting-fillup-remind`、`owlting-cleanup-stale-pending`、OwlTing 匯入 staging 相關寫入
- 批次三 HotelNabe：`hotelnabe-*` 訂單回寫路徑
- 批次四 已結清折扣／加購 RPC：`update_paid_order_discount_v2`、`update_paid_order_addons_v3`
- 批次五 `/admin` 手動：OrderDetail 內嵌編輯、5 個對話框、`OrderManualReviewCard`、`PaidAmountEditDialog`
- 批次六 團購／KOL／匯入低頻：`group-buy-cancel-refund`、`group-buy-expire-orders`、`group-buy-order-lookup`、`claim-order`、`member-order-manage`、`public-order-cancel`、`change-order-dates`、`ImportOrdersDialog`

---

未施工、未部署。等你確認分類與批次一做法後再繼續。
