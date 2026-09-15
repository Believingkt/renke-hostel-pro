---
name: Team Notification Center
description: 團隊小鈴鐺為多事件通知中心（設定缺口 + KOL 進度），新增事件的擴充方式與既有規則。
type: feature
---

小鈴鐺（`src/components/team/TeamSettingsBell.tsx`）是**通知中心**，不是只有「設定缺口」。

- 共用模型：`src/lib/notifications/types.ts` 的 `TeamNotification`（id / kind / category / severity / scope / title / detail / href / editable / reason / meta）。
- 分類 `CATEGORY_LABEL`：`settings`（設定缺口）、`kol`（KOL 進度）。鈴鐺頂端以分類 chips 篩選。
- 事件註冊：`NOTIFICATION_KINDS`（`src/hooks/use-notification-prefs.tsx`）每個 kind 需含 category，才能在偏好面板獨立靜音。
- 既有 KOL 事件（`src/hooks/use-kol-notifications.tsx`，衍生自 `kol_profiles`，不建表）：
  1. `kol-qualification`：近 30 天邀約未勾 `kpi_qualified`（通知 scout_manager/admin）。
  2. `kol-publish-overdue`：入住日 +14 天已過，缺 `publish_date` 或 `publish_url`。
  3. `kol-cid-missing`：已到入住日，缺 `cid_code` 或 `short_url`。
- 每則右上有直接跳轉箭頭按鈕（不需展開即可前往）；`/team/kol?tab=` 支援網址帶入分頁。
- 鈴鐺底部**不放**「查看設定完整性檢查」按鈕（已移除，勿再加）。
- 新增事件流程：寫一個 hook 產生 `TeamNotification[]` → 註冊 kind → 在鈴鐺 merge 進 `allItems`。
