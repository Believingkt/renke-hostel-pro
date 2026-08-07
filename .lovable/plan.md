# 館別合作期間（可暫停／重啟）＋ 成交組在職均分 ＋ 獎金口徑切換入住營收

## 目標

1. 用「合作期間分段」取代單一 `partnership_start_date`，支援合作 → 暫停 → 重啟。
2. 旅行日系列改為資料驅動（`bonus_policy = 'none'`），移除字串比對特例。
3. 成交組績效獎金均分分母改為「資料月在職人數」，支援離職日設定。
4. 抽成類獎金基準口徑由 `order_meta.team_commission_price` 評估切換至「業主月結本月入住營收」。

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

### 2. 成交組在職狀態

```text
team_member_profiles 新增
  resigned_at date null   -- 離職生效日（該日起不列入均分分母）
```

均分分母 = 資料月月底時仍在職（`resigned_at is null or resigned_at > 資料月底`）且具 closer 角色的人數。

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

## 三、口徑切換到入住營收的影響評估

| 項目 | 現行（team_commission_price） | 切換後（本月入住營收） |
|---|---|---|
| 歸屬時點 | `order_date`（下訂日） | 入住日逐晚攤提（`revenueAccrual.ts` 口徑） |
| 跨月訂單 | 全額落在下訂月 | 依住宿夜數拆分至各月 |
| 取消訂單 | 排除 + 事後補差扣回 | 自然不計入（無需扣回） |
| 增值服務 | 已依設定排除 | 需重新定義是否含加購 |
| 幣別 | 未處理 | 需用匯率快照換算台幣 |

風險與處置：
- **金額必然變動**：同月營收會因下訂／入住錯位而位移，7 月起的未付快照 resync 後金額會跳動；已付快照 append-only 不動。
- **不可同月切換**：建議設定切換生效資料月（例如 2026-09），該月以前維持舊口徑，程式以資料月判斷走哪條路徑。
- **雙軌對帳期**：切換前一個月同時計算兩種口徑並在明細 Drawer 並列顯示差額，供人工確認。
- **取消扣回機制**：切換後 `closer_commission_adjustments` 的「取消扣回」邏輯需停用（避免重複扣），改由入住營收自然反映。

---

## 四、UI 改動

1. `BonusSettingsTab.tsx`：「合作生效日」欄位升級為「合作期間」管理（列出各段、可新增暫停段／重啟段），狀態徽章擴充為 已生效／暫停中／待生效／未設定。
2. 成交組卡片：顯示在職人數與均分分母，離職成員標記並可設定離職日。
3. 明細 Drawer：顯示「採計區間」與決定因素（合作期間 / 白名單 / 行銷費）。
4. 口徑切換期間：Drawer 並列顯示新舊口徑金額與差額。

---

## 五、上線順序

1. Migration：建 `accommodation_partnership_periods` + 回填 + `resigned_at`。
2. 人工補齊天送、奧莉薇雅的合作期間（或確認不採計）。
3. 上線期間邏輯 + 移除旅行日字串特例（口徑不變）。
4. 上線成交組在職均分。
5. 最後再評估口徑切換，指定生效資料月並跑雙軌對帳。

## 技術備註

- 期別（10 日／25 日）、倍率邏輯完全不變。
- 快照仍只存基準金額，倍率在顯示層套用。
- 每次改動後需 resync 未付快照，並比對 TeamHome 與發放管理數字一致。
