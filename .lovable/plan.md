# 取消信「退款說明」文案矛盾修正（設計稿，未施工）

## 一、目前 info 物件的完整定義（逐字）

`supabase/functions/_shared/groupBuyEmail.ts:350`

```ts
export interface GroupBuyCancelInfo {
  /** 取消時間（已格式化為台北時間文字） */
  cancelledAtText: string;
  /** 已收款金額 */
  paidAmount: number;
  /** 累計已退款金額 */
  refundedTotal: number;
  /** 退款狀態：none / pending_manual / partial_refunded / refunded */
  refundStatus: string;
  reason?: string | null;
  /** 此館人工退款手續費（booking_settings.manual_refund_fee_amount）；0 = 不收 */
  handlingFee?: number;
  /** 已累計扣除的退款處理費 */
  refundFeeTotal?: number;
  /** 館別客服／官方 LINE（人工退款申請引導用；信用卡不適用） */
  venueContact?: VenueContact | null;
  /** ATM 未付款直接取消：提醒請勿再轉帳至原虛擬帳號 */
  atmNoTransferNotice?: boolean;
  /** 信用卡已收款、但依取消政策計算退款金額為 0（非退款失敗） */
  zeroRefundByPolicy?: boolean;
}
```

**目前完全沒有任何「入住日／取消時間／政策應退成數或金額」的欄位。**
`cancelledAtText` 只是顯示用字串，`zeroRefundByPolicy` 只是布林旗標，而且**只有信用卡版**（`cardRefundStatusBlock`）會讀它，非信用卡版 `refundStatusBlock` 完全不讀。

補寄函式的組裝（`group-buy-resend-notification/index.ts:161`）只傳：
`cancelledAtText / paidAmount / refundedTotal / refundFeeTotal / handlingFee / refundStatus: String(order.refund_status ?? "none") / reason: null / venueContact`
→ 沒有 `zeroRefundByPolicy`，也沒有任何政策計算。這就是 DD2A94W4 印出「依取消條件不進行退款」的直接原因。

對照：`group-buy-order-lookup/index.ts:469`（旅客自助取消）**有**先跑 `quoteCancellation()` 再傳 `zeroRefundByPolicy`；`group-buy-cancel-refund/index.ts:629` 則是在同一次操作已實際退款、`refundStatus` 已更新的前提下寄信。也就是說「只有補寄這條路徑缺少政策資訊」。

## 二、現有政策計算函式（可直接重用，不需另寫）

`supabase/functions/_shared/cancellationPolicy.ts:229`

```ts
export function quoteCancellation(input: QuoteInput): CancellationQuote
```

```ts
export interface QuoteInput {
  order: PolicyOrderShape;      // 付款方式／provider／paid_amount／final_price 等欄位
  checkInDate: string;          // yyyy-MM-dd
  cancellationDate?: string;    // Asia/Taipei yyyy-MM-dd，預設今天
  alreadyRefunded?: number;
  guaranteeBase?: number;
  freeCancelDays?: number;
  policyOverride?: CancellationPolicyType;
}
```

回傳含 `refundPercent`、`refundAmount`、`daysBefore`、`label`、`requiresManualReview`。
**可以直接餵（入住日、取消日）算出應退金額與成數**，級距來自 `DEPOSIT_REFUND_TIERS` / `FULL_PREPAYMENT_REFUND_TIERS` / `GUARANTEE_FEE_TIERS`。

現有呼叫端：`group-buy-cancel-refund`、`cancel-order-with-refund`、`group-buy-order-lookup`、`member-order-manage`、`public-order-cancel`。→ 這是全系統唯一權威版本，補寄只要照抄 `group-buy-order-lookup:880` 的用法即可，**不新增任何重複邏輯**。

## 三、修法設計

### 3.1 型別擴充（`_shared/groupBuyEmail.ts`）
在 `GroupBuyCancelInfo` 新增三個**選填**欄位（不填 = 完全維持現行行為）：

```ts
  /** 依 quoteCancellation() 算出的政策應退金額（尚未實際退款時用於文案） */
  policyRefundAmount?: number | null;
  /** 政策退款成數 0–100 */
  policyRefundPercent?: number | null;
  /** 需人工確認政策（unknown）→ 不得印出具體金額 */
  policyRequiresManualReview?: boolean;
```

