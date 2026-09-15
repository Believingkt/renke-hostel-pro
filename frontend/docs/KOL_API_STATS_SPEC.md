# KOL API `/stats` 端點技術說明書

> 文件性質：現況紀錄 + 修正規格。撰寫本文件時**未修改任何程式碼**。
> 對象：後續維護 `supabase/functions/kol-api/index.ts` 的同仁。
> 最後更新：2026-08-02

---

## 1. API 基本資訊

### 1.1 kol-api 是什麼

`supabase/functions/kol-api/index.ts` 是一個**對外公開的 Edge Function**（`verify_jwt = false`，見 `supabase/config.toml`）。
用途：讓 KOL 本人或其自動化工具（試算表、Zapier、自架腳本等）用「**折扣碼 + API Key**」查詢自己名下的訂單與預估佣金，不需要登入後台。

主要端點：

| 路徑 | 用途 |
| --- | --- |
| `/kol-api/orders?code=YOUR_CODE` | 查詢該折扣碼帶來的訂單清單 |
| `/kol-api/stats?code=YOUR_CODE` | 查詢彙總統計與預估佣金（本文件主題） |
| `/kol-api/commission?code=YOUR_CODE` | 查詢佣金相關資訊 |

### 1.2 認證方式

- 呼叫端需同時提供：
  - **折扣碼**：query string `?code=XXXX`（內部會 `toUpperCase()` 後比對）
  - **API Key**：HTTP header `x-api-key`
- 驗證邏輯：將傳入的 API Key 以 SHA-256 雜湊後，比對 `discount_code_secrets.api_key_hash`。**資料庫不存明碼**。
- Rate limit（記憶體內計數，per-instance）：

| 限制 | 數值 | 視窗 |
| --- | --- | --- |
| 每個 API Key | 100 次 | 1 小時 |
| 每個折扣碼 | 10 次 | 1 小時 |
| 連續驗證失敗鎖定 | 5 次失敗 | 鎖定該折扣碼 |

  - 折扣碼層級的限制是為了防止**折扣碼列舉攻擊**（enumeration）。
  - 回應會帶 rate limit headers。

### 1.3 沒有對應的內部前端頁面

**重要**：專案內**沒有任何前端頁面實際呼叫這個 API**。

- `KolApiDocs.tsx`、`KolDiscount.tsx` 僅為**對外文件／說明頁**，畫面上展示的是 `curl` / JS 範例程式碼字串，並非真實請求。
- 因此修改此 API 不會直接造成內部畫面壞掉，但**會直接影響外部 KOL 串接**。這點與一般內部 Edge Function 不同，改動風險評估要以「外部 API 破壞性變更」的標準看待。

---

## 2. `/stats` 端點現況邏輯（有問題，待修正）

### 2.1 目前資料來源

```ts
supabase
  .from('orders')
  .select('total_price, discount_amount, final_price, order_status, payment_status')
  .eq('discount_code', discountCode.toUpperCase());
```

### 2.2 目前計算公式

```
confirmedOrders      = count(order_status <> 'cancelled')
totalRevenue         = Σ final_price            (排除 cancelled)
totalDiscount        = Σ discount_amount        (排除 cancelled)
commissionRate       = discount_codes.commission_rate   // 百分比，例如 5 = 5%
estimatedCommission  = round(totalRevenue × commissionRate / 100)
```

即：**`Σ final_price(排除 cancelled) × commission_rate / 100`**。

### 2.3 已確認的問題（全部都會讓金額偏高或口徑不一致）

