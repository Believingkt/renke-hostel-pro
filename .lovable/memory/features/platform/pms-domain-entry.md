---
name: PMS 後台網域入口
description: pms.lakeze.com 後台專屬網域的模式判斷、/login 三欄登入流程、舊網域搬家轉址與密碼重設 redirect 規則
type: feature
---
# PMS 後台網域入口（pms.lakeze.com）

## 模式判斷（src/lib/appMode.ts）
- `pms.lakeze.com` → `"pms"`；`booking.lakeze.com` 與其他正式網域 → `"frontend"`；
  localhost / lovable 預覽 → 預設 `"neutral"`（不套守衛），可用 `?mode=pms` / `?mode=frontend` 切換（記在 sessionStorage）。
- 常數：`PMS_ORIGIN`、`BOOKING_ORIGIN`、`PMS_RESET_PASSWORD_URL`（勿用 window.location.origin 硬拼）。
- `pmsHref()` / `bookingHref()`：正式環境跨網域，開發環境同站加 `?mode=`。

## 守衛（src/components/PmsDomainGuard.tsx）
- PMS 模式：`/` → `/login`；非允許路徑（僅 /login、/auth、/reset-password、/change-password、/admin、/{slug}/admin/*）→ 導向 booking 對應路徑。
- 前台模式訪問 `/{slug}/admin*`：未登入 → `pms.lakeze.com/login?code={slug}`；已登入 → 顯示「後台已搬家」卡片。

## 登入頁（src/pages/PmsLogin.tsx，標題「人客多 PMS 民宿後台」）
三欄：民宿代號 / Email / 密碼。流程：代號 trim+lowercase 查 `accommodation_info.short_url_alias`
→ signInWithPassword → 查 `user_roles`（該館 hotel_admin/super_admin/staff 或全域 super_admin）
→ 皆通過則 `navigate('/{slug}/admin')`。代號記於 localStorage `pms_last_property_code`，支援 `?code=` 預填。
錯誤訊息固定：「查無此民宿代號」「Email 或密碼錯誤」「此帳號沒有 {民宿名} 的後台權限」；15 秒 timeout + disabled/spinner。
