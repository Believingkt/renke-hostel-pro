## 保證不動的檔案

- `supabase/functions/_shared/groupBuyEmail.ts`、`groupBuyAtmExpiredEmail.ts`、`groupBuy.ts`、`groupBuyPaymentNotify.ts` 及所有 `groupBuy*` 共用檔
- 所有 `group-buy-*` Edge Function（含 `group-buy-resend-notification`、`group-buy-cancel-refund`、`group-buy-email-preview-send`）
- `supabase/functions/_shared/sendBookingEmail.ts`（含 42–45 行 group_buy 略過邏輯）
- `cancel-order-with-refund`、`member-order-manage`、`public-order-cancel`（呼叫端一行不動）
- `tappay-atm-create`、`tappay-notify`、`tappay-payment-webhook`、`create-paid-order`、`complete-3ds-booking`、`create-card-bound-order`
- `cancel-expired-atm-orders` 的團購新制分支（96–168 行）
- 前端全部檔案（`src/**`）
- 任何 DB schema、RLS、trigger、RPC、權限設定 — 本次零 migration

## Precheck 基準（施工前貼出驗證）

| 檔案 | 行數 | md5 |
| --- | --- | --- |
| `supabase/functions/send-order-cancelled-email/index.ts` | 162 | `d63774b344c79cc9db3bba3cb08a6369` |
| `supabase/functions/cancel-expired-atm-orders/index.ts` | 179 | `1f65b5a1c87c2c2d98e3780b6c79d9e7` |
| `supabase/functions/_shared/groupBuyEmail.ts` | — | `b0c568529a04b6961b746350ee92c73a`（施工後必須完全相同） |

`supabase/functions/_shared/orderCancelledEmail.ts` 施工前不存在（已確認 `No such file or directory`），為全新檔案。

## 舊資料影響

不會補寄。寄信寫在「本輪剛成功取消這張訂單」之後，查詢條件本身就排除 `order_status = 'cancelled'`，先前那批已取消卻沒收到信的舊訂單永遠不會進入迴圈。再加上 `booking_email_log` 去重，同一張單只寄一次。要補寄舊單需另案人工授權。

## 測試計畫

### 步驟 1：先做「純新增 previewTo」（不重構）

為了能對重構前的版本取得基準 HTML，第一步只在現行 `send-order-cancelled-email/index.ts` 加入 `previewTo` 支援（收件人改成 previewTo、log 標記 preview），不搬動任何組信邏輯。部署後對一張真實已取消訂單以 `guest_request` + `previewTo: sakithebest@gmail.com` 寄出，存下主旨與完整 HTML 為 `before.html`。

### 步驟 2：重構

抽出 `_shared/orderCancelledEmail.ts`，HTTP 入口變薄。再用同一張訂單、同一組參數寄一次，存為 `after.html`。

### 步驟 3：逐字 diff（驗收門檻）

`diff before.html after.html` 與主旨比對，輸出必須為空。非空即視為重構失敗，退回修正後重跑。兩份檔案與 diff 指令輸出全部貼給你看。

### 步驟 4：單元測試 `src/test/order-cancelled-email.test.ts`（5 cases）

1. 預設 `guest_request` 主旨與內文與現行完全相同（回歸鎖）
2. `atm_expired` 主旨含「付款期限已過」
3. `atm_expired` 內文含付款期限文字與「請勿再匯款」
4. `atm_expired` 不含退款金額／取消手續費區塊
5. `atm_expired` 含重新訂房連結

另跑 `npx tsgo --noEmit`（需 exit 0）與既有相關測試。

### 步驟 5：atm_expired 即時驗證

挑既有已取消的官網 ATM 訂單（例如 `VH2S26D9`），以 `cancelKind: 'atm_expired'` + `previewTo: sakithebest@gmail.com` 寄一次。回報：完整 request／response、完整信件內容、`booking_email_log` 前後筆數（只會多一筆 preview 紀錄）、以及該訂單本身欄位零變動的查詢佐證。

cron 本體不手動觸發正式環境；不 Accept Draft、不 Publish（部署僅限上述驗證所需的兩支函式，且需你另外明示授權）。
