# ATM 逾期自動取消 → 補寄旅客通知信（設計稿，未施工）

## 一、cancel-expired-atm-orders/index.ts 現況

檔案共 179 行，兩段獨立流程：

- 第 12–49 行：建立 service-role client、算 `nowIso` / `taipeiIso` / `cutoffIso`（GRACE_MINUTES = 3），查「官網 legacy」逾期單：`payment_status='pending_payment'`、`atm_vacc_no not null`、`order_status<>'cancelled'`、`group_buy_payment_deadline_at is null`、`atm_expire_at < cutoff`，limit 200。
- 第 51–94 行：**官網 legacy 迴圈**（本次唯一要接寄信的位置）
  - 53：`paid_amount > 0` 直接跳過
  - 55–67：再讀一次最新狀態，已取消／已入帳／狀態非 pending 一律跳過
  - 68–80：寫 `[ATM Expire]` note，條件式 UPDATE 成 cancelled（`.eq(payment_status)`、`.neq(order_status)`，目前**沒有** `.select()`）
  - 81–84：UPDATE 失敗 → `continue`
  - 85：`cancelled.push(order_number)`
  - 86–93：寫一筆 `notifications`（站內通知，**不是**寄給客人的信）
  - 94：迴圈結束 ← 缺口就在這裡，客人完全收不到任何信
- 第 96–168 行：團購新制迴圈，已於 163–167 行 `sendAtmDeadlineExpiredEmail(...)`，本次**一行不動**。
- 第 170–179 行：console.log 統計與回傳 JSON。

## 二、接法提案（同意你的方向）

直接在本檔 import 共用模組、in-process 呼叫：

```ts
import { sendOrderCancelledEmail } from "../_shared/orderCancelledEmail.ts";
```

`sendOrderCancelledEmail(supabase, { orderId, cancelKind: 'atm_expired', deadlineText, triggerSource: 'atm_expire_cron' })`

可行且是最好的做法，理由：
- 共用模組已支援 `cancelKind: 'atm_expired'`（`orderCancelledEmail.ts:57–69`），文案、`booking_email_log` 寫入都現成，不需新增任何模組。
- 走 HTTP 會撞上 service-role 授權那道牆（就是這輪 403 的來源），in-process 直接用 cron 手上的 service-role client，沒有這個問題，也少一次網路往返與逾時風險。
- 與團購分支的既有寫法同構（團購也是 in-process 呼叫 `sendAtmDeadlineExpiredEmail`），維護一致。

`deadlineText` 用既有 `formatTaipei(new Date(o.atm_expire_at))`（`formatTaipei` 檔頭已 import，無需新增）。

## 三、動的範圍界線（唯一）

只做一件事：**在既有官網 legacy 迴圈中、一筆訂單成功取消（且已寫入 notifications）之後，多加一段寄信呼叫。**

明確不動：
- 取消判定條件（`paid_amount>0`、fresh 二次讀取、payment_status／order_status 檢查）
- 兩段 SQL 查詢的欄位與 where 條件（唯一例外見下）
- 迴圈結構、`continue` 時機、note 文字、notifications 內容
- 團購分支（96–168 行）整段
- `_shared/orderCancelledEmail.ts`、`send-order-cancelled-email`、任何資料表／RLS／trigger

唯一附帶的既有查詢調整（需你另外點頭，否則就不動）：第 34–42 行的 select 需要多帶 `guest_email` 嗎 → **不需要**，共用模組自己會重查訂單。所以查詢真的零改動。

另一個可選、與團購分支對齊的小改動：第 70 行 UPDATE 補 `.select('id').maybeSingle()`，改判 `if (upErr || !updated) continue;`，避免「沒真的更新到卻寄信」。這屬於取消邏輯的判斷式，若你認定越界，就維持原樣，只靠第五點的查重把關 —— 請你裁示要或不要。

## 四、單筆寄信失敗不得中斷整批

寄信呼叫整段包在 `try/catch` 內，catch 只 `console.error`，不 `continue`、不 throw、不改變 `cancelled` 陣列；`sendOrderCancelledEmail` 本身也是回傳 `{ ok:false }` 而非 throw，兩層都吞掉。寄信永遠排在 UPDATE 與 notifications **之後**，因此任何寄信失敗都不影響已 commit 的取消結果，也不會影響同批其他訂單。

## 五、查重機制（沿用 booking_email_log）

寄信前先查：

```
booking_email_log where order_id = o.id and email_type = 'order_cancelled' limit 1
```

有紀錄就跳過寄信（訂單先前已因客人取消或後台取消寄過信，不重複騷擾）。沒有才呼叫。

第二層保險：`sendOrderCancelledEmail` 成功／失敗都會寫一筆 `booking_email_log`（`status: sent|failed`），所以下一輪 cron 會看到紀錄而不重寄。若希望「失敗要重試」，查重條件需加 `status='sent'` —— 兩種語意請你選一種，預設採「不重寄」。

`previewTo` 有值時模組完全不寫 log，測試不會污染查重。

## 六、目前符合取消條件的真實訂單數（剛重查）

| 指標 | 數量 |
| --- | --- |
| 現在就會被這支函式取消的官網 legacy 訂單 | **0** |
| 其中未付款、且有 email 可寄的 | **0** |
| 尚未到期、未來會進入此條件的待付 ATM 訂單 | **0** |
| 團購新制待付 ATM 訂單 | **0** |
| 歷史上曾被自動取消（notes 含 `[ATM Expire]`） | 12（近 30 天 5 筆） |

也就是說：現在部署，下一次排程不會有任何訂單被取消，也不會寄出任何信；風險窗口是「未來有人開新的 ATM 待付訂單並逾期」。

## 七、部署前的驗證方案（不冒真實客人風險）

分三層，全部在部署前完成：

1. **單元測試（無副作用）**：對 `buildCancelEmail({ cancelKind:'atm_expired', deadlineText })` 加測試，斷言主旨、逾期文案、「請勿再匯款至原虛擬帳號」、且**不出現**退款／手續費區塊。純函式，不碰 DB、不寄信。
2. **真信內容確認（只寄給你）**：用已部署的 `send-order-cancelled-email`，帶一筆真實歷史 ATM 訂單 + `cancelKind:'atm_expired'` + `previewTo: sakithebest@gmail.com`，實際收信確認版型。`previewTo` 保證不寫 log、不寄給旅客。（此步需你出手觸發或另行授權呼叫方式，因為 service-role 呼叫我這邊拿不到。）
3. **部署後首輪安全性**：由第六點，目前符合條件筆數為 0，部署當下不可能誤發。若仍要更保守，可在建立一筆自有測試 ATM 訂單（收件人填你的測試信箱、過期時間設為過去）後再部署，觀察下一輪 cron 是否只取消該筆並只寄給你，確認後才視為驗收完成。

`cancel-expired-atm-orders` 在你明確授權部署之前維持不部署，這條規則不變。本輪未改任何程式、未執行任何 DB 寫入、未部署。
