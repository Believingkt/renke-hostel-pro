# V5.5C.0 — 訂單「變更／通知」區塊呈現方案比較（唯讀＋設計，未施工）

## 一、顯示與寄信是否綁在一起？

### 1. 各自獨立，證據如下

寄信路徑（與顯示無關）：
- DB trigger `orders_status_change_notify_trigger → enqueue_order_status_change()`：payment_status 變 paid/deposit_paid/refunded、order_status 變 confirmed/cancelled 時，寫入 `order_status_change_events` 佇列；由 Edge Function `notify-order-status-change` 掃描後寄 Email／LINE。
- Edge Functions 各自寄信並寫 `booking_email_log`：`send-booking-confirmation`、`send-final-payment-received`、`send-order-cancelled-email`、`admin-resend-booking-email`（手動重送）、`group-buy-resend-notification`（團購補寄，寫 `group_buy_payment_events`）。

顯示路徑（唯讀）：
- `OrderNotificationHistory.tsx` `load()` 只做 4 個 SELECT：`payment_status_history`、`booking_email_log`（團購再多讀 `group_buy_payment_events`）、`audit_logs`(entity_type='order_deposit')、`deposit_charges`，另外查 `profiles` 取姓名。
- `OrderAuditLogCard.tsx` 只 SELECT `audit_logs`(entity_type in order/order_meta)。

寫入路徑（與顯示無關）：
- `payment_status_history` 全庫唯一寫入者是 DB trigger `trg_log_payment_status_change → log_payment_status_change()`（前端／Edge Function 無任何 insert）。
- 押金 audit 由 `trg_log_order_deposit_change → log_order_deposit_change()` 寫入；`deposit_charges` 由押金相關 Edge Function 寫入。

結論：顯示層是純讀取，寄信是 trigger→佇列→Edge Function 的獨立鏈路，兩者沒有共用程式碼。

### 2. 只換顯示方式的風險（具體）

不動 trigger、不動寫入、不動 Edge Function 的前提下，對通知信功能的風險為零；真正的風險只在 UI 檔案本身：

- R1（中）：重送按鈕若在搬移過程中改動渲染條件或 `resend()` 的 `emailType` 字串，會造成「按鈕消失」或「寄錯模板」。這是唯一會實際影響寄信的地方（按鈕直接呼叫 `admin-resend-booking-email` / `group-buy-resend-notification`）。
- R2（低）：重送成功後會 `await load()` 重新整理列表；若拆元件後 `load` 沒接好，只是畫面不即時更新，信仍已寄出。
- R3（低）：團購分支（`orderSource==='group_buy'`、`isCardOrder`）條件若在合併時漏帶，會顯示錯誤的補寄按鈕組合。
- R4（低）：四來源合併排序時 `created_at` 時區／型別處理錯誤，只影響排序，不影響資料。
- R5（低）：`audit_logs` 的 RLS 已限制 entity_type，合併查詢若改寫 `.in()` 條件可能少讀或多讀，屬顯示範圍。

## 二、三個版本呈現比較（以 YC6U86W2 這類一般（非團購）訂單為例）

### A. 現況（OrderDetail 由上到下）

```
… 訂單資訊 / 押金管理 / 加購銷售 …
┌ 通知與付款紀錄  #YC6U86W2      [↻] [重送訂房確認][重送訂金通知][重送尾款通知]
│  ▸ 通知信件      （booking_email_log；狀態徽章＋模板名＋觸發來源＋收件人＋時間）
│  ▸ 付款狀態變更  （payment_status_history；未付款→已付訂金 (system)、已付/總額、時間）
│  ▸ 押金異動紀錄  （audit_logs order_deposit 欄位 from→to ＋ deposit_charges 扣退款動作）
└
┌ 變更紀錄（可摺疊，預設收合）
│  audit_logs(order / order_meta)：編輯／金額修改／已結清折扣修改／行銷資訊修改…
└
```

### B. 方案 A：只整合「變更紀錄」＋新 `order_change_log`

