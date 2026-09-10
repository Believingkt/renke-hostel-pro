## 技術細節與 diff

### 1. `supabase/functions/_shared/cardPaymentRule.ts`（新增）
```ts
/** 信用卡收款判定唯一規則（純 TS、零 import，前後端共用；比照 refundFee.ts 先例） */
const CARD_METHODS = new Set(["credit_card", "credit_card_3ds", "card", "信用卡"]);
const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer"]);

export interface CardPaymentOrderShape {
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  payment_provider?: string | null;
}

export function isCardPaidOrderRule(order: CardPaymentOrderShape | null | undefined): boolean {
  if (!order) return false;
  const methods = [order.balance_payment_method, order.payment_method, order.deposit_payment_method]
    .filter(Boolean) as string[];
  if (methods.some((m) => ATM_METHODS.has(m))) return false;
  if (methods.some((m) => CARD_METHODS.has(m))) return true;
  return !!order.room_charge_rec_trade_id;
}
```
邏輯與現行 `isCardPaidOrder` 逐字相同，只有零 import 與可選 order 兩點差異。前端打包沒有問題：檔案不含任何 Deno API 或 `.ts` 相對 import。

### 2. `orderRefund.ts`
```diff
+import { isCardPaidOrderRule } from "./cardPaymentRule.ts";
-export function isCardPaidOrder(order: RefundableOrder): boolean {
-  ...現行 9 行實作...
-}
+export function isCardPaidOrder(order: RefundableOrder): boolean {
+  return isCardPaidOrderRule(order);
+}
```

### 3. `src/lib/cardPaymentDisplay.ts`
```diff
+import { isCardPaidOrderRule, type CardPaymentOrderShape } from "../../supabase/functions/_shared/cardPaymentRule";
-export function isCardPaidOrderDisplay(order) { ...重複實作... }
+export type CardDisplayOrderShape = CardPaymentOrderShape;
+export const isCardPaidOrderDisplay = isCardPaidOrderRule;
```
`isTappayCardOrder` 保持不變（改呼叫上面的 const）。既有比對測試 `src/test/group-buy-card-cancel-ui.test.ts` 仍會通過，且從此不可能再漂移。

### 4. `OrderStatusDialog.tsx`
```diff
+const blockCancel = !!order && order.order_status !== "cancelled" &&
+  (order.order_source === "group_buy" || isCardPaidOrderDisplay(order));
+const blockHint = order?.order_source === "group_buy"
+  ? "團購訂單請改用團購管理的「取消／退款」，才會一併處理退款、佣金與取消通知信。"
+  : "信用卡訂單請改用訂單詳情頁的「取消訂單」，才會一併原卡退刷並寄出取消通知信。";
```
RadioGroup 內：`disabled={status.value === "cancelled" && blockCancel}`，並在該列下方以小字顯示 `blockHint`。`handleSave` 的 catch 新增：訊息含 `ORDER_CANCEL_BLOCKED` 時，顯示 `blockHint`，不顯示原始 SQL 例外字串。

### 5. `OrderDetail.tsx`
- 內嵌編輯的狀態下拉：同樣條件 disabled「已取消」＋同一段提示文字。
- 送出後的錯誤處理同樣攔截 `ORDER_CANCEL_BLOCKED`。
- 刪除死碼 `handleCancelOrder` / `buildAdminCancelPatch`（來源 `admin_order_cancel`，目前無任何 UI 呼叫）。

### 6. Migration：`update_order_fields_v1` 防護（已修正判斷邏輯）
函式 `declare` 區塊新增兩個布林變數，並在既有白名單處理之前插入判斷：
```sql
declare
  ...既有宣告不變...
  v_is_atm  boolean;
  v_is_card boolean;
begin
  ...取得 v_old 之後...
  v_is_atm := coalesce(v_old.balance_payment_method in ('atm','ATM','atm_transfer'), false)
           or coalesce(v_old.payment_method in ('atm','ATM','atm_transfer'), false)
           or coalesce(v_old.deposit_payment_method in ('atm','ATM','atm_transfer'), false);

  v_is_card := coalesce(v_old.balance_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
            or coalesce(v_old.payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
            or coalesce(v_old.deposit_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
            or v_old.room_charge_rec_trade_id is not null;

  if (v_patch ? 'order_status') and v_patch->>'order_status' = 'cancelled'
     and v_old.order_status is distinct from 'cancelled' then
    if v_old.order_source = 'group_buy' or (not v_is_atm and v_is_card) then
      raise exception 'ORDER_CANCEL_BLOCKED: 此訂單必須使用專屬取消流程';
    end if;
  end if;
```
- 三個付款方式欄位各自比對、各自 `coalesce(..., false)`：任一為 ATM 即不算卡付款；NULL 不會讓判斷失效。
- 與 `cardPaymentRule.ts` 的 `isCardPaidOrderRule` 逐字對等（ATM 優先於卡別，最後才看 `room_charge_rec_trade_id`）。
- SECURITY INVOKER 模式不變、白名單欄位不變、ACL 不變。
- 合法路徑不受影響：團購走 `group-buy-cancel-refund`、信用卡走 `cancel-order-with-refund`，兩者以 service role 直接 update，不經此 RPC。

## precheck / postcheck
- precheck：記錄 `update_order_fields_v1` 的 md5、`prosrc` 長度、`prosecdef`、ACL 清單。
- postcheck：同上四項重取比對（只有 md5／長度改變，`prosecdef=false`、ACL 逐字不變）。
- 測試 1（擋下）：BEGIN … 對一筆團購訂單呼叫 RPC 改成 cancelled → 必須 raise `ORDER_CANCEL_BLOCKED`；ROLLBACK。
- 測試 2（擋下）：同上，改用一筆信用卡訂單。
- 測試 3（回歸）：一筆 ATM／現金的一般訂單改成 cancelled → 成功寫入，`order_change_log` 照常產生；ROLLBACK。
- 測試 4（回歸）：一般欄位（備註、聯絡方式）更新不受影響；ROLLBACK。
- 前端：`npx tsgo --noEmit` 與既有卡別比對測試全數通過。
