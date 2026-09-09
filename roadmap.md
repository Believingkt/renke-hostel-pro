# Roadmap — 批次二/三 施工（已核准 2026-09-10）

- [ ] Migration：alert_recipients 新增 notify_owlting_sync_failure；update_order_with_context 擴充白名單（同交易 REVOKE FROM PUBLIC/anon/authenticated，postcheck 驗證）
- [ ] 新增 _shared/owltingSyncAlert.ts（OTA 同步失敗告警信）
- [ ] B1/B2 owltingAutoOrder.ts（改 RPC；取消改逐筆 + 成功/失敗清單 + error_logs + 告警）
- [ ] B4/B5 owlting-fillup-submit
- [ ] B7/B8 owlting-cm（方案 A：仍回 Success，失敗寫 cm log partial + error_logs + 告警）
- [ ] B10 owlting-email-ingest（含 cancelAutoPendingOrders 呼叫端）
- [ ] B11 owlting-cleanup-stale-pending
- [ ] B12 owlting-order-push、B13 owlting-selfpush-link
- [ ] H1 hotelnabe-order-receiver（白名單 pick，剔除 accommodation_id/order_source）
- [ ] 前端 SystemHealthMonitor.tsx 新增「OTA 同步告警」開關
- [ ] 部署 edge functions + Publish 前端 + 回報
