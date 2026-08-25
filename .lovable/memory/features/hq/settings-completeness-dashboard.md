---
name: Settings Completeness Dashboard
description: HQ「設定完整性檢查」單一 Tab 內含三個檢查群組（Ragic 收入寫入／獎金發放館別／全站獎金設定），不得新增 Tab。
type: feature
---

位置：HQ 設定頁第一個 Tab（`?tab=rate-check`），元件 `src/components/team/RateConsistencyCheckTab.tsx`（唯讀）。

- 群組切換用內層 Tabs，**不再新增外層 Tab**：
  1. `ragic`：合作期間／業主月結費率／行銷推廣費／訂房設定／歷史費率殘留
  2. `bonus-venue`：採計團隊獎金、採計成交組、業主自帶口徑、成交／影音費率、AM 負責人、場域簽約人、館別級距規則
  3. `bonus-global`：費率版本、共用／獨立來源白名單、角色綁定、成交組團隊獎金、獎金加倍活動（每列標示影響哪些獎金，取自 `bonusSettingImpact`）
- 判讀邏輯為純函式：`src/lib/settingsCompleteness/{ragicChecks,bonusChecks,types}.ts`；資料抓取集中在 `src/hooks/use-settings-completeness.tsx`（單趟平行查詢，台北時區今日）。
- 跳轉連結一律走 `src/lib/settingsGapLinks.ts`（tab／acc／focus 三參數；全站設定 `noAcc`）。
- 紅＝影響計算結果，黃＝建議補齊；點格子開修補指引彈窗（原因／目標頁／需補欄位／前往設定頁／已完成重新檢查）。
