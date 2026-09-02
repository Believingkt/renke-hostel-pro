---
name: Group Buy Child Tier Visibility
description: 團購方案層「兒童分齡顯示設定」（visibility override），與一般訂房兒童規則完全隔離。
type: feature
---

# 團購兒童分齡顯示設定

- SoT 不變：兒童規則仍讀 `accommodation_info.child_age_rules` +（一般）`accommodation_packages.child_age_rules_override`。團購**只覆寫顯示**，永不寫回。
- 新欄位：`group_buy_campaign_packages.child_tier_visibility jsonb`，形如 `{"infant":bool,"toddler":bool,"child":bool}`；NULL / 缺 key = 顯示（既有活動與訂單相容）。
- 共用解析：`src/lib/groupBuyChildVisibility.ts` 與 `supabase/functions/_shared/groupBuyChildVisibility.ts`。
- 前台 `GroupBuyCampaign` → `applyVisibilityToGuests` 後才計價／驗證；三種全 OFF 只顯示成人。
- 後端 `_shared/groupBuyBooking.ts` 在讀方案後把隱藏 tier 的人數 clamp 為 0（fail-safe）。
- 後台開關在 `src/components/admin/GroupBuyPackageCard.tsx`「基本設定」區，與既有 `allowed`（接受訂房）分離。
