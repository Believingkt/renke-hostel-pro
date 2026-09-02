// 團購訂單查詢／回報匯款（公開端點，以「訂單編號 + 聯絡電話後四碼」驗證）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { bankToInfo, buildAdminGroupBuyUrl, buildEmailOrder, formatTaipei, paymentDeadline, splitDeposit } from "../_shared/groupBuy.ts";
import {
  renderGuestCancelRequested,
  renderOrderCancelled,
  renderVenueOrderSelfCancelled,
  renderVenueCancelRequested,
  renderVenueTransferReported,
  sendGroupBuyEmail,
} from "../_shared/groupBuyEmail.ts";
import { CANCEL_REQUEST_RECEIVED_TEXT, REFUND_PENDING_REVIEW_TEXT } from "../_shared/refundPolicy.ts";
import { quoteCancellation, resolveCancellationPolicy, taipeiToday } from "../_shared/cancellationPolicy.ts";
import { paymentMethodKind, paymentMethodLabel, refundChannelLabel } from "../_shared/paymentMethodKind.ts";
import { loadManualRefundFee, remainingRefundableWithFee } from "../_shared/refundFee.ts";
import { classifyGroupBuySelfCancel, resolveSelfCancelRefundAmount } from "../_shared/groupBuySelfCancel.ts";
import { getPaymentAdapter, refundStatusAfterRefund } from "../_shared/paymentAdapter.ts";

import { resolveOrderNotifyEmails } from "../_shared/notifyRecipients.ts";

const FN = "group-buy-order-lookup";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 20) return false;
  rec.n++;
  return true;
}

