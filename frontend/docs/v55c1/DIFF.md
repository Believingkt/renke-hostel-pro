# V5.5C.1 實作內容（設計階段，未施工）

## 一、`src/pages/OrderDetail.tsx` 實際 diff

### 1-1 新增 state（第 324 行 `kolQuotaPrompt` 之後）

```diff
   const [kolQuotaPrompt, setKolQuotaPrompt] = useState<{ yearMonth: string; used: number; quota: number; packageName?: string | null; resolve: (v: boolean) => void } | null>(null);
+  // 付款狀態改為「已付清」但已付金額不足應收時的三選一確認
+  const [paidSyncPrompt, setPaidSyncPrompt] = useState<{
+    expectedFinal: number;
+    currentPaid: number;
+    resolve: (v: "sync" | "deposit" | "cancel") => void;
+  } | null>(null);
```

### 1-2 偵測邏輯（`handleSaveEdit` 內，接在 KOL 額度檢查之後、`setIsSavingEdit(true)` 之前）

沿用檔案裡既有的 promise-based prompt 寫法（與 KOL 額度確認同一套），不需要把送出邏輯抽成 `commitEdit`。

```diff
     if (!kolPermitted) { savingEditRef.current = false; return; }
 
+    // === V5.5C.1：狀態改為「已付清」但已付金額不足應收 ===
+    const FULLY_PAID_STATUSES = ["paid", "fully_paid"];
+    let paidSyncDecision: "sync" | "deposit" | "none" = "none";
+    {
+      const willBeFullyPaid = FULLY_PAID_STATUSES.includes(editForm.payment_status);
+      const wasFullyPaid = FULLY_PAID_STATUSES.includes(order.payment_status);
+      const savedTotalPriceForCheck = editForm.total_price + editForm.addon_total;
+      const pricingUnchangedForCheck =
+        Number(savedTotalPriceForCheck) === Number(order.total_price ?? 0) &&
+        Number(editForm.discount_amount) === Number(order.discount_amount ?? 0) &&
+        Number(editForm.addon_total) === Number(savedAddonTotalOf(order));
+      const expectedFinal = pricingUnchangedForCheck
+        ? Number(order.final_price ?? 0)
+        : savedTotalPriceForCheck - editForm.discount_amount;
+      const currentPaid = Number(editForm.paid_amount) || 0;
+
+      if (willBeFullyPaid && !wasFullyPaid && currentPaid < expectedFinal) {
+        const choice = await new Promise<"sync" | "deposit" | "cancel">((resolve) => {
+          setPaidSyncPrompt({ expectedFinal, currentPaid, resolve });
+        });
+        if (choice === "cancel") { savingEditRef.current = false; return; }
+        paidSyncDecision = choice;
+        if (choice === "sync") {
+          setEditForm(f => ({ ...f, paid_amount: expectedFinal }));
+        } else {
+          setEditForm(f => ({ ...f, payment_status: "deposit_paid" }));
+        }
+      }
+    }
+
     setIsSavingEdit(true);
```

註：`setEditForm` 是非同步更新，本次送出不能依賴它，因此下面 `updateData` 直接以 `paidSyncDecision` 覆寫實際送出的值（`setEditForm` 只是讓畫面在存檔後與 DB 一致）。

### 1-3 送出值覆寫（第 1078 / 1085 行）

```diff
-        payment_status: editForm.payment_status,
+        payment_status: paidSyncDecision === "deposit" ? "deposit_paid" : editForm.payment_status,
@@
-        paid_amount: editForm.paid_amount,
+        paid_amount: paidSyncDecision === "sync" ? paidSyncExpectedFinal : editForm.paid_amount,
```

（`paidSyncExpectedFinal` 為上段區塊算出的 `expectedFinal`，宣告在 `handleSaveEdit` 函式作用域最上層：`let paidSyncExpectedFinal = 0;`，於偵測區塊內賦值。）

### 1-4 稽核紀錄

第 1195–1196 行既有邏輯以 `order.paid_amount` 對比送出值產生 `已付 a→b`，需一併改用實際送出值：

```diff
-        if (Number(editForm.paid_amount) !== Number(order.paid_amount ?? 0)) {
-          auditParts.push(`已付 ${order.paid_amount ?? 0}→${editForm.paid_amount}`);
+        const submittedPaid = paidSyncDecision === "sync" ? paidSyncExpectedFinal : editForm.paid_amount;
+        if (Number(submittedPaid) !== Number(order.paid_amount ?? 0)) {
+          auditParts.push(`已付 ${order.paid_amount ?? 0}→${submittedPaid}`);
         }
```

`order_change_log` 會自動記錄 `paid_amount` / `payment_status` 前後值，不需另外處理。

### 1-5 對話框 UI（接在第 4148 行 `kolQuotaPrompt` 區塊之後）

