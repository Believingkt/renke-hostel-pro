# 前台營收分析（revenueAccrual）技術說明書

> 文件性質：現況紀錄 + 決策說明。撰寫本文件時**未修改任何程式碼**。
> 對象：後續維護 `src/lib/revenueAccrual.ts` 與其呼叫頁面的同仁、以及需要決定「這兩個分析頁商業定義」的業務負責人。
> 最後更新：2026-08-02

---

## 1. 現況設計

### 1.1 `src/lib/revenueAccrual.ts`

前端共用的「營收分攤（nightly accrual）」工具，口徑如下：

- **逐夜分攤**：`final_price / nights`，每一夜的金額歸屬到該夜「開始」的那個日曆日。
- **排除規則**（`isRevenueOrder()`）：

```ts
export const REVENUE_EXCLUDED_STATUSES = new Set(['cancelled']);
export const REVENUE_EXCLUDED_SOURCES  = new Set(['kol']);
```

即**只排除兩種情況**：

| 條件 | 說明 |
| --- | --- |
| `order_status === 'cancelled'` | 取消訂單 |
| `order_source === 'kol'` | 互惠／招待，不實際收款 |

其餘狀態（`pending`、`hold`、`confirmed`、`checked_out`…）與其餘來源（OTA、業主自帶、保留單、官方使用…）**全部計入**。

> 這是全系統中**最寬鬆**的排除邏輯：不讀 `owner_direct`，不讀 `owner_settlement_pricing_rules.exempt_order_sources`，也不處理幣別（非台幣訂單的 `final_price` 為原幣數字，會被當台幣直接加總）。

主要匯出：`isRevenueOrder`、`orderNights`、`accrueOrderNightlyShares`、`inRangeNightFraction`、`totalAccruedRevenue`、`accrueOrderAmount`。不變量測試位於 `src/lib/revenueAccrual.test.ts`。

### 1.2 呼叫者

| 檔案 | 用途 |
| --- | --- |
| `OccupancyRevenueTable.tsx` | 住房率／營收總覽表（每日、每月彙總） |
| `OrderSourceAnalyticsTab.tsx` | 訂單來源分析（各來源營收佔比與趨勢） |

兩者皆為**純前端瀏覽器程式**。`_shared/ownerPricingRule.ts`、`_shared/addonTotal.ts` 為 Deno Edge Function 的共用模組（`supabase/functions/_shared/`），**不在前端 build 的 module graph 內，無法直接 import**。這是目前兩份邏輯分開維護的直接技術原因。

---

## 2. 與正式排除規則的差異

### 2.1 正式規則：`buildExemptResolver()`

`supabase/functions/_shared/ownerPricingRule.ts` 提供的判斷器，被 `create-commission-snapshots`（`closer_commission_snapshots`）、`calculate-scout-payout`、`preview-closer-commission`、`push-ragic-revenue` 使用，並與 `src/lib/ownerSettlement.ts`（業主月結）同一套口徑：

```
isExempt(order) = order.owner_direct === true
                  OR order.order_source ∈ exempt_order_sources(該館別、該月生效版本)
```

`exempt_order_sources` 來源：`owner_settlement_pricing_rules`（append-only、依 `effective_from` 取當月生效版本），舊資料 fallback 至 `system_settings.owner_settlement_config[:accId]`。**由 AM 於後台可設定**，不是硬寫清單。

### 2.2 三套邏輯並存

| 邏輯 | 位置 | 排除條件 | 消費者 |
| --- | --- | --- | --- |
| A. 正式 | `_shared/ownerPricingRule.ts` | `cancelled` + `owner_direct` + DB `exempt_order_sources` | 佣金快照、星探發放、業主月結、Ragic（已於 2026-08 收斂） |
| B. 前端分析 | `src/lib/revenueAccrual.ts` | `cancelled` + `kol` | `OccupancyRevenueTable`、`OrderSourceAnalyticsTab` |

（歷史上另有 C：`push-ragic-revenue` 內硬寫的 `isExcludedSource`，已於 2026-08-02 移除並改用 A。）

### 2.3 2026 年 6 月實測差異

以 2026-06 全館訂單為樣本：

| 項目 | 數值 |
| --- | --- |
| 該月訂單總筆數 | **167 筆** |
| A 與 B 判斷不一致的訂單 | **11 筆** |
| 對應營收差異 | **約 NT$ 24,618** |

不一致的成因集中在兩類：

1. `owner_direct = true` 的業主自帶訂單 —— A 排除、B 計入（B 完全不讀此欄位）。
2. AM 在 `exempt_order_sources` 設定的來源（保留單、官方使用、部分 OTA 等）—— A 排除、B 計入。

反向情況（B 排除、A 計入）僅可能發生在 `kol` 未被列入某館 `exempt_order_sources` 時；實測期間天送館別即屬此情形。

### 2.4 結論：三個「營收」數字可能不同

同一個月份，以下三處顯示的營收**本來就可能是三個不同的數字**：

| 畫面／系統 | 排除邏輯 | 額外差異 |
| --- | --- | --- |
| 前端分析頁（總覽／來源分析） | B（寬鬆） | 不處理幣別、不扣加購 |
| Ragic 營收推送 | A | 已收斂為 DB 驅動 |
| 業主月結 | A | 另扣加購／增值服務、非台幣不抽成 |

差異**不是 bug**，是三套口徑各自的定義結果。任何對帳前，請先確認對的是哪一個口徑。

---

## 3. 該不該改？這是商業定義問題

