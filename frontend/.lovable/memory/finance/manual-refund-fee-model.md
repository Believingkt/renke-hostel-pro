---
name: Manual Refund Fee Model
description: 人工退款手續費（館別可設定）帳務模型：refunded_amount = 實退旅客、refund_fee_amount = 手續費、settled = 兩者相加；禁止寫死 30。
type: feature
---

# 人工退款手續費（Phase G2-ATM-FEE-IMPLEMENT V2）

## 設定來源（唯一）
- `booking_settings.manual_refund_fee_amount`（每館可不同，可為 0，預設 0）。
- 後台位置：總部 → 民宿設定 →「人工退款手續費」。
- **任何程式／文案都不得寫死 NT$30**。前台文案由 `refundFeeText(fee)` 產生；fee = 0 時不顯示手續費句子。

## 帳務模型
```
refunded_amount    = 實際匯回旅客的金額（payout）
refund_fee_amount  = 累計實際扣除的手續費（交易快照，不隨設定變動）
settledRefund      = refunded_amount + refund_fee_amount
remainingRefundable = paid_amount - settledRefund
```
- 後台輸入的「退款金額」= gross（自 paid_amount 沖銷的總額），系統再拆成 fee + payout。
- 退款狀態（refunded / partial_refunded）以 settledRefund 對比 paid_amount 判定。

## 適用範圍
- 只有人工銀行退款（銀行匯款／ATM）扣手續費。
- 信用卡 TapPay 原卡退刷一律 fee = 0，且信用卡文案不得出現匯款手續費。

## 唯一計算來源
- `supabase/functions/_shared/refundFee.ts`（splitRefundFee / settledRefund / remainingRefundableWithFee / loadManualRefundFee）
- `_shared/paymentAdapter.ts` 與 `src/lib/groupBuyPayment.ts` 的 remainingRefundable 皆已扣除 refund_fee_amount。
