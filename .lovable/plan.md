## 目標
把目前散落在前端的硬編碼 ID（HAKUNA / SENSAN / STRICT_PACKAGE_ANY_BOOKED_IDS / MULTI_UNIT_HEATMAP_IDS）改為由資料庫驅動的全域設定，後台可調整、所有相關 UI 統一沿用。

## 資料庫
在 `accommodation_info` 新增兩個欄位（boolean，預設 false）：
- `bundled_lock_inventory`：整館綁定鎖房（任一房型滿即整館關閉，日曆只顯示「可訂/已滿」、不顯示比例）。
- `package_inventory_as_one`：包棟型房型的庫存顯示一律以 1 計（避免多棟綁定時被誤算房數）。

資料回填（依目前硬編碼語意）：
- 哈庫納、森山 → `bundled_lock_inventory = true`、`package_inventory_as_one = true`
- 奧莉薇雅、嚴格包棟清單其餘 ID → `package_inventory_as_one = true`

## 前端
`AvailabilityCalendarDialog.tsx`
- 載入民宿時讀取上述兩個旗標，取代 `HAKUNA_ACCOMMODATION_ID` / `SENSAN_ACCOMMODATION_ID` / `STRICT_PACKAGE_ANY_BOOKED_IDS` / `MULTI_UNIT_HEATMAP_IDS` 的硬編碼判斷。
- `isMultiUnit` = `!bundled_lock_inventory`
- 包棟容量計算用 `package_inventory_as_one` 判定是否以 1 計。
- 可訂日計算邏輯：`bundled_lock_inventory` 取代原哈庫／森山的整館判斷分支（任一包棟房型 booked out 即關閉）。

## HQ 後台
在民宿基本設定頁（HQ AccommodationDialog / 對應設定 Tab）加入兩個開關：
- 「整館綁定鎖房（任一房型滿即整館關閉）」
- 「包棟型庫存以 1 計（多棟綁定時不累加房數）」

附說明文字，方便非技術同事理解。

## 影響範圍
- 僅前端顯示與日曆判斷邏輯，不動既有訂房／價格計算。
- 既有民宿行為不變（透過回填維持原樣），但未來新增民宿可在後台一鍵套用。
