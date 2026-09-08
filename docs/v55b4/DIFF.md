# V5.5B.4 — kol-dashboard 保險式排除 notes（設計稿，未施工）

## 事實前提（唯讀查證）
- `ORDER_SELECT`（L11-12）有撈 `notes`，且**必須繼續撈**：`commissionBaseFromOrder()` → `extraOnSiteAddonFromNotes()` 會從 notes 解析 `【額外現場加購金額】…【額外現場加購金額END】`（V2/V3 分潤基準需要）。
- 回傳端（L118-133）逐欄組裝，目前**沒有**把 notes 放進 `orders[]`。
- 因此本次不是修 bug，是加「防未來誤加回去」的保險：明確剝除 + 註解 + 測試。

## 1) `supabase/functions/kol-dashboard/index.ts`

```diff
@@ L11-12
+/**
+ * 🔒 notes 僅供伺服器端解析分潤用（extraOnSiteAddonFromNotes：現場加購金額），
+ *    嚴禁出現在回傳給 KOL 的 payload。
+ *    orders.notes 內含內部稽核（🔒 行）、金流（ATM 虛擬帳號、rec_trade_id、3DS/TapPay）、
+ *    包棟/包區房間配置與客人聯絡資料，KOL 為外部合作對象，不得看見。
+ *    2026-09 V5.5B 系列（B.1 OwlTing / B.2 客人信 / B.3 點數平台 / B.4 本檔）已逐一確認此原則。
+ *    ⚠️ 未來若要在 KOL 後台顯示備註，必須改走 buildOwltingNotes() 白名單過濾，
+ *       不可直接把 o.notes 塞進回傳物件，也不要因為「看起來沒用到」就刪掉下面的 stripInternal()。
+ */
 const ORDER_SELECT =
   "id, order_number, discount_code, ... custom_addon_details, notes, currency_at_booking";
+
+/** 回傳前的最後一道防線：任何情況下都不讓 notes（及其他內部欄位）流出。 */
+function stripInternal<T extends Record<string, unknown>>(row: T): Omit<T, "notes"> {
+  const { notes: _notes, ...safe } = row as T & { notes?: unknown };
+  return safe as Omit<T, "notes">;
+}
@@ L118-133 orders.push({...})
-    orders.push({
+    orders.push(stripInternal({
       id: o.id,
       order_number: o.order_number,
       ...
       is_settleable: isSettleable,
-    });
+    }));
```

說明：`orders.push()` 目前是欄位白名單，`stripInternal()` 對現況是 no-op；價值在於未來有人改成 `...o` 展開時，notes 仍會被剝掉，且註解直接寫明原因。

## 2) 新增測試 `src/test/kol-dashboard-no-notes.test.ts`

```ts
// 讀 supabase/functions/kol-dashboard/index.ts 原始碼文字，斷言：
// 1. ORDER_SELECT 仍含 notes（分潤解析需要，不可誤刪）
// 2. 回傳組裝走 stripInternal(
// 3. 檔案中不存在 `notes: o.notes` 或 `...o,` 這類把整列展開的寫法
```
純文字斷言，不需要跑 Edge Function，能擋住未來的回歸。

## 3) 影響面
- 行為零變化：現況回傳欄位一模一樣，分潤金額計算不受影響。
- 無 migration、無 DB 寫入、不影響前端（`KolDashboardPublic.tsx` 本來就沒讀 notes）。
- 需重新部署 `kol-dashboard`；回滾＝還原此檔。

## 4) 範圍外（如實說明）
`kol-bonus-public`、`kol-webhook` 本次不動（先前查證兩者皆未 select 或回傳 notes）。
