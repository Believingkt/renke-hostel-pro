---
name: Group Buy Package Booking Model
description: 團購兒童分齡規則 SoT = PER PACKAGE（group_buy_campaign_packages.child_age_rules）＋房型/人數 selector 開關＋方案已含人數優先於兒童加價。
type: feature
---

# 團購方案訂房模型（Per-Package）

## 兒童分齡規則 SoT
- SCOPE = **PACKAGE**。SoT：`group_buy_campaign_packages.child_age_rules` jsonb（一般 `ChildAgeRules` + `tier_visibility`）。
- NULL 時 fallback 順序：package → campaign（`group_buy_campaigns.child_age_rules`，**DEPRECATED 過渡期**）→ 民宿 `accommodation_info.child_age_rules` + 方案 override。
- Campaign-level UI 已移除（`GroupBuyChildRulesCard` 不再掛載）；欄位保留供 fallback，未 DROP。
- 後台入口：`GroupBuyPackageCard` →「兒童分齡規則（本方案）」區塊，未設定時由 fallback COPY ONCE 預填，儲存才寫入。
- 絕不寫回 `accommodation_info.child_age_rules` / `accommodation_packages.child_age_rules_override`；與一般 /booking 雙向隔離。
- 「團購頁顯示」(`tier_visibility`) 與「接受訂房」(`tier.allowed`) 仍是兩個不同 contract；OFF 不刪資料。

## Selector 開關
- `show_guest_selector`（default true）：關閉時前台不顯示人數選擇器，一律以方案固定人數（`included_guest_count`）成行；後端強制忽略 client 人數。
- `show_room_type_selector`（default false）：開啟時旅客可自選方案 mapping 內的房型；未選＝維持既有自動指派順序。關閉時後端忽略 client `roomTypeId`。

## Included Capacity 計價（GROUP BUY ONLY）
- `group_buy_campaign_packages.included_guest_count`（null＝沿用 `max_guests`）。
- 規則：方案售價已含的人頭不再收兒童加價。covered = `included − adults`，只有超出的計容量人頭才依規則收費（依費用由高至低配對），**不得同時收 package extra fee 與 child fee**。
- 不計入容量的年齡層（如嬰兒）不佔已含人數，收費規則不變。
- 硬限制（`allowed=false`、`max_count`、`max_total_guests`、`max_guests`）優先於 included capacity。
- 共用模組：`src/lib/groupBuyIncludedCapacity.ts` + Deno mirror `supabase/functions/_shared/groupBuyIncludedCapacity.ts`（`evaluateGroupBuyChildSelection`）。一般 /booking 完全不使用。
- 訂單 price snapshot 記錄 `child_rules_scope / child_rules_snapshot / included_guest_count / capacity_guest_count / overflow_guest_count / show_*_selector / selected_room_type_id`，為 immutable，日後改方案設定不影響既有訂單。
