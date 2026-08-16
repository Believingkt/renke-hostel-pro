# 業主自帶「雙軌」全面盤點與收斂計畫

目標：把目前散落在前端顯示、共用計算層、Edge Function 快照、資料表欄位的「含／排除業主自帶」雙軌邏輯，完整攤開一次，確認要保留什麼、關閉什麼、補說明什麼。本階段不改任何程式。

## 現況一句話

雙軌的「資料與欄位」全部還在（快照仍同時算兩軌），但「顯示切換」與「依館別 payout_basis 決定實付軌」已被兩處硬編碼關掉，實際上全站一律走**含業主自帶**單軌。UI 上卻仍留有徽章與說明文字，造成認知落差。

## 一、前端 UI 顯示與路徑盤點

| 位置 | 路徑 | 現在的行為 |
| --- | --- | --- |
| 雙軌切換鈕 `OwnerDirectBasisToggle` | /team（個人首頁）、/team/commission 發放管理 | `canSwitch` 被寫死 false，元件永遠不渲染 |
| 個人首頁獎金卡 `TeamHome` | /team | 取 `basisOverride` 傳進營收計算，但因 basis 固定 payout 而無效果 |
| 發放管理 `TeamCommission` | /team/commission | 同上，僅取用 hook 未實際切換 |
| 規則說明 Tab `BonusRulesReference` | /team/commission → 規則說明 | 每個 `usesVenueRevenue` 獎金項顯示「受業主自帶雙軌影響」徽章，目前不可點開 |
| 公式提示 `BonusFormulaHint` | 各獎金卡片 | 顯示「受含／排除業主自帶雙軌口徑影響」文字 |
| 訂單稽核 `BonusOrderInspector` | 獎金卡片 → 查訂單 | 逐筆顯示「業主自帶（owner_direct）」欄位與合作期間開關 |
| 獎金設定 `BonusSettingsTab` | /team/commission → 獎金設定 | 顯示／編輯合作期間的兩個採計開關；`payout_basis` 只讀取不提供編輯 UI |
| 零元原因 `ZeroBonusReason` | 獎金卡片 | 以 `counts_team_bonus` / `exempt_order_sources` 解釋為何 0 元 |
| 業主月結 | /admin/owner-settlement、設定頁 | 「業主自帶」在此指免抽成來源判定（`exempt_order_sources`），與團隊獎金雙軌是**不同概念**，目前用詞相同易混淆 |

## 二、後端與資料層盤點

- `src/lib/teamBonusRevenue.ts`
  - `getAccommodationRevenueDualByAcc`：仍計算 incl / excl 兩軌
  - `getAccommodationRevenueByAcc`：`basisOverride` 被 `void` 掉，固定回傳 `incl`
  - `getPartnershipPeriods`：仍讀 `payout_basis`，未設定時映射為 `exclude_owner_direct`（與實際採用 incl 相反，是潛在誤導）
- `supabase/functions/create-team-bonus-snapshots/index.ts`
  - `getPayoutBasisByAcc` 三元式兩邊皆回 `include_owner_direct`（等同停用）
  - 快照仍寫入 `amount_incl_owner` / `amount_excl_owner` / `revenue_base_*` / `payout_basis_used`
- `src/lib/ownerExempt.ts` + `_shared/partnershipGate.ts`：第一層過濾（owner_direct = true 或 exempt 來源）— **與雙軌無關，維持不動**
- 資料表
  - `accommodation_partnership_periods.payout_basis`：仍存在，目前無 UI 可改、後端不採用
  - `teamcommission_bonus_snapshots` / `..._lines`：雙軌欄位仍寫入

## 三、待你決定的三個問題

1. **雙軌要復活還是正式收掉？**
   - A. 正式收掉：全站單軌「含業主自帶」，移除切換鈕與相關 hook，徽章文案改為「以館別營收為基準」。
   - B. 復活：開放管理層切換，並在獎金設定補上 `payout_basis` 的編輯 UI（否則永遠沒人能設定實付軌）。
2. **快照的 incl / excl 欄位要不要繼續寫？** 建議續寫（成本低、可回溯對照），僅前端不顯示。
3. **「業主自帶」一詞在業主月結與團隊獎金意義不同，是否分別更名？** 建議團隊獎金側改稱「業主自有訂單口徑」，業主月結側維持「免抽成來源」。

## 四、依決定分支的實作範圍（尚未執行）

**若選 A（收掉單軌）**
- 移除 `useOwnerDirectBasis` / `OwnerDirectBasisToggle` 與 TeamHome、TeamCommission 的 `basisOverride` 傳遞
- `getAccommodationRevenueByAcc` 拿掉 `basisOverride` 參數
- `getPartnershipPeriods` 的 `payout_basis` 預設改為 `include_owner_direct`，消除語意矛盾
- 徽章改為可點開說明：以「這是什麼／為什麼曾有兩軌／目前一律含業主自帶／不影響哪些項目」四段呈現
- 快照欄位保留不動

**若選 B（復活雙軌）**
- 解除 `canSwitch`、`getPayoutBasisByAcc`、`getAccommodationRevenueByAcc` 三處硬編碼
- 獎金設定新增 `payout_basis` 選擇器（比照兩個採計開關的月份不可回溯規則）
- 切換至參考軌時全頁強制顯示「僅供參考，非實付金額」警示
- 補回歸測試：確認 payout 軌金額 = 快照 `payout_basis_used` 對應欄位

## 五、共同要做的事（兩案皆需）

- 「受業主自帶雙軌影響」徽章改為可點開 Popover，內容採先前討論定案的四段文案
- 在規則說明 Tab 標註哪些獎金**不受影響**（成交大師單筆、星探、加盟、星鏈）
- 撰寫 `docs` 或記憶檔，固定「業主自帶（雙軌）」與「免抽成來源」的名詞邊界