```diff
+      {paidSyncPrompt && (
+        <AlertDialog open onOpenChange={(v) => { if (!v) { paidSyncPrompt.resolve("cancel"); setPaidSyncPrompt(null); } }}>
+          <AlertDialogContent>
+            <AlertDialogHeader>
+              <AlertDialogTitle>付款狀態為「已付清」，但已付金額少於應收</AlertDialogTitle>
+              <AlertDialogDescription asChild>
+                <div className="space-y-2 text-sm">
+                  <p>
+                    應收 NT$ {paidSyncPrompt.expectedFinal.toLocaleString()}，
+                    目前已付 NT$ {paidSyncPrompt.currentPaid.toLocaleString()}，
+                    差額 NT$ {(paidSyncPrompt.expectedFinal - paidSyncPrompt.currentPaid).toLocaleString()}。
+                  </p>
+                  <p className="text-muted-foreground">請確認要如何處理，避免付款狀態與金額不一致。</p>
+                </div>
+              </AlertDialogDescription>
+            </AlertDialogHeader>
+            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
+              <AlertDialogAction
+                onClick={() => { paidSyncPrompt.resolve("sync"); setPaidSyncPrompt(null); }}
+              >
+                已收齊，把已付金額更新為 NT$ {paidSyncPrompt.expectedFinal.toLocaleString()}
+              </AlertDialogAction>
+              <Button
+                variant="outline"
+                onClick={() => { paidSyncPrompt.resolve("deposit"); setPaidSyncPrompt(null); }}
+              >
+                維持已付 NT$ {paidSyncPrompt.currentPaid.toLocaleString()}，狀態改為「已付訂金」
+              </Button>
+              <AlertDialogCancel
+                onClick={() => { paidSyncPrompt.resolve("cancel"); setPaidSyncPrompt(null); }}
+              >
+                取消，我要自己調整
+              </AlertDialogCancel>
+            </AlertDialogFooter>
+          </AlertDialogContent>
+        </AlertDialog>
+      )}
```

`AlertDialog*` 與 `Button` 皆為檔案既有 import，不需新增。

---

## 二、FM2N96G9 金額訂正

不走 UI。原因：該訂單目前 `payment_status = 'paid'`，UI 的內嵌編輯雖允許改 `paid_amount`，但一併會重算／夾帶其他金額欄位並觸發 🔒 稽核列與已結清攔截，操作面比單筆 SQL 更容易誤傷。改以單一交易 migration 訂正，並在備註留下訂正說明。

訂正內容：`paid_amount` 17,000 → 57,600（= `final_price`）。其餘欄位一律不動。

```sql
-- V5.5C.1-fix : FM2N96G9 paid_amount 訂正（客人已確認付清）
DO $$
DECLARE
  v_id uuid;
  v_final numeric;
  v_paid numeric;
  v_status text;
  v_rows int;
  v_note text;
BEGIN
  ---------- PRECHECK ----------
  SELECT id, final_price, paid_amount, payment_status, notes
    INTO v_id, v_final, v_paid, v_status, v_note
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
  UPDATE public.orders
     SET paid_amount = 57600,
         notes = COALESCE(notes, '') ||
           E'\n🔒[金額訂正 ' || to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') ||
           ' by 系統訂正 V5.5C.1] 已付 17000→57600（客人已確認付清；8/2 變更付款狀態時未同步已付金額）'
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
  IF (SELECT count(*) FROM public.orders WHERE order_number = 'NJ3U85G6' AND paid_amount = 0) <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: NJ3U85G6 must remain untouched';
  END IF;
  RAISE NOTICE 'POSTCHECK PASS: FM2N96G9 paid=57600 final=57600 status=paid; NJ3U85G6 untouched';
END $$;
```

影響列數：**orders 1 列（僅 FM2N96G9）**。NJ3U85G6 不在此次範圍，postcheck 明確驗證它維持 `paid_amount = 0`。

Rollback：

```sql
UPDATE public.orders
   SET paid_amount = 17000,
       notes = regexp_replace(notes, E'\n🔒\\[金額訂正 [^\n]*V5\\.5C\\.1\\][^\n]*', '', 'g')
 WHERE order_number = 'FM2N96G9' AND paid_amount = 57600;
```

（註：`🔒[金額異動` 前綴受 DB trigger 保護不可刪改，本訂正刻意使用 `🔒[金額訂正` 以區別；若要求同樣不可刪除，改用 `金額異動` 前綴即可，但屆時 rollback 只能由 super_admin 手動處理。此點請一併裁示。）

---

## 三、測試情境（BEGIN…ROLLBACK 不適用於前端，採元件層測試）

新增 `src/test/paid-status-sync-prompt.test.ts`：以純函式方式驗證決策邏輯（把 1-2 段的判斷抽成可測純函式 `resolvePaidSyncNeed()` 與 `applyPaidSyncDecision()`），三個情境：

| 情境 | 輸入 | 預期 |
|---|---|---|
| 觸發 | 原狀態 `unpaid`、新狀態 `paid`、應收 31500、已付 0 | `needsPrompt = true`，`expectedFinal = 31500` |
| 選項一 sync | decision `sync` | 送出 `payment_status='paid'`、`paid_amount=31500`，稽核含 `已付 0→31500` |
| 選項二 deposit | decision `deposit` | 送出 `payment_status='deposit_paid'`、`paid_amount=0` 不變 |
| 選項三 cancel | decision `cancel` | 不呼叫任何 supabase 寫入，維持編輯狀態 |
| 不觸發（已是已付清） | 原狀態 `paid`、新狀態 `paid`、已付 17000 < 應收 57600 | `needsPrompt = false`（避免誤蓋部分退款） |
| 不觸發（金額足額） | 原狀態 `unpaid`、新狀態 `paid`、已付 = 應收 | `needsPrompt = false` |

另加一項瀏覽器實測（正式核准後執行）：以低風險測試訂單在訂單詳情頁把狀態改成已付清、已付留 0，截圖確認對話框跳出，並分別驗證三個選項的 DB 結果。

---

## 四、與已結清折扣／加購 RPC 的關係

不受影響：`update_paid_order_discount_v2`、`update_paid_order_addons_v3` 僅由 `PaidAmountEditDialog.tsx` 呼叫，且其前提為訂單「已經」是 paid/fully_paid，不會發生 `!wasFullyPaid && willBeFullyPaid` 的狀態轉換，新判斷永遠不會攔截到那條路徑。
