## 目標
搜尋結果卡已顯示「含兒童加價 +NTxxx」，但點進民宿（`/booking/villa/:id`）後價格沒有把兒童加價算進去。需要讓 villa 頁的所有方案總價、底部 sticky 價格與搜尋結果一致包含兒童加價，並在價格旁顯示提示文案。

## 變更內容

1. **抓取兒童規則**  
   `src/hooks/use-accommodation-cache.tsx`：在 `accommodation_info` 的 `select(...)` 加入 `child_age_rules`，型別補進 `AccommodationInfo`，讓 villa 頁能讀到後台設定的兒童分齡加價規則。

2. **villa 頁計算兒童加價**  
   `src/pages/BookingVilla.tsx`：
   - 讀 URL `children` / `infants` / `toddlers`。
   - 用 `resolveChildRules(info.child_age_rules)` + `evaluateChildSelection(rules, {...}, nights)`（與搜尋頁 `BookingSearchResults.tsx` 相同 helper）算出 `childExtraTotal`。
   - 把 `childExtraTotal` 傳給 `CapacityPriceLadder`。
   - 底部 sticky 顯示的最低總價也加上 `childExtraTotal`。

3. **CapacityPriceLadder 顯示**  
   `src/components/booking-villa/CapacityPriceLadder.tsx`：
   - 新增 prop：`childExtraTotal?: number`（預設 0）。
   - `buildOption` 中：`totalPrice = tier.sale * nights + childExtraTotal`，`originalPrice = tier.original * nights + childExtraTotal`（與搜尋頁相同邏輯，保持折扣%不變）。
   - 在每張方案卡的總價下方加一行小字 `含兒童加價 +NT$X`（僅當 `childExtraTotal > 0`），樣式比照搜尋卡上的提示。

## 不更動
- 兒童加價的後台設定、計算函式（`src/lib/child-rules.ts`）。
- `BookingFlow` 結帳頁本身已正確計算兒童加價，不動。
- 包區方案的「不含兒童」標示、上限提醒等既有 UI 不動。

## 技術重點
- 與搜尋頁共用 `resolveChildRules` + `evaluateChildSelection`，邏輯一致，避免雙來源。
- 折扣百分比仍以 `(original-sale)/original` 計算，兒童加價同時加入兩端，避免假折扣。
- `childExtraTotal` 走 prop 注入，CapacityPriceLadder 無需感知 URL 與規則細節。
