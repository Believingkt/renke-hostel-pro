---
name: 跨通路庫存閘門（Phase H2）
description: orders BEFORE INSERT 觸發器以 gb_hold advisory lock 重驗庫存，涵蓋來源、豁免規則與付款後退款補償。
type: feature
---

# 跨通路庫存閘門（Phase H2）

## 資料庫
- `public.orders_website_inventory_gate()` + `trg_orders_website_inventory_gate`（BEFORE INSERT ON orders）。
- 鎖：`pg_advisory_xact_lock(hashtext('gb_hold:' || accommodation_id))`，與 `acquire_group_buy_payment_hold` **完全同一把鎖**，不可改 key。
- 鎖內只做一次 `get_adjusted_room_inventory_batch()`（已含團購 draft live hold 與包棟／綁定互斥），不足即 `RAISE EXCEPTION 'inventory_unavailable: ...'`（ERRCODE 23514）。

## 生效範圍
- 生效：`order_source = 'website'` 或 `points\_%`。
- 豁免：其他來源（manual／group_buy／owlting／hotelnabe…）、無 room_type_id、無日期、cancelled、以及 `auth.uid()` 為館別 staff／hotel_admin／admin（PMS 人工 override 保留）。
- Edge Function 用 service_role，`auth.uid()` 為 NULL → 一律受閘門保護。

## 應用層配合
- `validate-order-prices`：單間也做庫存複驗，並回傳 `inventoryUnavailable` 旗標供付款後呼叫端分流。
- `complete-3ds-booking`：庫存不足（驗證階段或 insert 被擋）→ `refundTapPay` 全額退款 + `reportBackendError`，回 409。
- `create-paid-order`：insert 失敗既有 refund 流程即涵蓋 23514。
- 前台 `BookingFlow` 與 3DS 皆將 `inventory_unavailable` 轉為「房型剛被訂走」的旅客文案。