### 3.2 `refundStatusBlock()` 的 `none` 分支（非信用卡）
現行：

```ts
if (info.refundStatus === "none") {
  return `<p>此訂單依取消條件不進行退款，如有疑問請與我們聯繫。</p>`;
}
```

改為三種情況：
1. `policyRefundAmount` 未提供（undefined／null）→ **原文案不變**（向後相容，其他呼叫端零影響）。
2. `policyRefundAmount > 0` → 改印「退款處理中」版本：沿用既有 `pendingRows(gross)` 三段表（政策應退／匯款手續費／預計實際退款）＋既有 `schedule` 時程，文案為
   「本次取消依取消政策可退還已付款項 **X%**，退款作業處理中，我們會盡快完成。」
3. `policyRefundAmount === 0`（或 `policyRequiresManualReview === true`）→ 0 元時維持「依取消條件不進行退款」；manual review 時改印「退款金額需人工確認，我們將盡快與您聯繫」，不印金額。

### 3.3 `cardRefundStatusBlock()` 的 `none` 分支
同樣邏輯，但金額不套匯款手續費（原卡退刷無手續費），文案沿用 `CARD_REFUND_NOTE`。`zeroRefundByPolicy` 既有分支保留在最前面，優先權不變。

### 3.4 補寄函式（`group-buy-resend-notification/index.ts`）
在 `order_cancelled` 分支內，寄信前呼叫既有 `quoteCancellation({ order, checkInDate: order.check_in_date, cancellationDate: taipei(order.cancelled_at), alreadyRefunded: refundedTotal })`，把 `refundAmount / refundPercent / requiresManualReview` 填入 info。
**仍然只讀不寫**：不更新任何訂單欄位、不動 refund_status、不寫 payment events（preview 模式行為不變）。

## 四、影響範圍與風險

**會動到的檔案（僅 2 個）**
- `supabase/functions/_shared/groupBuyEmail.ts`（型別 + 兩個 `none` 分支）
- `supabase/functions/group-buy-resend-notification/index.ts`（組裝政策欄位）

**不會影響的部分**
- `refunded` / `partial_refunded` 兩個分支：**一行不動**，判斷順序也不變（新邏輯只在 `none` 分支內）。
- `paidAmount <= 0`、`zeroRefundByPolicy`、pending_manual 尾段 fallback：皆不變。
- 其他呼叫端（`group-buy-cancel-refund`、`group-buy-order-lookup`、`group-buy-email-preview-send`）不傳新欄位 → 走情況 1，輸出與現在**逐字相同**。
- 政策級距檔 `cancellationPolicy.ts`：零改動。前端 `src/lib/cancellation-policy.ts`：零改動。
- 資料庫、RLS、`update_order_fields_v1`、退款金流：完全不碰。

**連動風險**
1. `order.check_in_date` 或 `cancelled_at` 缺值 → 設計上一律 fallback 成「不提供政策欄位」（走原文案），不得因缺值算出錯誤成數。
2. 文案與實際退款可能不一致：信上寫「應退 NT$X」但後台最終人工核給不同金額。緩解方式是文案用「依取消政策計算，實際金額以退款完成通知為準」措辭。
3. 既有測試 `src/test/group-buy-refund-email-copy.test.ts`、`manual-refund-fee-ui.test.ts`、`manual-refund-request.test.tsx` 都沒傳新欄位 → 預期全數維持通過；施工時會實際跑一次驗證。
4. DD2A94W4 的正確處理順序仍是：**先在 AdminGroupBuy 處理退款（可退 5,558）→ 再補寄**。本修法是防止未來再度出現矛盾文案的保險，不取代退款流程。

## 五、驗證計畫（施工後才執行）
1. `tsgo --noEmit`＋上述三支既有測試全綠。
2. 新增單元測試：`none` + 政策應退 > 0 → 出現「退款處理中」與金額；`none` + 政策 0 元 → 維持原文案；未傳新欄位 → 輸出逐字等同施工前。
3. 以 `previewTo` 對 DD2A94W4 寄一封副本到指定信箱人工核對（不寄旅客本人）。
