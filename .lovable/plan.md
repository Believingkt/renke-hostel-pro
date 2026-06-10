## 目標

把「包棟內房間組成」從單一扁平清單，改成「每個包棟方案各自有一份內含房間清單」，並保留「顯示在預訂管理」開關。

## 資料結構

`room_types` 新增 `package_contents jsonb`（只對 `is_exclusive_package = true` 有效）：

```json
[
  { "id": "r1", "name": "雙人房", "count": 4, "visible_in_booking_grid": true },
  { "id": "r2", "name": "三人房", "count": 2, "visible_in_booking_grid": false }
]
```

- 純文字房名 + 間數 + 可見性，不串接 `room_types`
- `accommodation_info.exclusive_room_breakdown` 維持不動（舊三家 fallback、與「其他自訂房型」資料）

## UI（`ExclusivePackageSettings.tsx`）

「包棟內房間組成」改為每個 `is_exclusive_package` 房型一張卡：

```
[A區標準10人]  可容納 10 人
  雙人房   間數 [2]   [☑ 顯示在預訂管理]   [🗑]
  三人房   間數 [2]   [☐ 顯示在預訂管理]   [🗑]
  + 新增房間
```

- 每張卡內可自由新增「房名 + 間數 + 顯示開關」
- 移除「勾選整個房型 / 整列填一個 count」的舊樣式
- 「其他自訂房型」區塊保留不動

儲存時：把每張卡 rows 寫進對應 `room_types.package_contents`。

## 訂單側對應

- **`CreateOrderDialog.tsx` / `OrderDetail.tsx`** — 選擇包棟方案時，房間下拉/checklist 改讀該房型的 `package_contents`
- **`BookingCalendarGrid.tsx`** — 包棟方案 row 的備註氣泡顯示 `package_contents`；底下虛擬房型 row 改用 `package_contents` 中 `visible_in_booking_grid = true` 的項目（取代目前從 `exclusive_room_breakdown` 撈的邏輯）

## 不動

- 預訂管理頁的列表渲染規則本身（哪些 row 顯示 = `visible_in_booking_grid`）
- 「其他自訂房型」與其開關
- 舊三家（森山/哈庫納/奧莉維亞）fallback 行為

## 邊界

- 既有資料：第一次部署時各 package 的 `package_contents` 為 null → UI 顯示空清單，由使用者重新填寫；無自動遷移
