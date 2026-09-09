# 方案1：已結清折扣「沿用原折扣碼、只調金額」（code_keep）

目標：提交的折扣碼與**資料庫中該訂單目前的 discount_code** 完全相同時，跳過折扣碼的存在性／啟用狀態／有效期限／適用範圍重新驗證，改以人工指定金額寫入；折扣碼保留，分潤記錄（commission_records）因此能用新金額自動更新。

---

## 一、RPC：update_paid_order_discount_v2 診斷與改法

現況（第 123–211 行）：`code` 與 `code_override` 共用同一段前置檢查 —— 多房型／多方案範圍判斷（128–171）→ `validate_discount_code`（181–188）→ 標準金額（190–194）→ 兩模式才分岔（197–210）。因此舊碼被停用、或多房型無法判斷範圍時，即使只想改金額也會被擋。

改法（只動 `ELSE -- code / code_override` 這一段的最前面，其餘一律不動）：

```sql
   ELSE -- code / code_override
     IF v_code IS NULL THEN
       RAISE EXCEPTION '請輸入折扣碼' USING ERRCODE = '22023';
     END IF;

+    -- ★ code_keep：提交的折扣碼與「資料庫裡這張訂單目前的 discount_code」完全相同
+    --   → 沿用原碼，不重新驗證存在性／啟用狀態／有效期限／適用範圍，只允許人工指定金額。
+    --   比對基準一律是 v_old_code（來自 SELECT ... FOR UPDATE 的 o.discount_code），不是前端傳來的值。
+    IF v_old_code IS NOT NULL AND v_code = v_old_code THEN
+      v_keep := true;
+      v_new_code := v_old_code;
+      v_new_discount := COALESCE(p_applied_discount_amount, v_old_discount);
+      IF v_new_discount < 0 THEN
+        RAISE EXCEPTION '實際套用折扣金額不得為負數' USING ERRCODE = '22023';
+      END IF;
+      -- 上限兩道檢查完全比照 code_override，不放寬
+      v_cap := LEAST(v_room_fee, COALESCE(o.total_price, 0)::integer);
+      IF v_new_discount > v_cap THEN
+        RAISE EXCEPTION '實際套用折扣金額不得大於折扣基準（房費 NT$%）', v_cap USING ERRCODE = '22023';
+      END IF;
+      v_standard := NULL;      -- 未重新驗證，無標準折扣可比對
+      v_override := true;
+    ELSE
     SELECT array_agg(DISTINCT r.template_id) ... （原本 128–210 行整段內縮，內容一字不動）
+    END IF;
   END IF;
```

宣告區新增：`v_keep boolean := false;`、`v_mode_label text;`

保持不變（不放寬）：
- `IF v_new_discount > COALESCE(o.total_price, 0)` 訂單總額上限（213–215）
- 樂觀鎖 `p_expected_updated_at`、`payment_status ∈ (paid, fully_paid)`、退款／取消高風險確認、`get_staff_module_permission = editable`、`v_uid IS NULL` 一律先擋
- SECURITY INVOKER（`prosecdef=false`）與 RLS 不變；audit_logs 寫入保留

稽核標記（`v_mode_label := CASE WHEN v_keep THEN 'code_keep' ELSE v_mode END`）：
- `mode='code_keep'`、新增 `keep_existing_code=true`
- `standard_discount_amount=null`（不做標準折扣比對，已確認可接受）
- changes 陣列在 keep 分支改為三項：`discount_code`（before=after，附 `note:'沿用訂單原折扣碼，未重新驗證'`）、`discount_amount`（label 改「實際套用折扣（人工指定）」）、`final_price`；不再輸出 standard 那一列
- `set_order_change_context('paid_discount_edit', 原因, '已結清折扣修改（code_keep／<settlement>）', 'user')`

安全性：此分支唯一的放寬是「不再查 discount_codes 表」。金額上限兩道、權限、樂觀鎖、付款狀態、風險確認全部在此分支之前或之後執行，無法被繞過；且 `v_old_code` 取自資料庫列鎖後的值，前端無法偽造。

---

## 二、前端 diff

### src/components/orders/PaidAmountEditDialog.tsx

```diff
   const validatedStandard = validation.status === "valid" ? validation.standardAmount : null;
   const usesCode = discountMode === "code" || discountMode === "code_override";
+  // 與訂單現有折扣碼相同 → 走 code_keep：不驗證、直接讓使用者填金額
+  const keepExistingCode =
+    usesCode && !!oldCode && (discountCode || "").trim().toUpperCase() === oldCode;
   const codeOverridden =
     usesCode && validatedStandard != null && appliedDiscountInput !== validatedStandard;
-  const effectiveDiscountMode: PaidDiscountMode = usesCode
-    ? codeOverridden ? "code_override" : "code"
-    : discountMode;
+  const effectiveDiscountMode: PaidDiscountMode = usesCode
+    ? keepExistingCode || codeOverridden ? "code_override" : "code"
+    : discountMode;
```

```diff
   const previewDiscount =
     discountMode === "none" ? 0
     : discountMode === "manual" ? newDiscountInput
+    : keepExistingCode ? appliedDiscountInput
     : validatedStandard != null ? (codeOverridden ? appliedDiscountInput : validatedStandard)
     : oldDiscount;
```

