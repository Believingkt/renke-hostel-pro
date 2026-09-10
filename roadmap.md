# RPC 白名單自動比對（做法 B）

## 階段 0（已核准，待告警類別決定後開工）
- [ ] 白名單快照腳本（pg_get_functiondef → src/test/__snapshots__/rpc-whitelists.json）
- [ ] 比對測試骨架（純函式 keys ↔ 白名單）
- [ ] charge-deposit 示範抽取（A 型）

## 階段 1（已核准，B 型需先附 rollback 實測再核准施工）
- [ ] update_order_fields_v1 全部 8 個前端呼叫點
- [ ] tappay-notify
- [ ] tappay-refund-notify
- [ ] tappayWebhookProcessor（B 型，需 BEGIN…ROLLBACK 欄位集合比對）
- [ ] cancel-order-with-refund（B 型，需 BEGIN…ROLLBACK 欄位集合比對）

## 待使用者決定（阻擋每日排程告警）
- [ ] 白名單漂移告警要沿用 notify_health_check，還是新增 notify_rpc_contract_drift（新增則同步補 HQ 系統健康監控頁開關）

## 之後再提
- [ ] 階段 2（OTA）、階段 3（低頻呼叫端）

---

# Step 3 方案 B：訂單歷程統一時間線（已完成）
- [x] OrderTimelineCard 元件與實測、掛載
