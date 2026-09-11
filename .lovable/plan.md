# 設計稿（未施工）：一般訂房草稿補救掃描 ＋ 3DS 舊路徑退款補齊

兩項都只出設計，等核准才動手。

---

## 一、新增補救掃描排程 `paid-draft-reconcile`

### 1. 「卡住」判定條件

只掃 `pending_paid_order_drafts`，兩類：

- `status = 'pending_3ds'` 且 `created_at < now() - 15 分鐘`（3DS 一般 5 分鐘內結束；15 分鐘是安全門檻，避免與正在進行中的付款打架）
- `status = 'manual_review'` 且 `updated_at < now() - 15 分鐘`
- 另補一類保險：`status = 'payment_succeeded'` 且 `updated_at < now() - 15 分鐘`（tappay-notify 已標成功但補建中斷）
- 一律排除 `status = 'order_created'`、排除超過 7 天的舊草稿（過期不再處理，只標 `expired`）
- 每輪 `limit 50`，逐筆處理

排程頻率：每 10 分鐘（與團購對帳同節奏）。

### 2. 怎麼跟 TapPay 核對

用既有共用函式 `_shared/tappay.ts` 的 `queryTapPayRecord({ partnerKey, recTradeId })`（`group-buy-draft-reconcile` 用的同一支）。
`pending_3ds` 草稿若 `rec_trade_id` 為 null，改用 `filters.order_number = idempotency_key` 的查詢無法保證，因此這種情況直接視為「無法確定」→ 走第三類處理（不會誤退、不會誤建）。

### 3. 三種核對結果的處理

| 核對結果 | 處理 |
|---|---|
| 已扣款成功（`record_status` 0/1、`amount` 等於 `expected_amount`）且查無對應訂單 | 先把草稿更新為 `payment_succeeded`，再以 service-role 呼叫既有 `create-paid-order`（post-charge 模式，帶 `alreadyChargedRecTradeId`），成功後草稿標 `order_created` 並記 `order_id` |
| 確認未扣款成功（查無交易、或 `record_status` 為失敗） | 草稿標 `failed`（超過 7 天者標 `expired`），寫 `last_error` 說明來源為對帳排程；不動任何金流 |
| 核對本身失敗／金額不符／`rec_trade_id` 缺失／補建仍失敗 | 草稿標 `manual_review` ＋ 寫 `last_error`，並透過既有 `reportBackendError` 寫 `error_logs`，另建一筆後台 `notifications` 告警 |

金額不符一律不補建，直接 `manual_review`（與 `tappay-notify` 現行語意一致）。

### 4. 不會建出重複訂單

三層保護，全部沿用既有機制、不新增規則：

1. 掃描時先以 `orders.idempotency_key = draft.idempotency_key` 查詢，已存在就直接把草稿標 `order_created` 並跳過。
2. `create-paid-order` 進入點本身就有 idempotency 檢查，命中會回 `alreadyExists` 不重建。
3. `orders.idempotency_key` 唯一鍵是最後防線，競態插入會被 DB 擋下。

此外掃描只處理「更新超過 15 分鐘沒動靜」的草稿，天然避開與 `tappay-notify`／`PaymentResult` 同時處理同一筆的競態。

### 5. 與 `tappay-notify` 的關係

互補、不重疊：

- `tappay-notify` 是事件驅動的第一線（TapPay 回調當下立刻補建）。
- 本排程是時間驅動的第二線，只撿「第一線沒跑到或跑失敗、且已靜置 15 分鐘」的殘留草稿。
- 兩者共用同一支 `create-paid-order` 與同一組草稿狀態機，所以就算同時觸發也只會有一筆訂單。
- `tappay-notify` 現行邏輯完全不動。

### 6. 檔案異動範圍

新增（全部是新檔，不改既有程式）：

- `supabase/functions/paid-draft-reconcile/index.ts`
- cron：新增每 10 分鐘的排程呼叫這支函式

不修改：`create-paid-order`、`tappay-notify`、`process-tappay-payment`、`PaymentResult.tsx`、任何 DB table／trigger／RLS。
（本排程只 UPDATE `pending_paid_order_drafts` 自己的狀態欄位，orders 一律透過 `create-paid-order` 建立。）

排程頻率說明：每 10 分鐘＝每天 144 次，屬低頻對帳型工作。因為是「錢已收、訂單沒建」的資金落差，必須有時間驅動的兜底，最長延遲 10 分鐘；再稀疏會讓客人等太久。

---

## 二、`complete-3ds-booking` 補齊 insert 失敗一律退款

### 1. 現有「庫存被搶」自動退款分支

- 退款輔助函式 `refundAndFail` 定義於 `supabase/functions/complete-3ds-booking/index.ts` 第 186–219 行，內部呼叫 `_shared/tappay.ts` 的 `refundTapPay(partnerKey, body.recTradeId, verifiedAmount)`，並寫 `reportBackendError`。
- 唯一呼叫點在第 345–348 行：`if ((orderError.message || "").includes("inventory_unavailable")) return await refundAndFail("inventory_gate_on_insert", ...)`。

### 2. 其他 insert 錯誤現在的處理

同一個 `if (orderError)` 區塊，第 349–357 行：直接回 `{ success:false, message:"建立訂單失敗" }` 搭 HTTP 500，完全不退款。判斷「是 insert 錯誤」的依據就是 `orders.insert(...)` 回傳的 `orderError` 不為 null，範圍精確、不會涵蓋其他情境。

### 3. 修改做法

把 `refundAndFail` 泛用化，只動這一個區塊：

- `refundAndFail` 增加參數區分情境（`kind: 'inventory' | 'insert_error'`），庫存分支的回應內容、HTTP 409、`inventoryUnavailable: true`、既有文案完全維持不變。
- 新增 `insert_error` 分支：一樣呼叫 `refundTapPay` 退全額，`reportBackendError` 的 `category` 改為 `order_insert_failed_after_payment`，回應 HTTP 500，文案為「訂單建立失敗，款項已全額退回原信用卡（約 3–7 個工作天入帳）」；退款失敗則改為「已通知客服為您處理退款」。
- 第 349–357 行原本的裸 500 回應改為 `return await refundAndFail("order_insert_error", orderError.message)`。

不受影響的情境（確認不會誤退）：
- TapPay 本身回傳失敗／查無交易／金額不符 → 這些在 insert 之前就 return，根本沒進到 `orderError` 區塊，沒扣到錢也不會退。
- 重複訂單（idempotency 命中）→ 走既有 return，不進退款。
- insert 成功之後的行程、KOL webhook、寄信失敗 → 仍維持非致命、不退款。

### 4. 其他邏輯保證不動

3D 驗證、`tappay-query` 核對、價格驗證 fail-open、`resolveMemberId`、庫存判斷、insert 欄位內容、insert 之後的所有收尾流程，一行都不改。本項改動僅限 `refundAndFail` 函式本體與 `if (orderError)` 這一個區塊。

---

## 驗證方式（施工後）

- 單元測試：斷言 insert 錯誤分支會呼叫退款、TapPay 失敗分支不會呼叫退款。
- 排程：先以手動呼叫（帶單筆 draftId 參數）對既有 3 筆 `pending_3ds` 舊草稿做 dry-run 模式，只回報判定結果不寫入，確認判定正確後才掛 cron。
- 部署前重查一次各狀態草稿筆數，確認不會波及真實資料。
