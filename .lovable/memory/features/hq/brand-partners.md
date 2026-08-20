---
name: Brand Partners
description: 品牌夥伴 logo 由 platform_brand_partners 驅動，透過 BrandLogoBar 同步 admin/team/hq/portal 四處。
type: feature
---

- 資料表 `platform_brand_partners`（name / logo_url / label / link_url / scopes / is_active / sort_order），僅 super_admin 可管理。
- 共用元件 `src/components/BrandLogoBar.tsx` + hook `useBrandPartners(scope)`；scope = admin | team | hq | portal。
- 夥伴文字標註（如「技術合作」）預設不顯示，僅訂房前台頁尾用 `showPartnerLabels` 開啟；側邊欄只顯示分隔線 + logo。
- 夥伴區為水平捲動（隱藏捲軸）、logo `shrink-0`、`maxPartners` 預設 8，logo 變多不會擠壓主 logo 或文字。
- 已替換的五處：AppSidebar、Header、HQSidebar（保留「總部」文字）、TeamSidebar（保留「行銷團隊」文字）、BookingFooter（`hidePartnershipInfo` 時仍完全隱藏，團購前台不受影響）。
- 管理頁 `/hq/brand-partners`（HQ 側邊欄「品牌夥伴」），支援拖拉排序、啟停用、顯示範圍勾選；勾「訂房前台」會二次確認。
- 上傳限 2MB、PNG/WebP/SVG，存在 `logos` bucket 的 `brand-partners/` 路徑；上傳時以 `src/lib/logoNormalize.ts` 自動 trim 透明邊 + 等比縮放（不裁切）+ letterbox 補透明邊 → WebP。
