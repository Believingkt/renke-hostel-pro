# V5.5C 批次四（唯讀調查／設計稿，未施工）

對象：`public.update_paid_order_discount_v2`、`public.update_paid_order_addons_v3`

## 1. 現況（重新查詢，非記憶）

| 項目 | discount_v2 | addons_v3 |
|---|---|---|
| 定義長度 | 291 行 | 726 行 |
| 安全模式 | **SECURITY INVOKER**（`prosecdef=false`）、`SET search_path=pg_catalog,public` | 同左 |
| 交易 | 單一 RPC 呼叫＝單一交易，內含 `SELECT … FOR UPDATE`＋樂觀鎖 `updated_at = p_expected_updated_at` | 同左 |
| audit_logs 寫入 | 第 216–252 行 `INSERT INTO public.audit_logs … RETURNING id INTO v_audit_id` | 第 659–688 行，同結構 |
| 落地驗證 | 254–266 行：`v_audit_id IS NULL` → 例外；`NOT EXISTS(audit_logs …)` → 例外 | 690–702 行，同樣兩道 |
| 回傳 | 274–288 行含 `audit_log_id` | 713–723 行含 `audit_log_id` |

details 結構（實際取樣自現有紀錄）：
- 兩者共同：`type`、`source`（中文來源字串）、`reason`、`confirmed`、`settlement_handling`、`risk_state`、`risk_acknowledged`、`difference`、`difference_note`、當時 `payment_status/order_status/refund_status`、`changes[]`（field/label/before/after）。
- 折扣另有：`mode`、`standard_discount_amount`、`applied_discount_amount`、`manual_override`。
- 加購另有：`amount_format`、`reduce_acknowledged`、`price_change_acknowledged`、`addon_line_changes[]`（每個加購項目的 before_lines／數量／單價／倍數／pricing_mode）、`addon_line_merges[]`、`price_corrections[]`。

## 2. 技術前提

3. **可以直接在 RPC 內呼叫 `set_order_change_context()`。** 它是 SECURITY DEFINER、用 `set_config(..., is_local=true)`，與後續 UPDATE 同一交易，`zzz_order_change_log`（AFTER INSERT OR UPDATE，執行 `log_order_change()`）在同一交易內讀得到，不需要像批次一那樣外包 `update_order_with_context()`。`authenticated` 對 `set_order_change_context` 有 EXECUTE（ACL 已確認），INVOKER 呼叫不會被權限擋。
4. 兩支 RPC 是 **INVOKER**；但 `log_order_change()` 與 `resolve_change_actor()` 都是 SECURITY DEFINER，且這兩支 RPC 一開頭就要求 `auth.uid()` 不得為 NULL，所以 actor 會被解析成 `actor_type='user'`＋真實 email＋真人姓名（不會出現批次一那種「系統・email」問題）。

## 3. 移除重複寫入的影響

5. **沒有任何流程依賴 `audit_logs` 的 id 判斷成敗**：全 repo 只有 `src/lib/paidAmountSettlement.ts:50` 宣告了選用型別 `audit_log_id?: string | null`，沒有任何讀取或判斷。對話框成功／失敗只看 RPC 是否 throw 與 `changed`。
   但 **RPC 內部自己依賴它**：`v_audit_id IS NULL` 與 `NOT EXISTS(audit_logs …)` 兩道自我驗證，移除 INSERT 時必須一併移除，否則永遠拋例外。
6. **細節會實質流失（這是本批最大風險）。** `log_order_change()` 只對白名單 `c_full` 欄位記 before/after；其餘只記 `{field, changed:true}`，畫面上顯示「（有更動）→（已更新）」。
   - 折扣：`discount_amount`／`discount_code`／`final_price` 都在 `c_full` → 金額前後值不會流失；但 `mode`、`standard_discount_amount`、`manual_override`、`settlement_handling`、`difference_note`、`risk_state` **只存在 audit_logs**。
   - 加購：`total_price`／`final_price`／`paid_amount` 在白名單；但 `custom_addon_details` 與 `notes` **不在白名單**，只會記成「（有更動）」。也就是加購方案明細、現場加購金額／備註、`addon_line_changes`、`price_corrections`、`merges` **全部消失**。
   結論：**折扣可視為「可移除但會少掉判讀脈絡」；加購若直接移除，等於把「修改前後對照」降級成一句「加購有更動」，不建議移除。**

