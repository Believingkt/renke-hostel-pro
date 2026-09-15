---
name: KOL 跨館同 CID 資格判定
description: 同一位 KOL 同支 CID 跨館別時，何時算同一份合約（1 資格）、何時各自獨立計資格。
type: feature
---
同一位 KOL、同一支 CID、不同館別：

1. 兩邊館別皆為「旅行日系列」→ 同一份合約，僅計 1 資格（建議歸為同一 contract_group_id 或設附屬）。
2. 任一邊的場域類別（`kol_venues.type`）非「民宿」（餐廳／農場／其他）→ 同一份合約，僅計 1 資格。
3. 其他（皆為民宿、非旅行日系列）→ **各自獨立、算 2 個以上資格是正確的**，UI 只顯示灰色 ℹ️ 資訊，不擋儲存、不標紅、不計入 unresolved。

「旅行日系列」判定沿用全站獎金口徑：`accommodation_info.name` 以「旅行日」開頭（TeamHome / TeamCommission / create-team-bonus-snapshots 同口徑）。

實作：`src/lib/kolInviteValidation.ts` 的 `isTravelSeriesAccommodation` / `isSameContractScope`，規則代碼 `cid.same_person_same_contract`（warning）與 `cid.same_person_other_accommodation`（info）；UI 於 `src/pages/team/TeamKOL.tsx` 依每筆衝突分色。

同一人改採多訊號辨識：KOL 名稱正規化、IG 帳號、`contract_group_id` 任一相符即視為同一人。但若辨識為同一人而名稱不同，仍須硬擋儲存並要求統一名稱；提示需同時列出兩個名稱（例如「請統一 KOL 名稱是餓犬Dicky或是Dicky」），不可用「不同人／二次合作」勾選略過。

`primary_profile_id` 規則（2026-08-27 更新）：同館、入住日相差 31 天內可直接設附屬；**跨館別或超過 31 天一律需勾選「特例附屬」**（跨館附屬已開放新建，不再唯讀、不再有「跨館遺留」獨立 UI，既有跨館關係已一次性回填 `primary_link_exception = true`）。同館別且同 CID 視為重複建檔，直接阻擋且不提供「設為主檔」按鈕。
