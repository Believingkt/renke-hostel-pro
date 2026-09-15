# 館別合作期間（可暫停／重啟）＋ 成交組在職均分 ＋ 獎金口徑切換入住營收

## 目標

1. 用「合作期間分段」取代單一 `partnership_start_date`，支援合作 → 暫停 → 重啟。
2. 旅行日系列改為資料驅動（`bonus_policy = 'none'`），移除字串比對特例。
3. 成交組績效獎金均分分母改為「資料月在職人數」，支援離職日設定。
4. 抽成類獎金基準口徑由 `order_meta.team_commission_price` 評估切換至「業主月結本月入住營收」。

### 整體結構整合目標（每次獎金改動都必須遵守）

- **說明同步**：任何獎金邏輯／規則異動，`team/commission` 的「結算規則說明」Tab 內容必須在同一次改動內同步更新，不得落後於程式。
- **全鏈路檢視**：新增或修改任一項獎金邏輯時，需逐一檢視所有顯示該獎金的位置是否需一併調整，至少涵蓋：
  - `TeamHome`（試算卡片、館別明細 Drawer）
  - `TeamCommission` 發放管理 Tab（快照、明細 Drawer、補差分類）
  - 業績統計 Tab（成交組／AM／KOL／星探各自的統計視圖）
  - `BonusSettingsTab` 獎金費率／金額設定卡片與其說明文字
  - edge function 快照產生器（`create-team-bonus-snapshots`、`create-commission-snapshots`、`calculate-scout-payout`）
- **單一真相來源**：計算邏輯一律抽到 `src/lib/` 共用純函式，前端與 edge function 必須鏡射同一份規則，禁止各處各自實作。
- **交付檢核**：改動完成後需比對 TeamHome 試算與發放管理實付金額一致，並確認說明 Tab 描述與實際計算相符。


---

## 一、資料模型

### 1. 合作期間表

```text
accommodation_partnership_periods
  id              uuid pk
  accommodation_id uuid  -> accommodation_info
  start_date      date    not null
  end_date        date    null      -- null = 持續中
  bonus_policy    text    not null  -- 'full' | 'none'
  note            text
  created_at / updated_at
```

規則：
- 同館期間不得重疊（以觸發器驗證，不用 CHECK）。
- 採計條件：訂單 `order_date` 落在某段 period 且該段 `bonus_policy = 'full'`。
- 沒有任何 period 的館別 → 不計入任何團隊獎金（維持現行 gate 語意）。

回填：
- 四館（森山寫照 2026-01-06、哈庫納馬塔塔 2026-04-23、淞湘卉館 2026-05-17、雲岫海景渡假會館 2026-07-27）→ 各建一段 `start_date = P, end_date = null, policy='full'`。
- 旅行日 6 館 → 各建一段 `start_date = '2000-01-01', end_date = null, policy='none'`。
- 天送幸福和苑、奧莉薇雅生活小酒店 → 不建 period（待人工確認）。
- `accommodation_info.partnership_start_date` 保留為相容欄位（唯讀顯示），計算一律走新表。

### 2. 成交組在職狀態（含離職後尾款獎金判定）

```text
team_member_profiles 新增
  resigned_at date null   -- 離職生效日（該日起不列入均分分母）
```

均分分母 = 資料月月底時仍在職（`resigned_at is null or resigned_at > 資料月底`）且具 closer 角色的人數。

**離職生效日對「成交大師個人歸屬獎金」的影響（需另行判定，不可只看均分分母）**

切換到入住營收後，獎金歸屬時點是「入住月」，因此會出現離職者的訂單在離職後才入住的情況（例：陳豆豆 2026-08 離職，其成交的兩筆訂單 2026-09 入住）。規則：

- **個人歸屬型獎金**（成交大師本人成交的訂單抽成、`kol_commission` 等有明確歸屬人者）：以**訂單成交當下的歸屬人**為準，即使該人已離職，入住月仍照常產生快照並發放。是否實際發放由發放管理人工決定（快照標記 `is_resigned_recipient = true`，Drawer 顯示「離職後入住」提示）。
- **均分型獎金**（`closer_performance` 等按在職人數均分）：離職者自 `resigned_at` 起不進分母、也不分得，尾款不追溯。
- **總管型獎金**（`am_manager` / `closer_manager`）：依資料月當時的角色綁定，離職者不再綁定即不計。

因此 `resigned_at` 只影響「均分分母與總管綁定」，不影響已成交訂單的個人歸屬；兩者需在計算層明確分流，避免把離職者的入住月訂單整批漏發或重複均分。


### 3. GRANT / RLS

- 新表：`GRANT SELECT` 給 authenticated、`GRANT ALL` 給 service_role；寫入限 super_admin / admin。
- append-only 不強制（合作期間需要可修正），但異動寫 `audit_logs`。

---

## 二、計算邏輯改動

共用純函式集中在 `src/lib/teamBonusRevenue.ts`，edge function `create-team-bonus-snapshots` 需同步鏡射（兩份實作務必一致）。

