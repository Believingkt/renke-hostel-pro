---
name: Cancelled At Truth
description: 取消時間一律以 orders.cancelled_at 為準；批次維運可用 app.skip_updated_at 停止刷新 updated_at。
type: feature
---

- 業績通報「今日取消」等所有取消時間判斷，一律使用 `orders.cancelled_at`，禁止改回 `updated_at`（批次更新會刷新 updated_at 造成歷史單誤報）。
- DB trigger `orders_set_cancelled_at_trg`：訂單狀態變為 `cancelled` 且 `cancelled_at` 為空時自動填 `now()`。程式端仍應主動寫入。
- 歷史資料已回填（2026-08-21 批次刷新那批改用 `created_at`）。
- 維運批次 UPDATE 前執行 `SET LOCAL app.skip_updated_at = 'on';`，`update_updated_at_column()` 會保留原 `updated_at`。
