---
name: Accommodation Notification Settings 跨館 RLS 修正
description: accommodation_notification_settings 四條 policy 由 is_admin_or_super() 改為 is_super_admin(auth.uid())，杜絕單館 hotel_admin 跨館讀寫漏洞；僅 migration 變更，無程式檔案或資料異動。
type: constraint
---

# Accommodation Notification Settings 跨館 RLS 修正紀錄

## 狀態
已核准完工（2026-09-14）。未 Publish，無額外部署。

## 改動內容

### 資料庫 migration（唯一異動）
- 目標表：`public.accommodation_notification_settings`
- 變更四條 RLS policy 的 `USING` / `WITH CHECK` 判斷式：
  - 修正前：`is_admin_or_super() OR is_hotel_admin_of(accommodation_id)`
  - 修正後：`is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)`
- 受影響 policy（共四條）：
  1. `accommodation_notification_settings_select_policy`
  2. `accommodation_notification_settings_insert_policy`
  3. `accommodation_notification_settings_update_policy`
  4. `accommodation_notification_settings_delete_policy`
- `is_super_admin()`、`is_hotel_admin_of()` 均為 `SECURITY DEFINER` + `SET search_path = public`，繞過 `user_roles` RLS，無遞迴問題。

### 未異動項目
- 無前端 `src/**` 檔案變更。
- 無 Edge Function 變更（`send-order-confirmation` 等走 `SERVICE_KEY`，RLS 對其無影響）。
- 無 schema 欄位、trigger、RPC 變更。
- `booking_confirmation_emails`、`booking_notification_emails` 欄位資料與時間戳完全未變。
- `group_buy_campaign_notification_settings` 未一併修正（本批 scope 外）。

## 影響範圍

| 角色 | 修正前 | 修正後 |
|------|--------|--------|
| `super_admin`（含 service_role） | 全館讀寫 | 維持全館讀寫 |
| 單館 `hotel_admin` 對自己所屬館別 | 可讀寫 | 維持可讀寫 |
| 單館 `hotel_admin` 對其他館別 | **可讀寫（漏洞）** | **被阻擋** |
| `staff` / `authenticated` 無館別權限 | 被阻擋 | 被阻擋 |
| 匿名 | 被阻擋 | 被阻擋 |

## 驗證方式

### 乙案：判斷式求值（已執行）
- 使用只綁定「奧莉薇雅生活小酒店」的 `hotel_admin` uid，對「奧丁丁測試」館求值：
  - 修正前：`is_admin_or_super() = true`（舊函式未綁館別即放行），合併判斷式結果 = true → 漏洞成立。
  - 修正後：`is_super_admin(auth.uid()) = false`、`is_hotel_admin_of('奧丁丁測試') = false`，合併判斷式結果 = false → 跨館存取被擋。
- super_admin 帳號求值：`is_super_admin(auth.uid()) = true`，對任意館別仍維持放行。
- 15 家館別逐館驗證 `is_hotel_admin_of()`：僅「奧莉薇雅生活小酒店」為 true，其餘 14 家為 false。

### Postcheck（已執行）
- `pg_policies` 查詢：四條 policy 皆已改為 `is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)`，`is_admin_or_super()` 殘留數 = 0。
- 全表列數：「森山寫照」1 列，「奧丁丁測試」0 列，其餘 0 列；內容與時間戳與修正前一致。

### 甲案：真實 JWT API 測試（未執行）
- 原因：系統只允許登入使用者本人帳號（sakithebest@gmail.com = super_admin），無法替該單館 `hotel_admin` 建立 JWT；以 super_admin 測試會真的寫入資料且無法證明漏洞已被擋，因此未執行。
- 防護查核仍執行：「奧丁丁測試」通知信箱設定維持 0 列，無任何意外寫入。

## 結論
- 修正前漏洞已由判斷式求值證明成立；修正後同一 uid 合併判斷式為 false，且 postcheck 確認 policy 已更新、資料零異動。
- 甲案僅缺「真實 JWT 打 API」外殼驗證，因技術限制與避免無意義寫入而未執行；用戶判定證據力已足，核准結案。