1. 新增 `getPartnershipPeriods(client, accIds)` 取代 `getPartnershipStartDates`。
2. 新增 `resolveCountableRanges(periods, monthStart, monthEnd, whitelistFrom, marketingFrom)`：
   - 回傳該館在該資料月內可採計的日期區間陣列（可能多段）。
   - 每段下界 = `MAX(段 start, 月初, W)`；上界 = `MIN(段 end, 月底)`。
   - `policy='none'` 的段直接丟棄。
3. `getAccommodationRevenueByAcc` 改為依「區間」查詢，不再只用單一 `gte`。
4. `getVenueClosingAccommodations` 改為檢查資料月內是否存在 `policy='full'` 的覆蓋段。
5. 移除 `旅行日` 字串比對（前端與 edge function 各處）。

---

## 三、口徑切換範圍（本次唯一的口徑變更）

**只切換「一、團隊獎金」**，即 `teamcommission_bonus_rate_settings` 內的：

- `am_performance`（AM 績效獎金）
- `closer_performance`（成交組績效獎金）
- `am_manager`（AM 總管獎金）
- `closer_manager`（成交組總管獎金）
- `kol_commission`（網紅營銷抽成）
- `kol_monthly`（網紅營銷專利月費，倍率仍依館數）
- `venue_closing`（場域成交獎金，固定額不受口徑影響，僅採計館別判定沿用新期間邏輯）

**維持不變（不切換）**：

- 二、星探類：底薪、稀有度、折扣碼、團隊達標、月結發放（仍走 `kol_profiles` / `scout_*` 既有口徑）
- 三、加盟 / Starlink / 業主分潤拆帳 / 佣金記錄（`commission_records`、`split_records`、`franchise_*`）
- 倍率邏輯、期別（10 日／25 日）、快照只存基準金額的原則

### 切換後的基準定義

團隊獎金基準金額改為「業主月結 本月入住營收」口徑：

| 面向 | 現行（team_commission_price） | 切換後（入住營收） |
|---|---|---|
| 歸屬時點 | `order_date` 下訂日全額落月 | 入住日逐夜攤提（`revenueAccrual.ts`） |
| 跨月訂單 | 全額落在下訂月 | 依夜數拆分至各月 |
| 取消訂單 | 排除 + 事後補差扣回 | 自然不計入，停用扣回 |
| 增值服務 | 全部排除 | 改為只排除 `commission_excluded_addon_types` 指定類型（與月結一致） |
| 業主自帶 | 排除 | 沿用 `ownerExempt.ts` 判定 |
| 幣別 | 未換算 | 依匯率快照換算台幣 |

實例（哈庫納馬塔塔 2026-07）：673,225 → 582,555。

### 風險與處置

- **金額必然變動**：未付快照 resync 後會跳動；已付快照 append-only 不動。
- **不可同月切換**：設定切換生效資料月（建議 `2026-09`），該月之前一律走舊口徑，程式以資料月分流。
- **雙軌對帳期**：生效前一個月同時計算兩種口徑，明細 Drawer 並列顯示差額供人工確認。
- **取消扣回停用**：切換後 `closer_commission_adjustments` 的「取消扣回」對團隊獎金停止產生（避免重複扣），星探類不受影響。

### 實作落點

- 新增 `src/lib/teamBonusStayRevenue.ts`：以 `revenueAccrual.ts` + `ownerExempt.ts` + 匯率快照計算「各館資料月入住營收」，並套用合作期間可採計區間裁切。
- `getAccommodationRevenueByAcc` 依資料月分流：`< 切換月` 走舊查詢，`>= 切換月` 走新函式。
- edge function `create-team-bonus-snapshots` 鏡射同一分流邏輯（兩份實作務必一致）。

---

## 四、UI 改動

1. `BonusSettingsTab.tsx`：「合作生效日」欄位升級為「合作期間」管理（列出各段、可新增暫停段／重啟段），狀態徽章擴充為 已生效／暫停中／待生效／未設定。
2. 成交組卡片：顯示在職人數與均分分母，離職成員標記並可設定離職日。
3. 明細 Drawer：顯示「採計區間」與決定因素（合作期間 / 白名單 / 行銷費），並標示目前使用的口徑（下訂 / 入住）。
4. 雙軌對帳期間：Drawer 並列顯示新舊口徑金額與差額。

---

## 五、上線順序

1. Migration：建 `accommodation_partnership_periods` + 回填 + `resigned_at`。
2. 人工補齊天送、奧莉薇雅的合作期間（或確認不採計）。
3. 上線期間邏輯 + 移除旅行日字串特例（口徑不變）。
4. 上線成交組在職均分。
5. 指定切換生效資料月（建議 2026-09），先跑雙軌對帳，確認後才讓團隊獎金改吃入住營收。


## 技術備註

- 期別（10 日／25 日）、倍率邏輯完全不變。
- 快照仍只存基準金額，倍率在顯示層套用。
- 每次改動後需 resync 未付快照，並比對 TeamHome 與發放管理數字一致。
