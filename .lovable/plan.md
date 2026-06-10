# 專案期間區段（Season Segments）

讓同一個「專案」可以包含多段日期範圍，每段有自己的平日/旺日/假日價格與房型 override，解決「6~9 月專案、7~8 月暑假價格不同」的需求。

## 目標 UX

新增/編輯專案時，原本的「有效期間 + 價格」區塊改成可摺疊的「**期間區段**」清單：

- 預設只有 1 段（行為與現在完全一樣，舊使用者無感）
- 按「+ 新增期間區段」可加更多段；每段是 Accordion，標題顯示「2026/06/01 ~ 2026/06/30 ‧ 平日 3,200 / 旺日 4,200 / 假日 5,200」
- 預設只展開最後一段，避免版面太長
- 每段可獨立設定：日期範圍、平日/旺日/假日 開關+價格、各房型 override、extra_dates、excluded_dates
- 段與段的日期不可重疊（前端 + DB 驗證）
- 段內欄位完全沿用既有 component，不重新設計

舊資料（單段）讀進來自動轉為「1 個 segment」呈現，零遷移成本。

## 資料模型

在 `pricing_templates` 新增一個欄位：

```
season_segments JSONB NOT NULL DEFAULT '[]'
```

每個 segment 結構：

```ts
{
  id: string,              // uuid，前端拖曳/key 用
  label?: string,          // 可選：「暑期」「平季」
  valid_from: 'YYYY-MM-DD',
  valid_until: 'YYYY-MM-DD',
  weekday_price: number | null,
  peak_price: number | null,
  weekend_price: number | null,
  weekday_enabled: boolean,
  peak_enabled: boolean,
  weekend_enabled: boolean,
  extra_dates: string[],
  excluded_dates: string[],
  room_overrides: RoomOverride[]   // 同現有結構
}
```

**向後相容策略**：
- `season_segments` 為空 → 解析器走目前的頂層欄位邏輯（不動）
- `season_segments` 有值 → 完全以 segments 為準，頂層的 `valid_from / valid_until / *_price / room_overrides / extra_dates / excluded_dates` 被忽略
- 寫入時仍把 segments 的 union（最早 valid_from、最晚 valid_until）回寫到頂層欄位，讓未升級的查詢（例如 OwlTing 對接、外部 API）仍能讀到合理範圍

## 程式變更（技術細節）

### 1. Migration
- `ALTER TABLE pricing_templates ADD COLUMN season_segments JSONB NOT NULL DEFAULT '[]'`
- 不轉移舊資料；舊 row segments=`[]` 即走 fallback

### 2. `src/utils/pricingTemplateHelpers.ts`
- 新增 `getSegments(template)` 回傳 segment 陣列
- 新增 `findSegmentForDate(template, dateStr)`：回傳該日落在哪個 segment（或 null）
- 改寫 `isTemplateActiveForDates`：有 segments 時，每個 date 都要找得到對應 segment 且不在該段 excluded_dates；沒有 segments 走原邏輯
- 改寫 `isTierSellable`：有 segments 時依日期取對應 segment 的開關 + room_override 開關
- 新增 `getRoomOverrideForDate(template, roomTypeId, dateStr)`：segments 模式下回該日該段的 override；否則回頂層 override

### 3. `src/utils/templatePriceResolver.ts`
- `resolveTemplatePricesForDates` 內：取 tier price 與 room_override 改走 `getRoomOverrideForDate` + segment-aware tier 價格

### 4. `src/components/PricingTemplateManager.tsx`
- `formData` 新增 `season_segments: Segment[]`
- 載入舊 template 時：若 `season_segments` 為空，自動包裝成 1 段（從頂層欄位生）
- 新增 `<SeasonSegmentsEditor>` 子元件：Accordion 列表 + 「新增區段」+「刪除」+ 日期重疊驗證
- 提交時：把 segments 寫入 `season_segments`，同時把 union 寫回頂層欄位（相容）
- 卡片列表顯示：若有多段，顯示「N 段期間：最早 ~ 最晚」；單段維持現狀

### 5. `src/pages/BookingFlow.tsx`
- 第 596-650 行的 inline 過濾改用 helpers 的 `isTemplateActiveForDates` + `isTierSellable`（已 segment-aware）

### 6. `src/pages/RoomPriceCalendar.tsx` + `src/components/BookingCalendarGrid.tsx`
- 不用大改：它們已經呼叫 `isTemplateActiveForDates` / `isTierSellable`，helpers 升級後自動生效
- `RoomPriceCalendar` 顯示房價的地方改呼叫 `getRoomOverrideForDate` 取對應段的 tier price

### 7. `pricing_template_applications` 表
- 不動，純審計表

## 驗證計畫

1. 舊 template（segments=[]）讀寫、計價、日曆顯示完全不變
2. 新建 1 段 template：行為等同舊單期專案
3. 新建 2 段 template（6 月、9 月 一段；7~8 月另一段）：
   - RoomPriceCalendar 每日顯示正確段的價格
   - 前台訂房選跨段日期 → 各夜套對應段價格
   - 後台 CreateOrderDialog 同上
   - 段內 excluded_dates 該日視為不可售
4. 段日期重疊時，前端 inline error + 後端 trigger 驗證拒絕

## 範圍外

- 不動 `pricing_template_applications` 的批量套用流程（之後若需要也讓它支援段，再另案）
- 不動 OwlTing CM 同步邏輯（它讀頂層 union，可正常運作）
- 不做 segment 拖曳排序（依日期自動排即可）
