---
name: Discount Code Scope Mode
description: 折扣碼適用範圍全館一律以「房價方案」判斷；後台可部分適用、前台單一方案成立才折。
type: feature
---

- 全部館別（含森山／雲岫／哈庫納）`accommodation_info.discount_scope_mode = 'pricing_template'`，之後建立的新訂單一律以房價方案判斷；既有訂單與 `applicable_room_types` 資料保留不動。
- 切換時已把舊三館折扣碼原本勾選的房型換算成對應房價方案（未勾選房型＝全部方案），避免舊折扣碼失效。
- `discount_codes.applicable_pricing_template_ids` (jsonb)：適用方案清單；未勾選任何方案＝不適用（嚴格）。
- `validate_discount_code(..., p_pricing_template_id)`：未傳方案 ID → 回「請先選擇房價方案」。
- 後台建立訂單（CreateOrderDialog）允許「部分適用」：逐組合驗證，只要一組適用即可套用，折扣基準只算適用組合的房費小計，其餘照原價；房型／方案變更會清除折扣。
- 前台（BookingFlow）一次結帳只有一個房型＋一個方案，方案未勾選就不折；變更房型／方案會自動取消已套用折扣需重新套用。
- UI：`src/components/discount/DiscountScopeSelector.tsx`；訂單方案 ID helper：`src/lib/discountScope.ts`。
