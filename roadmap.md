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
