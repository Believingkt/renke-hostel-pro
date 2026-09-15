# V5.5C.1 / V5.5C.2 完整內容（設計階段，未施工）

分兩批：
- **批次一 V5.5C.2**：`OrderAuditLogCard.tsx` 標籤誤判修正（純前端顯示）。
- **批次二 V5.5C.1**：`OrderDetail.tsx` 三選一確認 + FM2N96G9 金額訂正 migration。

---

## 批次一 V5.5C.2：系統標籤誤判修正

### 現況（bug）
`src/components/orders/OrderAuditLogCard.tsx:131`

```ts
action_type: first.op === "insert" ? "system_create" : "system_update",
```

只看 `op`，任何 `order_change_log` 列都會被貼上「系統自動變更／建立訂單」。真人（`actor_type='user'`）內嵌編輯也被標成系統自動變更，操作者卻是真人姓名。

### 修正 diff

```diff
@@ src/components/orders/OrderAuditLogCard.tsx  (ACTION_LABEL, 約 51-53 行)
   kol_quota_override: { text: "KOL額度覆寫", tone: "bg-orange-100 text-orange-700" },
   order_date_change: { text: "訂單改期", tone: "bg-fuchsia-100 text-fuchsia-700" },
-  system_update: { text: "系統自動變更", tone: "bg-slate-100 text-slate-700" },
-  system_create: { text: "建立訂單", tone: "bg-green-100 text-green-700" },
+  system_update: { text: "系統自動變更", tone: "bg-slate-100 text-slate-700" },
+  system_create: { text: "系統建立訂單", tone: "bg-slate-100 text-slate-700" },
+  order_create: { text: "建立訂單", tone: "bg-green-100 text-green-700" },
 };
```

```diff
@@ src/components/orders/OrderAuditLogCard.tsx  (changeRows 組裝，約 126-141 行)
+        // 是否為系統／未知來源（真人操作一律不掛系統標籤）
+        const isSystemActor = first.actor_type !== "user";
         return {
           id: `c_${first.id}`,
           origin: "change_log" as const,
           user_id: first.actor_id,
           user_email: first.actor_email,
-          action_type: first.op === "insert" ? "system_create" : "system_update",
+          action_type: isSystemActor
+            ? (first.op === "insert" ? "system_create" : "system_update")
+            : (first.op === "insert" ? "order_create" : "update"),
           details: {
```

姓名解析（162-164 行）現行邏輯已正確：`actor_type !== 'user'` 才顯示 `系統・xxx`，真人優先顯示 profiles 姓名 → email。本次不動。

補充：`SYSTEM_LABELS` 已含 `owlting_auto_order: "OwlTing 自動建單"`、`owlting_webhook: "OwlTing 同步"` 等，維持原樣。

### 驗證（實跑輸出，使用與修正後完全相同的判斷邏輯）

```
=== 一、標籤渲染（修正後） ===
真人 dodo 內嵌編輯改付款狀態(update)          => [編輯] dodo
真人 sakithebest 內嵌編輯(update, 無 profile name) => [編輯] sakithebest@gmail.com
真人建立訂單(insert)                          => [建立訂單] dodo
系統 OwlTing 同步(update, unknown)            => [系統自動變更] 系統・系統（未標記來源）
系統 OwlTing webhook(update, system)          => [系統自動變更] 系統・OwlTing 同步
系統自動建單(insert)                          => [系統建立訂單] 系統・OwlTing 自動建單
```

對應正式資料庫實際列（唯讀查詢結果）：

| changed_at (UTC) | 訂單 | op | actor_type | actor | changed_fields | 修正前顯示 | 修正後顯示 |
|---|---|---|---|---|---|---|---|
| 2026-09-09 07:41:20 | NJ3U85G6 | update | user | sakithebest@gmail.com | notes(有更動)、paid_amount 0→31500、payment_status unpaid→paid | 系統自動變更 sakithebest@… | 編輯 sakithebest@… |
| 2026-09-09 07:41:16 | NJ3U85G6 | update | user | sakithebest@gmail.com | notes、payment_status paid→unpaid | 系統自動變更 … | 編輯 … |
| 2026-09-09 07:24:02 | UK7E79B5 | update | unknown | actor_label=unmarked_system | owlting_sync_state(有更動) | 系統自動變更 系統・系統（未標記來源） | **不變**：系統自動變更 系統・系統（未標記來源） |
| 2026-09-09 07:22:09 | UK7E79B5 | update | user | nicolelin0113@gmail.com | notes、paid_amount 0→12000、payment_status unpaid→deposit_paid | 系統自動變更 nicolelin… | 編輯 nicolelin… |

