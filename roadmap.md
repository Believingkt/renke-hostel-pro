# RPC 白名單自動比對（做法 B）

## 階段 0 / 1（已核准並施工）
- [x] 白名單快照腳本 scripts/dump-rpc-whitelists.ts（同時寫測試快照與排程 expected.json）
- [x] 比對測試骨架 src/test/rpc-whitelist-contract.test.ts
- [x] charge-deposit（A 型示範）
- [x] update_order_fields_v1 全部 8 個前端呼叫點
- [x] tappay-notify / tappay-refund-notify
- [x] tappayWebhookProcessor（B 型）
- [x] cancel-order-with-refund（B 型）
- [x] 每日排程 rpc-contract-check + notify_rpc_contract_drift 告警與 HQ 開關

## 之後再提
- [ ] 階段 2（OTA 呼叫端）、階段 3（低頻呼叫端）
- [ ] HotelNabe 靜默警告升級為可觀測告警（使用者指示：之後再決定）
- [ ] HotelNabe 本地欄位清單補齊到與 RPC 白名單一致（之後再決定）

---

# Step 3 方案 B：訂單歷程統一時間線（已完成）
- [x] OrderTimelineCard 元件與實測、掛載

## guard v5.7（範圍一 template 取價 + 範圍二 bulk_open 排除）
- [ ] 出逐字程式碼（migration / resolve_template_night_price / validate_order_before_insert / CreateOrderDialog diff）
- [ ] src/types/order.ts 補 pricing_template_id 欄位（勿再遺漏）
- [ ] TS↔SQL 取價一致性 parity 測試矩陣

---

# ATM booking_pending 信尾分流（已核准）
- [ ] ATM 改為自動核帳說明＋「查詢訂單」按鈕
- [ ] 人工匯款／fallback 文案維持逐字不變
- [ ] 型別檢查、既有與新增測試、CE2V95Y5 安全副本驗證

---

# 包棟房間組成逐列對應（已核准施工 2026-09-11）
- [ ] 新增 src/hooks/use-package-breakdown.tsx（查詢/正規化/快取/動態補查）
- [ ] OrderDetail.tsx 逐列組成（顯示＋存備註），換房型才帶預設
- [ ] CreateOrderDialog.tsx 改用共用 hook＋換房型帶預設
- [ ] 測試：純函式、tsgo、既有測試、單一包棟回歸鎖、實測訂單（等核准才刪）

---

# 前台中英雙語（分階段）
## 第一步（已核准施工）
- [x] translation_cache 表（public 只讀、寫入僅 service role）
- [x] translate-content Edge Function（查快取→缺才走 Lovable AI）
- [x] useTranslatedFields hook
- [x] 試點頁 PaymentResult.tsx（固定文字＋動態內容）
## 之後分批（未授權）
- [ ] BookingFlow.tsx、搜尋列表、會員中心、訂單查詢
- [ ] 第二階段：通知信件雙語（本輪完全不動 4 支寄信函式）
- [待排] 已上線四頁（BookingSearchResults／PaymentResult／MemberOrders／MemberOrderDetail）冷啟動閃中文缺陷：第四批驗證穩定後，安排小批次改用 use-translated-fields 的可選延後顯示模式。阻塞：等第四批驗證穩定＋使用者核准。

---

# Apple AI 資料傳送同意補強（已核准施工 2026-09-12）
- [x] 三家服務商完整同意文案與各介面個別揭露
- [x] /ai-booking、入口網 AI、民宿頁 AI、語音在同意前零 AI 請求
- [x] 語音首次使用獨立同意，拒絕時不啟動麥克風
- [x] /privacy 兩個版本列出三家公司與各自處理資料
- [x] 確認 iOS App 語音入口與可用條件

## 第五批：首頁 BookingPortal.tsx 雙語（設計中，待核准施工）
- [x] 殘留中文清單現況更新（已過關；「技術合作」歸類為動態內容，排 BookingFlow 批）
- [x] 補件：搜尋／篩選程式碼佐證、PortalAIChatPanel 三處佐證、欄位量級估計、RoomTypeCard 報備規則
- [ ] 等待核准後施工（完工不自行 Publish）
- [ ] 第四批 Publish 保留中，等使用者對齊時間點後通知
