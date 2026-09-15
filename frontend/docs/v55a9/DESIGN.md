# V5.5A.9 設計文件（唯讀＋設計階段，尚未施工）

第四項：order_rooms 寫入改為單一交易的 diff-based RPC。
SQL 全文見 `01_migration.sql`／`02_rollback.sql`（均尚未執行）。

## 一、RPC 簽章

```
public.sync_order_rooms_v1(
  p_order_id            uuid,
  p_expected_updated_at timestamptz,   -- 樂觀鎖，比照 update_paid_order_addons_v3
  p_rooms               jsonb          -- [{id?, room_type_id, quantity, room_price, template_id?, template_name?, room_unit_id?}]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
GRANT EXECUTE TO authenticated, service_role（REVOKE FROM PUBLIC）
```

回傳：
```json
{"ok":true,"order_id":"…","inserted":[…],"updated":[…],"deleted":[…],
 "conflicts":[{"order_room_id":"…","room_type_id":"…","room_unit_id":"…",
               "reason":"unit_occupied","conflict_order_number":"UN4H62C3"}]}
```

## 二、行為

1. **identity diff**：以 `order_rooms.id` 比對。輸入沒帶到的既有列 → DELETE；帶 id 且存在 → UPDATE；沒帶 id → INSERT。先刪後寫，讓被釋放的房號能在同批重新指派。
2. **樂觀鎖**：`p_expected_updated_at` 與 `orders.updated_at` 不符 → `STALE_ORDER`，整筆不寫。
3. **advisory lock**：進入 function 第一件事就 `pg_advisory_xact_lock(hashtextextended(order_id,1))`，涵蓋 DELETE/UPDATE/INSERT 全程（現行只有部分 INSERT 路徑會鎖）。
4. **房號衝突容錯（方案 A）**：寫入前先查該 unit 是否被其他未取消、日期重疊的訂單佔用；有的話該列 `room_unit_id` 設 NULL 並記進 `conflicts`，**其餘欄位照常寫入、交易不失敗、RPC 回傳 ok:true**。
5. **既有規則不動**：`validate_order_rooms_inventory`（庫存）、`validate_room_unit_no_conflict`（最後一道防線）、`order_rooms_prevent_double_submit`、兩支 enqueue trigger 全部保留，migration 的 pre/postcheck 會驗證這 5 支 trigger 仍在。
6. **權限**：`service_role` 直接放行；否則以 `EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin','admin'))` 判斷全域管理員，其餘走 `public.get_staff_module_permission(uid, accommodation_id, 'orders') = 'editable'`。**不使用 `public.has_role()`——該函式在本專案不存在（DB 內只有 `public.user_has_role(uuid, uuid, app_role)` 與 `get_staff_module_permission`），原稿寫法會在執行期噴 `function does not exist`，已更正。** migration precheck 追加驗證 `get_staff_module_permission(_user_id uuid, _accommodation_id uuid, _module_key text)` 存在且為 SECURITY DEFINER。

### 測試身分補充（(d)/(e)）
先前 (a)(b)(c) 三個測試都是以 SQL 連線的既有身分執行（`request.jwt.claims` 未設 → `v_role` 非 service_role、`auth.uid()` 為 NULL 的路徑未被觸發，權限段等同未實測）。補測結果（BEGIN…ROLLBACK，正式資料 0 異動）：

```text
setup            order=app-staging-lab-5 rows=6
auth_uid         2693a019-449f-46e1-8b00-ba29b0db75fa   (super_admin)
(d) super_admin  {"ok": true, "deleted": [], "inserted": [], "updated": [6 筆 id], "conflicts": []}
(e) no-role      BLOCKED=NOT_AUTHORIZED
after_rows       6
```
交易結束後確認暫時函式已隨 rollback 消失（`tmp_fn=0`）。

## 三、呼叫端改法

### OrderDetail.tsx（`handleSaveEdit`）
- 移除 1243–1326 的 delete → 殘留驗證 → 自動指派 → insert 區塊，改為一次 `supabase.rpc('sync_order_rooms_v1', { p_order_id, p_expected_updated_at: order.updated_at, p_rooms })`。
- `p_rooms` 直接由 `editOrderRooms` 映射，**保留既有 id**（現行是整批重建、id 全換）。`quantity !== 1` 的列 `room_unit_id` 一律 null（規則不變）。
- 自動指派空房號的邏輯維持在前端（沿用現行 room_units / 佔用查詢），只是結果透過 RPC 寫入。
- 存檔成功後：
  ```ts
  const conflicts = (data as any)?.conflicts ?? [];
  if (conflicts.length > 0) {
    toast({ variant: "destructive", title: "部分房號未指派",
      description: `有 ${conflicts.length} 間房的房號已被其他訂單佔用（${conflicts.map(c=>c.conflict_order_number).join("、")}），已留空待人工確認。` });
  }
  ```
  一次性 toast，清單頁不加任何常駐標記。
