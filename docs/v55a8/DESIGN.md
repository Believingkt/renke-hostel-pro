# V5.5A.8 設計文件（唯讀＋設計階段，尚未施工）

範圍：一、告警開關 UI 補齊；二、`alert_recipients` 新增 `notify_order_rooms_failure`；三、`rebuildOrderRooms` 止血補丁。
第四項（order_rooms 修復 RPC）另案提供。

---

## 一、SystemHealthMonitor.tsx 補齊開關

檔案：`src/components/headquarters/SystemHealthMonitor.tsx`

### 1. 型別

```ts
interface AlertRecipient {
  id: string;
  email: string;
  is_active: boolean;
  notify_health_check: boolean;
  notify_frontend_error: boolean;
  notify_payment_webhook: boolean;        // 新增
  notify_order_rooms_failure: boolean;    // 新增
  created_at: string;
}
```

`loadAll()` 已用 `select("*")`，不需改查詢。

### 2. UI

表頭由 4 欄改為 6 欄，順序：Email／健檢告警／前端錯誤／金流告警／房型明細告警／啟用／（刪除）。
兩個新 Switch 完全比照現有寫法：

```tsx
<TableHead className="w-24 text-center">金流告警</TableHead>
<TableHead className="w-24 text-center">房型明細告警</TableHead>
...
<TableCell className="text-center">
  <Switch
    checked={r.notify_payment_webhook}
    onCheckedChange={(v) => handleToggle(r.id, "notify_payment_webhook", v)}
  />
</TableCell>
<TableCell className="text-center">
  <Switch
    checked={r.notify_order_rooms_failure}
    onCheckedChange={(v) => handleToggle(r.id, "notify_order_rooms_failure", v)}
  />
</TableCell>
```

`handleToggle(id, field, value)` 為泛用欄位更新（`keyof AlertRecipient`），型別補上後即可直接支援，邏輯不動。
Card 的 `CardDescription` 文案由「設定接收健檢失敗與前端崩潰告警的 Email」改為「設定接收健檢失敗、前端崩潰、金流事件與房型明細重建失敗告警的 Email」。
行動裝置：此表格已在既有 Card 內，新增兩欄後於窄螢幕會橫向捲動，維持現況不另做 RWD 改造（超出本次範圍）。

### 3. 新增收件人送出邏輯（選擇與理由）

現況：`insert({ email })`，其餘吃 DB 預設值。
**選擇：明確帶值。**

```ts
.insert({
  email,
  notify_health_check: true,
  notify_frontend_error: true,
  notify_payment_webhook: true,
  notify_order_rooms_failure: true,
})
```

理由：
- 目前「新增後看到的開關狀態」是由 DB 預設值決定，前端無從得知；明確帶值後畫面與寫入一致，不會出現「UI 顯示 A、DB 實際 B」的落差。
- 未來若有人改動 DB 預設值，不會無聲改變前端行為。
- 這四個旗標都是「新收件人預設全收，再由人自行關掉」的語意，明確寫出比較好讀。

### 4. 不動的部分

`paymentAlert.ts`、`health-check`、前端錯誤告警的判斷邏輯完全不動；本項只補型別與 UI。

---

## 二、DB migration：`alert_recipients` 新增 `notify_order_rooms_failure`

### 預設值選擇

**`NOT NULL DEFAULT true`**。理由：
- 與既有三個 notify_* 旗標一致（皆為 `NOT NULL DEFAULT true`），避免同一張表出現兩種語意。
- 目前 `alert_recipients` 為 0 列，DEFAULT 對既有資料無任何影響（0 業務資料異動）。
- 告警類旗標寧可預設開啟、由人主動關閉；預設 false 會讓「有人設了收件人卻收不到房型告警」變成沉默失敗。

### Migration（`01_migration.sql`）

precheck 以「目前欄位清單指紋」exact match（現值 `1dc2bb34db294ed2ef7328f6f1e5f338`，8 欄），不符即中止；
postcheck 驗證新欄位存在、型別/nullable/default 正確、欄位數為 9、且 `count(*) filter (where notify_order_rooms_failure is not true)` = 0。
單一 transaction，無 DML。

### Rollback（`02_rollback.sql`）

precheck 驗證欄位確實存在且為本次新增的定義，`ALTER TABLE ... DROP COLUMN`，postcheck 驗證欄位數回到 8 且指紋回到 `1dc2bb34db294ed2ef7328f6f1e5f338`。

RLS：不新增 policy，沿用 `alert_recipients` 既有 policy（欄位層級不受影響）。

---

## 三、rebuildOrderRooms 止血補丁（A 段設計，1／2／3／5 點不變）

檔案：`supabase/functions/_shared/owltingAutoOrder.ts`

1. `rebuildOrderRooms()` 檢查 delete、room_units 查詢、每一筆 insert 的 `error`，任一有錯即 `throw new Error(...)`，不再吞掉。
2. 呼叫端現況：`autoCreateOrder()` 與 `applyOwltingModification()` 外層都有 `try/catch`，會回傳 `{ ok:false, error }`；因為 `rebuildOrderRooms` 從未 reject，所以這條路徑從未被觸發。catch 本身可用，但**沒有寫 staging 標記**，需補。
3. 失敗時 staging 標記（`owlting_email_parsed_staging`）：
   - `auto_create_error` = 原始錯誤訊息
   - `review_status` = `'pending_review'`
   - `review_notes` = `[需人工檢查] 房型明細重建失敗：<訂單編號>／<錯誤摘要>`
   - `modification_diff_status` = `'rebuild_failed'`
   - `auto_order_id` 保留（訂單主檔已建立，需查得到）
   - `auto_created_at` 維持 NULL（代表未完成）
4. 告警：**新增**寄信，比照 `sendPaymentAlertEmail` 模式（同一支 Resend、同一張 `alert_recipients`），收件人條件改為 `is_active = true AND notify_order_rooms_failure = true`。新增 `supabase/functions/_shared/orderRoomsAlert.ts`，內容為內部技術告警語氣（訂單編號、OBE 編號、錯誤訊息、staging id），不寄給客人。不發明新的通知管道（無 Slack、無 dashboard）。
5. 測試（BEGIN…ROLLBACK，不碰正式資料）：以既有 `room_unit_id` 人為觸發 `validate_room_unit_no_conflict`，確認
   (a) 錯誤被捕捉並 throw；
   (b) delete 已生效但 insert 失敗時，該訂單 `order_rooms` 會變成 0 列（現行架構無交易保護，這正是第四項要解決的問題，止血補丁只讓它「看得見」）；
   (c) staging 標記如預期寫入。
   測試結束 ROLLBACK，正式資料 0 異動。

---

## 白話說明（一～三）

- 現在：HQ 的告警收件人只看得到「健檢告警／前端錯誤」兩個開關，金流告警其實一直存在但畫面上藏著；OwlTing 自動建單時如果房型明細寫入失敗，系統會當作成功、沒有人會知道。
- 之後：畫面上四個開關都看得到、可以逐一開關；房型明細重建失敗時，那筆信件會被標成「需人工檢查」並附上錯誤原因，同時寄一封內部告警信給有勾「房型明細告警」的同事。
- 這三項都不改任何金額、訂單或既有告警的判斷規則。
