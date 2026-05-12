## 目標

讓哈庫、田璁、奧莉薇等非森山民宿，也能在訂房頁顯示森山風格的「包區方案卡」。每間民宿可在後台自行設定方案（人數、價格、適用日、附加說明），前台採 v2 橫向精緻卡片版面。

森山現有的硬編碼方案（`sensan-pricing.ts`）保持不動，本次只新增其他民宿的資料驅動版本。

## 資料庫

新增 `accommodation_packages` 表，欄位：

- `accommodation_id`（關聯民宿）
- `name`（方案名稱，例「悠活包區方案」）
- `guest_count` / `guest_count_max`（建議人數 / 上限）
- `original_price` / `sale_price`（原價 / 售價）
- `room_allocation`（房型分配文字，例「雙人房 x2、四人房 x1」）
- `applicable_tiers`（陣列：weekday / friday_sunday / weekend）
- `tags`（陣列：early_bird / best_value / 一泊二食 ...）
- `includes`（陣列：早餐 / WiFi / 加床等附加說明，每項含 `text` + `available: true|false|optional` + 可選 `price_note`）
- `display_order`、`enabled`

RLS：所有人可讀（公開訂房頁需要）；只有該民宿管理員可寫。

## 後台管理頁

在 PMS 側欄新增「包棟方案」項目（每民宿獨立），位置放在「房價庫存」之下。

- 列表顯示所有方案（拖曳排序、啟用切換、編輯、刪除）
- 編輯彈窗包含上述所有欄位
- 適用日 / 標籤 / 附加說明用多選與動態列表

## 前台訂房頁

在 `BookingAccommodation.tsx`（散客版訂房頁）：

- 新增 `usePackages(accommodationId)` hook 抓取啟用方案
- 若該民宿有 ≥1 個方案 → 顯示「包棟方案」區塊（v2 橫向卡片），**取代**原本的房型列表 / 不再顯示 base_price 加總
- 若無方案 → 維持現狀（房型 + 模板價）
- 卡片依日期過濾 `applicable_tiers`，篩出符合的方案
- 點「立即預訂」帶 `roomId`（從 room_allocation 解析或方案直接綁定主房型）+ 日期 / 人數導向 `/book`

## 技術細節

```
src/
  pages/BookingAccommodation.tsx            # 加入方案區塊條件渲染
  components/booking-villa/
    PackageOptionCard.tsx                    # 新元件：v2 橫向卡片
    PackageOptionList.tsx                    # 列表容器 + 日期過濾
  components/admin/
    AccommodationPackagesManager.tsx         # 後台列表
    AccommodationPackageDialog.tsx           # 編輯彈窗
  hooks/use-accommodation-packages.tsx       # 抓取 hook
```

新增頁面路由 `/admin/packages`，掛在 `AppSidebar` 的「住宿設定」群組。

## 範圍說明（不做的事）

- 森山現有 `CapacityPriceLadder` 不動，避免破壞已鎖定的森山邏輯
- 方案不影響庫存扣減邏輯（沿用既有 room_types 的庫存）
- 方案的「房型分配」第一版只做文字顯示，不自動拆房
- 每個方案綁定一個主要 `room_type_id` 用於下單時的庫存對應

## 交付順序

1. 建立 DB 表 + RLS
2. 後台管理頁 + 編輯彈窗（你可以先輸入哈庫的方案測試）
3. 前台 v2 卡片 + 訂房頁整合
4. 你驗收後再決定要不要把森山也遷移到這個資料驅動版本（可選）