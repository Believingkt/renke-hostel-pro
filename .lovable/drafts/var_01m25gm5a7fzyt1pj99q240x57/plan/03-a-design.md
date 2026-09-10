# A. 補寄「訂單已取消」通知 — 完整設計稿（不施工）

## 1. 範圍與硬性原則
- **只寄信，不動任何訂單資料**：不寫 orders、不寫 notes、不動 `group_buy_commissions`、不呼叫 TapPay、不建立退款。
- 沿用既有 `renderOrderCancelled()`（純函式，只回 subject/html），與 `group-buy-cancel-refund` 的副作用完全分離。
- 只擴充既有 `group-buy-resend-notification`，不新增 Edge Function。

## 2. 檔案清單
| 檔案 | 動作 |
|---|---|
| `supabase/functions/group-buy-resend-notification/index.ts` | 修改：新增 `guestTemplate: "order_cancelled"` 分支、`order_status='cancelled'` 前置檢查、回傳 `lastCancelledEmailAt` |
| `src/components/group-buy/GroupBuyResendNotificationDialog.tsx`（既有補寄對話框，實際檔名以 AdminGroupBuy 引用者為準） | 修改：新增「訂單已取消通知」選項，僅在 `order_status==='cancelled'` 時可選，並顯示「上次已於 X 補寄過」提示 |
| 無 DB migration | 不新增資料表／欄位／函式 |

## 3. 後端 diff（`group-buy-resend-notification/index.ts`）

在旅客信分支（現行第 109–149 行）之前插入狀態檢查：

```ts
      // 取消信補寄：僅限已取消訂單，避免對進行中訂單誤寄
      const requestedTemplate = String((body as any).guestTemplate ?? "auto");
      if (requestedTemplate === "order_cancelled" && order.order_status !== "cancelled") {
        results.push({ orderNumber: order.order_number, skipped: "not_cancelled" });
        continue;
      }
```

旅客信分支改為先分流取消信：

```ts
      if (targets.has("guest")) {
        const requested = requestedTemplate;

        if (requested === "order_cancelled") {
          const paidAmt = Math.max(0, Math.round(Number(order.paid_amount ?? 0)));
          const refundedTotal = Math.max(0, Math.round(Number(order.refunded_amount ?? 0)));
          const refundFeeTotal = Math.max(0, Math.round(Number(order.refund_fee_amount ?? 0)));
          const isCardOrder = emailOrder.isCardOrder === true;
          const handlingFee = isCardOrder ? 0 : await loadManualRefundFee(admin, order.accommodation_id);

          const { data: accContact } = order.accommodation_id
            ? await admin.from("accommodation_info")
                .select("phone, line_id, website_url, email")
                .eq("id", order.accommodation_id).maybeSingle()
            : { data: null as any };

          const mail = renderOrderCancelled(emailOrder, {
            cancelledAtText: formatTaipei(new Date(order.cancelled_at ?? order.updated_at ?? Date.now())),
            paidAmount: paidAmt,
            refundedTotal,
            refundFeeTotal,
            handlingFee,
            refundStatus: String(order.refund_status ?? "none"),
            reason: null,
            venueContact: accContact
              ? { phone: accContact.phone ?? null, lineId: accContact.line_id ?? null,
                  websiteUrl: accContact.website_url ?? null, email: accContact.email ?? null }
              : null,
          });

          const sent = await sendGroupBuyEmail(previewTo ?? order.guest_email, withPreviewSubject(mail));
          entry.guest = sent;
          if (!previewTo) {
            await admin.from("group_buy_payment_events").insert({
              campaign_id: campaign?.id ?? null,
              order_id: order.id,
              event_type: sent.ok ? "email_sent" : "email_failed",
              actor_user_id: ctx.userId,
              actor_label: ctx.userEmail ?? (ctx.isServiceRole ? "system" : "admin"),
              note: `resend:true／recipient_type:guest／template_type:guest_order_cancelled／recipient_count:1${
                sent.ok ? "" : `／reason:${sent.reason ?? "unknown"}`}`,
            });
          }
        } else {
          /* ...現行 booking_pending / deposit_received / full_payment_received 分支原封不動... */
        }
      }
```

