# 一、虛擬帳號配發後有沒有再通知客人？答案：沒有

## 程式碼證據

`supabase/functions/tappay-atm-create/index.ts`（寫入虛擬帳號後）：

```ts
    // App 推播：訂房成功（含 ATM 繳費資訊）—— 背景執行，不阻塞回應
    const pushPromise = pushOrderEvent(order.id, "order_created").catch(() => {});
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(pushPromise); } catch { /* noop */ }

    // 訂房確認信：等虛擬帳號建立成功後才寄，確保信中含正確的匯款帳號與訂金金額
    const mailPromise = sendBookingConfirmationByOrderId(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      order.id,
      "ATM 虛擬帳號（待匯款）",
      "atm_va_created",
    ).catch((e) => console.error("[tappay-atm-create] send email failed", e));
```

但 `supabase/functions/_shared/sendBookingEmail.ts` 第一道閘門就把團購訂單擋掉：

```ts
  // 團購訂單有自己一整套通知信（_shared/groupBuyEmail.ts），
  // 不得再寄全站共用的訂房確認信，避免客人同時收到兩封重複內容。
  if (order.order_source === "group_buy") {
    console.log("[sendBookingEmail] group_buy order, skip shared confirmation", order.order_number);
    return { ok: false, reason: "group_buy_skipped" };
  }
```

`supabase/functions/group-buy-start-payment/index.ts` 在 `tappay-atm-create` 回來後，只寫稽核事件、不寄任何信：

```ts
    if (!result.reused) {
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign.id,
        order_id: order.id,
        event_type: "atm_created",
        ...
      });
    }
```

推播 `pushOrderEvent` 需要 `orders.member_id`；下面五筆真實訂單 `member_id` 全為 NULL，推播也送不出去。簡訊管道全站不存在。

## 真實寄送紀錄（`group_buy_payment_events`）

```
 order_number |          event_type / created_at
 CE2V95Y5     | order_created 15:41:28 → email_sent 15:41:30（booking_pending）→ email_sent 15:41:31（venue_new_order）
              | atm_created 15:41:43 → 之後到 atm_paid 15:43:48 前【沒有任何 email_sent】
 XS4K95P3     | atm_created 15:08:37 → 下一封信是 atm_paid 後的 deposit_received 15:09:49
 DV5Q32E5     | atm_created 07:40:34 → 下一封信是 cancelled 08:35:12
 UG4P85X6     | atm_created 07:08:04 → 下一封信是 atm_paid 後的 deposit_received 07:13:28
 WF3P44Q8     | atm_created 00:23:28 → 下一封信是 atm_paid 後的 deposit_received 01:00:52
```

`booking_pending` 那封的 note 逐字為：`recipient_type:guest／template_type:booking_pending／recipient_count:1／訂房通知＋匯款資訊信已寄至 …`，時間都早於 `atm_created` 約 13～20 秒。

**結論：虛擬帳號建立後，系統沒有任何信件、簡訊、推播把帳號送到客人手上。** 客人只有在付款當下的網頁上看得到（`GroupBuyOrderConfirmation.tsx` / `AtmPaymentPanel`），關掉頁面後只能靠訂單查詢頁自己回去看。

## 缺口大小

- 目前唯一團購活動 `enable_atm=true`、`enable_bank_transfer=false`，所以**該活動每一筆 ATM 訂單都落在這個缺口**。
- 已完成付款的（CE2V95Y5、XS4K95P3、UG4P85X6、WF3P44Q8）代表客人當場就轉了；DV5Q32E5 未付並在 55 分鐘後被取消。
- 之後只要再開 ATM 活動就會重複發生，屬結構性缺口，建議一併補（下面設計稿的 C 項），不是只有這一檔的問題。
