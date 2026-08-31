---
name: Commission Base V3 (per-accommodation addon exclusion)
description: 團隊獎金分潤基準 V3：2026-09-10 成交日起，增值服務是否列入抽成改由各館 owner_settlement_pricing_rules 決定。
type: feature
---

分潤基準（個人星探／成交組／KOL）版本化，SoT = `orders.order_date`（Asia/Taipei 日曆日）：

- LEGACY（< 2026-08-01）：`final − 所有 custom addon`（notes 現場加購不扣）
- V2（>= 2026-08-01）：再扣 notes「額外現場加購金額」
- V3（>= 2026-09-10）：`final − 該館設定為不列入抽成的 custom addon − notes 現場加購`
  - 規則來源：`owner_settlement_pricing_rules.commission_excluded_addon_ids / _types`（取 effective_from <= 該單台北月份的最新版本）
  - **查無規則／規則為空 = 不排除任何 addon（全部列入抽成）**
  - notes 現場加購在 V3 一律排除，不受設定影響
  - `order_meta.team_commission_price` 人工覆蓋優先，且不得再扣加購
  - `order_source = group_buy` 一律 0

實作位置（四層必須同口徑）：
- 前端：`src/lib/commissionFormulaVersion.ts`、`src/lib/commissionExclusionRule.ts`、`src/lib/ownerExempt.ts`、hook `use-commission-exclusion.tsx`
- Edge mirror：`supabase/functions/_shared/{commissionFormulaVersion,commissionExclusionRule,addonTotal}.ts`
- DB：`public.calc_team_commission_price(uuid)`
- 測試：`src/lib/__tests__/commissionV3Exclusion.test.ts`（含前端／Edge parity）

審查流程：AM 可編輯設定；儲存後 `commission_exclusion_reviewed_at` 為空，團隊小鈴鐺對 super_admin/admin 顯示綠燈「已設定・待審查」（kind `commission-exclusion-review`），於業主月結設定頁按「標記已審查」清除。
