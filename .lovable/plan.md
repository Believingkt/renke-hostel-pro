# 課程分潤獎金（Course Profit Share）實作計畫

新增一條**完全獨立**的獎金線：貝瑞每月手動輸入課程結算盈餘 → 勾選參與夥伴並設定分潤 %（版本制）→ 次月 10 號發放。不接任何館別營收、快照、費率或增值服務口徑，因此不影響現有任何獎金。

## 一、資料表（新建 3 張，皆不動既有表）

1. `course_profit_months` — 每月課程盈餘
   - `month`（YYYY-MM-01，唯一）、`surplus_amount`、`note`、`status`（`draft` / `locked`）、建立者/時間、更新者/時間
   - **可編輯**：`status = 'draft'` 時盈餘金額可反覆修改；一旦該月獎金發放（`locked`）即禁止修改（DB trigger 擋，非只靠前端）
2. `course_profit_share_rates` — 分潤 % 版本制（append-only，比照成員底薪）
   - `user_id`、`percent`、`effective_from`、`note`、`created_by_email`、`created_at`
   - 取用規則：某月適用「`effective_from <= 該月 1 日` 的最新一筆」；`percent = 0` 或無版本＝不參與
3. `course_profit_payouts` — 每月每人結算列
   - `month`、`user_id`、`percent_snapshot`、`amount`、`status`（`pending` / `paid`）、`paid_at`
   - 由「產生結算」動作依當月盈餘 × 當月適用 % 寫入；發放後凍結

權限：三表 `GRANT` 給 `authenticated` / `service_role`；RLS —
- 寫入：`super_admin` / `admin`（HQ 管理者）
- 讀取：HQ 管理者與 `finance` 可讀全部；一般成員只能讀自己的 `course_profit_payouts` 列

## 二、HQ 設定頁：新增 Tab「課程分潤」

位置：`/hq/bonus-settings?tab=course-profit`（與「成員底薪」同層），`readOnly={!isHQAdmin}`（finance 唯讀）。

Tab 內兩區塊：

**A. 課程盈餘（月份總覽）**
- 一張表格**一次列出所有已填月份**（近月在上），欄位：月份、盈餘金額、備註、狀態、最後修改者/時間
- 每列在「未發放（draft）」時可**就地編輯金額與備註並儲存**；已發放的列鎖定並顯示鎖頭與發放日
- 表頭一列「新增月份」快速輸入

**B. 參與夥伴與分潤 %（版本制）**
- 完全比照 `TeamBaseSalaryTab` 的 UI 與行為：成員清單依角色分組、每人可新增「生效日 + %」版本、歷史版本不可改、未生效版本可刪、顯示建立者與時間
- 勾選參與＝新增一筆 % > 0 的版本；取消參與＝新增一筆 0% 版本（保留歷史）
- 底部顯示「本月分潤預覽」：各人 % 與試算金額、% 合計（超過 100% 顯示警示但不阻擋）

**C. 產生結算**
- 針對某月按「產生／重算結算」→ 寫入 `course_profit_payouts`；只要該月仍為 `draft` 就可重算
- 「標記已發放」→ 該月轉 `locked`，payout 轉 `paid`，之後盈餘與結算皆不可改

## 三、TeamHome 卡片

在 `src/pages/team/TeamHome.tsx` 的 `cards.push(...)` 加法陣列新增一張「課程分潤」卡：
- 資料來源：`course_profit_payouts` 當期別（發放月＝資料月 + 1，10 號發放）該使用者的列
- 顯示：分潤 %、當月課程盈餘、分潤金額
- 無資料時比照現有規則不顯示（管理員預覽卡維持既有 0 元行為）

## 四、發放管理 Tab

`src/pages/team/TeamCommission.tsx`：
- `SourceItem` 新增來源 `course_profit_payouts`，`bonusTypeOf` 回 `course_profit`
- `SOURCE_LABEL` 加「課程分潤」
- 沿用既有發放列 UI 與已發放狀態寫入機制（`source_table + source_id + role_key`）

## 五、獎金加倍活動：明確排除

- `src/lib/bonusFormulas.ts` 新增 `course_profit` 項目（讓公式說明頁與發放管理可辨識）
- **加倍活動不得涵蓋此項**：
  - 在計算倍率的 `multOf` / `pickMultiplier` 呼叫端對 `course_profit` 固定回 `1`
  - `bonus_multiplier_settings` 的類型下拉選單過濾掉 `course_profit`（來源改為排除清單後的 registry）
  - `bonusSettingImpact.ts` 的 `bonus_multiplier.affects` 改為 `BONUS_FORMULAS.filter(f => !f.excludedFromMultiplier)`，並在 `course_profit` 標記 `excludedFromMultiplier: true`
- 加測試：斷言 `course_profit` 在任何加倍活動下倍率恆為 1

## 六、不會影響其他獎金的界線

不新增、不修改：`teamcommission_bonus_snapshots`、`teamcommission_bonus_rate_settings`、`venue_team_bonus_tier_rules`、`owner_settlement_pricing_rules`、館別營收口徑（`payout_basis` / 合作期間 / V3 增值服務排除）、`accommodation_commission_settings`。課程分潤只讀自己的三張新表。

## 七、驗證

- 新增 `src/test/course-profit-share.test.ts`：% 版本取用（生效日邊界）、金額計算、加倍恆為 1、locked 後禁止編輯
- 既有團隊獎金測試全數需維持通過（回歸確認未影響其他獎金）
