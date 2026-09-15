# 二、修法設計稿（先設計，不動手）

## 判斷方式：以「訂單本身」為主，活動設定只當保險絲

比照 `group-buy-order-lookup/index.ts` 已經做對的那段（逐字）：

```ts
    /**
     * 付款方式 SoT＝這張訂單的 orders.payment_method（不得依 campaign 現行設定推測）。
     * atm → ATM 虛擬帳號；credit_card* → 信用卡；其餘 → 銀行人工匯款。
     */
    const paymentMethodRaw = String((order as any).payment_method ?? "");
    const isAtmOrder = paymentMethodRaw === "atm" || !!(order as any).atm_vacc_no;
    const paymentChannel: "atm" | "credit_card" | "bank" = fullPayment
      ? "credit_card" : isAtmOrder ? "atm" : "bank";
```

活動層的 `enable_atm` / `enable_bank_transfer` **不能單獨當判斷依據**（活動可同時開兩種），但要當「不可能」的保險絲：若訂單判為 `bank` 而活動 `enable_bank_transfer === false`，一律不塞共用帳號，改走 fallback 文案。

### A. 抽一支共用函式（新增於 `_shared/groupBuy.ts`）

`resolveGroupBuyPaymentDisplay(admin, order, campaignId)` 回傳：

- `channel`: `"atm" | "credit_card" | "bank"`（規則同上）
- `bank`: 只有 `channel === "bank"` 且活動 `enable_bank_transfer !== false` 時才查 `group_buy_bank_accounts`，否則一律 `null`
- `atm`: `channel === "atm"` 時回 `{ bankCode, vaccNo, expireText }`（讀 `orders.atm_vacc_bank_code / atm_vacc_no / atm_expire_at`），未配發則 `null`

三處共用：resend、complete-paid-order，以及 create-order 改為呼叫同一支（行為不變，只是收斂）。

### B. `renderBookingWithBankInfo()` 增加 ATM 區塊

現況只有 `bank ? 匯款資訊表格 : "匯款資訊將由客服另行提供，請留意通知。"`。改為三態：

1. `atm` 有值 → 顯示「ATM 虛擬帳號」區塊：銀行代碼、虛擬帳號、轉帳金額、繳費期限（版面比照 `_shared/orderConfirmationEmail.ts` 的 `atmCard`）。
2. `bank` 有值 → 現行共用帳號表格，一字不動。
3. 兩者皆空 → 現行 fallback「匯款資訊將由客服另行提供，請留意通知。」

函式簽章改為 `(o, bank, atm?)`；`atm` 為選填，既有呼叫端不傳時行為與現在完全相同。

### C. 兩處實際修法

- `group-buy-resend-notification/index.ts` 第 183–192 行：把無條件查 `group_buy_bank_accounts` 換成 `resolveGroupBuyPaymentDisplay(...)`，把 `bank`／`atm` 一起傳給 `renderBookingWithBankInfo`。ATM 訂單補寄時就會看到自己的虛擬帳號，而不是 `006-5425717865226`。
- `group-buy-complete-paid-order/index.ts` 第 93–102 行：該路徑一律信用卡全額付款，回應已寫死 `bank: null`，但仍多查一次共用帳號並留下 `_bankUnused` 欄位。改為直接刪掉這段查詢與 `_bankUnused` / `_deadlineUnused` 兩個未使用欄位，杜絕日後誤用。

### D. 其他呼叫端盤點（全站已查）

| 位置 | 現況 | 處置 |
| --- | --- | --- |
| `group-buy-create-order/index.ts:134` | `const { data: bankRow } = isAtm ? { data: null } : await admin…` | 已正確；改呼叫共用函式，順便帶上尚未配發時的 fallback |
| `group-buy-order-lookup/index.ts:803` | `if (paymentChannel !== "bank") return null;` | 已正確，不動 |
| `group-buy-email-preview-send/index.ts:123` | 範本預覽用假資料 | 不動；另加一個 ATM 版預覽樣本 |
| `AdminGroupBuy.tsx:435/648/663/676` | 後台維護帳號設定 | 不動 |
| `GroupBuyOrderConfirmation.tsx:126` | `fullPayment || useAtm ? null : bank` | 已正確，不動 |

