## 技術細節

### 資料庫（staged migration，接受草稿時才生效，全部為新增欄位）

`course_profit_months`
- `entry_mode text NOT NULL DEFAULT 'manual'`，CHECK in (`manual`,`percent`)
- 既有列一次性 `UPDATE ... SET entry_mode='percent'`（在同一支 migration 內，於 DEFAULT 之後）

`course_profit_payouts`
- `is_manual boolean NOT NULL DEFAULT false`
- `note text`、`updated_by uuid`
- `percent_snapshot` / `surplus_snapshot` 已有 DEFAULT 0，手動列填 0

權限與 RLS（目前只有 SELECT）
- `GRANT INSERT, UPDATE, DELETE ON public.course_profit_payouts TO authenticated;`
- 新增 INSERT / UPDATE / DELETE policy，條件：`public.is_team_salary_manager()`
  AND `NOT public.course_profit_month_locked(month)` AND `is_manual = true`
  （自動列仍只由 trigger 維護，人不可改）

計算 trigger
- `recalc_course_profit_payouts(_month)` 開頭加：該月 `entry_mode = 'manual'` → 直接 return，不刪不寫
- `fn_course_profit_rates_sync()` 略過 manual 月份
- 月份由 percent 切成 manual 時，清掉該月尚未發放的自動列；由 manual 切回 percent 時，清掉未發放的手動列後重算
- 既有「已發放列不動」與 `course_profit_month_locked` 邏輯完全不變

### 前端

`src/components/team/CourseProfitShareTab.tsx`
- 月份列新增「分配方式」切換（已發放者唯讀）
- 手動月份展開名單編輯區：成員下拉（沿用現有 `MemberRow` 與角色分組）、金額 Input、備註 Input、新增／刪除列、儲存
- 「帶入上個月名單」：新增手動月份時查上一個資料月的 payouts，複製 user_id 與 amount 為未儲存草稿；查無資料則空白名單
- 合計列：加總 vs `surplus_amount`，差額以提示文字呈現
- 手動月份隱藏百分比版本區塊與本月分潤預覽

`src/pages/team/TeamHome.tsx`
- 課程分潤卡：`is_manual` 為真時不顯示分潤 %，只顯示金額（其餘顯示規則不變）

### 明確不動

發放管理 Tab 的來源解析與標記流程、`commission_payout_marks`、獎金加倍排除（`course_profit` 恆為 1）、`push-ragic-revenue` 的課程收入（讀月盈餘）、其他任何獎金線的表與公式。

### 驗證

- 既有月份金額與名單前後比對一致（percent 模式回歸）
- 手動月份：新增／修改／刪除、帶入上月名單、合計提示、已發放鎖定四項實測
- 非管理者與 finance 無法寫入手動列
- tsgo 零錯誤；測試維持既有 23 個失敗基準
