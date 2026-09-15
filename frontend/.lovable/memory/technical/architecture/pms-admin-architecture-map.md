---
name: PMS 後台架構地圖
description: PMS Admin 的 routing、layout、sidebar、responsive、權限、共用元件與 Mobile Ready 分級基準，後續改造直接引用勿重新盤點
type: reference
---
# PMS 後台架構地圖（2026-08-22 盤點基準）

## Routing / Auth
- 網域 `pms.lakeze.com`（`src/lib/appMode.ts`：PMS_ORIGIN / BOOKING_ORIGIN / resolveAppMode / isPmsAllowedPath / normalizePmsPath）。
- Router 單一定義：`src/App.tsx`（880 行），所有 admin route 為 flat `admin/*`（非 nested layout route），全部 lazy + Suspense skeleton。
- Layout 由 `src/components/ConditionalLayout.tsx` 依 pathname 判斷（frontend / admin / hq / auth），非 route-based layout。
- Guard 三層：`PmsDomainGuard`（網域）→ `ConditionalLayout`（session / force_password_change / `?next=` redirect）→ `RequireModule`（模組權限）。
- alias 前綴 `/:alias/admin/*` 由 `AliasResolver` + `useAliasPrefix` 支援；`ConditionalLayout` 內有一份重複的 RESERVED 清單（與 appMode.ts 不同步，屬風險）。
- 登入頁 `src/pages/PmsLogin.tsx`（三欄），`?next=` 只接受站內後台路徑。

## Layout / Navigation
- Admin shell：Sidebar + `src/components/Header.tsx`（sticky top-0 z-50 safe-top，h-16，含 SidebarTrigger / AccommodationSelector / Bell / 使用者選單）+ `main flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden` + footer。無 breadcrumb 於 shell（由頁面自帶）。
- Sidebar：`src/components/AppSidebar.tsx` + shadcn `src/components/ui/sidebar.tsx`（`collapsible="icon"`，<768px 自動切 Sheet drawer，已具 mobile 行為）。
- 選單唯一來源：`src/config/adminMenu.ts`（ADMIN_MENU_ITEMS + deriveModuleDefs）→ 同時餵 Sidebar 與 `src/constants/staffPermissions.ts`。新增分頁只改這裡。
- 頁面標題共用：`src/components/AdminPageHeader.tsx`（breadcrumb + PageHeader + action），約 30 個頁面使用。無共用 PageToolbar / ActionBar。

## Responsive
- 唯一 JS breakpoint：`src/hooks/use-mobile.tsx` = 768px。CSS 以 Tailwind `sm/md/lg` 為主。
- 已有 mobile card fallback：Orders、Customers、Reception、Accounts。其餘表格頁只有 `overflow-x-auto`。
- 硬性 min-width 風險：AdminGroupBuy(900)、GroupBuyAnalyticsTab(1100)、KolDiscountDetail(1100/1180)、RoomPriceCalendar / PackagePriceCalendar（sticky 左欄矩陣）。

## APP 基礎（已存在）
- Capacitor 8（`capacitor.config.ts`，appId `com.lakeze.booking`，webDir dist），@capacitor/app、browser、ios、push-notifications。
- Push：`src/lib/pushNotifications.ts` + `device_tokens` 表 + `use-push-bootstrap`。
- Deep link / OAuth：`src/lib/nativeOAuth.ts`、`src/utils/oauthCallbackHandler.ts`、`src/lib/liffState.ts`。
- `isNativeApp()` 目前把原生一律視為訂房前台（booking），PMS 上 APP 需擴充此判斷。
- 無 PWA manifest；`public/sw.js` 是 kill-switch，`main.tsx` 主動 unregister 所有 SW。

## 共用 Design System
- shadcn 全套於 `src/components/ui/`。Admin 專屬：`calendar.tsx` 的 `variant="admin"`、`src/components/admin/AdminDateRangeField.tsx`（目前僅 GroupBuyAnalyticsTab 使用）、`ui/save-button-container.tsx`、`ui/rich-text-editor.tsx`(TipTap)、`ui/month-picker`、`ui/time-picker`、`ui/dual-currency-input`、`validated-*`。
- 其他共用：EmptyState / ErrorState / LoadingOverlay / components/skeletons、ImageUploadField、MultiImageUploadField（dnd-kit）、CoverCropEditor。
- 無 `.icon-btn` 於 admin（僅前台 3 處使用），icon button 尺寸混用 h-9/h-10。

## Data / Permissions / Performance
- 權限三層：menu（AppSidebar filter）→ route（RequireModule）→ DB RLS。API 層仰賴 RLS + `current_user_accommodation_ids()`；hook `src/hooks/use-staff-permissions.tsx`（canView / canEdit，super_admin & hotel_admin 全開）。
- 民宿情境：`src/contexts/AccommodationContext.tsx`（localStorage `LAST_ACCOMMODATION_KEY` + URL param + 網域 alias；切換不改 route，只換 context → 頁面 query key 需含 accommodationId）。
- 資料層混用 React Query 與頁面內 useState + supabase 直查；無 virtual list，pagination 僅少數頁 `.range()`。
- 通知：`use-order-notifications` + supabase realtime channel + `notifications` 表 + Header Bell。

## Mobile 改造原則（結論）
- 最小改動路徑＝沿用現有 shadcn Sidebar 的 Sheet 模式（<768px 已自動 drawer），不新增 Bottom Nav；把力氣放在 ResponsiveDataView（table→card）與大型 Dialog→Sheet。
- 抽共用優先序：P0 ResponsiveDataView / AdminToolbar / AdminPageShell；P1 AdminFormSection + StickyActionBar + Dialog→Sheet 包裝；P2 icon-btn 44px token、safe-area、圖表 responsive。
