---
name: Discount Code Scope Mode
description: 折扣碼適用範圍依館別切換「房型」或「房價方案」判斷；森山/雲岫/哈庫納維持房型模式。
type: feature
---

- `accommodation_info.discount_scope_mode`：`room_type`（森山、雲岫、哈庫納，舊制不變）或 `pricing_template`（淞湘及其他／未來新館，預設）。
- `discount_codes.applicable_pricing_template_ids` (jsonb)：房價方案模式下的適用方案清單。
- `validate_discount_code(..., p_pricing_template_id)`：
  - 方案模式未勾選任何方案 → 不適用（嚴格）。
  - 未傳入方案 ID → 回「請先選擇房價方案」。
  - 房型模式維持「不勾選＝全部房型適用」。
- 前後台呼叫端皆須帶入方案 ID：BookingFlow、CreateOrderDialog、EditOrderDialog、OrderDetail、OrderPriceEditDialog、validate-order-prices Edge Function（`pricingTemplateId`）。訂單方案 ID 取自 `order_rooms.template_id`（helper：`src/lib/discountScope.ts`）。
- UI：`src/components/discount/DiscountScopeSelector.tsx` 依模式切換房型／房價方案勾選清單。
