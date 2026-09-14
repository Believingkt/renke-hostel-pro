# Roadmap

## 進行中
- [ ] 新手業主上架引導流程（A–F）—— 已施工完成，等 Publish 核准
  - [x] 第 13 步接上 `booking_confirmation_emails`（判定邏輯已定案：非空＝完成，選填不擋關）
  - [x] 七點細節對齊澄清（庫存/價格 7 天門檻、設施欄位、status 列舉、RLS helper、DELETE 範圍、橫幅關閉鈕、第 15 步條件）
  - [x] `accommodation_onboarding_steps` migration（已執行）
  - [x] Onboarding.tsx / use-onboarding-progress / steps.ts / OnboardingBanner 實作
  - [x] 兩條孤兒路由改 Navigate 轉址
  - [x] postcheck 完成（等 Publish 核准）
  - [ ] 待裁示：第 4／9 步判定與正式資料落差（房型照片、前台價格來源）

## 已完成
- [x] 一般訂房通知信箱（`booking_confirmation_emails`）＋通知信箱架構整理（已上線）
- [x] 訂房確認信民宿副本加「【副本】」標題（已上線）

## 後續獨立批次（已裁示，暫不動）
- [ ] `is_active=false` 不擋直接連結下單的缺口 —— 獨立小批次，需另行授權
- [ ] 已上線頁面英文冷啟動閃中文修補
- [ ] 通知信箱兩張表 RLS 跨館別漏洞（is_admin_or_super 不綁館別，已查證確認）—— 待評估是否修
- [ ] 重新實跑一次完整安全掃描（兩次回報皆為 stale，需取得真實現況）
