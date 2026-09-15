---
name: Package Date Price Override
description: 方案單日價格覆寫 package_date_prices 的取價優先序、批次改價 UI 與同步範圍。
type: feature
---

# 方案日期價格（package_date_prices）

## 取價優先序（全站唯一）
1. `package_date_prices`（方案 × 日期覆寫價）
2. `accommodation_packages.tier_prices[tier]`（平日／週五日／週六）
3. `accommodation_packages.sale_price`

共用解析：`src/lib/packageDatePrice.ts`（`resolvePackagePriceForDate`，回傳 `source: override | tier | default`）。
伺服器端 `validate-order-prices` 使用同一順序，避免前後台不一致擋單。

## 已同步的路徑
- 前台訂房頁價格階梯 `BookingVilla`（依所選入住日套用）
- 結帳 `BookingFlow`（`getPackageNightlySale` / `getPackageNightlyOriginal`）
- Edge Function `validate-order-prices`

## 管理介面
`/admin/package-price-calendar`（側欄：房價庫存 → 方案日期價格）
- 列＝方案、欄＝當月日期；每格顯示有效價格 + 來源徽章（單日指定價／平日假日價／方案預設價）
- 單格點擊可改價或清除覆寫
- 「整列批次改」：多選方案 × 日期區間 × 日期條件（全部／平日／週五日／週六假日／自訂星期），可套用或清除

## 規則
- 庫存數量（available_rooms / is_available）仍只由「房價價格設定」`room_inventory_pricing` 決定，方案覆寫只影響價格。
- 房型 base 價與 room_inventory_pricing 保留不動（散客訂房、搜尋最低價、OTA 推送仍讀它）。
- 覆寫價優先權高於 tier 價（週六也吃覆寫價）。
- 同人數方案跨包棟同價：批次改價一次套用多方案即可。

## 用語（UI 顯示）
- override → 單日指定價、tier → 平日假日價、default → 方案預設價（不再用「覆寫價／時段價／預設價」）。

## 變更紀錄
`package_date_price_logs`（append-only，DB trigger 自動寫入 create/update/delete + 改前改後金額 + auth.uid()）。
UI：`/admin/package-price-calendar` 右上「變更紀錄」按鈕（`src/components/pricing/PackagePriceChangeLog.tsx`）。
