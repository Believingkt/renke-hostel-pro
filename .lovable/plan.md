# Step 3 方案 B：訂單歷程統一時間線（唯讀設計，未施工）

把「通知與付款紀錄」（通知信、付款狀態變更、押金異動、重送按鈕）與「變更紀錄」（order_change_log + audit_logs order/order_meta）合併成單一卡片「訂單歷程」，上方加類型篩選，重送按鈕原封不動搬到標題列右側。

**本次不寄信、不動任何寫入路徑、不動 DB。純顯示層。**

---

## 一、四個來源正規化

### 1.1 統一 item 型別

```ts
type TimelineKind = "change" | "payment" | "deposit" | "email";
type ActorType = "user" | "system" | "unknown";

interface TimelineItem {
  id: string;              // 加來源前綴：c_/a_/p_/d_/dc_/m_
  kind: TimelineKind;
  at: string;              // ISO，統一用 created_at / changed_at
  actorType: ActorType;
  actorId: string | null;
  actorEmail: string | null;
  actorLabel: string | null;  // system 時的流程名
  badge: { text: string; tone: string };
  summary: string;            // 收合列右側一句話
  changes: OrderFieldChange[];// 展開時的 before→after
  extra?: React.ReactNode;    // 錯誤訊息、收件人等
}
```
四個來源各寫一支 mapper 產出 `TimelineItem`，其餘渲染、展開、去重、姓名補齊邏輯共用一份。

### 1.2 payment_status_history → actor 對齊（查證結果）

寫入者只有 trigger `log_payment_status_change()`：
```
source := COALESCE(NULLIF(current_setting('app.change_source',true),''),'system')
changed_by := auth.uid()
```
- 全庫 389 筆，`source` **唯一值就是 `'system'`**（沒有任何一筆帶其他值）。所以現在畫面上那個 `({p.source})` 括號 **不是**「這是系統做的」的判斷，只是把欄位原樣印出來，一律印 `(system)`。
- 真正能分辨真人／系統的是 `changed_by`：389 筆中 **298 筆有值（真人 auth.uid()）**、91 筆為 NULL（service_role／trigger 情境）。

對齊規則（與 order_change_log 的 actor_type 同一標準）：

| payment_status_history | 正規化後 |
|---|---|
| `changed_by IS NOT NULL` | `actorType='user'`，`actorId=changed_by`，姓名走 profiles 查表（與變更紀錄同一份 nameMap） |
| `changed_by IS NULL` | `actorType='system'`，`actorLabel = source`（目前恆為 `system` → 顯示「系統・自動處理」） |

即：**廢掉現行 `(system)` 這個誤導字串**，改成跟變更紀錄一致的「真人姓名 / 系統・xxx」。這是本次唯一一處顯示語意的實質修正，其餘只是搬位置。

### 1.3 audit_logs(entity_type='order_deposit') → actor 對齊

全庫 461 筆，**461 筆 `user_id` 皆非 NULL**（0 筆系統寫入）。現行已用 `profiles.name → user_email → 「系統／排程」` fallback。

正規化：`actorType='user'`、`actorId=user_id`、`actorEmail=user_email`，姓名共用同一份 nameMap（原本這張卡自己查一次 profiles，合併後只查一次）。fallback 順序與變更紀錄卡完全相同 → 顯示行為不變，只是文字來源統一。

`details` 是 `{field:{from,to}}`，轉成 `changes[]`：`{field, label: DEPOSIT_FIELD_LABEL[field] ?? getFieldLabel(field), before, after}`，值格式化沿用 `formatDepositValue`（NT$ 千分位、cash/charged 等中文字典）——**不改用 orderAuditDiff 的 formatChangeValue**，否則押金狀態會退化成英文原字串。

`deposit_charges`（9 筆）：`actorType = performed_by ? 'user' : 'system'`，`actorLabel = trigger_source==='scheduled' ? 'scheduled_charge' : 'manual'`，summary＝`押金扣款/退款 NT$x（自動排程/手動・成功/失敗）`，錯誤訊息放 extra。

### 1.4 booking_email_log / group_buy_payment_events

- `actorType = triggered_by ? 'user' : 'system'`；`actorLabel = trigger_source`（沿用 `TRIGGER_SOURCE_LABEL`）。
- 團購 mapper（`parseGroupBuyNote`）整段照搬，`triggered_by` 為文字 `actor_label` → 一律 `actorType='system'`、`actorLabel=該文字`（維持現況顯示）。
- badge 用現有 `EMAIL_STATUS_LABEL/VARIANT`，summary＝`模板名 → 收件人`。

