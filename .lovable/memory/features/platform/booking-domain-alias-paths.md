---
name: Booking 網域 alias 路徑
description: booking.lakeze.com/{alias} 與 /{alias}/admin 的路由解析、alias→accId 對應與 ConditionalLayout 規範化邏輯
type: feature
---
# Booking 網域 alias 路徑

## 概念
`booking.lakeze.com` 同時支援兩種民宿訪問方式：
1. `/{alias}` 前台、`/{alias}/admin/*` 後台（新）
2. 原民宿子網域（`traveldays.lakeze.com` 等）（舊，並存）

## alias 來源
`accommodation_info.short_url_alias`。森山的 `custom_domain` 已從 `booking.lakeze.com` 移除（避免衝突）。

## 路由結構（src/App.tsx）
- 共用子路由 `sharedRoutes` 同時掛在根層與 `/:alias/*` 父路由（`AliasResolver`）
- `AliasResolver` 解析 alias→accId，存入 `sessionStorage.alias_accommodation_id` 與 `localStorage.lastSelectedAccommodation`
- HQ 路由 `/hq*` 不放在 alias 樹下

## 路徑保留字（RESERVED）
判斷第一段是否為 alias 時，以下視為非 alias：
admin, auth, hq, hq-auth, headquarters, booking, book, member, ai-booking,
order-search, profile, payment-test, kol-api-docs, points-api-docs, pay,
payment-result, reset-password, change-password, og-preview, __cb

## ConditionalLayout
透過 `normalizedPath`（剝離 alias 前綴後）判斷 isAdminPage / isAuthPage 等；Navigate 時保留 alias 前綴。

## Auth.tsx
登入成功後 `getAdminPath()` 自動加上 alias 前綴。

## 待後續階段
- 全站 navigate / Link 改用 `useAliasPrefix().withPrefix`
- Email 連結、付款回調、QR Code 改用 alias 路徑
- 舊子網域 301 跳轉策略
