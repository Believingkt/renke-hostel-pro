# V5.5C.2 設計：停用重複寫入的舊變更紀錄（設計階段，未施工）

目標：讓 `zzz_order_change_log` trigger 成為訂單變更的唯一新紀錄來源，移除 15 個路徑各自寫入 `audit_logs` 的邏輯。

## 一、先講三個會影響決策的查證事實

**事實 A：trigger 只看得到 orders 資料表欄位的前後值。**
`log_order_change()` 逐欄比對 `orders` 的 OLD/NEW。白名單（`c_full`）內的欄位會存前後值，白名單外（例如 `notes`、`custom_addon_details`、`meal_plan_details`）只存 `{field, changed:true}`，不存內容。`order_rooms`、包區設定、退款政策計算、KOL 額度覆寫等「不在 orders 欄位裡的資訊」，trigger 完全記不到。

**事實 B：前端無法把「修改原因」帶進 trigger。**
`set_order_change_context()` 用 `set_config(..., is_local => true)`，只在同一個交易內有效。前端經 API 呼叫時，每個請求各自是一個交易，先呼叫 context 再呼叫 update 不會生效。也就是說：只要移除舊寫入，這些對話框裡使用者填的「原因／備註」文字，除非另外寫進 `notes` 或改成單一 RPC，否則就會消失。

**事實 C：兩支金流 RPC 對 audit_logs 有硬依賴。**
`update_paid_order_addons_v3`（L659–L723）與 `update_paid_order_discount_v2`（L216–L288）都是：`INSERT ... RETURNING id INTO v_audit_id` → `IF v_audit_id IS NULL THEN RAISE` → `IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE id = v_audit_id) THEN RAISE` → 回傳值帶 `'audit_log_id', v_audit_id`（型別定義在 `src/lib/paidAmountSettlement.ts:50`）。這是刻意的 fail-closed：寫不進紀錄就整筆回滾。

## 二、逐一確認（依賴檢查）

| # | 路徑 | 有無其他依賴 | 結論 |
|---|---|---|---|
| 1 | OrderDetail inline_edit :1354 | 無讀取依賴；但 details 含 order_rooms 差異、包區設定差異、notes 可見差異、額外加購金額／備註 → trigger 記不到（事實 A） | 部分保留 |
| 2 | OrderDetail cancel :1423 | 無。`order_status`/`cancelled_at` 都在白名單 | 可移除 |
| 3 | OrderDetail checkin/checkout :1463 | 無。`checked_in_at`/`checked_out_at` 在白名單 | 可移除 |
| 4 | OrderDetail price_edit :1584 | 無讀取依賴；金額欄位全在白名單；但 `reason` 會消失（事實 B） | 可移除（原因已另寫入 notes 的 🔒 稽核行） |
| 5 | PaymentStatusDialog :116 | 無。`payment_status`/`paid_amount` 在白名單；reason 已同時寫進 notes | 可移除 |
| 6 | OrderStatusDialog :91 | 無讀取依賴；但 reason **只**存在 audit_logs，沒寫進 notes | 移除會丟原因，需先補 notes |
| 7 | OrderSourceDialog :116 | 無。`order_source` 在白名單，變更也寫入 notes | 可移除 |
| 8 | OrderPriceEditDialog :492 | 無讀取依賴；`paid_discount_edit` 的 `changes` 由前端計算，欄位皆在白名單 | 可移除 |
| 9 | DealDateEditDialog :98 | 無。`order_date` 在白名單 | 可移除 |
| 10 | update_paid_order_discount_v2 | **有硬依賴**（事實 C） | 不動，另議 |
| 11 | update_paid_order_addons_v3 | **有硬依賴**（事實 C） | 不動，另議 |
| 12 | claim-order :33 | `logAttempt` 共 6 個呼叫點，其中 4 個是**失敗路徑**（根本沒有 orders UPDATE），trigger 不會有任何紀錄；另 `TeamKOL.tsx` 的「訂單被刪除」異常判定會讀 audit_logs 建立紀錄 | 不動，另議 |
| 13 | group-buy-order-lookup :420 | details 含退款政策、退款比例、rec_trade_id 等非 orders 欄位資訊 | 不動，另議 |
| 14 | group-buy-cancel-refund :370、:581 | 同上，另含手續費模型與 manual_override 判定 | 不動，另議 |
| 15 | change-order-dates :262 | 日期在白名單，但 reason／操作者名稱只在 audit；且 :281 的第二次 notes UPDATE 會另外產生一筆 change_log（不同交易），移除舊寫入後時間線會出現兩筆改期 | 不動，另議 |