### 1.5 order_change_log / audit_logs(order, order_meta)

**完全沿用 `OrderAuditLogCard` 現有邏輯，一行不改**：txid 收斂、`AUDIT_SUBTYPE_FIELD_HINT` 3 秒去重、`actor_type==='user'` → user_create/update、否則 system_create/system_update、`SYSTEM_LABELS` 對照。只是把輸出包成 `TimelineItem`（`kind='change'`）。

---

## 二、篩選對照表

| 篩選標籤 | 收錄來源 | 對應 action_type / kind |
|---|---|---|
| 全部 | 四類全收 | — |
| 變更 | `order_change_log`、`audit_logs(entity_type in order, order_meta)` | update / inline_edit / price_edit / paid_discount_edit / paid_addon_edit / cancel / checkin / checkout / undo_* / meta_edit / order_source_change / order_date_change / kol_quota_override / system_update / system_create / user_create / create |
| 付款 | `payment_status_history` | payment_status_change（單一 kind，無子類型） |
| 押金 | `audit_logs(entity_type='order_deposit')` ＋ `deposit_charges` | deposit_setting_change / deposit_charge / deposit_refund |
| 通知信 | `booking_email_log` ＋ 團購 `group_buy_payment_events(email_sent, email_failed)` | email_sent / email_resent / email_failed |

規則：**篩選只在前端 `filter()`，不改任何查詢**；四個 chip 各自顯示筆數（`全部 21 / 變更 16 / 付款 1 / 押金 2 / 通知信 0`）；筆數為 0 的 chip 顯示為 disabled 而不隱藏，避免使用者以為功能不見。預設 `全部`。

`audit_logs` 的 `order_deposit` 與 `order/order_meta` 是**兩次獨立 query**（`.eq('entity_type', ...)` vs `.in(...)`），維持現行寫法不合併，避免 RLS 條件被改動。

---

## 三、重送按鈕（完整搬移，邏輯零改動）

### 3.1 判斷邏輯（現況＝搬移後，逐字相同）

| 條件 | 顯示 |
|---|---|
| `canManage === false` | 一顆都不顯示（重新整理 ↻ 仍顯示，不受限） |
| `canManage && order_source !== 'group_buy'` | 固定三顆：重送訂房確認(`booking_confirmation`)／重送訂金通知(`deposit_received`)／重送尾款通知(`final_payment_received`)。**不隨付款狀態變化** |
| 團購 ＋ `payment_method` 符合 `/credit|card|tappay/i` | 「補寄旅客通知信：全額付款完成」(`guest`,`full_payment`) ＋「補寄民宿通知信」(`venue`) |
| 團購 ＋ 其他（匯款） | 「補寄旅客通知信：訂房成立・待匯款」(`guest`,`booking_pending`) ＋「補寄旅客通知信：訂金已收到」(`guest`,`deposit_received`) ＋「補寄民宿通知信」(`venue`) |

`isGroupBuy` / `isCardOrder` 兩個布林的算式、三顆按鈕的 `label`／`description`／`loading` key（`gb_guest_full`、`gb_guest_booking_pending`、`gb_guest_deposit`、`gb_venue`）**原字串搬過去，不重寫**。

### 3.2 搬移方式
整段 `<div className="flex items-center gap-2">…</div>`（現 L304–363，含 ↻ 與所有 `ResendButton`）連同 `ResendButton` 元件（L501–536）、`resend()`、`resendGroupBuy()`、`resendingType` state **原封不動剪貼**到新卡片 CardHeader 右側。`EMAIL_TYPE_LABEL` 等常數一併搬移（`ResendButton` 的 description fallback 依賴它）。

---

## 四、風險評估

### 4.1 完全不需要動「觸發寄信」的程式碼——原因

1. 按鈕 onClick 呼叫的是 `resend(emailType)` / `resendGroupBuy(target, guestTemplate, key)`，函式本體與簽章**逐字不變**，只是宣告位置從 `OrderNotificationHistory` 換到 `OrderTimelineCard`。
2. 這兩支函式內部呼叫 `supabase.functions.invoke("admin-resend-booking-email", {body:{orderId, emailType}})` 與 `("group-buy-resend-notification", {body:{orderIds:[orderId], targets:[target], guestTemplate}})`——**body 形狀不變**，兩支 Edge Function 一行不改、不重新部署。
3. 自動寄信鏈路是 `orders` trigger → `enqueue_order_status_change()` → `order_status_change_events` 佇列 → `notify-order-status-change`，與顯示層零共用程式碼；本次不碰 trigger、不碰佇列、不碰任何 Edge Function。
4. `booking_email_log`、`payment_status_history`、`audit_logs`、`deposit_charges` 在本次改動中**只有 SELECT**，沒有任何 insert/update。

