# 團隊獎金基準 V3：增值服務改為各館彈性抽成

## 先回答第 6 題

技術上「可以」，現在做不到只是**架構問題，不是規則問題**：

- 業主月結／住宿營收獎金池：走 `owner_settlement_pricing_rules`，是 **async + 帶 accommodation_id** 的批次 resolver（先撈規則 → 建 map → 逐單判斷），所以天生能做「有設定用設定、沒設定 fallback」。
- 個人分潤（星探／成交組／KOL）：走 `commissionBaseFromOrder()`，是**純同步、無 DB、無 accommodation_id** 的函式，而且被三層鏡像：前端 `src/lib/ownerExempt.ts`、Edge `_shared/addonTotal.ts`、DB `public.calc_team_commission_price()`（寫入時就把值凍進 `order_meta.team_commission_price`）。沒有館別參數，就沒有東西可以 fallback。

V3 要做的就是**把 resolver 補進這三層**，fallback 語意跟業主月結一致（查不到規則／欄位為 null → 全部列入抽成）。

## V3 規則定義

- Cutoff：`orders.order_date`（Asia/Taipei 日曆日）`>= 2026-09-10` → V3；之前維持 LEGACY / V2，歷史不回溯。
- V3 公式：`base = max(0, final_price − Σ(館別設定為排除的 custom addon) − notes 現場加購)`
  - 增值服務：只扣該館 `owner_settlement_pricing_rules.commission_excluded_addon_ids / _types` 命中的項目；**未設定＝全部列入抽成**（不扣）。
  - notes「額外現場加購金額」：V3 明訂**一律排除**（不受館別設定影響）。
  - `order_source = 'group_buy'` 維持 0；`order_meta.team_commission_price` 人工覆蓋維持最優先、不再二次扣除。

## 實作範圍

**1. 版本判定**
- `src/lib/commissionFormulaVersion.ts` + Edge mirror：新增 `V3` 與 `COMMISSION_V3_CUTOFF_TAIPEI_DATE = "2026-09-10"`，缺失／無效 `order_date` 仍 fail-safe LEGACY。

**2. 計算層（三層鏡像）**
- 前端 `src/lib/ownerExempt.ts`：新增 `buildCommissionBaseResolver(client, accIds)`（async 批次，比照 `buildExemptResolver`），內部沿用 `extractExcludedAddonTotal`。既有同步 `commissionBaseFromOrder()` 保留給 LEGACY/V2 與無館別情境。
- Edge `supabase/functions/_shared/addonTotal.ts`：同語意鏡像。
- DB `public.calc_team_commission_price()`：加入 order_date 版本分支，V3 時 join `owner_settlement_pricing_rules`（取 `effective_from <= order_date 月初` 的最新版本）只扣命中項目，並扣 notes 現場加購；LEGACY/V2 分支輸出**逐字不變**。

**3. 呼叫端接上 resolver**
- Edge：`create-commission-snapshots`、`create-commission-adjustments`、`calculate-scout-payout`、`preview-closer-commission`、`kol-dashboard`、`kol-bonus-public`、`kol-webhook`。
- 前端：`TeamOrders.tsx`、`KolStatsTab.tsx`、`OrderMetaDrawer.tsx`。

**4. 說明文案彙整**
- `src/lib/bonusFieldGlossary.ts` / `bonusFormulas.ts`、`BonusSettingsTab.tsx`、`BonusOrderInspector.tsx`、HQ 增值服務設定區塊：寫明三版本公式、9/10 cutoff、notes 現場加購一律排除、未設定＝全列入抽成，並加註「此設定自 9/10 起同時影響團隊獎金基準」。

**5. 小鈴鐺綠燈（第 9 題：要落庫）**
- Migration：`owner_settlement_pricing_rules` 新增 `reviewed_at timestamptz`、`reviewed_by uuid`（僅 super_admin/admin 可寫，走既有政策模型）。
- 新 hook `use-pricing-rule-review-notifications.tsx`：AM（非 super_admin/admin）建立且未 reviewed 的版本 → 產生 `category: "settings"`、severity 綠燈（info/success）通知，標題「{館名}：AM 已更新增值服務抽成設定，建議審查」，`href` 直達 HQ 該館設定。
- 註冊 kind 至 `NOTIFICATION_KINDS`，merge 進 `TeamSettingsBell`；HQ 設定頁提供「標記已審查」按鈕。

## 驗證

- 新增 `commissionFormulaV3.test.ts`：LEGACY/V2/V3 矩陣、cutoff 台北邊界（09-09 23:59 / 09-10 00:00）、未設定館別＝不扣、部分排除、group_buy=0、人工覆蓋、notes 一律排除、前端／Edge parity。
- 既有 `commissionBase.test.ts`、`commissionFormulaVersion.test.ts` 必須全綠（歷史不變）。
- DB：以 read-only SQL 比對 9/10 前訂單新舊函式輸出**完全相同**（0 筆差異）後才套用 migration。
- 不改任何歷史快照、payout、settlement 資料。
