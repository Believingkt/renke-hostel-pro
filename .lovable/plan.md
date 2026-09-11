# ATM 版 booking_pending 信尾文案分流（設計稿，未施工）

## 一、目前文案位置（逐字）

`supabase/functions/_shared/groupBuyEmail.ts:243-258`（`renderBookingWithBankInfo()` 結尾）

```ts
       ${bankBlock}
       ${o.deadlineText ? `<p><strong style="color:${BRAND.primary}">匯款期限：${esc(o.deadlineText)}</strong>（逾期系統將自動取消訂單）</p>` : ""}
       <p>匯款完成後，請至訂單查詢頁點選「我已完成匯款」，我們會盡快為您核對入帳。</p>
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">匯款回報 / 查詢訂單</a></p>` : ""}`
```

結論：**這是固定共用文案，完全沒有依付款方式分流**。同一支函式上方的付款區塊 (`bankBlock`) 已經有三態分流（ATM 優先 → 共用帳號 → fallback），但信尾這兩行不論 ATM 或人工匯款都照印，所以 ATM 訂單會出現「請點我已完成匯款」的錯誤指引。

（ATM 區塊內其實已有一行 `系統收到入帳通知後將自動更新訂單狀態，無需另行通知。`，與信尾文案自相矛盾。）

## 二、ATM 自動比對入帳機制（逐字佐證）

1. 開立虛擬帳號：`group-buy-start-payment/index.ts:291` 寫入 `event_type: "atm_created"`。
2. 客人匯款後 TapPay webhook 進入 `tappay-notify/index.ts`：
   - 第 187-196 行以 `atm_rec_trade_id` 反查訂單；
   - 第 391-394 行判定 ATM：`order.atm_rec_trade_id === rec_trade_id || order.payment_method === 'atm' || verifiedRecord?.acquirer === 'TW_TAPPAY_ATM' || verifiedRecord?.pay_info != null`；
   - 第 396-429 行自動累加 `paid_amount`、更新 `payment_status`（`deposit_paid` / `paid`），以 `p_source: 'tappay_atm_webhook'`、`p_actor_type: 'system'` 呼叫 `update_order_with_context`。
3. 團購分支第 488-495 行呼叫 `notifyGroupBuyPaymentReceived(...)`，`providerLabel: 'ATM 虛擬帳號轉帳'`。
4. `_shared/groupBuyPaymentNotify.ts:49-74`：自動寄 `renderDepositReceived()`（【已收到訂金】），並寫入 `event_type: "atm_paid"` 與 `email_sent`／`email_failed`（`template_type:deposit_received`）。

→ 用戶描述正確：ATM 全自動比對入帳、自動更新訂單、自動寄確認信，客人不需要回報。

## 三、修法設計

### 3.1 只動一個地方：`renderBookingWithBankInfo()` 的信尾

函式內已有 `atmBlock` 變數可判斷是否 ATM，直接依它分流：

- **ATM（`atmBlock` 有值）**：
  - 不印「請點我已完成匯款」那行、**不印按鈕**。
  - 改印：「本筆訂單為 ATM 虛擬帳號，匯款完成後系統會自動比對入帳並更新訂單狀態，我們也會另外寄出【訂房確認・已收到訂金】通知信，您**不需要**另行回報。」
  - 另加一行小字：「如逾 1 小時仍未收到確認信，請與我們聯繫。」（避免客人焦慮）
  - 順帶把 ATM 區塊內既有那句「系統收到入帳通知後將自動更新訂單狀態，無需另行通知。」保留不動（不重複刪改，降低 diff 風險）。
- **非 ATM（人工匯款／fallback）**：現行兩行**逐字不變**。

「匯款期限」那行兩者皆保留（ATM 逾期同樣自動取消）。

### 3.2 查詢訂單連結

ATM 版拿掉的是「匯款回報」語意的按鈕。若仍希望客人能查訂單，建議二選一（等您決定）：
- (a) ATM 版完全不放按鈕（最貼近您的描述）。
- (b) ATM 版保留按鈕但文字改成「查詢訂單」，不含「匯款回報」字樣。

## 四、影響範圍與風險

**只動 1 個檔案**：`supabase/functions/_shared/groupBuyEmail.ts`（`renderBookingWithBankInfo()` 內信尾字串）。

**受影響的呼叫端**（皆為同一模板，行為一致）：
- `group-buy-create-order`（建單初次寄信）
- `group-buy-resend-notification`（補寄）
- `group-buy-start-payment`（配發虛擬帳號後補寄）
- `group-buy-email-preview-send`（樣本 `guest_booking_with_atm_info` / `guest_booking_with_bank_info`）

**不會動到**：ATM 付款流程、`tappay-notify`、`groupBuyPaymentNotify.ts`、`renderDepositReceived`、任何 DB／RLS／RPC／前端。

**風險**
1. 人工匯款版必須逐字不變 → 施工後以既有樣本寄送做 diff 核對。
2. 若某訂單是 ATM 但虛擬帳號尚未配發（`atmBlock` 為 null），會落到非 ATM 文案（顯示「將由客服另行提供」＋回報按鈕）。此情況維持現狀，不在本次範圍；若要一併處理需再傳入付款方式旗標，請指示是否納入。

## 五、驗證計畫（施工後才執行）
1. `tsgo --noEmit` 與既有團購信件測試全綠。
2. 新增單元測試：ATM 版不含「我已完成匯款」與「匯款回報」字串；非 ATM 版輸出與施工前逐字相同。
3. 以 `previewTo: sakithebest@gmail.com` 對 CE2V95Y5 強制 `booking_pending` 寄一封副本人工核對（不寄旅客本人）。

目前未修改任何檔案、未部署、未 Publish。