殘留風險（來自稍早調查的 R1/R3，本設計的緩解）：
- R1 按鈕消失／寄錯模板 → 用「整段剪貼、不重寫字串」的方式搬移，並在測試計畫做四情境快照比對。
- R3 團購分支漏帶 → 同上，`isGroupBuy`/`isCardOrder` 條件與 JSX 整塊搬。
- R2 重送後 `await load()` 沒接好 → 新卡片的 `load()` 是合併版；重送成功後改呼叫同一支 `load()`，測試會驗證列表即時刷新。

### 4.2 舊資料相容性（實查數量）

| 來源 | 全庫筆數 | 格式差異 | 合併後風險 |
|---|---|---|---|
| `payment_status_history` | 389（298 真人 / 91 系統） | `source` 恆為 `system`；`paid_amount/final_price` 為 numeric 可能 NULL | 無；NULL 沿用現行 `|| 0` |
| `audit_logs` order_deposit | 461（user_id 全非 NULL） | `details` 為 `{field:{from,to}}`，`from` 可能 `null` | 無；`formatDepositValue` 已處理 null→「—」 |
| `deposit_charges` | 9 | — | 無 |
| `booking_email_log` | 38 ＋ 團購事件 107 | 團購走 note 字串解析 | 無；mapper 照搬 |
| `audit_logs` order/order_meta | 1881 | 新舊 details 兩種格式 | 無；現行去重與 fallback 照搬 |
| `order_change_log` | 32 | — | 無 |

不會有任何一筆消失：合併是四個陣列 concat 後依時間排序，沒有任何跨來源的丟棄邏輯；唯一的丟棄是**現行就已存在**的 audit↔change_log 3 秒去重（只作用於 `entity_type='order'` 且無可展開內容者），本次不改其條件。排序統一用 `+new Date(x.at)` 降冪，時間一律 `toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})`——**現況兩張卡不一致**（變更紀錄用台北時區、通知卡用 `date-fns format` 走瀏覽器本地時區），合併後統一為台北時區，這是刻意的一致化。

---

## 五、元件 diff（設計）

新檔 `src/components/orders/OrderTimelineCard.tsx`；`OrderNotificationHistory.tsx`、`OrderAuditLogCard.tsx` **保留檔案不刪**（先只換掛載點，回退＝改回兩行 JSX）。

`src/pages/OrderDetail.tsx`：
```diff
-        <OrderNotificationHistory
-          orderId={order.id}
-          orderNumber={order.order_number}
-          canManage={canManage}
-          orderSource={order.order_source}
-          paymentMethod={order.payment_method}
-        />
+        <OrderTimelineCard
+          orderId={order.id}
+          orderNumber={order.order_number}
+          canManage={canManage}
+          orderSource={order.order_source}
+          paymentMethod={order.payment_method}
+          refreshKey={(order as any).updated_at || ""}
+        />
@@
-      {order && <OrderAuditLogCard orderId={order.id} refreshKey={(order as any).updated_at || ""} />}
```

