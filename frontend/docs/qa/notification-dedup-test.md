# 通知中心去重 — 驗收測試流程

驗證重點：**新建一筆訂單時，無論開幾個後台分頁，每個分頁只彈一次 toast，通知中心也只新增一筆通知。**

## 架構對應（確保改動沒被回退）

執行測試前，請先確認以下三項仍然存在：

1. DB 唯一索引：`notifications_order_type_uniq` on `notifications (order_id, type) WHERE order_id IS NOT NULL`
2. DB Triggers：
   - `trg_create_new_order_notification` AFTER INSERT ON `orders`
   - `trg_create_order_update_notification` AFTER UPDATE ON `orders`
3. 前端 `src/hooks/use-order-notifications.tsx` 只 **訂閱** `notifications` 表，**不寫入**。

可用以下 SQL 快速確認：

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='notifications';

SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema='public' AND event_object_table='orders'
ORDER BY trigger_name;
```

---

## 測試前置

- 準備一台電腦、同一個瀏覽器，**登入同一個有後台權限的帳號**。
- 鎖定一間測試民宿（例如「哈庫納馬塔塔」），確認 `accommodation_id` 一致。
- 準備一筆可建立的訂單資料（任意房型、未來日期、姓名、電話）。

---

## 步驟

### 1. 開啟兩個後台分頁

- **分頁 A**：訪問 `/notifications`（通知中心）。
- **分頁 B**：訪問 `/orders`（訂單列表）。

兩個分頁都要使用同一民宿環境（網址列上的旅宿切換器顯示同一間）。

> 也可以開三個分頁、或在第二台裝置 / 手機上同時登入同一帳號 — 結果預期相同。

### 2. 紀錄當下基準

在分頁 A 觀察「未讀」徽章數字 N₀，並從通知列表記下最新一筆通知的時間戳。

### 3. 建立訂單

打開第三個分頁進入 `/orders`，點「新增訂單」建立一筆訂單並送出。記下系統產生的訂單編號（例如 `RK5M72B9`）。

### 4. 立即觀察兩個分頁（Toast）

回到分頁 A 與分頁 B，觀察右下角通知 toast：

✅ **通過條件：每個分頁只跳出 1 個「🎉 新訂單通知」toast，內容為剛建立的訂單編號。**
❌ 失敗：同一分頁出現 ≥ 2 個 toast，或顯示其他訂單編號。

### 5. 驗證通知中心去重

回到分頁 A，按「重新整理」或等待 realtime 更新：

✅ **通過條件**：
- 通知列表頂端只多出 **1 筆**「🎉 新訂單通知」，內容為步驟 3 的訂單編號。
- 未讀徽章變成 N₀ + 1。

### 6. SQL 直接覆核

到 Lovable Cloud 後台執行：

```sql
SELECT id, title, created_at
FROM public.notifications
WHERE order_id = (SELECT id FROM public.orders WHERE order_number = '<剛剛的訂單編號>')
  AND type = 'new_order';
```

✅ **通過條件**：只回 1 列。

### 7.（選做）狀態變更去重

在分頁 B 把這筆訂單從「待確認」改成「已確認」：

- 兩個分頁都應只跳出 1 個「📋 訂單狀態更新」toast。
- 通知中心對應這筆訂單的 `status_update` 類型仍只有 1 筆（描述會被更新成最新狀態，且 `is_read` 重置為 false）。

---

## 已知預期行為

- **多個分頁/裝置**：每個 client 都會收到 realtime 推送並彈自己的 toast，這是預期的。重點是 **不會重複插資料庫**，所以通知中心不會疊加。
- **同類型重複事件**：例如連按兩次「標為待確認」，不會新增新通知，但會把現有那筆 `status_update` 的 `description` 與時間更新，`is_read` 重置為 false。
- **不同類型**：同一筆訂單可同時有 `new_order`、`status_update`、`payment`、`refund` 各 1 筆。

---

## 失敗排查

| 症狀 | 可能原因 | 排查 |
|------|---------|------|
| 通知中心一次新增多筆 `new_order` | 唯一索引被丟掉 | 跑「架構對應」中第 1 條 SQL 確認索引存在 |
| 完全沒收到 toast | `notifications` 不在 realtime publication，或前端 channel 訂閱失敗 | 看 console；執行 `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications';` |
| 通知中心沒新增但 toast 有跳 | DB trigger 沒裝 / 被刪 | 跑「架構對應」中第 2 條 SQL |
| 收到別的旅宿的通知 | 前端 channel filter 失效 | 確認 `useOrderNotifications` 的 filter 為 `accommodation_id=eq.${accommodationId}` |