| # | 問題 | 影響 |
| --- | --- | --- |
| 1 | **沒有扣加購項目** | `final_price` 內含 `custom_addon_details` 的加購金額（清潔費、加床、包場等）。正式試算是扣掉的，這裡沒扣 → 佣金高估。 |
| 2 | **沒有排除非台幣訂單** | 旅行日等館別有 JPY 訂單，`final_price` 存的是**原始幣別數字**。直接加總等於把日幣當台幣算 → 金額嚴重失真。正式規則是非台幣訂單**不計入獎金**。 |
| 3 | **沒有排除 exempt 訂單** | `owner_direct = true`（業主自帶）與 `order_source ∈ exempt_order_sources`（保留單、官方使用等）在正式試算是**免抽成**，這裡照算 → 虛增。 |
| 4 | **沒有採用人工覆蓋值** | `order_meta.team_commission_price` 是分潤基準金額的人工覆蓋欄位，正式快照優先採用；這裡完全沒讀 → 與實際發放金額不符。 |
| 5 | **沒有日期篩選** | 端點不接受任何日期參數，回傳的是**全期間累計**。KOL 無法查「某月」金額，也無法與月結／發放單對帳。 |

> 綜合結果：`/stats` 回傳的 `estimated_commission` **系統性高於**實際發放金額，且無法對帳。

---

## 3. 正確的計算規則（必須遵循）

目標：與正式試算路徑（`closer_commission_snapshots` / `create-commission-snapshots` / `calculate-scout-payout`）**完全一致**。

### 3.1 基準金額（commission base）計算順序

對每一筆納入計算的訂單：

1. 讀取 `order_meta.team_commission_price`。
   - **若有值（人工覆蓋）→ 直接採用這個數字，不再扣加購。**
   - 不論該值是從哪一個前端入口填寫的（`TeamOrders.tsx` 或 `OrderMetaDrawer.tsx`），一律視為權威值。
2. 若無值（`null`）或等於 `final_price`（代表未實際人工調整）→ 使用

   ```ts
   commissionBaseFromOrder(order)
   // = max(0, final_price − Σ custom_addon_details[].total)
   ```

3. 佣金金額 = `commission_base × commission_rate / 100`（`commission_rate` 為百分比整數）。

### 3.2 排除規則（三層，任一命中即整筆不計入）

1. **取消訂單**：`order_status = 'cancelled'`
2. **免抽成訂單**：`isExempt(order) === true`
   - `owner_direct = true`，或
   - `order_source` 屬於該館別當時生效版本的 `exempt_order_sources`
3. **非台幣訂單**：`currency_at_booking` 有值且 `<> 'TWD'`
   - `null` 視為台幣（migration 前的舊訂單），與 `create-commission-snapshots` 行為一致。

### 3.3 必須直接 import 的共用函式（不可另寫副本）

| 函式 | 檔案 | 用途 |
| --- | --- | --- |
| `commissionBaseFromOrder(order)` | `supabase/functions/_shared/addonTotal.ts` | `final_price − 加購總額`，下限 0 |
| `extractAddonTotal(custom_addon_details)` | `supabase/functions/_shared/addonTotal.ts` | 單獨取加購總額（做透明欄位時用） |
| `buildExemptResolver(client, accommodationIds)` → `isExempt(order)` | `supabase/functions/_shared/ownerPricingRule.ts` | 批次載入 `owner_settlement_pricing_rules` + legacy `system_settings`，回傳判斷器 |

**規範**：一律 `import` 上述共用模組。
**嚴禁**在 `kol-api/index.ts` 內另外寫一份同義公式或硬編 exempt 清單——`create-commission-snapshots`、`calculate-scout-payout`、`preview-closer-commission`、`ownerSettlement.ts` 都已收斂到這組共用函式，另寫副本會造成**口徑漂移**，日後規則調整時只改一邊，爭議難以追溯。

`buildExemptResolver` 為**批次**設計：先蒐集這批訂單涉及的所有 `accommodation_id`，一次建立 resolver，之後逐筆判斷不再打 DB。

### 3.4 查詢欄位需求

現行 `select` 欄位不足，修正時至少需要：

```
id, accommodation_id, final_price, custom_addon_details,
order_status, order_date, currency_at_booking,
owner_direct, order_source, discount_amount, total_price
```

外加 `order_meta` 的 `order_id, team_commission_price, is_excluded`（以 `in('order_id', orderIds)` 批次撈取後建 Map）。

---

## 4. 修改時應同時注意的事項

### 4.1 對外破壞性：金額會全面調降