```diff
-  const codeReady = mode !== "discount" || !usesCode || validation.status === "valid";
+  const codeReady =
+    mode !== "discount" || !usesCode || keepExistingCode || validation.status === "valid";
```

```diff
   const handleValidateCode = async () => {
     if (!snap?.accommodation_id) return;
+    if (keepExistingCode) return;   // 沿用原碼不需驗證
```

UI（折扣碼區塊，第 525–560 行）：`keepExistingCode` 為 true 時
- 隱藏「驗證折扣碼」按鈕與 `scopeError` / 「尚未驗證」提示
- 直接顯示「實際套用折扣金額」輸入框（原本只有驗證成功後才出現）
- 顯示綠字說明：`沿用此訂單原有的折扣碼 {oldCode}，不重新檢查有效期限與適用範圍，只調整折扣金額；折扣碼與分潤／業績歸屬記錄會保留並依新金額更新。`

確認頁（第 727–736 行）：`keepExistingCode` 時不顯示「系統計算標準折扣」列，改顯示 `已沿用原折扣碼並人工指定折扣金額（模式：code_keep）`。

### src/components/orders/OrderPriceEditDialog.tsx（同形狀處，約第 285 行）

```diff
-    // 若與訂單原有折扣碼相同且金額未變動，不重複驗證
-    if (code === (order.discount_code || "").toUpperCase() && editDiscountAmount === order.discount_amount) {
+    // 與訂單原有折扣碼相同 → 一律不重新驗證（金額改了也一樣），保留折扣碼、只調金額
+    if (code === (order.discount_code || "").toUpperCase()) {
       return;
     }
```

（`src/lib/paidDiscountEdit.ts` 不需改：`code_override` 已要求並傳遞 `p_applied_discount_amount`。）

---

## 三、BEGIN…ROLLBACK 實測（正式資料，最後刻意 RAISE EXCEPTION 回滾）

同交易內建立 patched 副本 `__test_paid_discount` 執行，實際輸出：

```
[T1] rpc={"mode":"code_keep","changed":true,"final_price":39000,"audit_log_id":"6cf222ca-…",
     "discount_code":"168168","discount_amount":30000,"keep_existing_code":true,
     "standard_discount_amount":null}
[T1] commission: discount_amount=30000 order_total=69000 commission_amount=1950
     code_id=91dd9ca7-bc0c-456b-8528-2daa602cfbcb
[T1] audit={"mode":"code_keep","type":"paid_discount_edit","keep_existing_code":true,
     "standard_discount_amount":null,"applied_discount_amount":30000,"manual_override":true,
     "settlement_handling":"data_only","changes":[
       {"field":"discount_code","before":"168168","after":"168168","note":"沿用訂單原折扣碼，未重新驗證"},
       {"field":"discount_amount","label":"實際套用折扣（人工指定）","before":37000,"after":30000},
       {"field":"final_price","before":32000,"after":39000}]}
[T1] change_log=op=update actor_type=system actor_label=已結清折扣修改（code_keep／data_only）
     source=paid_discount_edit reason=測試1 沿用原碼調整金額
     fields=[{"field":"final_price","from":32000,"to":39000},
             {"field":"discount_amount","from":37000,"to":30000}]
[T2] 走完整驗證並被擋下：此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額
[T3] rpc={"mode":"code_keep","changed":true,"final_price":10500,"discount_code":"CYNTHIA66",
     "discount_amount":5000,"standard_discount_amount":null,"keep_existing_code":true}
[T3] commission=discount_amount=5000 commission=525
[T3b] 完整驗證路徑錯誤：折扣碼無效：折扣碼不存在或已停用
```

- **T1** YC6U86W2 + 168168（同碼）+ 30000：成功、折扣碼保留、分潤記錄同步改為 30000／佣金 1950（code_id 未變）。
- **T2** 同一張訂單換成別的碼 CYNTHIA66：仍走原本完整驗證，被多房型範圍判斷擋下 → 不受本次改動影響。
- **T3** 單一房型 TE9H24J8（CYNTHIA66，原 5950 → 5000）：成功，分潤同步 5000／佣金 525。
- **T3b** 單一房型換不同碼 ZEN：仍完整驗證並回「折扣碼不存在或已停用」→ 回歸正常。
- 註：`actor_type=system` 是因測試在無 `auth.uid()` 的環境跑；正式前端由登入者呼叫時為 user。

回滾查證（交易外重查）：
`YC6U86W2 = 37000/168168/32000`、`TE9H24J8 = 5950/CYNTHIA66/9550`、`commission_records=1 筆 commission_amount=1600`、暫時函式殘留 0、`update_paid_order_discount_v2` md5=`205ce832aa0a966945e8274b622b52de` 長度 `13318`（與現況一致）。

---

## 施工範圍（核准後才執行）

1. migration：`CREATE OR REPLACE update_paid_order_discount_v2`（維持 SECURITY INVOKER，pre/postcheck 記錄 md5／長度／prosecdef）
2. 前端：`PaidAmountEditDialog.tsx`、`OrderPriceEditDialog.tsx`
3. 需要 Publish（含前端變更）
