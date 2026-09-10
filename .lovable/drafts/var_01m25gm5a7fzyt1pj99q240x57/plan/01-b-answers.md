# B. 三題明確結論（唯讀查證，未修改任何內容）

## B1. isCardPaidOrder 能不能抽成前後端共用純模組？
**可以。** 該函式只讀 `balance_payment_method` / `payment_method` / `deposit_payment_method` / `room_charge_rec_trade_id` 四個欄位，全為純字串比對，沒有任何 Deno 專屬 API、沒有 fetch、沒有 import（同檔案的 `resolveCardRecTradeId` 才需要 supabase client，那支不搬）。

而且這件事**其實已經做了一半**：`src/lib/cardPaymentDisplay.ts` 就是同一份規則的前端複本，並有 `src/test/group-buy-card-cancel-ui.test.ts` 逐一比對兩者結果。也就是目前是「兩份程式碼＋一個比對測試」，不是單一來源。

建議做法（本次不施工）：
- 新增 `supabase/functions/_shared/cardPaymentRule.ts`（純 TS、無 import），內含 `CARD_METHODS` / `ATM_METHODS` / `isCardPaidOrder`。
- `orderRefund.ts` 改為 re-export；`src/lib/cardPaymentDisplay.ts` 改為 re-export（比照現成先例 `src/lib/refundFee.ts`，它已經直接 `export ... from "../../supabase/functions/_shared/refundFee"`）。
- **前端打包不會有問題**：已有 `src/lib/refundFee.ts` 這個既存先例在正式站運作，且 `src/types/deno-shims.d.ts` 已為 Deno 全域與 URL import 提供型別 shim。唯一硬性條件是被共用的檔案不得 import 任何 `.ts` URL / npm: 模組——新檔案零 import，符合。

## B2. 非團購信用卡訂單有沒有正確取消入口？
**有，不是缺口。** `src/components/orders/CancelOrderDialog.tsx` 會呼叫 `cancel-order-with-refund`（第 80 行 quote、第 112 行實際執行），掛載在 `src/pages/OrderDetail.tsx:3858`，由訂單詳情頁的「取消訂單」按鈕（第 2169 行、以及第 2225 行的下拉選單項目）開啟。

但有兩個實際風險：
1. **訂單列表頁 `/admin/orders` 的狀態變更走的是 `OrderStatusDialog`**，直接改成「已取消」會完全繞過退款與取消信 —— 這就是原本要防呆的那條路。
2. `OrderDetail.tsx:1401` 的 `handleCancelOrder()`（直接呼叫 RPC 寫 cancelled）目前**沒有任何地方引用，是死碼**，建議一併移除以免日後被接回去。

## B3. 其他可能把 order_status 改成 cancelled 的 `update_order_fields_v1` 呼叫端
| 呼叫端 | p_source | 能否寫 cancelled | 是否合法取消路徑 |
|---|---|---|---|
| `OrderStatusDialog.tsx` | `admin_order_status_dialog` | 是（選項之一） | ❌ 繞過退款／取消信，需防呆 |
| `OrderDetail.tsx` 編輯表單（`buildOrderEditPatch`，orderFieldPatches.ts:138） | `admin_order_inline_edit` | 是（表單狀態下拉） | ❌ 同樣繞過，需一併考慮 |
| `OrderDetail.tsx:1407` `handleCancelOrder`（`buildAdminCancelPatch`） | `admin_order_cancel` | 是 | ⚠️ 死碼，無 UI 觸發 |
| `OrderPriceEditDialog` / `DealDateEditDialog` / `OrderSourceDialog` / `PaymentStatusDialog` / `OrderManualReviewCard` / `ImportOrdersDialog`(折扣碼) | 各自 source | 否（patch 不含 order_status） | 不受影響 |
| `ImportOrdersDialog` 匯入「已取消」 | — | 是，但走**新建訂單 insert**，非本 RPC | 合法（歷史資料匯入） |

**結論：可以在 RPC 本身加一道防護。** 因為所有合法的取消路徑（團購 `group-buy-cancel-refund`、一般訂房 `cancel-order-with-refund`）都是 service_role Edge Function，不經過 `update_order_fields_v1`。因此可在 RPC 內針對「舊狀態非 cancelled → 新狀態 cancelled」且（`order_source='group_buy'` 或信用卡已收款）的組合直接 RAISE EXCEPTION，前端擋不住也會被 DB 擋下。匯入路徑走 insert，不受影響。
