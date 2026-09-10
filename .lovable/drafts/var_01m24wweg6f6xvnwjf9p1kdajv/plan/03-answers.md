## 1. 工作量評估

| 項目 | 量 |
| --- | --- |
| 需修改的 Edge Function 檔案 | 24（26 減去 `orderContext.ts` 與純轉呼叫者） |
| 需修改的前端檔案 | 12 |
| 新增純函式檔案（每個 function 一支 `patchBuilders.ts`） | 約 20 |
| 新增測試檔 | 3～5（一支 RPC 一支測試，共用同一個比對工具） |
| 需要重新部署的 Edge Function | 24 |

複雜度分級：

- **低（約 14 處，A 型）**：機械式搬移，每處 5～15 分鐘。
- **中（約 9 處）**：patch 含 2～3 個條件展開，需把條件值當參數傳入。
- **高（約 5 處，`member-order-manage`、`cancel-order-with-refund`、`tappayWebhookProcessor`、`owltingAutoOrder`、`owlting-fillup-submit`）**：需要先釐清哪些值是「算出來的」、哪些是「決定送不送」的旗標，逐處要有 rollback 驗證。

**還有一個關鍵前提**：白名單那一端也要自動化，否則等於換一份人工清單。做法是加一支腳本，用 `pg_get_functiondef` 讀出五支 RPC 現行定義、正則抽出白名單陣列、寫成 `src/test/__snapshots__/rpc-whitelists.json`；測試讀這份快照。快照過期（超過 N 天）測試直接失敗，逼它重抓。這支腳本約半天。

**總量**：純函式抽取本體約 2～3 個工作階段；加上快照腳本、測試骨架、24 支部署與驗證，整體約 4～5 個階段。

## 2. 可以分階段嗎

可以，而且**應該**分。比對工具與快照腳本一次做好之後，每多抽一支呼叫端就多一支被保護的路徑，沒有「全部做完才有用」的門檻。建議順序：

- **階段 0**：白名單快照腳本 + 比對測試骨架 + 拿 1 支 A 型呼叫端（`charge-deposit`）當示範。
- **階段 1（今天出過包＋金流最重）**：`update_order_fields_v1` 全部 8 個前端呼叫點（今晚 `guest_gender` 就是從這裡炸的）、`tappay-notify`、`tappay-refund-notify`、`tappayWebhookProcessor`、`cancel-order-with-refund`。
- **階段 2（OTA）**：`owltingAutoOrder`、`owlting-fillup-submit`、`owlting-cm`、`hotelnabe-order-receiver`、`sync_order_rooms_v1` 兩個呼叫點。
- **階段 3（其餘低頻）**：團購、claim、public/member cancel、押金、綁卡、入住扣款、cleanup、push/selfpush。

未抽完的呼叫端不受影響，維持現狀。

## 3. 會不會改到現有行為

**設計上不會，但不是零風險**，需要靠紀律把風險壓到可忽略：

- 只搬「最後那個物件字面值」，不搬任何 `await`、不搬順序、不搬 early return。
- 純函式不得存取 `supabase`、`Deno.env`、`Date.now()`；時間戳、金額、備註文字都由呼叫端算好後傳入（`new Date().toISOString()` 留在原地或當參數）。
- 真正的風險點是 B 型的 `...(cond ? {...} : {})`：抽出去時若把 `cond` 的來源看錯，會少送或多送欄位。這五處各自要有一組 BEGIN…ROLLBACK 實測，比對抽取前後送出的 key 集合完全相同。
- 額外保險：抽取當次的 diff 應該是「刪掉 N 行物件字面值、在新檔加回同樣 N 行」，逐字可比對。

## 4. 完成後怎麼跑

- **本機／每次改動**：`vitest` 一起跑，秒級，等於進 CI 前就擋下來（今晚 `guest_gender` 這類會在寫程式當下就紅燈）。
- **對照正式環境**：白名單快照要新鮮。建議加一個排程任務，**每天一次**重抓五支 RPC 定義；若與快照不一致就發告警（沿用現有 `SystemHealthMonitor` 的通報管道）。這樣「有人改了 RPC 白名單但沒改呼叫端」、以及反向情況，都會在 24 小時內被抓到。
- 不需要手動執行；唯一人工動作是收到告警後決定要補哪一邊。

## 待你決定

要不要開始、以及分成幾個階段。我不會在你說「核准」之前動任何檔案。
