---
name: Group Buy Campaign Child Rules
description: 團購兒童分齡規則為 Campaign-Level 獨立 SoT（group_buy_campaigns.child_age_rules），所有方案共用，與一般訂房完全隔離。
type: feature
---

# 團購兒童分齡規則（Campaign-Level）

- SCOPE = **CAMPAIGN**，非 package/plan。一個團購活動一套規則，底下所有方案共用。
- SoT：`group_buy_campaigns.child_age_rules` jsonb。內容 = 一般 `ChildAgeRules` schema + `tier_visibility {infant,toddler,child}`。
- NULL = 尚未設定 → fallback 既有行為（民宿 `accommodation_info.child_age_rules` + 方案 override、三種全顯示），確保 ma 等既有活動 0 regression。
- 「團購頁顯示」(`tier_visibility`) 與「接受訂房」(`tier.allowed`) 是兩個不同 contract；OFF 不刪資料。
- 絕不寫回 `accommodation_info.child_age_rules` 或 `accommodation_packages.child_age_rules_override`；雙向隔離（一般訂房日後修改不會覆蓋團購 snapshot）。
- 初始化：後台第一次開啟時由民宿規則 COPY ONCE 預填（僅表單預填，儲存才寫入），之後獨立。
- 共用模組：`src/lib/groupBuyChildRules.ts`、`supabase/functions/_shared/groupBuyCampaignChildRules.ts`；計算共用 `child-rules.ts` 的 `evaluateChildSelection`（只共用 calculator，不共用 storage）。
- 後端 fail-safe：`_shared/groupBuyBooking.ts` 依 campaign 規則 clamp 隱藏 tier 人數為 0。
- 後台 UI：AdminGroupBuy「方案設定」Tab 最上方 `GroupBuyChildRulesCard`；方案卡內的 per-plan 開關已移除。
- `group_buy_campaign_packages.child_tier_visibility` = **DEPRECATED / UNUSED**（runtime 不再讀取，未 DROP）。
