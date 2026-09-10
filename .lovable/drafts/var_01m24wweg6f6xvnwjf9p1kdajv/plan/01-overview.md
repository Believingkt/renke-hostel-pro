# 做法 B 評估：把「這次要送哪些欄位」抽成可測試的純函式

（唯讀評估，未施工、未部署、未 Publish）

## 現況盤點（重新讀取現正部署的程式碼）

- 引用 `update_order_with_context` 的檔案：**26 個**（含 `_shared/orderContext.ts` 這支共用包裝本身）。
- 實際「組裝 patch」的呼叫點：**約 28 處**（有些檔案一支函式內有成功／失敗兩個 patch，`member-order-manage` 一支就有 5 處）。
- 另外 4 支 RPC 的前端呼叫點：`update_order_fields_v1`（`OrderDetail.tsx`、`OrderPriceEditDialog`、`OrderStatusDialog`、`PaymentStatusDialog`、`OrderSourceDialog`、`DealDateEditDialog`、`OrderManualReviewCard`、`ImportOrdersDialog`）、`update_paid_order_discount_v2`／`update_paid_order_addons_v3`（`paidDiscountEdit.ts`、`paidAddonEdit.ts`、兩個對話框）、`sync_order_rooms_v1`（`OrderDetail.tsx`、`owltingAutoOrder.ts`）。

## 目前 patch 是怎麼寫的（決定了工作量）

兩種型態：

- **A 型（好抽）**：patch 是一個獨立的物件字面值，欄位固定或只受幾個布林條件影響。例：`charge-deposit`、`refund-deposit`、`bind-deposit-card`、`owlting-cleanup-stale-pending`、`owlting-selfpush-link`、`tappay-sync-refund`。
- **B 型（要小心）**：patch 夾在一長串 await（退款結果、報價試算、備註串接）之間，欄位還會靠 `...(cond ? {...} : {})` 展開。例：`member-order-manage`、`cancel-order-with-refund`、`tappayWebhookProcessor`、`owltingAutoOrder`、`owlting-fillup-submit`。

B 型不能整段搬走，正確做法是：**保留原本所有 await 與判斷不動，只把「最後那個物件字面值」原封不動搬進一個純函式**，輸入是已經算好的那些值（`refunded`、`chargedFee`、`refundOutcome`、`noteText`…），輸出就是同一個物件。