## 4. 建議方案

- **方案 A（建議）**：兩支都只補 `set_order_change_context()`，`audit_logs` 寫入 **保留**。顯示層維持現況（`OrderAuditLogCard` 的去重只在舊紀錄「沒有可展開內容」時才合併，這兩種紀錄有 `changes[]`，本來就不會被誤併，但會與新 trigger 各顯示一筆）。
- **方案 B（若仍要移除）**：折扣先移除、加購維持保留；並在移除前把 `settlement_handling`、`difference_note`、`standard_discount_amount`、`manual_override` 寫進 `reason` 字串或擴充 `log_order_change` 白名單，否則細節流失。
- **方案 C（完整移除）**：需要同時擴充 `log_order_change()` 白名單與 `changed_fields` 結構（把 `custom_addon_details` 拆成語意化明細），屬於改動 trigger 本體，風險高於本批目標。

## 5. 完整 diff（方案 A，設計稿）

`update_paid_order_discount_v2`：在既有 `set_config` 區塊尾端（現行第 198 行後）插入 4 行，其餘一字不改。

```diff
   PERFORM set_config('app.paid_discount_settlement', v_settle, true);
+
+  -- V5.5C 批次四：標記變更來源／原因／操作者，供 zzz_order_change_log trigger 記錄
+  PERFORM public.set_order_change_context(
+    'paid_discount_edit',
+    v_reason,
+    '已結清折扣修改（' || v_mode || '／' || v_settle || '）',
+    'user');

   UPDATE public.orders
      SET discount_amount = v_new_discount,
```

`update_paid_order_addons_v3`：在 `app.paid_addon_reduce_ack` 區塊之後（現行第 608 行後）插入 5 行。

```diff
   IF v_delta < 0 THEN
     PERFORM set_config('app.paid_addon_reduce_ack', 'on', true);
   END IF;
+
+  -- V5.5C 批次四：標記變更來源／原因／操作者
+  PERFORM public.set_order_change_context(
+    'paid_addon_edit',
+    v_reason,
+    '已付款加購修改（' || v_settle || '）',
+    'user');

   UPDATE public.orders
      SET custom_addon_details = v_addons,
```

若採方案 B，折扣版另刪除第 216–252 行的 INSERT、254–266 行的兩道自我驗證，並把回傳的 `'audit_log_id', v_audit_id` 改為 `NULL`（前端型別為選用，不需同步改）。

## 6. 測試（重要：目前受環境權限限制）

沙箱的資料庫身分只有 select/insert，且沒有 `auth` schema 權限，實測遇到：
- `SET LOCAL ROLE authenticated` → `permission denied to set role`
- 直接呼叫 → `ERROR: permission denied for table orders`（`SELECT … FOR UPDATE`）
- 建立 `public` 測試副本 → `permission denied for schema public`（`pg_temp` 副本可建立，但一樣卡在 orders 權限）

也就是說，這兩支 RPC 的 BEGIN…ROLLBACK 實測 **無法用批次一～三那條路徑完成**。可行做法二選一：
- (a) 以「刻意在最後 RAISE EXCEPTION 中止」的 migration 執行三組測試：以 postgres 身分建立 patched 版本、跑折扣／加購／檢查 `order_change_log`，最後拋例外讓整個 migration 回滾，資料庫不留任何變更；
- (b) 先核准施工，再由實際後台操作一筆測試訂單驗證。

補充查證（已完成，可佐證判斷）：
- `order_change_log` 目前共 32 筆、全部 `source='unmarked'`，最早 2026-09-09 07:22 UTC；現有的 `paid_discount_edit`／`paid_addon_edit` audit 紀錄（09-07、09-08）都早於 trigger 建立時間，因此目前 **尚無任何一次已結清折扣／加購修改被 trigger 記錄過**，這也是本批要補 context 的直接理由。

## 7. 待你決定

1. 採方案 A（只補 context、保留 audit_logs）還是 B／C？
2. 測試要用 (a) 自我中止的 migration，還是 (b) 施工後實機驗證？
