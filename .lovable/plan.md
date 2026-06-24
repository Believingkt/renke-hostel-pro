# 方案 B：禮遇範本庫整合

把「民宿層預設禮遇」改造成「禮遇範本庫」，方案編輯時一鍵套用後仍可自由微調，前台永遠只讀方案自己的「附加說明」，徹底消除兩處設定可能衝突的問題。

## 使用流程（最終體驗）

1. 民宿層後台「禮遇範本庫」：可建立多組命名範本，例如「一泊二食」「純住宿」「包棟尊榮」。每組範本包含區塊標題與條列項目。
2. 方案編輯對話框「附加說明」區塊上方新增「📋 套用範本」按鈕：
   - 點開出現範本下拉清單
   - 選取後該範本所有條列項目會帶入「附加說明」，狀態預設為「包含」
   - 帶入後完全脫鉤，使用者可任意增刪改、不影響原範本
3. 前台 BookingVilla 完全不再讀取民宿層的禮遇設定，只看方案自己的 includes（沒填就不顯示禮遇區塊）。

## 變更內容

### 1. 資料庫
- `accommodation_info` 新增欄位 `villa_perk_templates jsonb default '[]'`。
- 結構：`[{ id, name, title, items: [{ text, enabled }] }]`。
- 一次性回填：把現有 `villa_default_perks` 內容自動轉成名為「預設」的單一範本，沒資料的民宿維持空陣列。
- 保留舊欄位 `villa_default_perks` 不刪除，避免影響其他可能讀取的位置；只是不再讀寫。

### 2. 後台 `src/pages/AdminPackages.tsx`
- 移除：原「方案預設禮遇」區塊、`defaultPerks` 自動關閉互斥邏輯、黃色警示橫幅、`perksAutoDisabled` state、Toast 自動關閉訊息。
- 新增：頂部「禮遇範本庫」卡片
  - 清單顯示所有範本（名稱、條列摘要）
  - 「新增範本」按鈕 → 開啟一個小編輯區（命名 + 區塊標題 + 條列項目，與原來編輯介面雷同）
  - 每個範本可編輯 / 刪除 / 重新命名
  - 一律有「儲存範本庫」按鈕（整批寫回 jsonb）
- 方案編輯對話框 `附加說明` 區塊上方加一行：
  - 「📋 套用範本」按鈕 + 範本下拉
  - 套用時把範本 items 轉成 `{ available: "yes", text, price_note: null }` 取代或附加到 `form.includes`（提供「取代 / 附加」兩個動作）
  - 若範本庫為空則隱藏此按鈕

### 3. 前台 `src/components/booking-villa/CapacityPriceLadder.tsx`
- 移除 `defaultPerks` prop 與其 fallback 區塊（lines 382–400 的 `items.length === 0` 分支）。
- 當方案沒有任何 includes 時，整段禮遇條列不顯示（但禮遇標題列、訂房規則仍依現有條件顯示）。

### 4. 前台 `src/pages/BookingVilla.tsx`
- 移除查詢 `villa_default_perks` 欄位與相關 state（lines 163、184、812 附近的 `defaultPerks` / `villaDefaultPerks`）。
- 不再傳 `defaultPerks` 給 `CapacityPriceLadder`。

## 為什麼這樣設計

- 「附加說明會因入住方案不同而變更」這個事實直接成為主要資料路徑，不需要 fallback 也不需要互斥開關。
- 範本只在「使用者明確套用」那一刻才寫進方案，之後完全脫鉤 → 改範本不會悄悄影響舊方案，符合一般 SaaS 後台直覺。
- 多組範本支援常見情境：同民宿有「含餐」「不含餐」「包棟」幾組標準禮遇可一鍵帶入。
- 前台邏輯被簡化成單一資料來源，bug 面變小。

## 風險與注意事項

- 既有民宿若已設過「方案預設禮遇」且依賴前台 fallback 顯示，遷移後若該方案沒填 includes 就不再出現禮遇 → 由一次性回填把舊內容轉成範本，並在後台範本庫卡片頂部加一行提示「請至各方案『附加說明』點『套用範本』完成轉移」。
- 舊欄位 `villa_default_perks` 保留不刪，下個版本再清理。