### 3.1 需要改的理由

若這兩個分析頁的用途是「反映**可抽佣／可對帳的實際營收**」：

- 使用者（老闆、AM、財務）會拿這裡的數字去跟業主月結、Ragic、佣金發放單對帳，對不上就會被視為系統算錯。
- 業主自帶與保留單本質上不是平台業績，計入會系統性高估。
- 這種情況下應改為採用 `exempt_order_sources` + `owner_direct` 的排除規則。

### 3.2 不需要改的理由

若這兩個分析頁的設計目的本來就是「看**全通路總業績**」：

- 「訂單來源分析」的價值恰恰在於看到 OTA、業主自帶、官方使用等**所有**來源的佔比與趨勢；把可抽佣以外的來源直接排除，等於讓這張圖失去分析意義（OTA 佔比會直接消失）。
- 住房率／營收總覽若要與住房率分母（實際被佔用的房夜）一致，也應計入所有實際入住的訂單，否則營收與住房率會脫鉤。
- 這種情況下**目前的寬鬆排除才是正確設計**，不應與 Ragic 口徑綁定。

### 3.3 明確結論

> **這是「這兩個頁面的商業定義是什麼」的決策問題，不是技術對錯問題。**
> 在業務負責人明確定義用途之前，不建議工程端逕行修改 `isRevenueOrder()`——任一方向的改動都會讓另一群使用者看到「數字突然變了」。

---

## 4. 若決定要改：技術建議做法

### 4.1 讓排除清單改為 DB 驅動（參數化，不寫死）

前端無法 import Deno 共用模組，但可以查同一份資料來源：

1. 新增一支 hook，例如 `useExemptOrderSources(accommodationIds, monthStart)`：
   - 以 React Query 查 `owner_settlement_pricing_rules`（`accommodation_id in (...)`，取 `effective_from <= monthStart` 的最新版本），
   - fallback 查 `system_settings`（key：`owner_settlement_config` 與 `owner_settlement_config:<accId>`），
   - 快取（`staleTime` 建議 5–10 分鐘），避免每次切月都重查。
2. 將 `revenueAccrual.ts` 的排除改為**接受參數**而非常數：

```ts
export interface RevenueFilterOptions {
  excludedStatuses?: ReadonlySet<string>;
  /** key: accommodation_id -> 該館生效的 exempt_order_sources */
  exemptSourcesByAcc?: Map<string, ReadonlySet<string>>;
  respectOwnerDirect?: boolean;
}

export function isRevenueOrder(o: RevenueOrder, opts?: RevenueFilterOptions): boolean
```

   - 不傳 `opts` 時維持現行行為（向後相容，既有測試不動）。
   - `accrueOrderNightlyShares` / `totalAccruedRevenue` / `inRangeNightFraction` / `accrueOrderAmount` 同步加上可選的 `opts` 透傳。
   - `RevenueOrder` 需擴充 `accommodation_id`、`owner_direct`、`order_date` 欄位，且呼叫端的 `select` 要一併補齊。
3. **不要**在前端另寫一份硬編 exempt 清單——那正是本次要消除的漂移來源。若日後 Deno/前端可共用（例如把純函式抽到 `src/lib/` 再由 Edge Function 以相對路徑 import），應優先走共用路徑。

### 4.2 若要同時呈現兩個數字

較安全、也較符合實務的折衷：**兩個都顯示，不做二選一**。

- **總覽表（`OccupancyRevenueTable`）**：營收欄拆成「總業績」與「可抽佣營收」兩欄（或主數字 + 下方小字副數字），並在表頭加 tooltip 說明兩者定義差異。加一個全域切換（Segmented control：`全通路業績 / 可抽佣營收`）控制圖表與匯出採用哪一個口徑，預設「全通路業績」以維持現行行為。
- **來源分析（`OrderSourceAnalyticsTab`）**：維持以「全通路業績」計算佔比（否則圖失去意義），但在被 `exempt_order_sources` 命中的來源列上加註標記（例如灰色 badge「不計抽佣」），並於表尾同時列出「合計 / 其中可抽佣」兩個數字。
- 匯出（CSV／PDF）比照畫面同時輸出兩欄，避免下載後無法判斷是哪個口徑。
- 任一數字旁務必標明口徑來源，例如「可抽佣營收（同業主月結口徑）」，讓對帳者一眼知道該跟哪個系統比。

---

## 附錄：相關檔案索引

| 檔案 | 角色 |
| --- | --- |
| `src/lib/revenueAccrual.ts` | 本文件主題，前端營收分攤與排除邏輯 |
| `src/lib/revenueAccrual.test.ts` | 現行口徑的不變量測試 |
| `src/components/.../OccupancyRevenueTable.tsx` | 住房率／營收總覽表 |
| `src/components/.../OrderSourceAnalyticsTab.tsx` | 訂單來源分析 |
| `supabase/functions/_shared/ownerPricingRule.ts` | 正式 exempt 判斷（`buildExemptResolver`） |
| `supabase/functions/_shared/addonTotal.ts` | 加購扣除共用函式 |
| `supabase/functions/create-commission-snapshots/index.ts` | 正式佣金快照，口徑基準 |
| `supabase/functions/push-ragic-revenue/index.ts` | Ragic 營收推送（已收斂至共用邏輯） |
| `src/lib/ownerSettlement.ts` | 業主月結前端計算 |
| `docs/KOL_API_STATS_SPEC.md` | 同性質文件，`/stats` 端點計算口徑 |
