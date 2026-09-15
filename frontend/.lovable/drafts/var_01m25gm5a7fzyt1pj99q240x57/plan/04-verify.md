## 審查提問的兩項查證結果

### 1. 資料庫是否存在「三個付款方式欄位不一致」的訂單
實際查詢全庫 `orders`：

| 檢查項目 | 筆數 |
| --- | --- |
| 三個付款方式欄位彼此不一致（任兩個非空且不相同） | 0 |
| 同時含 ATM 與信用卡（舊 coalesce 版會誤判擋下） | 0 |
| 三欄皆 NULL 但有 `room_charge_rec_trade_id`（舊版 NOT IN 遇 NULL 會失效） | 0 |
| 純信用卡訂單（新舊版判斷一致） | 20 |

結論：舊 coalesce 寫法的兩個缺陷在現有真實資料上尚未造成過影響，但屬未來會踩到的邏輯錯誤（訂金 ATM、尾款刷卡是完全合法的組合），仍必須依修正版寫法施工。因為目前沒有真實混合資料，這兩種情境的測試只能以合成資料在 `BEGIN … ROLLBACK` 中臨時改欄位後驗證，測試前後皆回滾。

### 2. 兩處畫面的 order 物件是否含五個財務欄位
兩處都是 `select *`，五個欄位都會抓到：

- `src/pages/Orders.tsx:204-206`
  ```ts
  .from("orders")
  .select(`*, room_types ( id, name )`, { count: "exact" })
  .eq("accommodation_id", accommodationId);
  ```
- `src/pages/OrderDetail.tsx:1550-1559`
  ```ts
  .from("orders")
  .select(`
    *,
    room_types ( name, name_en )
  `)
  .eq("id", orderId)
  .maybeSingle();
  ```

唯一要補的是型別：`src/types/order.ts` 的 `Order` 介面有 `payment_method`、`deposit_payment_method`、`balance_payment_method`，但沒有 `room_charge_rec_trade_id` 與 `payment_provider`。施工時在 `Order` 介面補上這兩個可選欄位（`room_charge_rec_trade_id?: string | null; payment_provider?: string | null;`），前端判斷才會完整生效，而不是靠 `any` 轉型蒙混。

### 補充測試案例（依修正後邏輯）
- 案例 A：`deposit_payment_method='atm'`、`balance_payment_method='credit_card'` → 不擋（舊版會錯誤擋下）。
- 案例 B：三欄皆 NULL、`room_charge_rec_trade_id` 有值 → 必須擋（舊版會漏擋）。
- 案例 C：團購訂單 → 擋。
- 案例 D：純 ATM 一般訂單 → 不擋，`order_change_log` 照常寫入。
