# 館別合作生效日（partnership_start_date）為獎金採計起算基準

## 目標

所有營收型團隊獎金的採計起算日，改以「該館合作生效日 P」為基礎；未設定 P 的館別一律不計入任何團隊獎金。

## 採計規則

```text
P = 館別合作生效日（accommodation_info.partnership_start_date）
W = 訂單來源白名單生效日（該獎金類型對應白名單版本）
M = 行銷推廣費啟用生效日（僅場域成交獎金需要）

未設定 P            -> 該館所有團隊獎金皆不採計
抽成類獎金起算日 S  = MAX(P, W)
場域成交獎金起算日  = MAX(P, M, 簽約人指派生效日)
資料月採計區間      = [MAX(月初, S), 月底]
```

要點：P 未填不再退化成「用白名單日期全額採計」，而是不採計。

## 資料現況盤點

已有簽約人生效日（可直接回填 P）：

| 館別 | 簽約人生效日 | 行銷費生效日 |
|---|---|---|
| 森山寫照 | 2026-01-06 | 2026-01-01 |
| 哈庫納馬塔塔 | 2026-04-23 | 2026-07-01 |
| 淞湘卉館 | 2026-05-17 | 2026-05-01 |
| 雲岫海景渡假會館 | 2026-07-27 | 2026-07-01 |

缺少合作生效日（上線後將不計入獎金，需人工確認補齊或確認本就不該計）：

- 天送幸福和苑
- 奧莉薇雅生活小酒店
- 旅行日-DAIDODO／The Nomad Inn Osaka／光／十一鳴／心齋之翼／艾屋吉屋（旅行日系列本就排除於獎金計算）

實質待確認者只有「天送幸福和苑」與「奧莉薇雅生活小酒店」兩館。

## Migration

1. `accommodation_info` 新增 `partnership_start_date date`（可為 null）。
2. 回填：以各館 `teamcommission_venue_closing_assignments` 最早一筆 `effective_from` 作為 P（上表四館）。
3. 不動既有已發放快照（append-only）。

## 程式改動

1. `src/lib/teamBonusRevenue.ts`
   - 新增 `getPartnershipStartDates(client, accIds)`。
   - `getAccommodationRevenueByAcc` 改為逐館以 `MAX(monthStart, P, W)` 作 `order_date` 下界；P 為 null 的館別直接略過。
   - `getVenueClosingAccommodations` 加上 P 檢查與 `MAX(P, M, 指派生效日)`。
2. `supabase/functions/create-team-bonus-snapshots/index.ts`
   - 同名重複實作需同步修改（兩份邏輯務必一致）。
3. 呼叫端館別集合（`revenueAccIds`）過濾掉 P 未設定的館別。

## UI 改動

1. 白名單卡片（`BonusSettingsTab.tsx`）加註：僅作用於已設定合作生效日的館別。
2. 場域成交人卡片：欄位拆為「合作生效日（P）」與「簽約人指派日」，加狀態徽章（已生效／待生效／未設定合作日）。
3. 館別設定頁新增「合作生效日」欄位供編輯。
4. 明細 Drawer 顯示「採計起算日 = P / 白名單 / 行銷費 三者何者決定」。

## 上線順序與風險

1. 先跑 migration + 回填，確認四館 P 正確。
2. 補齊天送、奧莉薇雅的 P（或確認不採計）。
3. 再上線計算邏輯改動。
4. 未付快照 resync 後金額可能下降（尤其起算日晚於月初的月份）；已付快照不受影響。

## 技術備註

- 期別／倍率邏輯不變，僅改採計區間與館別過濾。
- 旅行日系列排除規則維持不變，與 P 判斷各自獨立。