## 三、順帶處理虛擬帳號配發後的通知缺口（建議一併做）

在 `group-buy-start-payment/index.ts` 寫入 `atm_created` 事件之後，寄一封團購版 `booking_pending`（帶真正的虛擬帳號）：

- 用 B 項新增的 ATM 區塊，收件人 `orders.guest_email`。
- 寄完寫 `email_sent`／`email_failed` 事件，寄信失敗不影響開帳號主流程。
- 影響範圍：只有團購 ATM 訂單多收到一封含帳號的信；一般訂房不受影響（既有 `sendBookingConfirmationByOrderId` 路徑不動）。

### 冪等檢查：逐字照抄 `_shared/groupBuyAtmExpiredEmail.ts`

```ts
export const ATM_DEADLINE_EXPIRED_TEMPLATE = "atm_deadline_expired";

/**
 * 寄送逾期通知信（每張訂單最多成功寄出一次）。
 * Idempotency SoT = group_buy_payment_events：已有 email_sent + 此 template_type 即不再寄。
 * 寄送失敗記為 email_failed（可觀察、下一輪 cron 會重試）。
 */
export async function sendAtmDeadlineExpiredEmail(
  admin: any,
  orderId: string,
  deadlineText: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: sentEvent } = await admin
    .from("group_buy_payment_events")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "email_sent")
    .ilike("note", `%template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}%`)
    .maybeSingle();
  if (sentEvent) return { sent: false, reason: "already_sent" };

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order?.guest_email) return { sent: false, reason: "no_recipient" };
  ...
  const mail = await sendGroupBuyEmail(
    order.guest_email,
    renderAtmDeadlineExpired(emailOrder, deadlineText),
  );

  await admin.from("group_buy_payment_events").insert({
    campaign_id: commission?.campaign_id ?? null,
    order_id: orderId,
    event_type: mail.ok ? "email_sent" : "email_failed",
    actor_label: "system",
    note: mail.ok
      ? `recipient_type:guest／template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}／recipient_count:1／付款逾期通知信已寄出`
      : `recipient_type:guest／template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}／付款逾期通知信寄送失敗：${
        mail.reason ?? "unknown"
      }`,
  });

  return { sent: mail.ok, reason: mail.ok ? undefined : (mail.reason ?? "send_failed") };
}
```

新通知照同一個 pattern，template_type 換成 `atm_va_created`，查詢條件照抄（`.eq("event_type","email_sent").ilike("note","%template_type:atm_va_created%")`），並多一道只有這條流程才適用的前置閘：`reused === true`（沿用既有虛擬帳號）直接不寄。

**主動揭露一個差異**：「check-then-insert」不是原子操作。逾期信不怕，因為只有每小時 cron 單一觸發來源；補寄帳號信是客人可重複觸發的，同一秒內連點兩次理論上可能雙寄。做法二選一：

- (a)（建議）接受這個極小窗口——連點兩次看到的是同一組帳號；且寄失敗寫 `email_failed`、下次再點因 `reused=true` 本來就不重寄，雙寄窗口只剩「第一次的並發」。
- (b) 寄前先 insert `email_sending` 佔位事件搶佔——完全排除雙寄，但事件時間軸多一種狀態，後台稽核紀錄會多一列。

## 驗證計畫（實作後）

1. 團購 ATM 已配發訂單 → 後台補寄 `booking_pending`，信中顯示 `822-92596260…` 該筆虛擬帳號，且**沒有**共用帳號。
2. 團購 ATM 尚未配發（建單瞬間）→ 顯示「將由客服另行提供」，與現況一致。
3. 人工匯款團購訂單補寄 → 共用帳號區塊與現行 HTML 逐字相同（diff 為零）。
4. 信用卡全額訂單走 complete-paid-order → 回應仍 `bank: null`，信件無匯款區塊。
5. `group-buy-create-order` 兩種付款方式各一筆 → 寄出內容與改前逐字相同。
6. 新增的配發後通知：同一訂單重複呼叫 start-payment 只寄一封（若選 (b) 則驗證並發雙寄為零）。

現況資料庫、檔案、信件、Publish 皆未變動。核准後才實作。