- `STALE_ORDER` → toast「訂單已被其他人修改，請重新整理」。

### owltingAutoOrder.ts（`rebuildOrderRooms`）
- 新增 `syncOrderRoomsViaRpc()`：沿用現有「查 room_units＋算佔用＋依序挑房」的組列邏輯產生 `p_rooms`（不帶 id，等同全新建立），再呼叫 `admin.rpc('sync_order_rooms_v1', {...})`，`p_expected_updated_at` 傳 null（背景流程不做樂觀鎖）。
- RPC 回錯 → 沿用 V5.5A.8 的止血補丁：staging 標記 `pending_review` ＋ 寄 `orderRoomsAlert.ts` 告警信。
- **`conflicts` 非空不算失敗、不寄信、不標 staging**（已與需求確認）。

### 舊邏輯保留方式
- 不做 feature flag、不做執行期 fallback。呼叫端只走 RPC，RPC 出錯就直接報錯。
- 舊實作改名保留為 `legacyRebuildOrderRooms_DO_NOT_CALL`（owltingAutoOrder.ts）與 `legacySaveOrderRooms_DO_NOT_CALL`（OrderDetail.tsx 內註解區塊），程式中不存在任何分支可走到它們；緊急復原靠重新部署舊 commit。
- 現況確認：`rebuildOrderRooms` 目前僅 2 個呼叫點（owltingAutoOrder.ts:189、:506），改完後為 0。另註記 `owlting-fillup-submit/index.ts:316` 也有一處獨立的 `order_rooms` 刪除（取消 pending 單用），本次不在範圍內。

## 四、BEGIN…ROLLBACK 實測（已執行，正式資料 0 異動）

以暫時建立的同版本 function 在交易內執行，最後以刻意 exception 回滾。

**(a) 正常編輯**（訂單 UN4H62C3，6 列）
```
BEFORE_rows=6 cin=2026-10-17 cout=2026-10-18
result={"ok": true,
  "deleted": ["02da259a-836b-4b88-829a-8d132379042f"],
  "updated": ["2e5606e5-…","5bca89d2-…","6002fb4f-…","787be62e-…","e671f7cd-…"],
  "inserted": ["52c354ba-0711-4c14-a4f5-46f44cbe61a8"],
  "conflicts": []}
AFTER_rows=6
```

**(b) 房號衝突**（訂單 NY7H35S2，塞入 UN4H62C3 佔用中的房號）
```
BEFORE_detail=[{"id":"201b48e6-…","unit":null,"price":49000}]
result={"ok": true, "updated":["201b48e6-…"], "deleted":[], "inserted":[],
  "conflicts":[{"reason":"unit_occupied","room_unit_id":"05f69900-118b-42e1-b5a9-c31508cc71e3",
                "order_room_id":"201b48e6-…","conflict_order_number":"UN4H62C3"}]}
AFTER_detail=[{"id":"201b48e6-…","unit":null,"price":49000}]
```
→ RPC 成功、衝突列 unit 留空、其餘欄位照寫。

**(c) 庫存超賣**（把該房型當日 available_rooms 設 0 後再加一間）
```
(c) BLOCKED=Room not available on 2026-10-17
```
→ 既有庫存規則仍然擋下，未被拿掉。

## 五、白話說明

- 現在：改訂單房型時，系統先把整張單的房間紀錄全部刪掉、再一筆一筆重新寫回。中途出錯的話刪掉的救不回來，房間明細就會變空白；同時房號被別人佔走時整批存檔會直接失敗。
- 之後：改成一次交易處理，只針對真正有變動的那幾間做新增／修改／刪除，中途出錯全部回到原樣，不會憑空消失。房號剛好被別的訂單佔走時，只會把那一間的房號留空，其他資料照存，存檔後跳一次提示告訴當下操作的人；不會整張單存不進去，也不會寄告警信。庫存與重複送出的既有防護完全保留。
