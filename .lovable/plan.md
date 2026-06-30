
# 旅行日 JPY 雙幣別顯示方案

## 一、設計原則（重要）

旅行日是台灣公司營運的民宿，金流（信用卡、ATM、LINE Pay、TapPay）、發票、分潤、營收統計**仍以 TWD 為主**。因此採取「**儲存單一幣別（TWD）+ 顯示層雙幣別（JPY 參考價）**」策略：

- ✅ DB `room_inventory_pricing.price`、`orders.total_price/final_price` 等欄位 **仍只存 TWD**。
- ✅ 新增「JPY 顯示」是給日本客人看的參考價，不影響金流、不影響分潤、不影響營業額統計。
- ❌ 不為單一民宿改動 `orders` schema 加 currency 欄位 → 會污染所有民宿的查詢、報表、Edge Functions。
- ❌ 不做真正的多幣別結算（會牽涉匯損會計、退款匯差，超出需求）。

只在「旅行日」`accommodation_id = fb894708-d807-42b0-aaba-d4329ab34467` 啟用 JPY 顯示。

## 二、實作範圍

### 1. 後端設定（最小 schema 變動）

`accommodation_info` 新增 2 欄（nullable，只旅行日填）：
- `secondary_currency text` — 例：`'JPY'`，NULL 表示不啟用
- `secondary_currency_rate numeric` — TWD → JPY 匯率，例：`4.7`（1 TWD = 4.7 JPY）

HQ 後台「住宿資訊」加一個 Section「副幣別顯示（選用）」，僅旅行日會去設定。其他民宿留空，行為完全不變。

### 2. 共用工具

新增 `src/lib/currency.ts`：

```ts
formatTWD(amount)         // "NT$ 12,000"
formatJPY(amount)         // "¥ 56,400"
formatDual(twd, rate)     // "NT$ 12,000（約 ¥ 56,400）"
useSecondaryCurrency(accId) // hook 讀 accommodation_info，回 { code, rate } | null
```

所有顯示邏輯收斂到此檔，避免散落。

### 3. 前台訂房頁（旅行日）

僅當該民宿有設 `secondary_currency` 時，於以下位置同步顯示括號 JPY：
- 房型卡片價格
- 入住方案 ladder（每人/每晚價）
- 訂單摘要 / CTA bar 總價
- 訂單確認 Email（旅行日專屬 template）

### 4. 訂單列表 / 訂單詳情（Admin / Team / Member）

統一在「金額」欄位 render：若 `order.accommodation_id` 屬旅行日且該民宿有設副幣別 → 顯示 `NT$ X,XXX（約 ¥ Y,YYY）`。其他民宿維持只顯示 TWD。

涉及檔案（只加 wrapper，不動數值邏輯）：
- `Orders.tsx`（列表）
- `OrderDetail.tsx` / `OrderMetaDrawer.tsx`（詳情/抽屜）
- `MemberOrders.tsx`（會員中心）
- `TeamOrders.tsx`（業務端）

### 5. 營運分析 / 統計

**不改動統計數值本身**（仍以 TWD 為基準）。只在「旅行日篩選下」的卡片標題旁加註：「（亦可換算 ¥{總額}）」。
- `AnalyticsDashboard.tsx`、`RevenueChart.tsx`、`Settlement.tsx`、`OwnerSettlement.tsx`

如使用者選了「全部民宿」或非旅行日 → 不顯示 JPY，行為與今天完全相同。

### 6. 不動的部分（明確排除）

- 金流：TapPay / ATM / LINE Pay 一律 TWD 計價、TWD 扣款。
- 分潤、星探、加盟、KOL 互惠：全部以 TWD 為基準。
- OwlTing / HotelNabe / 旭海推送：TWD（這些通路本身就 TWD）。
- Excel 匯出、發票、Resend Email：仍 TWD 為主，旅行日 Email 增加 JPY 參考。

## 三、匯率更新策略

採「**人工設定 + 顯示僅供參考**」：
- HQ 後台手動填寫 `secondary_currency_rate`，旁邊註記「僅供顯示參考，實際以 TWD 收款」。
- 不串第三方匯率 API（避免日支出、避免匯率波動觸發訂單金額爭議）。
- 之後若需要可加 daily cron 抓台銀牌告匯率，先不做。

## 四、技術細節（給工程師看）

```text
schema migration
└─ ALTER TABLE accommodation_info
     ADD COLUMN secondary_currency text,
     ADD COLUMN secondary_currency_rate numeric;

src/lib/currency.ts                       新增
src/hooks/use-secondary-currency.tsx      新增
src/components/headquarters/...           HQ 住宿資訊新增表單欄位
src/components/booking-villa/...          價格顯示元件包 formatDual
src/components/orders/*                   金額欄位包 formatDual
```

防呆：
- `rate` 必 > 0，否則回退 TWD-only 顯示。
- 旅行日 accommodation_id 寫死 constant `TRAVELDAYS_ACC_ID`，避免誤觸發。

## 五、預計階段

1. **Phase 1**：migration + HQ 設定 UI + currency 工具（後端就緒，前端不變）
2. **Phase 2**：前台訂房頁雙幣別顯示
3. **Phase 3**：Admin/Team/Member 訂單金額顯示
4. **Phase 4**：分析頁/結算頁加註 JPY 換算
5. **Phase 5**：旅行日 Email template 更新

每個 phase 可獨立部署，每完成一階段我會停下來請你驗收。

## 六、要先跟你確認

1. JPY 在訂單列表是「同行括號」還是「下方小字」？我預設**同行括號小字**：`NT$ 12,000（≈ ¥ 56,400）`
2. 匯率你打算多久手動更新一次？（決定是否要做變更紀錄）
3. 旅行日的 Email 確認信要不要也加 JPY 顯示？
4. 是否要直接從 Phase 1 開始實作？