目前全庫 `order_change_log` 共 4 列：`user/update` 3 列、`unknown/update` 1 列（OwlTing 同步）。修正後只有那 1 列保留系統標籤。

風險：純顯示邏輯，無 DB 異動、無寫入路徑改動。

---

## 批次二 V5.5C.1

### 2-1 `src/pages/OrderDetail.tsx` 完整 diff

**(a) 新增 state（324 行 `kolQuotaPrompt` 之後）**

```diff
   const [kolQuotaPrompt, setKolQuotaPrompt] = useState<{ yearMonth: string; used: number; quota: number; packageName?: string | null; resolve: (v: boolean) => void } | null>(null);
+  // V5.5C.1：付款狀態改為「已付清」但已付金額不足應收時的三選一確認
+  const [paidSyncPrompt, setPaidSyncPrompt] = useState<{
+    expectedFinal: number;
+    currentPaid: number;
+    resolve: (v: "sync" | "deposit" | "cancel") => void;
+  } | null>(null);
```

**(b) 偵測邏輯（`handleSaveEdit` 內，KOL 額度檢查之後、`setIsSavingEdit(true)` 之前）**

沿用檔案既有 promise-based prompt 寫法（同 KOL 額度確認），不需把送出段抽成 `commitEdit`。

```diff
     if (!kolPermitted) { savingEditRef.current = false; return; }
 
+    // === V5.5C.1：狀態改為「已付清」但已付金額不足應收 ===
+    const FULLY_PAID_STATUSES = ["paid", "fully_paid"];
+    let paidSyncDecision: "sync" | "deposit" | "none" = "none";
+    let paidSyncExpectedFinal = 0;
+    {
+      const willBeFullyPaid = FULLY_PAID_STATUSES.includes(editForm.payment_status);
+      const wasFullyPaid = FULLY_PAID_STATUSES.includes(order.payment_status);
+      const expectedFinal = Number(editFinalPriceCalc ?? order.final_price ?? 0);
+      const currentPaid = Number(editForm.paid_amount) || 0;
+
+      if (willBeFullyPaid && !wasFullyPaid && currentPaid < expectedFinal) {
+        paidSyncExpectedFinal = expectedFinal;
+        const choice = await new Promise<"sync" | "deposit" | "cancel">((resolve) => {
+          setPaidSyncPrompt({ expectedFinal, currentPaid, resolve });
+        });
+        if (choice === "cancel") { savingEditRef.current = false; return; }
+        paidSyncDecision = choice;
+        if (choice === "sync") {
+          setEditForm((f) => ({ ...f, paid_amount: expectedFinal }));
+        } else {
+          setEditForm((f) => ({ ...f, payment_status: "deposit_paid" }));
+        }
+      }
+    }
+
     setIsSavingEdit(true);
```

註：`setEditForm` 為非同步更新，本次送出不可依賴它；下面 `updateData` 直接依 `paidSyncDecision` 覆寫送出值，`setEditForm` 只讓畫面在存檔後與 DB 一致。

**(c) 送出值覆寫（1078 / 1085 行）**

```diff
-        payment_status: editForm.payment_status,
+        payment_status: paidSyncDecision === "deposit" ? "deposit_paid" : editForm.payment_status,
@@
-        paid_amount: editForm.paid_amount,
+        paid_amount: paidSyncDecision === "sync" ? paidSyncExpectedFinal : editForm.paid_amount,
```

**(d) 稽核行使用實際送出值（1195-1197 行）**

```diff
-        if (Number(editForm.paid_amount) !== Number(order.paid_amount ?? 0)) {
-          auditParts.push(`已付 ${order.paid_amount ?? 0}→${editForm.paid_amount}`);
+        const submittedPaid = paidSyncDecision === "sync" ? paidSyncExpectedFinal : editForm.paid_amount;
+        if (Number(submittedPaid) !== Number(order.paid_amount ?? 0)) {
+          auditParts.push(`已付 ${order.paid_amount ?? 0}→${submittedPaid}`);
         }
```

（此段只在 `isPaidOrDeposit`＝原本已是 paid/fully_paid 時才跑；本次觸發情境為「原本不是已付清」，所以實務上不會進到這段，但為避免未來狀態組合改變留下不一致，一併修正。`order_change_log` 會自動記錄 `paid_amount`/`payment_status` 前後值。）

**(e) 對話框 UI（4158 行 `kolQuotaPrompt` 區塊之後）**

