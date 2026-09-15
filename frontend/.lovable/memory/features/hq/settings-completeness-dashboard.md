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

## 覆蓋補齊（2026-08）
- 館別維度新增：`videoRate`（影音費率，原本只查 closer_rate）、`kolQuota`（本月互惠額度）。
- 全站維度新增：`scout_tier`（星探級距費率）、`scout_salary`（星探底薪／團隊獎金）。
- `useSettingsCompleteness` 另回傳 `blockedChecks`：查詢被 RLS 擋下時該檢查不可信任，通知端一律略過，避免對無權限角色誤報。

## 小鈴鐺（A 案：衍生式，不建表）
- `src/components/team/TeamSettingsBell.tsx` 掛在 `TeamHeader`，切換 /team 子頁不會消失；設定補齊即自動消失。
- 通知對象與跳轉位置的單一真相：`settingsGapLinks.ts` 的 `GAP_AUDIENCE` / `shouldNotify` / `resolveGapHref`。
- 路由原則：HQ 角色（super_admin/admin/finance）→ `/hq/bonus-settings`；其他角色 → 團隊頁（AM 負責人 `/team/members`、互惠額度與星探設定 `/team/kol`）；沒有可編輯位置時只顯示提示不掛連結。
