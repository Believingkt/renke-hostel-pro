## 5. 設計稿

### 會修改的檔案（只有兩支，加一支新測試）

1. `supabase/functions/send-order-cancelled-email/index.ts`
   - `Body` 介面新增三個可選欄位：`cancelKind?: "guest_request" | "atm_expired"`（預設 `guest_request`）、`deadlineText?: string`、`previewTo?: string`。
   - 只在 `cancelKind === "atm_expired"` 時走新文案分支：主旨改「【付款期限已過】訂單已自動取消 - 訂單編號 XXXX」；內文說明因未於付款期限完成 ATM 轉帳而由系統自動取消；表格加「付款期限」一列；隱藏退款／手續費區塊；加上「請勿再匯款至原虛擬帳號」提醒與重新訂房連結。
   - `previewTo` 存在時只寄到該地址，且 `booking_email_log` 的 `trigger_source` 標記為 `preview`（避免污染正式寄信紀錄）。
   - 預設路徑（現行客人主動取消）行為完全不變，這點用單元測試鎖住。

2. `supabase/functions/cancel-expired-atm-orders/index.ts`
   - 只改官網 legacy 迴圈：UPDATE 補上 `.select('id').maybeSingle()` 以確認真的更新成功（與團購分支一致，避免對沒被更新的訂單寄信）。
   - 取消 commit 且站內通知建立後，`try/catch` 呼叫 `send-order-cancelled-email`，帶 `{ orderId, cancelKind: 'atm_expired', deadlineText, triggerSource: 'atm_expire_cron' }`。寄信失敗只記 log，絕不回滾取消。
   - 去重：呼叫前先查 `booking_email_log` 是否已有此 `order_id` + `email_type='order_cancelled'`，有就跳過。
   - 團購分支（96–168 行）一行不動。

3. 新增 `src/test/atm-expired-cancel-email.test.ts` — 純函式測試（把文案組裝抽成同檔可匯出的 `buildCancelEmail()`，不動寄送邏輯）。

### 保證不動的檔案

- `supabase/functions/_shared/groupBuyEmail.ts`
- `supabase/functions/_shared/groupBuyAtmExpiredEmail.ts`
- `supabase/functions/_shared/groupBuy.ts`、`groupBuyPaymentNotify.ts`、`group-buy-*` 全部函式
- `supabase/functions/_shared/sendBookingEmail.ts`（含 42–45 行的 group_buy 略過邏輯）
- `tappay-atm-create`、`tappay-notify`、`tappay-payment-webhook`、`create-paid-order`、`complete-3ds-booking`、`create-card-bound-order`、`cancel-order-with-refund`、`member-order-manage`、`public-order-cancel`
- 任何 DB schema、RLS、trigger、RPC、權限設定 — 本次零 migration。
- 前端全部檔案。

### 舊資料會不會被掃到？

不會。寄信呼叫寫在「本輪迴圈剛剛成功取消這張訂單」之後，資料來源是本次 UPDATE 回傳的那筆。查詢條件本身就是 `order_status != 'cancelled'`，已取消的舊訂單根本不會進入迴圈。加上 `booking_email_log` 去重，即使同一張單在同一輪重試也只寄一次。先前那 28 筆缺信的舊訂單不會被自動補寄；若之後要補，另案人工授權。

### 測試計畫

Precheck（施工前貼出）：
- `cancel-expired-atm-orders/index.ts` — 目前 md5 `1f65b5a1c87c2c2d98e3780b6c79d9e7`、179 行
- `send-order-cancelled-email/index.ts` — 目前 md5 `d63774b344c79cc9db3bba3cb08a6369`、162 行
- `_shared/groupBuyEmail.ts` — 基準 md5 `b0c568529a04b6961b746350ee92c73a`（施工後必須完全相同）

單元測試（新檔，至少 5 case）：
1. 預設 `guest_request` 主旨與內文與現行完全相同（回歸鎖）。
2. `atm_expired` 主旨含「付款期限已過」。
3. `atm_expired` 內文含付款期限文字與「請勿再匯款」。
4. `atm_expired` 不含退款金額／取消手續費區塊。
5. `atm_expired` 含重新訂房連結。

即時驗證（需要你另外授權才執行）：
- 挑一張既有已取消的官網 ATM 訂單（例如先前查到的 `VH2S26D9`），以 `previewTo: "sakithebest@gmail.com"` 呼叫改版後的函式，只寄到你的信箱，不寄旅客本人。
- 回報 request／response、完整信件文案、`booking_email_log` 前後筆數（preview 只會多一筆標記為 preview 的紀錄），並確認訂單本身零變動。
- cron 本體不手動觸發正式環境。

等你明確授權後才動 code；本輪不 Accept Draft、不 Publish、不部署。