```diff
       {kolQuotaPrompt && ( ... )}
+      {paidSyncPrompt && (
+        <AlertDialog
+          open
+          onOpenChange={(v) => { if (!v) { paidSyncPrompt.resolve("cancel"); setPaidSyncPrompt(null); } }}
+        >
+          <AlertDialogContent>
+            <AlertDialogHeader>
+              <AlertDialogTitle>付款狀態為「已付清」，但已付金額少於應收</AlertDialogTitle>
+              <AlertDialogDescription asChild>
+                <div className="space-y-2 text-sm">
+                  <p>
+                    應收 NT$ {paidSyncPrompt.expectedFinal.toLocaleString()}、
+                    目前已付 NT$ {paidSyncPrompt.currentPaid.toLocaleString()}、
+                    差額 NT$ {(paidSyncPrompt.expectedFinal - paidSyncPrompt.currentPaid).toLocaleString()}。
+                  </p>
+                  <p className="text-muted-foreground">請確認要如何處理，避免付款狀態與金額不一致。</p>
+                </div>
+              </AlertDialogDescription>
+            </AlertDialogHeader>
+            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
+              <AlertDialogAction onClick={() => { paidSyncPrompt.resolve("sync"); setPaidSyncPrompt(null); }}>
+                已收齊，把已付金額更新為 NT$ {paidSyncPrompt.expectedFinal.toLocaleString()}
+              </AlertDialogAction>
+              <Button variant="outline" onClick={() => { paidSyncPrompt.resolve("deposit"); setPaidSyncPrompt(null); }}>
+                維持已付 NT$ {paidSyncPrompt.currentPaid.toLocaleString()}，狀態改為「已付訂金」
+              </Button>
+              <AlertDialogCancel onClick={() => { paidSyncPrompt.resolve("cancel"); setPaidSyncPrompt(null); }}>
+                取消，我要自己調整
+              </AlertDialogCancel>
+            </AlertDialogFooter>
+          </AlertDialogContent>
+        </AlertDialog>
+      )}
     </div>
```

`AlertDialog*`、`Button` 皆為既有 import，不需新增。

### 2-2 FM2N96G9 金額訂正 migration（🔒 不可逆定案）

訂正內容：`paid_amount` 17,000 → 57,600（= `final_price`），其餘欄位不動；備註使用受 DB trigger 保護、不可刪改的 `🔒[金額異動 ...]` 前綴。

實際寫入的備註文字（`<執行當下台北時間>` 由 SQL 產生，格式 `YYYY-MM-DD HH24:MI`）：

```
🔒[金額異動 2026-09-09 16:20 by 系統訂正 V5.5C.1] 已付 17000→57600（客人已確認付清；2026-08-02 變更付款狀態為已付清時未同步已付金額）
```

```sql
-- V5.5C.1-fix : FM2N96G9 paid_amount 訂正（客人已確認付清）／單一交易
DO $$
DECLARE
  v_id uuid;
  v_final numeric;
  v_paid numeric;
  v_status text;
  v_rows int;
  v_line text;
BEGIN
  ---------- PRECHECK ----------
  SELECT id, final_price, paid_amount, payment_status
    INTO v_id, v_final, v_paid, v_status
  FROM public.orders WHERE order_number = 'FM2N96G9';

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PRECHECK FAIL: order FM2N96G9 not found';
  END IF;
  IF v_id <> 'c4e86a9a-6125-463b-98b5-a00b6f4d8eab'::uuid THEN
    RAISE EXCEPTION 'PRECHECK FAIL: unexpected order id %', v_id;
  END IF;
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'PRECHECK FAIL: payment_status = % (expected paid)', v_status;
  END IF;
  IF v_final <> 57600 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: final_price = % (expected 57600)', v_final;
  END IF;
  IF v_paid <> 17000 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: paid_amount = % (expected 17000)', v_paid;
  END IF;
  RAISE NOTICE 'PRECHECK PASS: id=% final=% paid=% status=%', v_id, v_final, v_paid, v_status;

  ---------- APPLY ----------
  v_line := E'\n🔒[金額異動 '
         || to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI')
         || ' by 系統訂正 V5.5C.1] 已付 17000→57600（客人已確認付清；2026-08-02 變更付款狀態為已付清時未同步已付金額）';

  UPDATE public.orders
     SET paid_amount = 57600,
         notes = COALESCE(notes, '') || v_line
   WHERE id = v_id
     AND payment_status = 'paid'
     AND final_price = 57600
     AND paid_amount = 17000;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'APPLY FAIL: updated % rows (expected 1)', v_rows;
  END IF;

  ---------- POSTCHECK ----------
  SELECT final_price, paid_amount, payment_status
    INTO v_final, v_paid, v_status
  FROM public.orders WHERE id = v_id;

  IF v_paid <> 57600 OR v_final <> 57600 OR v_status <> 'paid' THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: final=% paid=% status=%', v_final, v_paid, v_status;
  END IF;
  IF (SELECT count(*) FROM public.orders WHERE notes LIKE '%🔒[金額異動%'
        AND order_number = 'FM2N96G9') <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: audit line not appended exactly once';
  END IF;
  RAISE NOTICE 'POSTCHECK PASS: FM2N96G9 paid=57600 final=57600 status=paid, audit line appended';
END $$;
```

