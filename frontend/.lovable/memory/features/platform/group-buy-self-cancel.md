---
name: Group Buy Self Cancellation
description: 團購旅客自助取消三路分流（未收款直接取消／信用卡自動退刷／ATM 已收款人工），退款一律依政策級距
type: feature
---

分流由 `_shared/groupBuySelfCancel.ts::classifyGroupBuySelfCancel()` 判定，SoT = orders 該筆付款欄位（禁止用 campaign 設定回推）：

- `direct_cancel`：未收款（paid_amount<=0）→ 立即取消、釋放庫存、隱藏 VA，信件附「請勿再轉帳」。
- `card_auto_refund`：payment_provider=tappay 且 isCardPaidOrder 且仍有可退餘額 → refund-first 自動原卡退刷後才 update orders。
- `manual_review`：ATM／銀行匯款「已收款」→ 維持現行後台人工退款審核（銀行退匯無法自動化）。

退款金額：**依 quoteCancellation() 級距**（非全額），並取 min(可退餘額, 政策金額)；`requiresManualReview = true` 一律降級 manual_review，絕不自動退款。

取消寫入帶併發保護：`.eq("payment_status", 原值).neq("order_status","cancelled")`，0 rows → 回 409 請重查。paid_amount 永不歸零。
入口：`group-buy-order-lookup` action=`request_cancel`；回應 `cancelled:true` 或 `cancelRequested:true`；lookup 另回 `selfCancel.mode` 供前台文案。
