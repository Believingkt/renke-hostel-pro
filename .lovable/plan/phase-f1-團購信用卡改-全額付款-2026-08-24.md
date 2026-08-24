# Phase F1｜團購信用卡改「全額付款」

目標：團購信用卡（3DS）改為刷**訂單總額 100%**，訂金欄位歸零；ATM／銀行匯款維持現行訂金制，行為完全不動。一般訂房完全不碰。

## 一、金額鏈（Server）

1. `group-buy-create-payment-draft`
   - `amount_to_charge` 由 `plan.deposit` 改為 `plan.total`。
   - 回傳新增 `chargeMode: "full"`，`amountToCharge = total`，`balance` 回 0。
   - Draft 內 `deposit_amount` 仍保留 `plan.deposit` 作為快照（不影響應收）。

2. `_shared/groupBuyBooking.ts`
   - `CreateGroupBuyOrderOptions` 新增 `fullPayment?: boolean`。
   - `buildGroupBuyOrderInsert`：`fullPayment` 時
     - `deposit_amount = 0`
     - `payment_status = "paid"`（`paid_amount >= total` 時本來就成立，明確化）
     - notes 移除「訂金 X 元／尾款 Y 元現場付清」該行，改寫入「信用卡全額付款 NT$總額（無尾款）」。

3. `_shared/groupBuyCreditCompletion.ts`
   - 呼叫轉單時帶 `fullPayment: true`。
   - `balance` 計算結果為 0，事件 note 由「訂金」改為「全額」。
   - 金額比對（`verifiedAmount !== draft.amount_to_charge`）邏輯不變，自動吃到新的全額。
   - 失敗自動退款金額仍為實刷金額，不需改。

4. 不動：`group-buy-start-payment`（ATM）、`groupBuyAtmDue.ts`、`acquire_group_buy_payment_hold`、`convert_group_buy_payment_draft`、庫存 Gate。

## 二、Email 文案分流

`_shared/groupBuyEmail.ts`
- `renderDepositReceived(o, opts)` 新增 `opts.fullPayment`：
  - 標題「已收到您的訂金」→「已收到您的付款」；主旨同步。
  - 內文金額改為「已收到您的款項 NT$總額，本筆訂單已全額付清」。
  - 隱藏「尾款 … 請於入住當天現場付清」整段。
- `renderVenueNewOrder(o)` 新增 `fullPayment`：隱藏「應付訂金／入住支付尾款」列，改單列「已全額收款（信用卡）」。
- `renderBookingPending`（匯款信）不動。
- `groupBuyPaymentNotify.ts`（ATM 入帳）不傳 `fullPayment`，維持訂金文案。

## 三、前台 UI 分流

1. `GroupBuyCreditCardDialog.tsx`：標題與明細改「訂單總額／本次應付（全額）」，移除訂金百分比與尾款列。金額仍一律讀 server draft。
2. `GroupBuyConfirmDialog.tsx`：選擇「信用卡」時，摘要區顯示「線上全額付款 NT$總額」，隱藏訂金／尾款兩列；選 ATM／匯款時維持原樣。
3. `GroupBuyPaymentSteps.tsx`：新增 `creditCardEnabled`，信用卡可用時補一條「信用卡：線上全額付款，付款成功即訂房完成」。
4. `GroupBuyOrderConfirmation.tsx`：依 `payment_provider === "tappay"` 分支——顯示「付款完成，訂房成功」、隱藏匯款資訊／ATM 面板／匯款期限，金額列改「已付金額（全額）」。
5. `GroupBuyOrderLookup.tsx`：同上分支——隱藏匯款資訊、匯款回報表單與「應付訂金／入住現場付清」，狀態徽章顯示「已付款」。
6. `group-buy-order-lookup` Edge Function：`select` 補 `payment_provider`，回傳新增 `paymentProvider`、`paidAmount`、`fullPayment` 旗標；`deposit` 對信用卡訂單回 0、`balance` 回 `max(0, total - paid)`。

## 四、後台

`AdminGroupBuy.tsx` 對帳列表：`payment_provider === "tappay"` 的列，「應付訂金」欄改顯示「全額 NT$總額」，並隱藏「確認收到訂金」按鈕（已全額付清）。`src/lib/groupBuyPayment.ts` 的 `depositState` 已優先判 `payment_status === "paid"`，不需改。

## 五、驗收

- 既有 vitest 全綠（含 `group-buy-credit-dialog.test.tsx`，需更新為全額斷言）。
- 新增測試：`buildGroupBuyOrderInsert` 在 `fullPayment` 下 `deposit_amount === 0`、`payment_status === "paid"`。
- Regression：ATM／匯款流程 Draft 與 Email 文案完全未變。
- 不做實刷；部署後由你決定何時進行第一筆 Production 3DS。