影響列數：**orders 1 列（僅 FM2N96G9）**。

**Rollback：無。** 依裁示，這是金流訂正紀錄，🔒 行受 `prevent_immutable_order_fields_change` 保護，不可刪改；若日後需再訂正，以新的 🔒 訂正紀錄覆蓋，不刪除或改寫本行。唯一「反悔」方式是再跑一支反向訂正 migration（同樣 append 新的 🔒 行），不是回復原狀。

**重要更正：** 先前版本的 postcheck 曾斷言 `NJ3U85G6.paid_amount = 0`。實際查詢顯示 NJ3U85G6 今日（2026-09-09 07:41 UTC）已被 sakithebest@gmail.com 由 UI 改為 `paid_amount = 31500`、狀態 paid。該斷言已移除，本次 migration 也不碰 NJ3U85G6。

### 2-3 六項測試（實跑輸出）

以與 diff 完全相同的判斷邏輯執行純函式模擬（`resolvePaidSyncNeed` / `applyPaidSyncDecision`）：

```
T1 觸發              {"needsPrompt":true,"expectedFinal":31500,"submitted":"(不送出決策)","audit":"(無已付稽核行)"}
T2 選項一 sync       {"needsPrompt":true,"expectedFinal":31500,"submitted":{"payment_status":"paid","paid_amount":31500},"audit":"已付 0→31500"}
T3 選項二 deposit    {"needsPrompt":true,"expectedFinal":31500,"submitted":{"payment_status":"deposit_paid","paid_amount":0},"audit":"(無已付稽核行)"}
T4 選項三 cancel     {"needsPrompt":true,"expectedFinal":31500,"submitted":null,"audit":"(無已付稽核行)"}
T5 已是已付清不觸發  {"needsPrompt":false,"expectedFinal":57600,"submitted":"(不送出決策)","audit":"(無已付稽核行)"}
T6 金額足額不觸發    {"needsPrompt":false,"expectedFinal":31500,"submitted":"(不送出決策)","audit":"(無已付稽核行)"}
```

| # | 情境 | 輸入 | 實際輸出 | 是否符合預期 |
|---|---|---|---|---|
| T1 | 觸發條件 | unpaid→paid、應收 31500、已付 0 | needsPrompt=true、expectedFinal=31500 | 是 |
| T2 | 選項一 sync | 同上，選 sync | 送出 paid / paid_amount=31500、稽核「已付 0→31500」 | 是 |
| T3 | 選項二 deposit | 同上，選 deposit | 送出 deposit_paid / paid_amount=0 不變 | 是 |
| T4 | 選項三 cancel | 同上，選 cancel | 不送出（null），維持編輯狀態 | 是 |
| T5 | 已是已付清 | paid→paid、應收 57600、已付 17000 | needsPrompt=false（不誤蓋部分退款） | 是 |
| T6 | 金額足額 | unpaid→paid、已付=應收 | needsPrompt=false | 是 |

核准後另加一項瀏覽器實測：以低風險測試訂單在訂單詳情頁改為已付清且已付不足，截圖確認對話框跳出，並逐一驗證三個選項的 DB 結果。

### 2-4 與已結清折扣／加購 RPC 的關係

不受影響：`update_paid_order_discount_v2`、`update_paid_order_addons_v3` 僅由 `PaidAmountEditDialog.tsx` 呼叫，前提是訂單「已經」是 paid/fully_paid，不會發生 `!wasFullyPaid && willBeFullyPaid` 的狀態轉換，新判斷不會攔截該路徑。

---

## 三、批次相依性評估

兩批**沒有相依性**，建議分開兩次施工：

| 批次 | 內容 | 檔案／物件 | 風險 | 需 Publish |
|---|---|---|---|---|
| V5.5C.2 | 標籤誤判修正 | `OrderAuditLogCard.tsx`（顯示層） | 極低，無 DB 寫入 | 是 |
| V5.5C.1 | 三選一 + FM2N96G9 訂正 | `OrderDetail.tsx` + 1 列 orders 訂正（不可逆） | 中，涉及金額與不可逆 🔒 行 | 是（前端）+ migration |

理由：兩者檔案不重疊；V5.5C.1 若需回頭調整，不會牽動 V5.5C.2 的顯示修正。建議先跑 V5.5C.2（低風險、可立即改善判讀），確認畫面正確後再跑 V5.5C.1。
