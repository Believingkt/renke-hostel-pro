# V5.5C.1 設計：內嵌編輯表單「改為已付清時同步已付金額」

狀態：設計階段，未施工。

## 一、NJ3U85G6 現況（唯讀）

| 項目 | 值 |
|---|---|
| 訂單 | NJ3U85G6 / 水行戶外 / 森山 |
| 入住 | 2026-09-19 → 09-20 |
| 房費 total_price | 31,500 |
| 折扣 | 0 |
| 應收 final_price | 31,500 |
| 訂金 deposit_amount | 9,450（付款方式 ATM） |
| 已付 paid_amount | **0** |
| 付款狀態 | paid（已付清） |
| 訂單來源 | owner_provided（業主自帶）；原為保留單轉正 |
| 備註 | 只有包棟房間配置、保留單、狀態變更、來源變更四行，**沒有任何收款金額或匯款紀錄** |

金流線索：
- `payment_status_history`：僅 1 筆，2026-09-01 04:21 由 hsusylvia0406 從 unpaid → paid，當下 `paid_amount = 0`。
- `audit_logs`：2026-09-01 的 `inline_edit` 只改了 payment_status 與房間配置。
- `payment_link_logs`、線上金流交易：**無任何紀錄**（ATM 只是註記的付款方式，沒有實際虛擬帳號或入帳）。

也就是說系統裡查不到這筆的實際收款證據，判斷仍需人工向業主／同仁確認，我不下結論。

## 二、修法設計（OrderDetail.tsx 內嵌編輯 handleSaveEdit）

### 觸發條件
在 `handleSaveEdit` 組 `updateData` 之前偵測：

```
const FULLY_PAID = ["paid", "fully_paid"];
const willBeFullyPaid = FULLY_PAID.includes(editForm.payment_status);
const wasFullyPaid   = FULLY_PAID.includes(order.payment_status);
const expectedFinal  = pricingUnchanged ? Number(order.final_price ?? 0) : editFinalPriceCalc;
const paidShort      = Number(editForm.paid_amount) < expectedFinal;

const needsPaidSync = willBeFullyPaid && !wasFullyPaid && paidShort;
```

只在「這次存檔正要把狀態改成已付清」時觸發；已經是已付清的訂單不動（避免誤蓋已結清訂單的部分退款情境）。

### 建議行為：跳出確認，不要無聲自動修正

理由：
- `PaymentStatusDialog` 是「單純換狀態」，自動帶入是安全的；內嵌編輯表單同時可改房費、加購、訂金、已付金額，使用者有可能是刻意輸入部分收款金額，靜默覆蓋會造成新的資料錯誤。
- 但完全不管，就是 FM2N96G9／NJ3U85G6 這種狀況的成因。

設計為存檔前彈出一個 AlertDialog：

```
標題：付款狀態為「已付清」，但已付金額少於應收
內容：應收 NT$31,500，目前已付 NT$0，差額 NT$31,500。
選項一（預設、主要按鈕）：已收齊，把已付金額更新為 31,500
選項二：維持已付 0，狀態改為「已付訂金」
選項三：取消，我要自己調整
```

- 選一：`updateData.paid_amount = expectedFinal`，並在稽核 diff 追加 `已付 0→31500`（沿用既有 1195 行的 auditParts 機制）。
- 選二：`updateData.payment_status = "deposit_paid"`，`paid_amount` 不動。
- 選三：關閉對話框、留在編輯狀態，不送出。

反向不一致（狀態非已付清、但已付 ≥ 應收）不在本次範圍，維持現狀。

### 實作落點
- 新增 state：`paidSyncPrompt`（存放 pending 的 updateData 與差額），`handleSaveEdit` 在偵測到 `needsPaidSync` 時 `setPaidSyncPrompt(...)` 並 return；使用者選擇後以帶參數的方式續跑同一段送出邏輯（把送出段抽成 `commitEdit(updateData)`）。
- 稽核：已付金額變動本來就會被 1195–1196 行的 `已付 a→b` 記錄，且 `order_change_log` 也會記到 paid_amount 前後值，不需要另外加。
- DB trigger 不受影響：`paid_amount` 不在已付款不可變更的欄位清單裡（現行程式碼在已結清訂單也一直有送 `paid_amount`）。

### 待處理的既有錯資料
FM2N96G9（應收 57,600 / 已付 17,000，客人已確認付清）與 NJ3U85G6 待確認後，於本設計核准施工時一併訂正，並在備註留下訂正說明。

## 三、與已結清折扣／加購專用流程的關係（已確認）

- `update_paid_order_discount_v2`、`update_paid_order_addons_v3` 只在 `src/components/orders/PaidAmountEditDialog.tsx` 內以 `supabase.rpc()` 呼叫，與 `OrderDetail.tsx` 的 `handleSaveEdit` 是**完全分開的兩條路徑**，不共用任何函式。
- 本次改動只落在 `handleSaveEdit` 的送出前判斷，不改 RPC、不改 `PaidAmountEditDialog`。
- 觸發條件是「payment_status 由非已付清 → 已付清」；那兩支 RPC 的使用前提本來就是訂單**已經**是 paid/fully_paid，狀態不會在該流程中發生轉換，因此不會被新判斷攔截。
- 現行 handleSaveEdit 對已結清訂單的折扣／加購欄位仍維持 blocked 攔截（1131–1150 行），行為不變。
