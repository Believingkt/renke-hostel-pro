---
name: 舊版一般民宿訂房頁停用
description: /booking/:accId 與根路徑 Index 一律導向 /booking/villa/:accId，禁止再新增指向舊版訂房頁的連結
type: constraint
---
# 舊版「一般民宿訂房頁」停用

- 舊頁面：`src/pages/BookingAccommodation.tsx`（`/booking/:accId`）與 `src/pages/Index.tsx`（根路徑／子網域首頁）。
- 現況：`/booking/:accId` 路由改由 `src/components/LegacyBookingRedirect.tsx` 直接 replace 導向 `/booking/villa/:accId`（保留 query/hash）；`Index.tsx` 解析到 accommodationId 後也直接導向新版包棟訂房頁。
- 入口統一：BookingPortal、BookingSearchResults、MemberOrders「再次預訂」、AliasResolver、AccommodationSelector 一律使用 `/booking/villa/{accId}`。
- **禁止**再新增任何指向 `/booking/{accId}` 或舊首頁的連結；不要用 `isSensanAccommodation` 或「是否有包區方案」判斷要走哪個訂房頁。
- 舊檔案暫留（尚未刪除）僅為歷史參考，前台不再可達。

## 2026-09 更新
- 平台入口（/booking 列表）點進館別後也走短網址 `/{alias}`，與民宿主人對外貼的網址一致。
- `/{alias}` 直接渲染訂房頁（不再 302 到 `/booking/villa/{uuid}`）。
- `/booking/villa/{uuid}` 保留可用（向下相容），其 canonical 指向 `/{alias}`，避免兩個網址兩份 meta。
