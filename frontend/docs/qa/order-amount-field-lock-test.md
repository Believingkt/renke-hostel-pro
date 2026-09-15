# 訂單金額欄位鎖定 — 手動驗收清單

驗證範圍：`OrderDetail.tsx` inline edit、`OrderPriceEditDialog`、DB trigger `prevent_immutable_order_fields_change`。

## 鎖定矩陣（預期行為）

| payment_status | 房費 total_price | 折扣 discount_amount | 折扣碼 discount_code | 訂金 deposit_amount |
|---|---|---|---|---|
| `unpaid`        | ✅ 可編輯 | ✅ 可編輯 | ✅ 可編輯 | ✅ 可編輯 |
| `deposit_paid`  | ✅ 可編輯 | ✅ 可編輯 | ✅ 可編輯 | 🔒 鎖定 |
| `paid`          | 🔒 鎖定（*1） | 🔒 鎖定（*2） | 🔒 鎖定（*2） | 🔒 鎖定 |
| `fully_paid`    | 🔒 鎖定（*1） | 🔒 鎖定（*2） | 🔒 鎖定（*2） | 🔒 鎖定 |

(*1) super_admin 可繞過。
(*2) 具「修改已結清折扣」權限或 super_admin 可解鎖。

附帶規則：
- `🔒 結清金額變動` 通知 + `🔒[金額異動 ...]` 備註審計列：**僅** OLD.payment_status ∈ {paid, fully_paid} 時觸發；`deposit_paid` 不會觸發。
- 已寫入的 `🔒[金額異動` 備註列任何人（含 super_admin）都不能刪改。

---

## 前端驗收

於 `/admin/orders/<id>` 進入訂單，按「編輯」開啟 inline edit，並開啟「修改金額」(`OrderPriceEditDialog`)：

### A. unpaid 訂單
- [ ] 房費、折扣、折扣碼、訂金 input 全部可編輯（`disabled=false`）。
- [ ] 修改任一金額存檔成功，**不**寫入 `🔒[金額異動` 列、**不**產生 `settled_amount_change` 通知。

### B. deposit_paid 訂單
- [ ] 房費 input 可編輯。
- [ ] 折扣、折扣碼 input 可編輯（無「修改已結清折扣」權限亦可）。
- [ ] 訂金 input `disabled=true`。
- [ ] 嘗試透過 DevTools 移除 disabled 改訂金後存檔 → toast「訂金 無法在此付款狀態下變更…」。
- [ ] 修改房費或折扣後存檔成功，**不**寫入 `🔒[金額異動` 列、**不**產生通知。

### C. paid / fully_paid 訂單（一般使用者，無解鎖權限）
- [ ] 房費、折扣、折扣碼、訂金 input 全部 `disabled=true`。
- [ ] 強制改值送出 → toast 列出被擋下的欄位。
- [ ] 加購方案調整後存檔，`final_price` 更新成功且寫入 `🔒[金額異動 ... 實收 a→b]` 備註列、產生「🔒 結清金額變動」通知。

### D. paid / fully_paid 訂單（已開啟「修改已結清折扣」權限）
- [ ] 折扣、折扣碼 input 可編輯，房費與訂金仍鎖定。
- [ ] 修改折扣存檔成功 → 備註自動追加 `🔒[金額異動 YYYY-MM-DD HH:mm by 操作者顯示名稱] 折扣 a→b…`。
- [ ] 通知中心新增「🔒 結清金額變動」一筆（每次修改都是新的一筆，不被去重合併）。

### E. 備註不可破壞
- [ ] 嘗試於備註欄刪除既有的 `🔒[金額異動 …]` 整行後存檔 → 失敗 toast：「已鎖定的金額異動記錄不可刪除或修改」。
- [ ] 修改非 🔒 開頭的其他備註行可正常存檔。

---

## DB Trigger 驗收（用 super_admin 以外的使用者執行）

```sql
-- 1) deposit_paid 訂單修改 deposit_amount → 應失敗
UPDATE public.orders SET deposit_amount = deposit_amount + 1
WHERE id = '<deposit_paid order id>';
-- ❌ 預期：ERROR  deposit_amount cannot be changed after deposit is paid

-- 2) deposit_paid 訂單修改 total_price → 應成功
UPDATE public.orders SET total_price = total_price + 100
WHERE id = '<deposit_paid order id>';
-- ✅ 預期：UPDATE 1，且不產生 settled_amount_change notification

-- 3) paid 訂單修改 total_price → 應失敗
UPDATE public.orders SET total_price = total_price + 100
WHERE id = '<paid order id>';
-- ❌ 預期：ERROR  total_price cannot be changed after payment

-- 4) paid 訂單修改 discount_amount（無解鎖權限）→ 應失敗
UPDATE public.orders SET discount_amount = discount_amount + 50
WHERE id = '<paid order id>';
-- ❌ 預期：ERROR  discount_amount cannot be changed after payment

-- 5) 嘗試刪除既有 🔒 備註列 → 應失敗
UPDATE public.orders SET notes = ''
WHERE id = '<order with 🔒 line>';
-- ❌ 預期：ERROR  已鎖定的金額異動記錄不可刪除或修改
```

驗收通過條件：以上五項 SQL 結果與預期一致。
