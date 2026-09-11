# 官網 ATM 逾期取消通知信 — 唯讀查證＋設計稿

只補一個缺口：官網（非 group_buy）ATM 訂單因虛擬帳號到期未繳款被系統自動取消時，客人收不到任何通知信。本輪未修改任何檔案、未執行 migration、未部署。

## 1. 兩個分支現況並列（`supabase/functions/cancel-expired-atm-orders/index.ts`）

官網 legacy 分支（34–93 行）：

```ts
const { data: expired, error } = await supabase
  .from('orders')
  .select('id, order_number, accommodation_id, atm_expire_at, paid_amount, notes')
  .eq('payment_status', 'pending_payment')
  .not('atm_vacc_no', 'is', null)
  .neq('order_status', 'cancelled')
  .is('group_buy_payment_deadline_at', null)
  .lt('atm_expire_at', cutoffIso)
  .limit(200);

for (const o of expired || []) {
  if ((o.paid_amount || 0) > 0) continue;
  const { data: fresh } = await supabase.from('orders')
    .select('payment_status, order_status, paid_amount').eq('id', o.id).maybeSingle();
  if (!fresh) continue;
  if (fresh.order_status === 'cancelled') continue;
  if ((fresh.paid_amount || 0) > 0) continue;
  if (fresh.payment_status !== 'pending_payment') { /* skip */ continue; }

  const note = `[ATM Expire] ${taipeiIso} - 虛擬帳號逾期未繳款，系統自動取消訂單`;
  const { error: upErr } = await supabase.from('orders')
    .update({ order_status: 'cancelled', cancelled_at: nowIso, notes: newNotes, updated_at: nowIso })
    .eq('id', o.id).eq('payment_status', 'pending_payment').neq('order_status', 'cancelled');
  if (upErr) { continue; }
  cancelled.push(o.order_number);
  await supabase.from('notifications').insert({ /* 後台站內通知 */ });
}
// ← 這裡結束，沒有任何寄給客人的呼叫
```

團購新制分支（113–168 行，寄信在 162–167 行）：

```ts
    const { data: updated, error: upErr } = await supabase.from('orders')
      .update({ order_status: 'cancelled', cancelled_at: nowIso, notes: newNotes, updated_at: nowIso })
      .eq('id', o.id).eq('payment_status', 'pending_payment').neq('order_status', 'cancelled')
      .select('id').maybeSingle();
    if (upErr || !updated) { continue; }
    lateCancelled.push(o.order_number);

    await supabase.from('notifications').insert({ /* 後台站內通知 */ });

    // POST-CANCELLATION：cancellation commit 之後才寄逾期通知信；寄信失敗不得回滾取消
    try {
      await sendAtmDeadlineExpiredEmail(supabase, o.id, deadlineTaipei);
    } catch (mailErr) {
      console.error('[cancel-expired-atm-orders] expired email threw:', o.order_number, mailErr);
    }
```

差別只有兩點：團購分支的 UPDATE 有 `.select('id')` 確認真的更新成功，以及最後多一段「取消成功後才寄信、寄信失敗不回滾」的呼叫。

## 2. 團購那支寄信函式能不能重用？

不能。鏈路是 `sendAtmDeadlineExpiredEmail()`（`_shared/groupBuyAtmExpiredEmail.ts`）→ `renderAtmDeadlineExpired()`（`_shared/groupBuyEmail.ts:318`）→ `sendGroupBuyEmail()`。裡面寫死團購專屬邏輯：

- 去 `group_buy_commissions` / `group_buy_campaigns` 撈活動，撈不到就用假資料 `{ title: "團購活動", deposit_percentage: 30 }`。
- 以 `group_buy_payment_events` 當去重與記錄來源（官網訂單不該寫進團購事件表）。
- 文案寫死「您的**團購**訂單已自動取消」，欄位是「應付訂金」而非官網的訂單總額。

硬要重用就等於改到 group_buy 既有流程，本輪明確禁止。所以官網走自己的一條路。

## 3. `sendBookingEmail.ts:42-45` 會不會擋路？

不會，也不需要動它。那段是「若 `order_source === 'group_buy'` 就不寄全站共用確認信」，只存在於 `sendBookingConfirmationByOrderId()` 這個「訂房確認信」入口。官網逾期取消信不會經過那一層。實際路徑是：

`cancel-expired-atm-orders`（legacy 分支，取消成功後）→ 直接 `fetch` 呼叫 `send-order-cancelled-email`（service role）→ Resend 寄出 → 寫入 `booking_email_log`。

`_shared/sendBookingEmail.ts` 本體不修改。

## 4. 官網有沒有現成取消信可重用？

有：`supabase/functions/send-order-cancelled-email/index.ts`（162 行）。它已經做好官網需要的一切：service-role 驗證、以 `orderId`／`orderNumber` 撈單、撈民宿名稱／電話／Email、房型與日期表格、Resend 寄送、寫 `booking_email_log(email_type='order_cancelled')`。

但現行文案是「我們已依**您的要求**取消以下訂單」，並固定顯示「取消手續費／退款金額」。逾期自動取消要改講法：

- 標題與內文明講是「因超過 ATM 付款期限未收到款項，系統自動取消」，不是客人要求。
- 顯示原訂單金額與付款期限（台北時間）。
- 明確提醒「請勿再匯款至原虛擬帳號」。
- 不顯示退款區塊（這類訂單 `paid_amount = 0`）。
- 附「重新訂房」連結，導回該民宿訂房頁。
