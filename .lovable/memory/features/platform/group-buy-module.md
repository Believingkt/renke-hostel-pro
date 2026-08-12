---
name: Group Buy (網紅團購) Module
description: 網紅團購頁的路由、資料表、匯款對帳流程、72 小時逾期取消與分潤隔離規則。
type: feature
---

# 網紅團購（Group Buy）

## 路由
- 公開團購頁：`/g/:slug`（`GroupBuyCampaign.tsx`，anon 可讀 status='active' 活動與方案）
- 旅客訂單查詢／回報匯款：`/g/order/:orderNumber?`（`GroupBuyOrderLookup.tsx`，以「訂單編號 + 電話後四碼」驗證）
- 後台管理：`/admin/group-buy`（`AdminGroupBuy.tsx`，掛在「訂單資訊」群組，權限模組 `orders`）

## 資料表
`group_buy_campaigns` / `group_buy_campaign_packages` / `group_buy_bank_accounts` / `group_buy_commissions` / `group_buy_payment_events`。
訂單與活動的關聯是透過 `group_buy_commissions.order_id`（每筆團購訂單都會建一列）。

## Edge Functions
- `group-buy-create-order`：公開端點。server 端重算價格（團購價 × 晚數 × 間數），下訂前 + 下訂後雙重庫存驗證（`get_adjusted_room_inventory_batch`，含包棟互斥），超賣自動取消。
- `group-buy-order-lookup`：查詢 + `report_transfer`（旅客「我已完成匯款」，只能回報一次）。
- `group-buy-confirm-deposit`：民宿端確認收款（super_admin 或該館 hotel_admin），寫入 `admin_confirmed` 事件並寄確認信。
- `group-buy-expire-orders`：pg_cron `group-buy-expire-orders-hourly`（每小時 :05）。逾期以 **建單時間 + payment_deadline_hours（預設 72h）** 固定計算。

## 規則
- 三種信件在 `_shared/groupBuyEmail.ts`：訂房＋匯款資訊 / 已收到訂金 / 逾期取消。走 Resend gateway，寄信失敗不影響主流程。
- 訂單一律 `order_source = 'group_buy'`；`calc_team_commission_price` 對此來源回傳 0，**不進既有團隊／星探分潤**，團購分潤只記在 `group_buy_commissions`。
- 匯款帳戶「各活動各自設定」，不公開讀取（僅由 Edge Function 於信件與訂單查詢頁提供）。
- 訂金比例、匯款期限、分潤比例都在活動層設定。

## 口徑切換與稽核
- `src/lib/groupBuyCaliber.ts`：`GroupBuyMode = exclude | only | include`，**預設 exclude（不混算）**。
  營運分析「訂單來源分析」與業主月結頁都有切換鈕，並固定顯示「團購／非團購」對照表（兩組永遠各自獨立計算，不受切換影響）。
- 狀態流轉稽核全部寫入 `group_buy_payment_events`：`order_created`（建單，由 `group-buy-create-order` 寫入）、
  `guest_reported`（旅客回報已匯款）、`admin_confirmed`（後台確認收訂金）、`expired`（逾期取消）。
  後台 `/admin/group-buy` 訂單列可開「稽核紀錄」時間軸（時間／操作者／金額／末五碼／備註）。
- 自動化情境測試：`src/lib/__tests__/groupBuyIsolation.test.ts`（口徑分流不重複不遺漏、庫存雙向共用、包棟互斥、下訂前後雙重驗證）。
