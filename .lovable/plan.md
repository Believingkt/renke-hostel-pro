
# 旅行日 JPY 可直接輸入方案

## 一、需求理解

目前 JPY 只是顯示換算（DB 仍存 TWD）。你要的是：
- 房型/方案價格（後台房價設定）
- 建立訂單（房間金額、加購、折扣）
- 訂單詳情編輯（金額、已付金額…）

→ 在「旅行日」可**直接以 JPY 輸入金額**，系統自動換算成 TWD 寫入 DB。

## 二、核心策略：「輸入時雙向，儲存仍 TWD」

DB schema **完全不動**，所有金額繼續存 TWD。原因：
- 金流（信用卡、ATM、LINE Pay）只能扣 TWD
- 分潤、營業額、結算、推播全部已綁 TWD
- 改成多幣別會牽動 50+ 個 Edge Function / 統計報表，風險過大

實作方式：**在輸入欄位加幣別切換**。

```
┌──────────────────────────────────┐
│ 金額: [ 75,175 ] [TWD ▼]         │
│       下方小字：≈ ¥ 382,641      │
└──────────────────────────────────┘
         切到 JPY 後：
┌──────────────────────────────────┐
│ 金額: [ 380,000 ] [JPY ▼]        │
│       下方小字：≈ NT$ 74,754     │
└──────────────────────────────────┘
```

- 按下「儲存」時，若選 JPY → 自動除以匯率轉成 TWD 存入 DB
- 列表、統計、推播等讀取端**完全不變**（仍讀 TWD）
- 幣別偏好記到 `localStorage`（每個使用者個別記憶），預設 JPY（旅行日場景）

## 三、實作範圍

### 新元件
- `<DualCurrencyInput>`：金額 input + 幣別切換按鈕 + 下方換算小字
  - 僅當該 accommodation 有 `secondary_currency` 時顯示切換鈕
  - 其他民宿 → 退化成普通 TWD input（行為不變）

### 套用位置（只動旅行日相關 UI，其他民宿無感）
1. **建立訂單** `CreateOrderDialog.tsx`：房間金額、加購金額、額外加購金額、折扣金額、已付金額
2. **訂單詳情** `OrderDetail.tsx` + `OrderMetaDrawer.tsx`：實收金額、已付金額、加購、額外加購
3. **後台房價設定** `RoomPriceCalendar.tsx` / `RoomPriceEditDialog.tsx` / `BulkOpenInventoryDialog.tsx`：批次設定價格 input
4. **方案/包區金額** `AdminPackages.tsx`、`CapacityPriceLadder.tsx` 後台 → 暫不動（房價已涵蓋）

### 不動的部分
- DB schema、orders 欄位
- 列表顯示（維持先前的「TWD 主 + JPY 小字」雙幣顯示）
- 金流、發票、推播、分潤、結算

## 四、換算規則

- 來源：`accommodation_info.secondary_currency_rate`（HQ 已設定）
- TWD → JPY：`Math.round(twd * rate)`
- JPY → TWD：`Math.round(jpy / rate)`（四捨五入到元）
- 儲存時固定使用「**當下匯率**」一次性換算，存進 DB 的是換算結果 TWD
- 若日後改匯率，**歷史訂單金額不會變動**（合理：訂單已成立）

## 五、技術細節

```text
src/components/ui/dual-currency-input.tsx        新增
  ↳ props: { value (TWD), onChange (TWD), config, ...inputProps }
  ↳ 內部 state: displayCurrency ('TWD' | 'JPY')
  ↳ localStorage key: 'lakeze-input-currency-{accId}'

修改檔案：
- src/components/orders/CreateOrderDialog.tsx
- src/pages/OrderDetail.tsx (或對應金額欄位區塊)
- src/components/orders/OrderMetaDrawer.tsx
- src/pages/RoomPriceCalendar.tsx
- src/components/RoomPriceEditDialog.tsx
- src/components/BulkOpenInventoryDialog.tsx
```

## 六、防呆

- 切換幣別時，現有數字會立即換算顯示，避免「以為改了幣別、數字沒變」誤填
- 失焦時顯示換算結果，提交前 toast 提示：「將以 NT$ X,XXX 入帳」
- 匯率未設 / ≤ 0 → 自動隱藏切換鈕，退回 TWD-only

## 七、要先跟你確認

1. 切換幣別後預設值：**「沿用上次選擇（localStorage）」**？還是 **「旅行日預設 JPY、其他預設 TWD」**？
2. 「房價設定」（每日房價）也要嗎？我猜要，因為這是業主端最常輸入的地方
3. 訂單提交前要不要彈一個確認：「將以 NT$ 74,754 入帳（換算自 ¥ 380,000 @ 5.08）」？避免匯率錯誤造成爭議