`OrderTimelineCard.tsx` 結構：
```tsx
const load = useCallback(async () => {
  const [p, e, d, c, auditRes, changeRes] = await Promise.all([
    /* 1 payment_status_history  — 查詢語句與現行逐字相同，多選 changed_by */
    /* 2 booking_email_log        — 現行語句 */
    /* 3 audit_logs order_deposit — 現行語句 */
    /* 4 deposit_charges          — 現行語句 */
    /* 5 audit_logs order/order_meta — 現行 OrderAuditLogCard 語句 */
    /* 6 order_change_log         — 現行 OrderAuditLogCard 語句 */
  ]);
  if (isGroupBuy) { /* group_buy_payment_events mapper 照搬 */ }
  const items = [
    ...mapChange(changeRes, auditRes),  // 含 txid 收斂＋3 秒去重（照搬）
    ...mapPayments(p), ...mapDeposits(d), ...mapCharges(c), ...mapEmails(e),
  ].sort((a,b) => +new Date(b.at) - +new Date(a.at));
  // 一次補齊所有 actorId 的 profiles.name
}, [orderId, isGroupBuy, refreshKey]);
```
```tsx
<Card>
  <CardHeader>
    <CardTitle><History/> 訂單歷程 {orderNumber && <span>#{orderNumber}</span>}</CardTitle>
    <div className="flex items-center gap-2">{/* ↻ ＋ 重送按鈕整塊剪貼 */}</div>
    <div className="flex gap-1.5 flex-wrap">{/* 全部/變更/付款/押金/通知信 chips＋筆數 */}</div>
  </CardHeader>
  <CardContent>
    {/* 單一 <ul>：badge + actor 名 + summary + 台北時間；有 changes 才可展開 */}
    {/* 預設顯示 15 筆，「顯示全部 N 筆」沿用 */}
  </CardContent>
</Card>
```
卡片預設**展開**（現行變更紀錄卡預設收合，但通知卡預設展開；合併後以通知卡的行為為準，避免付款／押金紀錄變得更難找）。

---

## 六、測試規劃

### 6.1 並排對照（真實訂單 YC6U86W2，`1e025ed8-…`）
實查：付款狀態 1 筆、押金異動 2 筆、押金扣退 0 筆、通知信 0 筆、變更 14 筆、order_change_log 0 筆。

| 合併前 | 合併後（全部） |
|---|---|
| 通知信件：`尚無寄送紀錄` | （通知信 chip 顯示 0、disabled） |
| 付款狀態變更：`已付訂金 → 已付清 (system)`／已付 x/總額 y／09-06 09:42 | `付款狀態 · 吳雲蔚 · 已付訂金→已付清（已付 x/總額 y）· 2026-09-06 17:42`（actor 由 changed_by=43d6838f… 解析為真人姓名，取代 `(system)`） |
| 押金異動 09-06 09:42：應收/已扣款 0→8000、方式→現場現金、狀態 pending→已扣款、操作者 wuyunwai@gmail.com | `押金設定異動 · 吳雲蔚 · 3 項變更`，展開內容逐字相同 |
| 押金異動 09-37:15：應收 5000→8000、方式 現場現金→— | `押金設定異動 · 吳雲蔚 · 2 項變更`，同上 |
| 變更紀錄（收合）14 筆：inline_edit ×10、payment_status_change、meta_edit、create… | 同 14 筆，badge/展開內容不變，與上述 3 筆依時間交錯排序 |

驗收：合併後「全部」筆數 = 1+2+0+0+14 = **17**，與合併前四區塊筆數總和一致，逐筆時間戳、badge 文字、展開內容比對相同（時間由瀏覽器本地改為台北時區顯示）。
另補 NJ3U85G6（`ff33a2ce-…`：付款 3、變更 7、change_log 2）驗證 change_log 與 audit 的去重在合併後行為不變；CE2V95Y5（`652770d9-…`，團購 ATM、付款 2 筆）驗證團購三顆補寄按鈕組合。

### 6.2 重送按鈕功能測試
1. **快照比對（不寄信）**：四種情境（一般＋canManage、一般＋非 canManage、團購信用卡、團購匯款）分別擷取改動前後的按鈕清單，逐字比對 label 集合與順序。
2. **簽章驗證（不寄信）**：暫時 stub `supabase.functions.invoke`，點三顆按鈕確認送出的 `functionName` 與 `body` 與改動前完全相同（`{orderId, emailType}` / `{orderIds, targets, guestTemplate}`）。
3. **真實寄送（擇一、需你點頭）**：在一張測試訂單上實際按「重送訂房確認」，確認收到信、`booking_email_log` 新增一筆 `trigger_source='manual_resend'`、列表自動刷新（驗 R2）。此步驟涉及真的寄出郵件，施工時再單獨確認要不要做、用哪張訂單。
4. 失敗路徑：對不存在的 orderId 觸發，確認 toast 顯示「重送失敗：…」且不 crash。

---

## 七、本次不做
- 不移除任何 notes 的 🔒／【】文字（A 類延後，維持先前決定）。
- 不動 `payment_status_history`、`audit_logs`、`booking_email_log`、`deposit_charges` 的任何寫入者、trigger、Edge Function。
- 不刪除 `OrderNotificationHistory.tsx` / `OrderAuditLogCard.tsx`（保留為回退路徑）。
- 不做 DB migration。
