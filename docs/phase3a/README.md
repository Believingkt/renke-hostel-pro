# Phase 3A — SAFE SIMPLE RLS Draft (NOT APPLIED)

狀態：**DRAFT ONLY**。此資料夾的 SQL **未**套用到 production，也**未**放入 `supabase/migrations/`。
要套用時必須另行由使用者核准 migration tool 執行。

範圍（僅兩張表）：
- `external_hotel_mappings`（Channel Manager，Staff 無 write）
- `addon_sales`（module owner = `addon_center`）

不在本 Phase：`customers`、`order_rooms`、`orders`（凍結）。

檔案：
- `01_external_hotel_mappings_and_addon_sales.sql` — 提案 SQL（SECTION A / SECTION B）
- `02_verification_queries.sql` — 唯讀驗證與套用後回歸查詢

## Helper（沿用既有，不新增）
- `public.is_super_admin(auth.uid())` — 全域 bypass
- `public.is_hotel_admin_of(accommodation_id)` — **target accommodation** 的 hotel_admin/super_admin（非任意館別）
- `public.staff_can_edit_module(accommodation_id, module_key)` — 內含 admin 視為 editable

## 現況 policy
`external_hotel_mappings`
- `Admins can manage external mappings` — FOR ALL / authenticated / USING + WITH CHECK = `user_has_access_to_accommodation(auth.uid(), accommodation_id)` ← readonly bypass 根因
- `Staff can read accommodation mappings` — FOR SELECT / authenticated / 同一 broad predicate

`addon_sales`
- `Members can view addon sales of their accommodation` — SELECT（broad）
- `AM team can view addon sales` — SELECT
- `Finance can view addon sales` — SELECT
- `Members can insert addon sales for their accommodation` — INSERT（broad）← 根因
- `Members can update addon sales of their accommodation` — UPDATE（broad）← 根因
- `Members can delete addon sales of their accommodation` — DELETE（broad）← 根因

## Gain / Loss（唯讀實測）
非 super_admin 的 Staff×accommodation pairs 總數 = **75**
- `channel_manager`：editable 38 / readonly 4 / hidden 33
- `addon_center`：editable 47 / readonly 1 / hidden 27

`hotel_admin` pairs = 79；super_admin users = 6。
`user_roles` 中帶 `accommodation_id` 的非 staff/hotel_admin/super_admin 角色 = **0**（故無其他角色被誤傷）。

| 項目 | external_hotel_mappings | addon_sales |
|---|---|---|
| current Staff writable pairs | 75 | 75 |
| proposed Staff writable pairs | 0 | 47 |
| Staff write removed | 75（含 legacy editable 38） | 28（readonly 1 + hidden 27） |
| 合法 editable Staff loss | N/A（產品規則無 Staff editable） | 0 |
| hotel_admin loss | 0 | 0 |
| super_admin loss | 0 | 0 |
| cross-accommodation gain | 0 | 0 |
| SELECT semantic changed | NO | NO |

## Dependency regression
- `search-external-rooms`、`test-external-rooms-connection`、`ai-booking-chat` 皆以 **SERVICE_ROLE** client 讀取 mappings → 不受 RLS 影響。
- `BookingAccommodation` / Public Booking 不直接寫 mappings。
- TravelMap business logic 不變更。
- `addon_sales` 讀取端：`OwnerSettlement.tsx`、`OrderAddonSalesCard.tsx` 僅 SELECT，SELECT 不改。
- 寫入端僅 `AddonCenter.tsx`（insert / update / delete）與 `ChannelManager.tsx`（mappings insert / update，前端已於 Phase 2C 對 Staff readonly）。

## False success 檢查
`src/pages/AddonCenter.tsx:224-237`：insert / update / delete 皆檢查 `error` 並 `toast.error(...)`，成功 toast 在 error return 之後；update/delete 另受 global write guard（0 row 會報錯）。
→ **FALSE_SUCCESS_BLOCKER = NO**（未修改任何前端）。
