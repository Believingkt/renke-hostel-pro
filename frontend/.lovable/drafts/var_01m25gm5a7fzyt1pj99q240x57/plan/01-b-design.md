# B. 防止用「變更訂單狀態」誤取消團購／信用卡訂單（設計稿，未施工）

## 要解決的問題
後台訂單列表的「變更訂單狀態」可以把任何訂單直接改成「已取消」，不會退款、不會寄取消信、也不會處理團購佣金。團購訂單與信用卡訂單各自有正確的取消入口，但目前沒有任何機制擋住走錯路。

## 修改／新增檔案清單
1. 新增 `supabase/functions/_shared/cardPaymentRule.ts`（純 TypeScript、零 import）
2. `supabase/functions/_shared/orderRefund.ts` → 改為 re-export 上檔規則
3. `src/lib/cardPaymentDisplay.ts` → 改為 re-export 上檔規則
4. `src/components/orders/OrderStatusDialog.tsx` → 停用「已取消」選項＋導引文字＋錯誤訊息轉譯
5. `src/pages/OrderDetail.tsx` → 內嵌編輯表單同樣擋下「已取消」；刪除死碼 `handleCancelOrder`
6. 新增 migration：`update_order_fields_v1` 內建最後一道防線