function digits(s: unknown) {
  return String(s ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "查詢過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
    const phoneLast4 = digits(body.phoneLast4).slice(-4);
    const action = String(body.action ?? "lookup");

    if (!orderNumber || phoneLast4.length !== 4) {
      return json({ error: "請輸入訂單編號與聯絡電話後四碼" }, 400);
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, guest_count, room_quantity, total_price, final_price, deposit_amount, paid_amount, order_status, payment_status, payment_provider, payment_method, order_source, order_date, notes, group_buy_booking_notice_snapshot, accommodation_id, package_id, room_type_id, refund_status, refunded_amount, refund_fee_amount, refunded_at, cancelled_at, deposit_payment_method, balance_payment_method, room_charge_rec_trade_id, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, atm_rec_trade_id",
      )
      .eq("order_number", orderNumber)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || digits(order.guest_phone).slice(-4) !== phoneLast4) {
      return json({ error: "查無此訂單，請確認訂單編號與電話後四碼" }, 404);
    }

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();

    const { data: campaign } = commission?.campaign_id
      ? await admin.from("group_buy_campaigns").select("*").eq("id", commission.campaign_id).maybeSingle()
      : { data: null as any };

    const depositPct = campaign?.deposit_percentage ?? 30;
    const { total, deposit, balance } = splitDeposit(
      Number(order.final_price ?? order.total_price ?? 0),
      depositPct,
    );
    // NEW CONTRACT：已寫入 group_buy_payment_deadline_at 者，前台顯示一律以它為準；
    // LEGACY（NULL）維持原本以 order_date + payment_deadline_hours 推算。
    const deadline = (order as any).group_buy_payment_deadline_at
      ? new Date((order as any).group_buy_payment_deadline_at)
      : paymentDeadline(order.order_date ?? new Date().toISOString(), campaign?.payment_deadline_hours ?? 72);

    const { data: events } = await admin
      .from("group_buy_payment_events")
      .select("event_type, amount, account_last5, transferred_at, note, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    // ── 回報已匯款 ──
    if (action === "report_transfer") {
      if (order.order_status === "cancelled") return json({ error: "此訂單已取消，請聯繫客服" }, 400);
      if (order.payment_status !== "unpaid") return json({ error: "此訂單已完成收款，無需重複回報" }, 400);
      // ATM／信用卡訂單由金流自動入帳，不適用人工匯款回報
      if (String((order as any).payment_method ?? "") === "atm" || (order as any).atm_vacc_no) {
        return json({ error: "此訂單為 ATM 虛擬帳號付款，入帳後系統會自動更新，無需回報" }, 400);
      }
      const already = (events ?? []).some((e: any) => e.event_type === "guest_reported");
      if (already) return json({ error: "您已回報過匯款，我們正在核對中" }, 400);

      const accountLast5 = digits(body.accountLast5).slice(-5);
      const transferredAtRaw = String(body.transferredAt ?? "").trim();
      if (accountLast5.length !== 5) return json({ error: "請輸入匯款帳號後五碼" }, 400);
      const transferredAt = transferredAtRaw ? new Date(transferredAtRaw) : new Date();
      if (Number.isNaN(transferredAt.getTime())) return json({ error: "匯款時間格式錯誤" }, 400);

      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign?.id ?? null,
        order_id: order.id,
        event_type: "guest_reported",
        amount: deposit,
        account_last5: accountLast5,
        transferred_at: transferredAt.toISOString(),
        actor_label: order.guest_name,
        note: "旅客自行回報已完成匯款",
      });

      // 民宿／管理者通知（失敗不可影響旅客回報結果）
      try {
        const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
          accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
          campaignId: campaign?.id ?? null,
        });
        if (venueEmails.length === 0) {
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: "note",
            actor_label: "system",
            note: "venue_email_skipped／recipient_type:venue／template_type:venue_transfer_reported／no_recipients",
          });
        } else {
          const { data: accRow } = await admin
            .from("accommodation_info")
            .select("name")
            .eq("id", (order as any).accommodation_id ?? campaign?.accommodation_id ?? "")
            .maybeSingle();
          const emailOrder = buildEmailOrder({
            order,
            campaign: campaign ?? { title: "團購活動", deposit_percentage: depositPct, payment_deadline_hours: 72 },
            accommodationName: (accRow as any)?.name ?? null,
            packageName: null,
            frontendOrigin: typeof body.origin === "string" ? body.origin : null,
          });
          const tpe = (opts: Intl.DateTimeFormatOptions) =>
            new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", ...opts }).format(transferredAt);
          const venueMail = await sendGroupBuyEmail(
            venueEmails,
            renderVenueTransferReported(
              {
                ...emailOrder,
                depositAmount: deposit,
                guestPhone: order.guest_phone ?? null,
                guestEmail: order.guest_email ?? null,
                paymentStatusText: "待匯款（旅客已回報）",
                adminUrl: buildAdminGroupBuyUrl({
                  accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
                  campaignId: campaign?.id ?? null,
                  orderNumber: order.order_number,
                }),
              },
              {
                accountLast5,
                transferDateText: tpe({ year: "numeric", month: "2-digit", day: "2-digit" }),
                transferTimeText: tpe({ hour: "2-digit", minute: "2-digit", hour12: false }),
              },
            ),
          );
          if (!venueMail.ok) console.error(`[group-buy-order-lookup] venue email failed: ${venueMail.reason}`);
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: venueMail.ok ? "email_sent" : "email_failed",
            actor_label: "system",
            note: `recipient_type:venue／template_type:venue_transfer_reported／recipient_count:${venueEmails.length}／source:${venueSource}${
              venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
            }`,
          });
        }
      } catch (venueErr) {
        console.error("[group-buy-order-lookup] venue notify threw", venueErr);
      }

      return json({ success: true, reported: true });
    }

    const cancelRequestedEvent = (events ?? []).find((e: any) => e.event_type === "cancel_requested") ?? null;

    // ── 旅客自助取消訂單 ──
    // A. 未收款（ATM 未付款／匯款未匯）→ 直接取消 + 釋放庫存 + 隱藏虛擬帳號，不需審核
    // B. 信用卡（一律即時請款；本平台不存在 authorized-only 狀態）
    //    → 依取消政策級距自動原卡退刷（refund-first）；政策退款 0 元則不呼叫退款 API 直接取消
    //    → 永遠沒有 business review（不建立 cancel_requested / 待審核）
    //    → 僅在「資料／設定異常」時走 TECHNICAL EXCEPTION：記錄取消意圖 + 管理員技術告警
    // C. ATM／銀行匯款「已收款」→ 維持現行人工退款審核流程（不在本輪變更）
    if (action === "request_cancel") {
      if (order.order_status === "cancelled") return json({ error: "此訂單已取消" }, 400);
      if (cancelRequestedEvent) return json({ error: "您已送出取消申請，我們正在處理中" }, 400);

      const reason = String(body.reason ?? "").trim().slice(0, 300);
      const selfCancel = classifyGroupBuySelfCancel(order as any);
      const accIdForCancel = (order as any).accommodation_id ?? campaign?.accommodation_id ?? null;

      // 政策級距（一律 server 計算，前端不得傳入金額）
      const policyQuote = quoteCancellation({
        order: order as any,
        checkInDate: String(order.check_in_date),
        cancellationDate: taipeiToday(),
        alreadyRefunded: Math.max(0, Math.round(Number((order as any).refunded_amount) || 0)),
      });

      /** 信用卡自助取消：資料／設定異常 → technical exception（不是人工取消審核） */
      const cardException = selfCancel.isCardOrder
        ? detectCardSelfCancelException({
          checkInDate: order.check_in_date,
          paidAmount: (order as any).paid_amount,
          policyRequiresManualReview: policyQuote.requiresManualReview,
          policyRefundAmount: policyQuote.refundAmount,
        })
        : null;

      const autoRefund = resolveSelfCancelRefundAmount({
        refundable: selfCancel.refundable,
        policyRefundAmount: policyQuote.refundAmount,
        requiresManualReview: false,
      });

      // 信用卡（含已全額退款、政策 0 元退款）一律自動處理，不進 business review
      const canAutoHandle = selfCancel.mode === "direct_cancel" ||
        (selfCancel.isCardOrder && !cardException);

      // ── 信用卡 TECHNICAL EXCEPTION：不取消、不假裝完成、不建立取消審核 ──
      if (selfCancel.isCardOrder && cardException) {
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign?.id ?? null,
          order_id: order.id,
          event_type: "note",
          actor_label: "system",
          note: `self_cancel_technical_exception／reason:${cardException}／${
            CARD_SELF_CANCEL_EXCEPTION_LABEL[cardException]
          }${reason ? `／旅客原因:${reason}` : ""}`,
        });
        try {
          await admin.from("notifications").insert({
            accommodation_id: accIdForCancel,
            order_id: order.id,
            type: "payment_exception",
            title: "⚠️ 團購信用卡自助取消：系統無法自動處理",
            description:
              `訂單 ${order.order_number} 的旅客已提出取消，但${CARD_SELF_CANCEL_EXCEPTION_LABEL[cardException]}，` +
              `系統未執行退款也未取消訂單。這是技術／設定異常，請至「金流稽核」修正後完成處理（非取消審核）。`,
            is_read: false,
          });
        } catch (e) {
          console.error("[group-buy-order-lookup] technical exception alert failed", e);
        }
        return json({
          success: true,
          processing: true,
          mode: "technical_processing",
          message: "系統正在處理您的取消，完成後將另行通知。",
        });
      }

      if (canAutoHandle) {
        const nowIso = new Date().toISOString();
        const cancelledAtText = formatTaipei(new Date(nowIso));
        const paid = selfCancel.paid;
        const alreadyRefunded = Math.max(0, Math.round(Number((order as any).refunded_amount) || 0));
        const alreadyRefundFee = Math.max(0, Math.round(Number((order as any).refund_fee_amount) || 0));
        const isAtm = String((order as any).payment_method ?? "") === "atm" || !!(order as any).atm_vacc_no;
        /** 信用卡且政策計算結果 0 元 → 不呼叫 TapPay，直接取消 */
        const zeroRefundByPolicy = selfCancel.isCardOrder && paid > 0 && autoRefund.refundAmount <= 0;

        // ── B：refund-first，TapPay 失敗即中止，訂單維持未取消 ──
        let refundAmount = 0;
        let refundRecTradeId: string | null = null;
        if (selfCancel.isCardOrder && autoRefund.refundAmount > 0) {
          const settle = await getPaymentAdapter(order as any).refundPayment({
            order: { ...(order as any), id: order.id },
            amount: autoRefund.refundAmount,
            note: reason || "旅客自助取消",
            supabase: admin,
            triggerSource: "group_buy_self_cancel",
          });
          if (!settle.ok) {
            await admin.from("group_buy_payment_events").insert({
              campaign_id: campaign?.id ?? null,
              order_id: order.id,
              event_type: "note",
              actor_label: "system",
              note: `self_cancel_refund_failed／${settle.error ?? "unknown"}／${settle.message ?? ""}`,
            });
            return json({
              error: settle.needsReconciliation
                ? "退款結果尚待金流確認，請稍後再試或聯繫客服，我們會盡快為您處理。"
                : (settle.message ?? "目前無法完成自動退款，請聯繫客服協助處理。"),
            }, 400);
          }
          refundAmount = autoRefund.refundAmount;
          refundRecTradeId = settle.recTradeId ?? null;
        }

        const totalRefunded = alreadyRefunded + refundAmount;
        const totalSettled = totalRefunded + alreadyRefundFee;
        // 政策 0 元退款＝金流已「依規則處理完畢」，不得標記為退款處理中（none = 不進行退款）
        const refundStatus = paid <= 0 || zeroRefundByPolicy
          ? "none"
          : refundStatusAfterRefund(paid, totalSettled);
        const paymentStatusPatch = totalSettled <= 0
          ? {}
          : { payment_status: totalSettled >= paid ? "refunded" : "partial_refunded" };

        const noteLines = [
          order.notes ?? "",
          `【取消】${cancelledAtText} 由旅客自助取消（團購訂單查詢頁）`,
          refundAmount > 0
            ? `退款處理：已完成原信用卡退刷 NT$${refundAmount.toLocaleString("en-US")}（TapPay${
              refundRecTradeId ? ` ${refundRecTradeId}` : ""
            }）`
            : paid > 0
            ? "退款處理：依取消政策不予退款"
            : "退款處理：未收款，不需退款",
          `取消政策：${policyQuote.policy}（${policyQuote.policyReason}）／距入住 ${policyQuote.daysBefore} 天／比例 ${policyQuote.refundPercent}%／已付 NT$${
            paid.toLocaleString("en-US")
          }／本次退款 NT$${refundAmount.toLocaleString("en-US")}`,
          reason ? `原因：${reason}` : null,
        ].filter(Boolean).join("\n");

        // 併發保護：付款狀態若在此期間變動（例如遲到入帳）則中止，改走人工
        const { data: updated, error: uErr } = await admin
          .from("orders")
          .update({
            order_status: "cancelled",
            cancelled_at: (order as any).cancelled_at ?? nowIso,
            refunded_amount: totalRefunded,
            refunded_at: refundAmount > 0 ? nowIso : (order as any).refunded_at,
            refund_status: refundStatus,
            ...paymentStatusPatch,
            notes: noteLines,
            updated_at: nowIso,
          })
          .eq("id", order.id)
          .eq("payment_status", order.payment_status)
          .neq("order_status", "cancelled")
          .select("id");
        if (uErr) throw uErr;
        if (!updated || updated.length === 0) {
          return json({ error: "訂單狀態剛剛有更新，請重新查詢後再試一次。" }, 409);
        }

        // 分潤作廢
        const { data: commissionRow } = await admin
          .from("group_buy_commissions")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();
        if (commissionRow?.id) {
          await admin.from("group_buy_commissions").update({ status: "void" }).eq("id", commissionRow.id);
        }

        await admin.from("group_buy_payment_events").insert([
          {
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: "cancelled",
            actor_label: order.guest_name,
            note: [
              reason ? `旅客自助取消訂單：${reason}` : "旅客自助取消訂單",
              `退款狀態 ${refundStatus}`,
            ].join("／"),
          },
          ...(refundAmount > 0
            ? [{
              campaign_id: campaign?.id ?? null,
              order_id: order.id,
              event_type: "refunded",
              amount: refundAmount,
              actor_label: "system",
              note: [
                "退款方式：原信用卡退刷（TapPay）",
                refundRecTradeId ? `交易編號 ${refundRecTradeId}` : null,
                `本次退款 NT$${refundAmount.toLocaleString("en-US")}`,
                `累計實退 NT$${totalRefunded.toLocaleString("en-US")}`,
                `已收 NT$${paid.toLocaleString("en-US")}`,
              ].filter(Boolean).join("／"),
            }]
            : []),
        ]);

        await admin.from("audit_logs").insert({
          accommodation_id: accIdForCancel,
          user_id: null,
          user_email: order.guest_email ?? null,
          action_type: "cancel_order",
          action_category: "group_buy",
          entity_type: "order",
          entity_id: order.id,
          entity_name: order.order_number,
          details: {
            source: "group_buy_self_cancel",
            mode: selfCancel.mode,
            paid_amount: paid,
            refund_amount: refundAmount,
            total_refunded_amount: totalRefunded,
            refund_status: refundStatus,
            rec_trade_id: refundRecTradeId,
            policy: policyQuote.policy,
            policy_reason: policyQuote.policyReason,
            policy_refund_percent: policyQuote.refundPercent,
            operator: "guest",
            timestamp: nowIso,
            reason: reason || null,
          },
        });

        // 通知（寄信失敗不影響取消結果）
        try {
          const { data: accRow } = accIdForCancel
            ? await admin.from("accommodation_info").select("name").eq("id", accIdForCancel).maybeSingle()
            : { data: null as any };
          const baseEmailOrder = buildEmailOrder({
            order,
            campaign: campaign ?? { title: "團購活動", deposit_percentage: depositPct, payment_deadline_hours: 72 },
            accommodationName: (accRow as any)?.name ?? null,
            packageName: null,
            frontendOrigin: typeof body.origin === "string" ? body.origin : null,
          });
          const emailOrder = {
            ...baseEmailOrder,
            isCardOrder: selfCancel.isCardOrder,
            paymentMethodText: paymentMethodLabel(order as any),
            refundChannelText: refundChannelLabel(selfCancel.isCardOrder),
          } as any;

          const guestMail = await sendGroupBuyEmail(
            order.guest_email,
            renderOrderCancelled(emailOrder, {
              cancelledAtText,
              paidAmount: paid,
              refundedTotal: totalRefunded,
              refundFeeTotal: alreadyRefundFee,
              refundStatus,
              reason: reason || null,
              atmNoTransferNotice: isAtm && paid <= 0,
            }),
          );
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: guestMail.ok ? "email_sent" : "email_failed",
            actor_label: "system",
            note: `recipient_type:guest／template_type:guest_self_cancelled${
              guestMail.ok ? "／recipient_count:1" : `／reason:${guestMail.reason ?? "unknown"}`
            }`,
          });

          const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
            accommodationId: accIdForCancel,
            campaignId: campaign?.id ?? null,
          });
          if (venueEmails.length > 0) {
            const venueMail = await sendGroupBuyEmail(
              venueEmails,
              renderVenueOrderSelfCancelled(
                {
                  ...emailOrder,
                  guestPhone: order.guest_phone ?? null,
                  guestEmail: order.guest_email ?? null,
                  adminUrl: buildAdminGroupBuyUrl({
                    accommodationId: accIdForCancel,
                    campaignId: campaign?.id ?? null,
                    orderNumber: order.order_number,
                  }),
                },
                {
                  cancelledAtText,
                  reason: reason || null,
                  paidAmount: paid,
                  refundedAmount: refundAmount,
                  refundStatus,
                  refundChannelText: selfCancel.isCardOrder ? "原信用卡退刷（TapPay）" : "未收款，不需退款",
                },
              ),
            );
            await admin.from("group_buy_payment_events").insert({
              campaign_id: campaign?.id ?? null,
              order_id: order.id,
              event_type: venueMail.ok ? "email_sent" : "email_failed",
              actor_label: "system",
              note: `recipient_type:venue／template_type:venue_self_cancelled／recipient_count:${venueEmails.length}／source:${venueSource}${
                venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
              }`,
            });
          }
        } catch (notifyErr) {
          console.error("[group-buy-order-lookup] self-cancel notify threw", notifyErr);
        }

        return json({
          success: true,
          cancelled: true,
          mode: selfCancel.mode,
          refundAmount,
          refundedTotal: totalRefunded,
          refundStatus,
          message: refundAmount > 0
            ? "訂單已取消，退款已送回原付款信用卡（實際入帳依發卡銀行作業時間，約 3～7 個工作天）。"
            : "訂單已取消。",
        });
      }

      // ── C：維持人工審核流程 ──
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign?.id ?? null,
        order_id: order.id,
        event_type: "cancel_requested",
        actor_label: order.guest_name,
        note: reason ? `旅客申請取消訂單：${reason}` : "旅客申請取消訂單",
      });

      // 通知：旅客取消申請確認信 + 民宿／管理者通知（寄信失敗不影響申請結果）
      try {
        const { data: accRow } = await admin
          .from("accommodation_info")
          .select("name")
          .eq("id", (order as any).accommodation_id ?? campaign?.accommodation_id ?? "")
          .maybeSingle();
        const emailOrder = buildEmailOrder({
          order,
          campaign: campaign ?? { title: "團購活動", deposit_percentage: depositPct, payment_deadline_hours: 72 },
          accommodationName: (accRow as any)?.name ?? null,
          packageName: null,
          frontendOrigin: typeof body.origin === "string" ? body.origin : null,
        });
        const requestedAtText = formatTaipei(new Date());
        const paidAmount = Math.max(0, Math.round(Number((order as any).paid_amount) || 0));
        // 手續費一律讀館別設定（信用卡原卡退刷不收）
        const isCardPay = String((order as any).payment_provider ?? "") === "tappay" &&
          String((order as any).payment_method ?? "").includes("credit_card");
        const handlingFee = isCardPay ? 0 : await loadManualRefundFee(
          admin,
          (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
        );

        const guestMail = await sendGroupBuyEmail(
          order.guest_email,
          renderGuestCancelRequested(emailOrder, { requestedAtText, reason: reason || null, handlingFee }),
        );
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign?.id ?? null,
          order_id: order.id,
          event_type: guestMail.ok ? "email_sent" : "email_failed",
          actor_label: "system",
          note: `recipient_type:guest／template_type:guest_cancel_requested${
            guestMail.ok ? "／recipient_count:1" : `／reason:${guestMail.reason ?? "unknown"}`
          }`,
        });

        const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
          accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
          campaignId: campaign?.id ?? null,
        });
        if (venueEmails.length === 0) {
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: "note",
            actor_label: "system",
            note: "venue_email_skipped／recipient_type:venue／template_type:venue_cancel_requested／no_recipients",
          });
        } else {
          const venueMail = await sendGroupBuyEmail(
            venueEmails,
            renderVenueCancelRequested(
              {
                ...emailOrder,
                guestPhone: order.guest_phone ?? null,
                guestEmail: order.guest_email ?? null,
                adminUrl: buildAdminGroupBuyUrl({
                  accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
                  campaignId: campaign?.id ?? null,
                  orderNumber: order.order_number,
                }),
              },
              { requestedAtText, reason: reason || null, paidAmount },
            ),
          );
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: venueMail.ok ? "email_sent" : "email_failed",
            actor_label: "system",
            note: `recipient_type:venue／template_type:venue_cancel_requested／recipient_count:${venueEmails.length}／source:${venueSource}${
              venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
            }`,
          });
        }
      } catch (notifyErr) {
        console.error("[group-buy-order-lookup] cancel notify threw", notifyErr);
      }

      return json({
        success: true,
        cancelRequested: true,
        message: `${CANCEL_REQUEST_RECEIVED_TEXT}${REFUND_PENDING_REVIEW_TEXT}`,
      });
    }



    // ── 民宿基本資料／訂房須知（正式規則）／入住前提醒／方案內容 ──
    // 注意：訂房須知為 live data（顯示目前最新版本），非下單當時的條款快照。
    const accommodationId = (order as any).accommodation_id ?? campaign?.accommodation_id ?? null;
    const [{ data: acc }, { data: intro }, { data: bookingSettings }, { data: customSections }] = await Promise.all([
      accommodationId
        ? admin.from("accommodation_info").select("name, address, phone, check_in_notice, line_id, website_url, email").eq("id", accommodationId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin
          .from("group_buy_venue_intros")
          .select("address, phone, check_in_notice")
          .eq("accommodation_id", accommodationId)
          .maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin.from("booking_settings").select("*").eq("accommodation_id", accommodationId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin
          .from("custom_sections")
          .select("id, section_title, section_subtitle, section_content, display_order, is_enabled")
          .eq("accommodation_id", accommodationId)
          .order("display_order")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // ── 常見問題：與團購活動頁完全同源 ──
    // 資料表 faqs（accommodation_id + is_published，display_order 排序），
    // 後台若於 group_buy_campaigns.faq_item_ids 指定，則依該陣列順序過濾。
    let faqItems: { id: string; question: string; answer: string }[] = [];
    if (accommodationId) {
      const { data: faqRows } = await admin
        .from("faqs")
        .select("id, question, answer")
        .eq("accommodation_id", accommodationId)
        .eq("is_published", true)
        .order("display_order");
      const all = (faqRows ?? []) as { id: string; question: string; answer: string }[];
      const picked = (campaign as any)?.faq_item_ids;
      faqItems = Array.isArray(picked)
        ? (picked.map((id: string) => all.find((f) => f.id === id)).filter(Boolean) as typeof all)
        : all;
    }


    let pkg: any = null;
    if (campaign?.id) {
      const { data: pkgs } = await admin
        .from("group_buy_campaign_packages")
        .select("display_name, description, image_url, group_buy_price, package_id, room_type_id, room_type_ids")
        .eq("campaign_id", campaign.id);
      const list = (pkgs ?? []) as any[];
      // 建單時會把方案名稱寫進 notes（「方案：XXX × N 間 × M 晚」），優先用它精準比對，
      // 避免同活動多方案共用房型時抓錯方案。
      const noteName = String((order as any).notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? "";
      pkg = (noteName ? list.find((p) => p.display_name === noteName) : null)
        ?? list.find((p) => p.package_id && p.package_id === (order as any).package_id)
        ?? list.find((p) =>
          p.room_type_id === (order as any).room_type_id ||
          (Array.isArray(p.room_type_ids) && p.room_type_ids.includes((order as any).room_type_id))
        )
        ?? (list.length === 1 ? list[0] : null);

    }

    const emailEvents = (events ?? []).filter((e: any) =>
      e.event_type === "email_sent" || e.event_type === "email_failed"
    );


    // 團購信用卡＝全額付款：無訂金／尾款概念
    const paidAmountNow = Math.max(0, Math.round(Number((order as any).paid_amount) || 0));
    const fullPayment = String((order as any).payment_provider ?? "") === "tappay" &&
      String((order as any).payment_method ?? "").includes("credit_card");

    /**
     * 付款方式 SoT＝這張訂單的 orders.payment_method（不得依 campaign 現行設定推測）。
     * atm → ATM 虛擬帳號；credit_card* → 信用卡；其餘 → 銀行人工匯款。
     */
    const paymentMethodRaw = String((order as any).payment_method ?? "");
    const isAtmOrder = paymentMethodRaw === "atm" || !!(order as any).atm_vacc_no;
    const paymentChannel: "atm" | "credit_card" | "bank" = fullPayment
      ? "credit_card"
      : isAtmOrder
      ? "atm"
      : "bank";
    // 已收訂金／已付清：以 orders.payment_status 為準（ATM 不會有 admin_confirmed 事件）
    const depositPaid = ["deposit_paid", "partial", "partial_paid", "paid"].includes(
      String((order as any).payment_status ?? ""),
    ) || paidAmountNow > 0;

    /** 人工退款手續費（此館設定；信用卡原卡退刷一律 0）——前台文案唯一來源 */
    const manualRefundFeeSetting = paymentChannel === "credit_card"
      ? 0
      : await loadManualRefundFee(admin, accommodationId);

    return json({
      order: {
        orderNumber: order.order_number,
        guestName: order.guest_name,
        // 只回傳遮罩後的信箱給前台顯示（不外流完整 PII）
        guestEmailMasked: (() => {
          const em = String(order.guest_email ?? "");
          const [local, domain] = em.split("@");
          if (!domain || !local) return null;
          return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
        })(),

        checkInDate: order.check_in_date,
        checkOutDate: order.check_out_date,
        guestCount: order.guest_count,
        roomQuantity: order.room_quantity,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        total,
        deposit: fullPayment ? 0 : (Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit),
        balance: fullPayment ? Math.max(0, total - paidAmountNow) : balance,
        depositPercentage: depositPct,
        paymentProvider: (order as any).payment_provider ?? null,
        paidAmount: paidAmountNow,
        fullPayment,
        /** 付款方式分流（前台顯示 SoT） */
        paymentChannel,
        paymentMethod: paymentMethodRaw || null,
        depositPaid,
        atm: isAtmOrder && (order as any).atm_vacc_no
          ? {
            vaccNo: (order as any).atm_vacc_no,
            bankCode: (order as any).atm_vacc_bank_code ?? null,
            expireAt: (order as any).atm_expire_at ?? null,
            // 本地商業付款期限（新制）；NULL = legacy，前台沿用 provider 期限顯示
            localDeadline: (order as any).group_buy_payment_deadline_at ?? null,
            amount: Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit,
          }
          : null,
        // 取消政策依「此訂單」實際付款制度判定，不得依活動當下設定判定
        cancellationPolicy: resolveCancellationPolicy({
          order_source: (order as any).order_source ?? "group_buy",
          payment_provider: (order as any).payment_provider ?? null,
          payment_method: (order as any).payment_method ?? null,
          paid_amount: paidAmountNow,
          final_price: Number((order as any).final_price ?? (order as any).total_price ?? 0),
        }).policy,

        /** 人工退款手續費（此館設定；信用卡原卡退刷一律 0）——前台文案唯一來源 */
        manualRefundFee: manualRefundFeeSetting,
        refundFeeAmount: Math.max(0, Math.round(Number((order as any).refund_fee_amount) || 0)),
        refundedAmount: Math.max(0, Math.round(Number((order as any).refunded_amount) || 0)),
        remainingRefundable: remainingRefundableWithFee(order as any),

        paymentDeadline: deadline.toISOString(),
        paymentDeadlineText: formatTaipei(deadline),
      },
      campaign: campaign
        ? { title: campaign.title, slug: campaign.slug, contactNote: campaign.contact_note, kol: campaign.kol_display_name }
        : null,
      bank: await (async () => {
        // 只有「銀行人工匯款」訂單才回傳活動匯款帳戶；ATM／信用卡一律不得出現匯款帳號
        if (paymentChannel !== "bank") return null;
        if (!campaign?.id) return null;
        const { data } = await admin
          .from("group_buy_bank_accounts")
          .select("*")
          .eq("campaign_id", campaign.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        return bankToInfo(data);
      })(),
      events: events ?? [],
      cancelRequest: cancelRequestedEvent
        ? { requestedAt: (cancelRequestedEvent as any).created_at, note: (cancelRequestedEvent as any).note }
        : null,

      // 只回傳結構化欄位，raw note（內部 metadata）不外流給前台
      emails: emailEvents.map((e: any) => {
        const note = String(e.note ?? "");
        const pick = (k: string) => note.match(new RegExp(`${k}:([^／/]+)`))?.[1]?.trim() ?? null;
        return {
          status: e.event_type === "email_sent" ? "sent" : "failed",
          recipientType: pick("recipient_type"),
          templateType: pick("template_type"),
          createdAt: e.created_at,
        };
      }),

      venue: acc
        ? {
          name: (acc as any).name ?? null,
          address: (intro as any)?.address || (acc as any).address || null,
          phone: (intro as any)?.phone || (acc as any).phone || null,
          /** 人工退款申請引導用的客服管道（沿用館別 contact 設定，前台不得寫死） */
          contact: {
            phone: (intro as any)?.phone || (acc as any).phone || null,
            lineId: (acc as any).line_id || null,
            websiteUrl: (acc as any).website_url || null,
            email: (acc as any).email || null,
          },
        }
        : null,
      // 入住前提醒（訂單成立後才顯示的補充資訊），非正式住宿規則。
      // 有快照時優先使用快照版本（保留下單當時提供給客人的內容）。
      preArrivalNotice: (order as any).group_buy_booking_notice_snapshot?.post_booking_notice
        ?? (intro as any)?.check_in_notice ?? null,
      // 常見問題：與團購活動頁完全同源（faqs 表 + campaign.faq_item_ids 指定順序）
      faqItems: faqItems,
      // 註：訂房須知快照（orders.group_buy_booking_notice_snapshot）仍完整保留於資料庫，
      // 供後台稽核／爭議舉證使用，僅不在旅客訂單查詢頁顯示。

      package: pkg
        ? {
          name: pkg.display_name,
          description: pkg.description,
          imageUrl: pkg.image_url,
          price: Number(pkg.group_buy_price) || 0,
        }
        : null,
      refund: (() => {
        const o = order as any;
        const paid = paidAmountNow;
        const refundedAmount = Math.max(0, Math.round(Number(o.refunded_amount) || 0));
        const feeAmount = Math.max(0, Math.round(Number(o.refund_fee_amount) || 0));
        const settled = refundedAmount + feeAmount;
        const isCard = paymentChannel === "credit_card";
        /**
         * 「政策應退」一律沿用 server 既有 quoteCancellation（不另建一套算法）：
         *  - 已有沖銷紀錄 → 直接用實際沖銷總額（實退 + 手續費），與帳務一致。
         *  - 尚未退款 → 以取消日（cancelled_at 的台北日期，無則今日）試算。
         */
        const cancelDate = o.cancelled_at
          ? new Date(o.cancelled_at).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
          : taipeiToday();
        const quote = quoteCancellation({
          order: {
            order_source: o.order_source ?? "group_buy",
            payment_provider: o.payment_provider ?? null,
            payment_method: o.payment_method ?? null,
            deposit_payment_method: o.deposit_payment_method ?? null,
            balance_payment_method: o.balance_payment_method ?? null,
            paid_amount: paid,
            final_price: Number(o.final_price ?? o.total_price ?? 0),
          },
          checkInDate: String(o.check_in_date),
          cancellationDate: cancelDate,
          alreadyRefunded: 0,
        });
        const policyRefundAmount = settled > 0
          ? settled
          : Math.min(paid, Math.max(0, Math.round(quote.refundAmount)));
        const feeApplies = !isCard && policyRefundAmount > 0;
        const expectedFee = feeAmount > 0
          ? feeAmount
          : feeApplies
          ? Math.min(manualRefundFeeSetting, policyRefundAmount)
          : 0;
        return {
          status: o.refund_status ?? null,
          amount: refundedAmount,
          refundedAt: o.refunded_at ?? null,
          paidAmount: paid,
          policyRefundAmount,
          feeAmount,
          /** 尚未退款時的預估手續費（已退款則等於實際 feeAmount） */
          expectedFeeAmount: expectedFee,
          expectedPayoutAmount: Math.max(0, policyRefundAmount - expectedFee),
          refundedAmount,
          remainingRefundable: Math.max(0, paid - settled),
          paymentMethodKind: paymentMethodKind(o),
          paymentMethodLabel: paymentMethodLabel(o),
          refundChannelLabel: refundChannelLabel(isCard),
          isCardOrder: isCard,
        };
      })(),
      /** 旅客自助取消分流（前台文案用）：direct_cancel / card_auto_refund / manual_review */
      selfCancel: (() => {
        const cls = classifyGroupBuySelfCancel(order as any);
        if (cls.mode === "card_auto_refund") {
          const q = quoteCancellation({
            order: order as any,
            checkInDate: String(order.check_in_date),
            cancellationDate: taipeiToday(),
            alreadyRefunded: Math.max(0, Math.round(Number((order as any).refunded_amount) || 0)),
          });
          const r = resolveSelfCancelRefundAmount({
            refundable: cls.refundable,
            policyRefundAmount: q.refundAmount,
            requiresManualReview: q.requiresManualReview,
          });
          return r.manualReview
            ? { mode: "manual_review", estimatedRefund: 0 }
            : { mode: "card_auto_refund", estimatedRefund: r.refundAmount };
        }
        return { mode: cls.mode, estimatedRefund: 0 };
      })(),
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    // 對客一律回傳友善文案，原始 exception 只留在 server log
    return json({ error: "目前無法完成操作，請稍後再試或聯繫客服。" }, 500);
  }
});