此 API 對外公開，金額修正後 KOL 看到的數字會**變小**。實測影響幅度：

- 整體約 **−2.25%**
- 個別折扣碼最高 **−10.2%**
- **exempt 訂單占比高的折扣碼，可能從「有金額」直接變成 0**

**建議**：上線前評估是否需主動通知受影響的 KOL／星探，並準備一段說明（「先前預估值未扣除加購與免抽成訂單，現已與正式發放口徑對齊」），避免被視為系統少算。

### 4.2 回應格式：加上透明欄位

不要只回一個總數。建議 `statistics` 內補上組成拆解，讓呼叫方能自行核對：

| 欄位 | 意義 |
| --- | --- |
| `gross_revenue` | 原始總額（Σ final_price，排除 cancelled）— 即現行 `total_revenue`，保留以維持相容 |
| `commission_base` | 各項排除與扣除後的實際抽成基礎 |
| `addon_excluded_total` | 因加購而被扣除的總額 |
| `exempt_orders_count` | 因 `isExempt()` 命中被排除的訂單數 |
| `non_twd_orders_count` | 因非台幣被排除的訂單數 |
| `manual_override_count` | 採用 `team_commission_price` 人工覆蓋值的訂單數 |
| `estimated_commission` | `commission_base × commission_rate / 100`（四捨五入） |

**相容性原則**：既有欄位（`total_orders`、`confirmed_orders`、`total_revenue`、`total_discount`、`estimated_commission`）**保留名稱不改**，只新增欄位。`estimated_commission` 的**數值**會變，這是刻意為之的修正。

### 4.3 分潤比例格式維持百分比

`commission_rate` 對外**維持百分比整數**（`5` 代表 5%）。
**不要**改成內部慣用的小數格式（`0.05`）——外部串接方已依百分比實作，改格式會直接讓對方金額差 100 倍。內部運算若需小數，請在函式內部轉換，不要影響回應 payload。

### 4.4 時間邊界一律 Asia/Taipei

若後續補上日期篩選（`start_date` / `end_date` 或 `month=YYYY-MM`）：

- 月份／日期邊界一律以 **Asia/Taipei** 牆上時間換算成 UTC 區間後再查詢（比照 `create-commission-snapshots` 的 `taipeiMidnightUtcISO()`）。
- 篩選基準欄位一律使用 **`orders.order_date`**（與正式快照對齊），**不要**用 `COALESCE(confirmed_at, order_date)` 或 `check_out_date`。

---

## 5. 已知但本次文件不涵蓋的相關問題（僅記錄）

- **`order_meta.team_commission_price` 稽核缺口**
  此人工覆蓋欄位目前有兩個編輯入口：
  - `OrderMetaDrawer.tsx` — 有寫入 `public.audit_logs`，保留前後值完整異動記錄。
  - `TeamOrders.tsx` — **未寫入 `audit_logs`**，直接 update，只保留最後一次狀態。

  此為既有稽核缺口，與本次 `kol-api` 金額修正**無直接關聯**，故不在本文件範圍內展開。但日後若發生佣金爭議需追溯「誰在何時把基準金額改成多少」，`TeamOrders.tsx` 路徑將無記錄可查，屆時可能需一併補齊。

---

## 附錄：相關檔案索引

| 檔案 | 角色 |
| --- | --- |
| `supabase/functions/kol-api/index.ts` | 本文件主題，`/stats` 實作 |
| `supabase/functions/_shared/addonTotal.ts` | 加購扣除共用函式 |
| `supabase/functions/_shared/ownerPricingRule.ts` | exempt 判斷共用函式 |
| `supabase/functions/create-commission-snapshots/index.ts` | 正式快照，計算口徑的參考基準 |
| `supabase/functions/calculate-scout-payout/index.ts` | 星探發放試算 |
| `src/lib/ownerSettlement.ts` | 業主月結前端計算（同一套口徑） |
| `src/pages/KolApiDocs.tsx` / `KolDiscount.tsx` | 對外文件頁（不實際呼叫 API） |