新增 import：`renderOrderCancelled`（`_shared/groupBuyEmail.ts`）、`formatTaipei`、`loadManualRefundFee`（與 `group-buy-cancel-refund` 同一來源，不複製實作）。

「是否已寄過」查詢（回傳給前端顯示，不硬擋）：

```ts
      const { data: prevSent } = await admin
        .from("group_buy_payment_events")
        .select("created_at")
        .eq("order_id", order.id)
        .eq("event_type", "email_sent")
        .ilike("note", "%guest_order_cancelled%")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      entry.lastCancelledEmailAt = prevSent?.created_at ?? null;
```

## 4. 欄位取數對照
| 欄位 | 來源 |
|---|---|
| `cancelledAtText` | `orders.cancelled_at`（缺值 fallback `updated_at`）→ `formatTaipei` |
| `paidAmount` | `orders.paid_amount` |
| `refundedTotal` | `orders.refunded_amount` |
| `refundFeeTotal` | `orders.refund_fee_amount` |
| `handlingFee` | 信用卡 = 0；否則 `booking_settings.manual_refund_fee_amount`（`loadManualRefundFee`） |
| `refundStatus` | `orders.refund_status`（none / pending_manual / partial_refunded / refunded） |
| `isCardOrder` / `refundChannelText` / `paymentMethodText` | `buildEmailOrder()` 內既有規則（`payment_provider='tappay' && isCardPaidOrder`） |
| `venueContact` | `accommodation_info` 的 phone / line_id / website_url / email |
| `reason` | 補寄一律 `null`（不重述當初取消原因，避免與稽核不一致） |

## 5. 前端 diff（補寄對話框）
- 模板選單新增 `order_cancelled → 訂單已取消通知`。
- 該選項 `disabled={order.order_status !== 'cancelled'}`，附說明「僅已取消訂單可補寄」。
- 送出後若回傳 `skipped: "not_cancelled"`，toast 顯示「此訂單尚未取消，未寄出」。
- 若 `lastCancelledEmailAt` 有值，選單下方顯示「上次已於 YYYY-MM-DD HH:mm 補寄過取消通知」，仍允許再寄。
- 沿用既有「測試副本 previewTo」欄位，不另做。

## 6. precheck / postcheck 驗證方式
**precheck（部署前，唯讀）**
1. `SELECT order_number, order_status, paid_amount, refunded_amount, refund_fee_amount, refund_status, cancelled_at, payment_provider, deposit_payment_method FROM orders WHERE order_number='DD2A94W4';` 存下快照。
2. 記錄該訂單 `group_buy_payment_events` 的筆數與最新一筆 id。
3. 確認現行 `group-buy-resend-notification` 部署版本與四種既有模板可正常 preview。

**postcheck（部署後）**
1. 以 `previewTo` 測試副本模式對 DD2A94W4 呼叫 `guestTemplate:"order_cancelled"`，信件寄到指定內部信箱。
2. 人工核對信件內容：付款方式顯示「ATM 虛擬帳號」而非信用卡；退款區塊為「依取消條件不進行退款／退款處理中」（依 `refund_status='none'`）；金額與 precheck 快照一致；不得出現原卡退刷字樣。
3. **副作用歸零驗證**：重跑 precheck 的兩條查詢，`orders` 該列所有欄位逐欄相同（含 `notes`、`refund_status`、`refunded_amount`、`updated_at` 不得因此變動），`group_buy_payment_events` 因 previewTo 模式**不新增任何列**。
4. 正式（非 preview）補寄一次後：`orders` 仍逐欄不變，`group_buy_payment_events` 只新增 1 列 `email_sent`，note 含 `template_type:guest_order_cancelled` 與操作者 email。
5. 反例測試：對任一 `order_status='confirmed'` 的團購訂單呼叫同一參數，必須回 `skipped:"not_cancelled"`，不寄信、不寫事件。
6. 回歸：既有四種補寄模板各寄一次 preview，內容與部署前一致。