> 依你「有依賴就先不要動」的原則：**本次施工只做 #2、#3、#4、#5、#7、#8、#9 共 7 個路徑**；#6 需先補 notes 才移除；#1 改為「只在有非 orders 欄位內容時才寫」；#10–#15 全部保留、另開一輪討論。

## 三、完整 diff（本次建議施工範圍）

### 3.1 `src/pages/OrderDetail.tsx` — cancel（L1444–L1460）
```diff
       if (error) throw error;
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          const { error: auditError } = await supabase.from("audit_logs").insert([{
-            user_id: user.id,
-            user_email: user.email,
-            action_type: "update",
-            action_category: "order",
-            entity_type: "order",
-            entity_id: order.id,
-            entity_name: order.order_number,
-            accommodation_id: order.accommodation_id,
-            details: { type: "cancel", changes: [{ field: "order_status", label: "訂單狀態", before: order.order_status, after: "cancelled" }] } as any,
-          }]);
-          if (auditError) throw auditError;
-        }
-      } catch (e) { console.error("Audit log error:", e); }
+      // 變更紀錄由 zzz_order_change_log trigger 統一寫入（V5.5C.2）
       toast({ title: "訂單已取消", description: `訂單 ${order.order_number} 已成功取消` });
```

### 3.2 `src/pages/OrderDetail.tsx` — checkin/checkout（L1484–L1500）
```diff
       if (error) throw error;
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          const { error: auditError } = await supabase.from("audit_logs").insert([{
-            user_id: user.id,
-            user_email: user.email,
-            action_type: "update",
-            action_category: "order",
-            entity_type: "order",
-            entity_id: order.id,
-            entity_name: order.order_number,
-            accommodation_id: order.accommodation_id,
-            details: { type: action, changes: Object.keys(patch).map(k => ({ field: k, label: k, before: (order as any)[k] ?? null, after: patch[k] })) } as any,
-          }]);
-          if (auditError) throw auditError;
-        }
-      } catch (e) { console.error("Audit log error:", e); }
+      // 變更紀錄由 zzz_order_change_log trigger 統一寫入（V5.5C.2）
       toast({
```

### 3.3 `src/pages/OrderDetail.tsx` — price_edit（L1605–L1623）
```diff
       if (error) throw error;
-
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          const { error: auditError } = await supabase.from("audit_logs").insert([{
-            user_id: user.id,
-            user_email: user.email,
-            action_type: "update",
-            action_category: "order",
-            entity_type: "order",
-            entity_id: order.id,
-            entity_name: order.order_number,
-            accommodation_id: order.accommodation_id,
-            details: { type: "price_edit", reason: editReason.trim(), old: oldValues, new: newValues, changes: ... } as any,
-          }]);
-          if (auditError) throw auditError;
-        }
-      } catch (e) {
-        console.error("Audit log error:", e);
-      }
-
+      // 變更紀錄由 trigger 統一寫入；修改原因已寫入 notes 的 🔒 金額異動稽核行（V5.5C.2）
       toast({ title: "金額修改成功", description: "訂單金額已更新" });
```
（`oldValues`／`newValues` 若移除後成為未使用變數，一併刪除其宣告。）

### 3.4 `src/pages/OrderDetail.tsx` — inline_edit（L1335–L1392，部分保留）
保留整段差異計算，只把「純 orders 欄位」的 `changes` 排除，僅在仍有 rooms／包區／額外加購備註等 trigger 記不到的內容時才寫一筆：
```diff
-          if (changes.length > 0) {
+          // trigger 已涵蓋 orders 欄位；此處只補記 order_rooms／包區設定／額外加購等
+          // 不在 orders 資料表的內容（V5.5C.2）
+          const NON_ORDER_FIELDS = ["rooms", "exclusive_configs", "addon_note", "extra_addon_amount", "notes"];
+          const residual = changes.filter((c) => NON_ORDER_FIELDS.includes(c.field));
+          if (residual.length > 0) {
             const { error: auditError } = await supabase.from("audit_logs").insert([{
               ...
-              details: { type: "inline_edit", changes } as any,
+              details: { type: "inline_edit", changes: residual } as any,
             }]);
```

### 3.5 `src/components/orders/PaymentStatusDialog.tsx`（L103–L125）
```diff
-      // Audit log
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          await supabase.from("audit_logs").insert([{
-            user_id: user.id,
-            user_email: user.email,
-            action_type: "update",
-            action_category: "order",
-            entity_type: "order",
-            entity_id: order.id,
-            entity_name: order.order_number,
-            details: {
-              type: "payment_status_change",
-              old_status: order.payment_status,
-              new_status: selectedStatus,
-              reason: reason.trim(),
-            } as any,
-          }]);
-        }
-      } catch (e) {
-        console.error("Audit log error:", e);
-      }
-
+      // 變更紀錄由 trigger 統一寫入；備註已併入 notes（V5.5C.2）
       toast({ title: "付款狀態已更新" });
```

