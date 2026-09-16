# Roadmap

## 進行中
- [ ] 第一批：order_meta / kol_profiles 補稽核（updated_by 欄位＋set_updated_by trigger）— 設計已完成，等核准施工
- [ ] 第二批：order_meta_update policy 收緊（補 WITH CHECK、finance）— 等第一批觀察後個別核准
- [ ] 第三批：kol_profiles_update policy 收緊（scout 限本人）— 等 updated_by 觀察 venue_manager/hotel_admin 是否寫入
- [ ] 課程盈餘併入「上傳至 Ragic 收入總表」（依匯款日期認列、合併一列可展開明細）— 已完成程式，待接受草稿後部署與實測


## 已完成
- [x] 一般訂房通知信箱（`booking_confirmation_emails`）＋通知信箱架構整理（已上線）
- [x] 訂房確認信民宿副本加「【副本】」標題（已上線）
- [x] 新手業主上架引導流程（A–F）（已上線）
- [x] 對外 API 唯讀金鑰讀金鑰＋寫入攔截（已上線）
- [x] 多館範圍金鑰（accommodation_api_key_scopes＋accommodation-api 多館查詢＋後台多選館別，強制唯讀）— 待 Publish

## 後續獨立批次（已裁示，暫不動）
- [ ] `is_active=false` 不擋直接連結下單的缺口 —— 獨立小批次，需另行授權
- [ ] 已上線頁面英文冷啟動閃中文修補
- [ ] 通知信箱兩張表 RLS 跨館別漏洞（is_admin_or_super 不綁館別，已查證確認）—— 待評估是否修
- [ ] 重新實跑一次完整安全掃描（兩次回報皆為 stale，需取得真實現況）
- [ ] accommodation-api / kol-api 流量限制改用資料庫計數（記憶體計數在雲端函式多執行個體無法真正限流；kol-api 既有 100 次/小時限制同樣從未真正生效）—— 待設計稿核准

- [ ] 館別後台「AI 客服 → 常見問題」自助管理頁（含 created_by 自動帶入、ai_faq 模組權限、稽核）
