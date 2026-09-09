# V5.5C 批次二（OwlTing）＋批次三（HotelNabe）

- [x] Migration：alert_recipients 新增 notify_owlting_sync_failure；update_order_with_context 擴充 OTA 白名單（同一 transaction 內 REVOKE FROM PUBLIC/anon/authenticated + GRANT service_role，postcheck 驗證）
- [x] 共用模組：_shared/orderContext.ts（RPC 呼叫＋白名單過濾）
- [x] 共用模組：_shared/owltingSyncAlert.ts（error_logs＋告警信）
- [x] B1 owltingAutoOrder 修改通知改用 RPC
- [x] B2 cancelAutoPendingOrders 逐筆 RPC，回傳 {cancelled, failed}，失敗記錄＋告警
- [x] B4/B5 owlting-fillup-submit 補單與寄信旗標
- [x] B7/B8 owlting-cm Cancel／Modify＋方案 A 回應（partial log＋告警）
- [x] B10 owlting-email-ingest 清除鎖房標記、取消結果處理
- [x] B11 owlting-cleanup-stale-pending
- [x] B12 owlting-order-push（dryrun／live 回寫）
- [x] B13 owlting-selfpush-link
- [x] H1 hotelnabe-order-receiver updateById 改用 RPC（白名單過濾，INSERT 路徑不變）
- [x] 前端 SystemHealthMonitor.tsx 新增「OTA 同步告警」開關
- [x] 部署 7 支 Edge Functions
- [x] Publish 前端

備註（不處理）：balance_payment_method 會被既有 trg_sync_order_payment_fields 正規化。