### 3.6 `src/components/orders/OrderStatusDialog.tsx`（L88–L109，含補寫 notes）
```diff
       const { error } = await supabase
         .from("orders")
-        .update(updateData)
+        .update({
+          ...updateData,
+          // 原因原本只存在 audit_logs，移除舊寫入前先落地到 notes（V5.5C.2）
+          notes: reason.trim()
+            ? (order.notes
+                ? `${order.notes}\n【狀態變更】${order.order_status} → ${selectedStatus}：${reason.trim()}`
+                : `【狀態變更】${order.order_status} → ${selectedStatus}：${reason.trim()}`)
+            : order.notes,
+        })
         .eq("id", order.id);
 
       if (error) throw error;
-
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          await supabase.from("audit_logs").insert([{
-            ...
-            details: {
-              type: "order_status_change",
-              old_status: order.order_status,
-              new_status: selectedStatus,
-              reason: reason.trim(),
-            } as any,
-          }]);
-        }
-      } catch (e) {
-        console.error("Audit log error:", e);
-      }
```

### 3.7 `src/components/orders/OrderSourceDialog.tsx`（L113–L141）
```diff
       if (error) throw error;
-
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          await supabase.from("audit_logs").insert([{
-            ... details: { type: "order_source_change", old_source, new_source, changes: [...] }
-          }]);
-        }
-      } catch (e) {
-        console.error("Audit log error:", e);
-      }
-
+      // 變更紀錄由 trigger 統一寫入（V5.5C.2）
       if (kolOverrideStatus && accommodationId) {
```
（KOL 額度覆寫紀錄 `logKolQuotaOverride` 不動。）

### 3.8 `src/components/orders/OrderPriceEditDialog.tsx`（L481–L505）
```diff
       if (error) throw error;
-
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          const details = paidDiscountEdited ? {...} : { type: "price_edit", ... };
-          await supabase.from("audit_logs").insert([{ ... details: details as any }]);
-        }
-      } catch (e) {
-        console.error("Audit log error:", e);
-      }
-
+      // 變更紀錄由 trigger 統一寫入；原因已寫入 notes（V5.5C.2）
       toast({ title: "金額修改成功", description: "訂單金額已更新" });
```

### 3.9 `src/components/orders/DealDateEditDialog.tsx`（L95–L120）
```diff
       if (error) throw error;
-
-      try {
-        const { data: { user } } = await supabase.auth.getUser();
-        if (user) {
-          await supabase.from("audit_logs").insert([{ ... details: { type: "order_deal_date_change", ... } }]);
-        }
-      } catch (e) {
-        console.error("audit log failed", e);
-      }
-
+      // 變更紀錄由 trigger 統一寫入（V5.5C.2）
       toast.success("成交日已更新", {
```

### 3.10 `src/components/orders/OrderAuditLogCard.tsx`
不改。顯示層去重邏輯保留（歷史 audit_logs 仍要正確合併顯示），只是新資料不再產生重複列。

## 四、測試

**T1 — trigger 覆蓋度（BEGIN…ROLLBACK）**：對測試單分別更新 `order_status`、`checked_in_at`、`payment_status`+`paid_amount`、`order_source`、`order_date`、五個金額欄位，逐項比對 `order_change_log.changed_fields` 是否含有與移除前 audit `changes` 相同的 field 與 from/to，最後 ROLLBACK。

**T2 — 兩支金流 RPC 不受影響**：不改 RPC，仍執行回歸。在交易內用測試單分別驗證：(a) 傳錯 `p_expected_updated_at` 必須 `40001`；(b) 正常執行後 `final_price`／`paid_amount`／差額與移除前計算一致；(c) 回傳 JSON 仍帶非 NULL `audit_log_id`。全部 ROLLBACK。

**T3 — 顯示不缺欄位**：取一筆同時有舊 audit 與新 change_log 的訂單，先記錄目前 `OrderAuditLogCard` 展開後的欄位集合；改動後再跑一次，比對「移除前 audit 顯示的欄位」全部仍能從 change_log 取得；另針對 inline_edit 驗證 rooms／包區／額外加購備註仍有紀錄。

**T4 — 原因文字不遺失**：OrderStatusDialog 填原因存檔後，確認 notes 出現【狀態變更】行；PaymentStatusDialog／金額修改確認 notes 既有行為不變。

## 五、不在本次範圍

#10 `update_paid_order_discount_v2`、#11 `update_paid_order_addons_v3`、#12 claim-order、#13 group-buy-order-lookup、#14 group-buy-cancel-refund、#15 change-order-dates —— 皆有依賴或會遺失非 orders 欄位資訊，待你決定後另開一輪設計。
