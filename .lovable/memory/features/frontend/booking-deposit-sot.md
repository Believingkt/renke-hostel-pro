---
name: Booking Deposit SoT
description: 一般訂房「訂房訂金」以 orders.booking_deposit_amount/percentage 快照為準，付款摘要統一走 paymentSummary
type: feature
---

- 訂房訂金 SoT = `orders.booking_deposit_amount` / `booking_deposit_percentage`（下單當下快照，BookingFlow 寫入）。舊單才回退解析 notes。
- 絕不可用 `deposit_required_amount` 當付款金額，那是「入住押金 security deposit」。
- 會員中心 / ATM 完成頁 / 訂單確認信一律使用 `src/lib/paymentSummary.ts`（Deno 鏡像 `supabase/functions/_shared/paymentSummary.ts`）。
- ATM 訂房確認信改由 `tappay-atm-create` 在虛擬帳號建立成功後寄出（BookingFlow 不再對 ATM 立即寄信）。
- 訂房確認信押金提醒為純文字設定：`accommodation_info.email_show_security_deposit_notice / _title / _notice`（網站內容 → 訂房確認通知）。
