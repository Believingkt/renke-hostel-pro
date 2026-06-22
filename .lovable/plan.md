# 兒童分齡 + 加價/排除規則

## 目標

1. 前台搜尋列把「兒童」拆成 **嬰兒 / 幼兒 / 兒童** 三個年齡層，各自帶人數。
2. 後台新增 **民宿預設規則** 與 **方案層覆寫**：年齡定義、人數上限、超限加價或不接受。
3. 搜尋結果圖卡顯示兒童規則摘要；若搜尋條件超過上限：依設定 **加價** 或 **排除**。

---

## 1. 資料模型（migration）

### 1.1 `accommodation_info` 加入 `child_age_rules jsonb`（民宿預設）

```json
{
  "tiers": {
    "infant":  { "label": "嬰兒", "min_age": 0, "max_age": 2, "fee_per_night": 0,   "max_count": null, "allowed": true },
    "toddler": { "label": "幼兒", "min_age": 3, "max_age": 6, "fee_per_night": 500, "max_count": 2,    "allowed": true },
    "child":   { "label": "兒童", "min_age": 7, "max_age": 12,"fee_per_night": 800, "max_count": 2,    "allowed": true }
  },
  "note": "可選備註，例如 12 歲以上以成人計"
}
```

預設值在 migration 內以 `DEFAULT` 給上述 JSON，避免空值要處理。

### 1.2 `accommodation_packages` 加入 `child_age_rules_override jsonb NULL`

- 結構同上；`NULL` = 沿用民宿預設。
- 移除/保留：保留現有 `child_count_max`、`child_age_note` 不動（向後相容），但新規則為準。

### 1.3 一個共用 helper（前後台都會用）

`src/lib/child-rules.ts`：
- `resolveChildRules(accommodation, pkg?)`：回傳合併後 tiers。
- `evaluateChildSelection(rules, { infants, toddlers, children, nights })` → `{ exceeded: tier[], extraFee, blocked, breakdown }`。

---

## 2. 後台 UI

### 2.1 民宿預設（`AdminBookingSettings` 之類，找到 accommodation_info 編輯頁）
新增一段「兒童分齡規則」卡片，含三段 tier 的：
- 標籤（可改名）
- 年齡區間（min/max）
- 每晚加價（NT$，0 = 免費）
- 人數上限（空白 = 不限）
- 是否接受訂房（switch；關閉等同 max_count = 0 → 排除）
- 備註文字

### 2.2 方案覆寫（`AdminPackages` 編輯方案表單）
- 加 switch「使用民宿預設規則」
- 關閉時展開同上三段 tier，可獨立設定，存入 `child_age_rules_override`

---

## 3. 前台搜尋介面

### 3.1 `PortalSearchBar`、`EditSearchSheet`（民宿首頁與搜尋頁的調整搜尋條件）
- 把單一「兒童」列改為三列：嬰兒 / 幼兒 / 兒童（label 動態讀民宿規則）。
- 各自 +/- 計數，範圍對齊 tier。
- 用 URL params：`infants` / `toddlers` / `children`（保留 `children` 命名以相容舊連結）。

### 3.2 hooks 與 state
- `useSearchParams` 讀三個欄位。
- 將總人數 = adults + sum(tier counts，僅納入成人計的策略：依規則設定，預設 infants 不佔人數，其他佔）。先採簡單版：**全部都納入兒童總數，但不加入 adults**，下方加價/上限以 tier 單獨判斷。

---

## 4. 搜尋結果圖卡（`BookingSearchResults`）

每張卡片下方新增一行「兒童規則」摘要：

> 嬰兒 0–2 歲免費 · 幼兒 3–6 歲 +NT$500/晚 · 兒童 7–12 歲 +NT$800/晚（上限 2 位）

並依使用者搜尋值計算：
- 若任一 tier 超過上限 **且 `allowed=false` 或無加價方案**：圖卡標記「不符兒童人數條件」並淡化，或從結果濾掉（看 1.3 設定）。
- 若超出但仍允許加價：在價格旁顯示 `含兒童加價 +NTD X`。

實作方式：在現有 results 計算迴圈內呼叫 `evaluateChildSelection`，把 extraFee 疊加到顯示價，blocked 則 push 到「不符條件」list。

---

## 5. 訂房流程（`BookingFlow` / `BookingVilla`）

- 價格計算引擎讀取相同 helper，將 `extraFee * nights` 加到總價（顯示於明細表）。
- 後端 3DS 驗證 Edge Function 亦需同步計算（後續另開）；本次先做前台。

---

## 6. 影響檔案（預估）

- `supabase/migrations/<ts>_child_age_rules.sql`
- `src/lib/child-rules.ts`（新增）
- `src/integrations/supabase/types.ts`（自動）
- 後台：定位民宿設定與方案編輯檔案後加 UI
- 前台：`PortalSearchBar.tsx`、`booking-villa/EditSearchSheet.tsx`、`BookingSearchResults.tsx`、`BookingVilla.tsx`、`BookingFlow.tsx`

---

## 7. 範圍切分

建議分兩階段提交，避免一次過大：

**Phase A（本輪）**：DB migration + helper + 後台兩處 UI + 前台搜尋列 3 段欄位 + 搜尋結果圖卡顯示與排除/加價。

**Phase B（下一輪）**：訂房流程價格疊加、3DS 驗證、Edge Function、訂單 schema（infants/toddlers/children 拆分儲存）。

---

請確認：
1. Phase 切分是否 OK，先做 A？
2. 預設年齡區間 0–2 / 3–6 / 7–12 可以嗎？
3. 嬰兒預設「不佔人數」對嗎（純資訊性，不影響房型容量檢查）？