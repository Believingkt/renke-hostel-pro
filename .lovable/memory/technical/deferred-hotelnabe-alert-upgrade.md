---
name: HotelNabe 靜默丟棄欄位升級為可觀測告警
description: HotelNabe order receiver 目前對 update_order_with_context 白名單外的欄位僅 console.warn，需評估是否改為可觀測告警（error_logs / 通知）。
type: feature
---
2026-09-10 複查結論：暫不處理，記錄待決。

HotelNabe `buildOrderPayload()` 會組出包含 `order_source`、`ota_channel`、`accommodation_id` 等不可變欄位的完整 payload，再經 `pickUpdatableOrderFields()` 靜默丟棄非白名單欄位。目前僅透過 `console.warn` 輸出，未寫入 error_logs 或發送告警。

未來若需處理，可選方案：
1. 在丟棄時寫入 error_logs，來源標為 `hotelnabe_order_receiver`。
2. 對確實不可變的欄位，改為直接不組進 patch；對可能遺漏的的欄位，則擴充白名單。
3. 加入 owltingSyncAlert 類的內部技術告警信。

此為非急迫債務，待後續評估。