```
（通知與付款紀錄：完全不動，位置、三個小節、三顆重送按鈕原樣）

┌ 變更紀錄（統一時間線）
│  2026-09-08 14:22  金額修改      張小姐   總價 12,000 → 11,400
│  2026-09-08 14:20  系統自動      OwlTing 同步   訂單狀態 pending → confirmed
│  2026-09-07 10:05  行銷資訊修改  Nicole   成交組 → 小倩
│  （來源標記：手動紀錄 / 自動紀錄；同 txid 收斂為一筆）
└
```
差異：只有下半部那張卡的內容變多、變完整（自動變更也看得到）。上半部維持原樣。

### C. 方案 B：四來源全部併入同一條時間線

```
┌ 訂單歷程                          [↻] [重送訂房確認][重送訂金通知][重送尾款通知]
│  [全部][變更][付款][押金][通知信]   ← 篩選 chips
│
│  09-08 14:22  🟠 金額修改    張小姐    總價 12,000 → 11,400        (order_change_log)
│  09-08 14:21  🟢 付款狀態    系統      未付款 → 已付訂金 / 已付 3,600 / 總額 12,000
│  09-08 14:21  ✉️ 通知信      系統自動  訂金已收到 → guest@x.com 已寄出
│  09-08 14:20  🔵 押金異動    Ruby      應收押金 0 → 2,000
│  09-07 10:05  🟣 行銷資訊    Nicole    成交組 → 小倩                (audit_logs)
└
```
一張卡、一條時間線、以類型 chips 篩選；重送按鈕移到這張卡的標題列右側（與現在同一排位置，只是卡片名稱改為「訂單歷程」）。

### 按鈕擺放三個選項（方案 B）
1. 建議：維持在標題列右側（同現況相對位置），卡名改「訂單歷程」——使用者肌肉記憶不變。
2. 次選：保留「通知與付款紀錄」外殼與按鈕，內容改成統一時間線＋篩選，變更紀錄卡移除。
3. 不建議：把按鈕拆到訂單頂部操作區——與紀錄脈絡脫節，且要改 OrderDetail 版面。

## 三、重送按鈕的顯示邏輯（現況查證）

`OrderNotificationHistory.tsx` 標題列：
- 全部按鈕都需 `canManage === true`（由 OrderDetail 傳入的權限）。
- 非團購（`order_source !== 'group_buy'`）：固定顯示三顆——重送訂房確認 / 重送訂金通知 / 重送尾款通知。不隨付款狀態變化。
- 團購（`order_source === 'group_buy'`）：
  - 付款方式含 credit/card/tappay → 顯示「補寄旅客通知信：全額付款完成」＋「補寄民宿通知信」。
  - 其他（匯款）→ 顯示「補寄旅客通知信：訂房成立・待匯款」＋「補寄旅客通知信：訂金已收到」＋「補寄民宿通知信」。
- 另有一顆重新整理 ↻，不受 canManage 限制。

方案 A：這些按鈕完全不受影響，維持原卡片、原位置、原邏輯。正確。

## 四、方案比較表

| 項目 | 方案 A | 方案 B |
|---|---|---|
| 需改檔案 | `OrderAuditLogCard.tsx`（或新元件）＋新表/trigger | 同 A ＋ `OrderNotificationHistory.tsx` 重構、`OrderDetail.tsx` 版面調整 |
| 是否動寫入／寄信程式碼 | 否 | 否（仍只動顯示層＋按鈕搬位） |
| 需動 DB | 新 `order_change_log` 表＋trigger＋RLS（兩案相同） | 同左，不需再動 `payment_status_history`／`audit_logs`／`booking_email_log` |
| 風險等級 | 低 | 中低（風險集中在重送按鈕搬移，見 R1／R3） |
| 工作量 | 中（表＋trigger＋一張卡） | 中偏大（多出時間線合併、類型 chips、四來源型別統一、按鈕搬移與回歸測試） |
| 多出來的部分 | — | 四來源正規化為同一 item 型別、篩選 UI、按鈕搬移、團購分支保留、E2E 重送回歸測試 |

## 五、建議
先做方案 A（零風險拿到「全訂單變更都看得到」這個目標），穩定後若仍希望單一時間線，再把方案 B 當獨立小改動執行，屆時只剩顯示層與按鈕搬移。
