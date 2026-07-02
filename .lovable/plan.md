# 訂單改期功能（方案 A + 方案 B）

同時實作兩條路徑，共用底層 Edge Function 與 UI Dialog，用權限/狀態判斷開放範圍。

## 一、共用底層：change-order-dates Edge Function

新建 `supabase/functions/change-order-dates/index.ts`，單一 transaction 處理所有改期邏輯。

輸入：`orderId`, `newCheckIn`, `newCheckOut`, `mode: 'kol' | 'general'`, `forceKolQuotaOverride?: boolean`

流程（皆在 DB transaction 內）：
1. **權限檢查**
   - `mode='kol'`：訂單須 `order_source='kol'` 且 `payment_status != 'paid'`。角色：任何能編輯訂單者。
   - `mode='general'`：非 KOL 單。角色：`super_admin` / `admin` / `manager`（沿用現有訂單編輯權限）。
2. **不變條件**：新日期 `check_out > check_in`；同一民宿。
3. **庫存 & 互斥重驗**：呼叫既有 `validate_order_rooms_inventory` 邏輯（排除自己 `_exclude_order_id`），沿用包棟互斥、strict package rule。
4. **價格重算**（僅 general 模式，且原本非手動訂單）：以新日期跑 `templatePriceResolver`；若價差 > 0 記錄於 audit，但**不自動改金額**（由業務決定是否再手動調）。KOL 互惠單金額通常 0，跳過。
5. **KOL 每月額度處理**（僅 mode='kol' 或 order_source='kol'）：
   - 舊月份 = 舊 check_in 的 yyyy-MM，新月份 = 新 check_in 的 yyyy-MM。
   - 若跨月：新月 `fetchKolQuotaStatus` 檢查；若 `willExceed` 且未帶 `forceKolQuotaOverride`，回 409 讓前端跳 `KolQuotaConfirmDialog`。
   - 舊月份自然透過 `count_kol_reciprocal_orders` 計算（訂單日期改了就自動不計入），不需手動退還。
   - 若強制覆寫：寫 `logKolQuotaOverride`（context='date_change'）。
6. **更新** `orders.check_in_date` / `check_out_date`。
7. **Audit log**：寫 `audit_logs`（`type='order_date_change'`, before/after 日期、操作者、mode、庫存重驗結果、KOL 額度變動）；同時記入 `notes` 顯示於 OrderAuditLogCard。
8. **LINE 通知**（可選）：若是 KOL 單改期，推播負責業務／KOL 群組（沿用 `notifyOrderAmountChanged` 樣板，改用「📅 訂單改期通知」文案）。

## 二、前端 UI

### 新增 `ChangeOrderDatesDialog.tsx`
- Props: `order`, `mode`, `open`, `onOpenChange`, `onSuccess`
- 內容：兩個 DateRangePicker（新入住 / 新退房）、顯示原日期 → 新日期 diff、備註欄。
- 呼叫 `change-order-dates` Edge Function。
- 409 KOL 超額 → 開啟 `KolQuotaConfirmDialog`，確認後帶 `forceKolQuotaOverride: true` 重試。
- 成功後 toast + `onSuccess()` 重新載入訂單。

### 入口按鈕
在 `OrderDetail.tsx` 標題列（日期區塊旁）新增「改期」按鈕：
- `order_source === 'kol' && payment_status !== 'paid'` → 顯示「改期」（mode='kol'），任何 editor 可見。
- 一般訂單 → 顯示「改期」（mode='general'），僅 admin/super_admin/manager 可見，且 `payment_status !== 'paid'`（已付款單改期需先做退款，暫不開放）。

## 三、資料庫

不需要新表；沿用：
- `audit_logs`（新 `details.type='order_date_change'`）。
- `kol_reciprocal_monthly_quotas` + `count_kol_reciprocal_orders`（無變動）。
- `validate_order_rooms_inventory` trigger 已支援 UPDATE 場景。

## 四、技術細節

- Edge function：`verify_jwt = true`（沿用其他訂單 fn 設定），內部用 service role 執行 DB 操作，操作者從 JWT 取。
- 全流程包在一個 `BEGIN; ... COMMIT;` （用 supabase-js 無法直接 tx，改為：先 RPC `change_order_dates_tx(...)` 建立 SECURITY DEFINER function 處理原子性；Edge Function 只做權限/KOL 額度檢查與通知）。
- RPC 內部負責：庫存重驗（呼叫既有 validator）、UPDATE orders、寫 audit_logs。若任一步失敗自動 rollback。
- 前端 KOL 額度檢查在 Edge Function 呼叫 RPC 之前先跑，避免 tx 內 side effect。

## 五、測試

- 手動 QA：
  - KOL 單同月改期（不觸發額度）。
  - KOL 單跨月改期到未滿月份。
  - KOL 單跨月到已滿月份 → 跳確認 → 強制覆寫。
  - 一般單改期到有衝突日期 → 應被 validator 擋下。
  - 一般單改期到有效日期 → 成功 + audit log 出現。
  - 已付款單 → 按鈕隱藏。

---

需要你確認一點才動手：
**一般訂單改期時的權限**要不要限 `super_admin` + `admin` + `manager`？還是所有能編輯訂單的角色（含 closer/scout 等）都給？
