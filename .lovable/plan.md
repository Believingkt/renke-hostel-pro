## 目標
1. 客人繳完尾款（狀態由 `deposit_paid`/`partial` → `paid`）時，自動寄第二封「尾款已收到」通知。
2. 後台可依訂單編號查看所有付款狀態變更、以及訂房相關通知信的實際寄送記錄（時間/收件人/狀態）。
3. 訂單詳情頁提供「手動重送訂房確認通知」按鈕，不影響付款流程。

---

## 一、資料庫（migration）

### 1. `payment_status_history`（付款狀態變更記錄）
欄位：`id, order_id, from_status, to_status, paid_amount, final_price, source (webhook/manual/system), changed_by (uuid null), notes, created_at`。

- 建立 `AFTER UPDATE` trigger on `orders`：當 `payment_status` 有變動時寫一筆。
- GRANT + RLS：`authenticated` 依 accommodation 可 SELECT；`service_role` 全權；staff 依 `staff_module_permissions` 讀取自己有權限的訂單相關記錄。

### 2. `booking_email_log`（訂房相關通知信記錄）
欄位：`id, order_id, order_number, email_type (booking_confirmation / final_payment_received), recipient, subject, status (sent/failed), resend_id, error_message, triggered_by (uuid null = system), trigger_source (auto_atm / auto_3ds / auto_final_payment / manual_resend / other), created_at`。

- GRANT + RLS：staff 依 accommodation SELECT。
- 由 Edge Function 寫入（成功或失敗都寫）。

---

## 二、Edge Functions

### A. 新增 `send-final-payment-received`
- Input: `orderId, triggerSource, triggeredBy?`
- 從 DB 讀單，寄「尾款已收到」信（新 template，含訂單編號、房型、入住日、總金額、已付金額、付款方式明細）。
- 寫 `booking_email_log`。
- 冪等：若同一 `orderId` 已有 `email_type='final_payment_received'` 且 `status='sent'` 的紀錄，直接回 `already_sent`（避免 webhook 重送）。

### B. 修改 `send-booking-confirmation`
- 成功/失敗都寫一筆 `booking_email_log`（`email_type='booking_confirmation'`），沿用呼叫端傳入的 `trigger_source` 與 `triggered_by`。

### C. 修改 `tappay-notify`
- 現有邏輯：只在「未付 → 首次付款」寄訂房確認信。
- 新增：當 `previousStatus ∈ {deposit_paid, partial}` 且 `newPaymentStatus === 'paid'` 時，呼叫 `send-final-payment-received`（trigger_source=`auto_final_payment`）。
- 同步在 `process-linepay-payment` 加入相同判斷（若也會在該檔案完成狀態轉換）。

### D. 新增 `admin-resend-booking-email`（`verify_jwt=true`）
- Input: `orderId`
- 驗證呼叫者：`admin`/`super_admin` 或該訂單所屬 accommodation 的 staff（沿用 `_shared/authz.ts`）。
- 呼叫 `sendBookingConfirmationByOrderId`，`trigger_source='manual_resend'`, `triggered_by=user.id`。
- 不改任何訂單欄位、不影響付款狀態。

---

## 三、前端

### `src/pages/OrderDetail.tsx`（或子 Card 元件）
新增「通知與付款記錄」區塊：
1. **付款狀態變更記錄** 表格：時間、來源、`from → to`、當時已付金額、觸發者。
2. **通知信寄送記錄** 表格：時間、類型（訂房確認 / 尾款已收到）、收件人、狀態、觸發來源、Resend ID（若失敗顯示錯誤）。
3. **手動重送訂房確認通知** 按鈕：
   - 觸發前彈 confirm dialog（顯示將寄到哪個 email）。
   - 呼叫 `admin-resend-booking-email`。
   - 成功後 toast + refetch email log。
   - 依權限顯示：僅 admin/super_admin 或該 accommodation staff。

---

## 技術細節
- 現有 `send-booking-confirmation` 通用範本沿用；「尾款已收到」用新的 email 主旨與內容（強調本次繳清金額 + 累計已付 = 訂單總額），不改動舊模板。
- Migration 對兩張表都建立 `order_id` index，及必要 GRANT。
- Trigger 用 `SECURITY DEFINER` `search_path = public`，來源以 `current_setting('app.change_source', true)` 傳遞，否則預設 `system`。
- 冪等鎖：`booking_email_log` 對 `(order_id, email_type)` 建立部分唯一索引 `WHERE status='sent' AND email_type='final_payment_received'`，避免 webhook 重試導致重寄尾款信。

## 交付
- Migration 1 份（兩張表 + trigger + GRANT + RLS + index）。
- 新 Edge Functions：`send-final-payment-received`, `admin-resend-booking-email`。
- 修改：`send-booking-confirmation`, `tappay-notify`, `process-linepay-payment`（若需要）。
- 前端：`OrderDetail.tsx` 通知記錄 Card + 手動重送按鈕。
