// Member-facing order self-service: cancel / change dates / change guest count.
// Ownership is verified against platform_members.user_id (auth user) -> orders.member_id,
// with a fallback on guest_email matching the authenticated email.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { calcCancellationFee, taipeiToday } from "../_shared/cancellationPolicy.ts";
import { payByCardToken, refundTapPay } from "../_shared/tappay.ts";
import { quoteGuestCountChange } from "../_shared/guestCountPricing.ts";
import { createManualReviewTask } from "../_shared/manualReviewTask.ts";

interface Body {
  orderNumber: string;
  action:
    | "cancel"
    | "cancel_quote"
    | "change_dates"
    | "change_guests"
    | "change_guests_quote"
    | "request_date_change";
  newCheckIn?: string;
  newCheckOut?: string;
  guestCount?: number;
  reason?: string;
  /** 客人已於前台確認金額變動（補差／退差）後才允許實際套用 */
  confirmPriceChange?: boolean;
}




const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.orderNumber || !body?.action) {
      return json({ success: false, message: "缺少必要參數" }, 400, corsHeaders);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, message: "請先登入會員" }, 401, corsHeaders);
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) return json({ success: false, message: "請先登入會員" }, 401, corsHeaders);

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, order_number, member_id, guest_email, guest_count, order_status, payment_status, paid_amount, final_price, total_price, discount_amount, package_id, check_in_date, check_out_date, notes, accommodation_id, room_charge_status, room_charge_rec_trade_id",
      )
      .eq("order_number", body.orderNumber)
      .maybeSingle();

    if (!order) return json({ success: false, message: "找不到訂單" }, 404, corsHeaders);

    const email = (user.email || member?.email || "").toLowerCase();
    const owns =
      (member?.id && order.member_id === member.id) ||
      (!!email && (order.guest_email || "").toLowerCase() === email);
    if (!owns) return json({ success: false, message: "此訂單不屬於目前登入的會員" }, 403, corsHeaders);

    if (order.order_status === "cancelled") {
      return json({ success: false, message: "此訂單已取消" }, 400, corsHeaders);
    }

    const today = taipeiToday();

    // 民宿自訂免費取消天數
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("free_cancel_days")
      .eq("accommodation_id", order.accommodation_id)
      .maybeSingle();
    const freeCancelDays = Number(bs?.free_cancel_days ?? 14);

    const quote = calcCancellationFee(
      Number(order.final_price || 0),
      order.check_in_date,
      today,
      Number(order.paid_amount || 0),
      freeCancelDays,
    );

    // 取消政策試算（不異動資料）
    if (body.action === "cancel_quote") {
      return json({ success: true, quote, freeCancelDays }, 200, corsHeaders);
    }

    // 改期／改人數：入住日當天或之後不可線上異動
    if (body.action !== "cancel" && order.check_in_date <= today) {
      return json(
        { success: false, message: "入住日當天或之後無法線上異動，請直接聯繫住宿" },
        400,
        corsHeaders,
      );
    }
    // 取消：已過入住日不可線上取消
    if (body.action === "cancel" && order.check_in_date < today) {
      return json(
        { success: false, message: "已過入住日無法線上取消，請直接聯繫住宿" },
        400,
        corsHeaders,
      );
    }

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const appendNote = (line: string) => `${order.notes ? order.notes + "\n" : ""}${line}`;

    if (body.action === "cancel") {
      const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
      const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");

      const lines: string[] = [
        `🔒 ${stamp} 會員於前台自行取消訂單（${email}）${body.reason ? `：${body.reason}` : ""}`,
        `🔒 取消政策：距入住 ${quote.daysBefore} 天，扣款比例 ${quote.percent}%（${quote.label}）`,
      ];

      let chargedFee = 0;
      let refunded = 0;
      let needManual = false;

      // 情境 A：尚未扣款、卡片已綁定 → 依級距即時收取手續費，其餘不收
      if (order.room_charge_status === "card_bound" && Number(order.paid_amount || 0) === 0) {
        const { data: tokenRow } = await supabase
          .from("deposit_card_tokens")
          .select("*")
          .eq("order_id", order.id)
          .eq("purpose", "room_charge")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (quote.feeAmount > 0 && tokenRow && partnerKey && merchantId) {
          const r = await payByCardToken({
            partnerKey,
            merchantId,
            cardKey: tokenRow.card_key,
            cardToken: tokenRow.card_token,
            amount: quote.feeAmount,
            details: `取消手續費 - 訂單 ${order.order_number}`,
            orderNumber: `CXL-${order.order_number}`,
          });
          await supabase.from("deposit_charges").insert({
            order_id: order.id,
            accommodation_id: order.accommodation_id,
            card_token_id: tokenRow.id,
            action: "cancellation_fee",
            amount: quote.feeAmount,
            status: r.success ? "success" : "failed",
            trigger_source: "member_cancel",
            rec_trade_id: r.recTradeId ?? null,
            webhook_status: r.success ? "pending" : "failed",
            needs_manual_review: !r.success,
            error_message: r.success ? null : (r.msg || `TapPay error ${r.status}`),
          });

          if (r.success) {
            chargedFee = quote.feeAmount;
            lines.push(`🔒 已收取取消手續費 NT$${chargedFee.toLocaleString()}（TapPay ${r.recTradeId}）`);
          } else {
            needManual = true;
            lines.push(`🔒 取消手續費 NT$${quote.feeAmount.toLocaleString()} 扣款失敗（${r.msg || r.status}），待人工處理`);
          }
        } else if (quote.feeAmount > 0) {
          needManual = true;
          lines.push(`🔒 應收取消手續費 NT$${quote.feeAmount.toLocaleString()}，但查無有效綁卡，待人工處理`);
        } else {
          lines.push("🔒 符合免費取消，未扣任何款項");
        }

        if (tokenRow) {
          await supabase.from("deposit_card_tokens").update({ is_active: false }).eq("id", tokenRow.id);
        }
      }
      // 情境 B：已扣款 → 退還（已收金額 - 手續費）；信用卡自動退刷，ATM／現金／轉帳走人工
      else if (Number(order.paid_amount || 0) > 0) {
        const refundAmount = quote.refundAmount;
        chargedFee = Math.min(Number(order.paid_amount || 0), quote.feeAmount);
        refundOutcome = await refundOrderCard(
          supabase,
          order as any,
          refundAmount,
          "member_cancel",
        );
        refunded = refundOutcome.refunded;
        needManual = refundAmount > 0 && !refundOutcome.success;
        lines.push(
          refundOutcome.success
            ? `🔒 ${refundOutcome.note}（保留手續費 NT$${chargedFee.toLocaleString()}）`
            : `🔒 ${refundOutcome.note}`,
        );
        if (needManual) {
          await flagRefundNeedsManual(supabase, order as any, refundAmount, refundOutcome);
        }
      } else {
        lines.push("🔒 訂單尚未收款，取消不產生退款");
      }


      const { error } = await supabase
        .from("orders")
        .update({
          order_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_fee_amount: chargedFee,
          cancellation_fee_percent: quote.percent,
          paid_amount: Math.max(0, Number(order.paid_amount || 0) - refunded) + (chargedFee && Number(order.paid_amount || 0) === 0 ? chargedFee : 0),
          payment_status: refunded > 0 || Number(order.paid_amount || 0) === 0 ? "refunded" : order.payment_status,
          room_charge_status: order.room_charge_status ? "cancelled" : null,
          notes: appendNote(lines.join("\n")),
          refunded_amount: refunded,
          ...(refundOutcome ? buildRefundPatch(refundOutcome, Number(order.paid_amount || 0)) : {}),
        })
        .eq("id", order.id);

      if (error) return json({ success: false, message: error.message }, 500, corsHeaders);

      // 客人自行取消 → 寄取消通知信（後台人員取消不會走這裡，因此不寄信）
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-order-cancelled-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            reason: body.reason ?? null,
            chargedFee,
            refunded,
            needManual,
            triggerSource: "member_cancel",
          }),
        });
      } catch (mailErr) {
        console.error("[member-order-manage] cancellation email failed", mailErr);
      }

      return json(
        {
          success: true,
          quote,
          chargedFee,
          refunded,
          needManual,
          message: needManual
            ? "訂單已取消，款項將由客服人員協助處理"
            : quote.feeAmount === 0
              ? "訂單已取消，符合免費取消未扣款"
              : chargedFee > 0 && refunded === 0
                ? `訂單已取消，依政策收取手續費 NT$${chargedFee.toLocaleString()}`
                : `訂單已取消，已退款 NT$${refunded.toLocaleString()}`,
        },
        200,
        corsHeaders,
      );
    }


    if (body.action === "change_guests" || body.action === "change_guests_quote") {
      const n = Number(body.guestCount);
      if (!Number.isInteger(n) || n < 1 || n > 30) {
        return json({ success: false, message: "入住人數不正確" }, 400, corsHeaders);
      }

      const priceQuote = await quoteGuestCountChange(supabase, order as any, n);
      const changed = n !== Number(order.guest_count);
      const hasPaidAny =
        Number(order.paid_amount || 0) > 0 ||
        ["paid", "deposit_paid", "partial", "fully_paid"].includes(String(order.payment_status));
      const fullyPaid = ["paid", "fully_paid"].includes(String(order.payment_status));

      // 只試算，不異動資料
      if (body.action === "change_guests_quote") {
        return json({ success: true, priceQuote }, 200, corsHeaders);
      }

      if (!changed) {
        return json({ success: false, message: "入住人數沒有變更" }, 400, corsHeaders);
      }

      // 無法自動重算價格（非方案型／查無對應人數方案）→ 已付款訂單一律轉客服待辦
      if (priceQuote.needsManualReview && hasPaidAny) {
        await createManualReviewTask(supabase, {
          orderId: order.id,
          accommodationId: order.accommodation_id,
          orderNumber: order.order_number,
          taskType: "guest_count_repricing",
          reasonCode: "guest_count_repricing",
          requestedGuestCount: n,
          quoteSnapshot: { priceQuote, currentGuestCount: order.guest_count },
          requesterNote: body.reason ?? null,
        });
        await supabase
          .from("orders")
          .update({
            notes: appendNote(
              `🔒 ${stamp} 會員申請將入住人數改為 ${n} 人（${email}），系統無法自動重算金額，已建立客服待辦`,
            ),
          })
          .eq("id", order.id);
        return json(
          {
            success: false,
            code: "NEEDS_MANUAL_REVIEW",
            reviewTaskCreated: true,
            message:
              "已為您送出人數變更申請，金額需由客服重新確認，客服將盡快與您聯繫。",
            priceQuote,
          },
          409,
          corsHeaders,
        );
      }

      const priceChanged = priceQuote.canAutoPrice && priceQuote.diff !== 0;

      // 已全額付款且金額會變動 → 不可線上自行變更，轉客服待辦
      if (priceChanged && fullyPaid) {
        await createManualReviewTask(supabase, {
          orderId: order.id,
          accommodationId: order.accommodation_id,
          orderNumber: order.order_number,
          taskType: "guest_count_repricing",
          reasonCode: "guest_count_repricing_paid",
          requestedGuestCount: n,
          quoteSnapshot: { priceQuote, currentGuestCount: order.guest_count },
          requesterNote: body.reason ?? null,
        });
        await supabase
          .from("orders")
          .update({
            notes: appendNote(
              `🔒 ${stamp} 會員申請將入住人數改為 ${n} 人（${email}），訂單已付清且金額有變動，已建立客服待辦`,
            ),
          })
          .eq("id", order.id);
        return json(
          {
            success: false,
            code: "PRICE_LOCKED",
            reviewTaskCreated: true,
            message:
              "此訂單已付清，變更人數會影響金額。已為您送出申請，客服將協助處理。",
            priceQuote,
          },
          409,
          corsHeaders,
        );
      }


      // 金額會變動 → 需前台明確確認補差／退差後才套用
      if (priceChanged && !body.confirmPriceChange) {
        return json(
          {
            success: false,
            code: "PRICE_CHANGE_CONFIRM_REQUIRED",
            message:
              priceQuote.diff > 0
                ? `變更為 ${n} 人後房費將增加 NT$${priceQuote.diff.toLocaleString()}，需確認後才能送出。`
                : `變更為 ${n} 人後房費將減少 NT$${Math.abs(priceQuote.diff).toLocaleString()}，需確認後才能送出。`,
            priceQuote,
          },
          409,
          corsHeaders,
        );
      }

      const noteLines = [
        `🔒 ${stamp} 會員自行調整入住人數：${order.guest_count} → ${n}（${email}）`,
      ];
      if (priceChanged) {
        noteLines.push(
          `🔒 ${stamp} 人數變更重算房費：NT$${priceQuote.currentRoomTotal.toLocaleString()} → NT$${priceQuote.newRoomTotal.toLocaleString()}（${
            priceQuote.diff > 0 ? "需補差額" : "需退差額"
          } NT$${Math.abs(priceQuote.diff).toLocaleString()}）｜方案：${priceQuote.currentPackageName ?? "-"} → ${priceQuote.newPackageName ?? "-"}｜已付 NT$${priceQuote.paidAmount.toLocaleString()}，尚需支付 NT$${priceQuote.newOutstanding.toLocaleString()}`,
        );
      } else if (priceQuote.needsManualReview) {
        noteLines.push(`🔒 ${stamp} 人數變更未自動重算金額：${priceQuote.reason ?? "非方案型訂單"}`);
      }

      const update: Record<string, unknown> = {
        guest_count: n,
        notes: appendNote(noteLines.join("\n")),
      };
      if (priceChanged) {
        update.total_price = priceQuote.newRoomTotal;
        update.final_price = priceQuote.newFinalPrice;
        if (priceQuote.newPackageId) update.package_id = priceQuote.newPackageId;
      }

      const { error } = await supabase.from("orders").update(update).eq("id", order.id);
      if (error) return json({ success: false, message: error.message }, 500, corsHeaders);

      return json(
        {
          success: true,
          priceQuote,
          message: priceChanged
            ? priceQuote.diff > 0
              ? `入住人數已更新，房費調整為 NT$${priceQuote.newFinalPrice.toLocaleString()}，尚需支付 NT$${priceQuote.newOutstanding.toLocaleString()}，我們將與您聯繫確認補款方式。`
              : `入住人數已更新，房費調整為 NT$${priceQuote.newFinalPrice.toLocaleString()}，多付的差額將由客服協助辦理退款。`
            : "入住人數已更新",
        },
        200,
        corsHeaders,
      );
    }


    // change_dates / request_date_change
    const { newCheckIn, newCheckOut } = body;
    if (!newCheckIn || !newCheckOut || !DATE_RE.test(newCheckIn) || !DATE_RE.test(newCheckOut)) {
      return json({ success: false, message: "日期格式必須為 yyyy-MM-dd" }, 400, corsHeaders);
    }
    if (newCheckOut <= newCheckIn) {
      return json({ success: false, message: "退房日必須晚於入住日" }, 400, corsHeaders);
    }
    if (newCheckIn <= today) {
      return json({ success: false, message: "入住日必須是未來日期" }, 400, corsHeaders);
    }
    if (order.check_in_date === newCheckIn && order.check_out_date === newCheckOut) {
      return json({ success: false, message: "新舊日期與原訂單相同" }, 400, corsHeaders);
    }
    const hasPaid = Number(order.paid_amount || 0) > 0 ||
      ["paid", "deposit_paid", "partial"].includes(String(order.payment_status));

    // 已付款訂單的改期一律走客服待辦（人工審核 + 可能的價差處理）
    if (body.action === "request_date_change" || hasPaid) {
      if (!hasPaid) {
        return json(
          { success: false, message: "此訂單可直接線上改期，無需送出申請" },
          400,
          corsHeaders,
        );
      }
      await createManualReviewTask(supabase, {
        orderId: order.id,
        accommodationId: order.accommodation_id,
        orderNumber: order.order_number,
        taskType: "date_change_request",
        reasonCode: "date_change_paid_order",
        requestedCheckIn: newCheckIn,
        requestedCheckOut: newCheckOut,
        quoteSnapshot: {
          currentCheckIn: order.check_in_date,
          currentCheckOut: order.check_out_date,
          paidAmount: Number(order.paid_amount || 0),
          finalPrice: Number(order.final_price || 0),
          paymentStatus: order.payment_status,
        },
        requesterNote: body.reason ?? null,
      });
      await supabase
        .from("orders")
        .update({
          notes: appendNote(
            `🔒 ${stamp} 會員申請改期：${order.check_in_date}~${order.check_out_date} → ${newCheckIn}~${newCheckOut}（${email}）｜訂單已付款，已建立客服待辦待人工確認空房與價差`,
          ),
        })
        .eq("id", order.id);
      return json(
        {
          success: false,
          code: "NEEDS_MANUAL_REVIEW",
          reviewTaskCreated: true,
          message:
            "已為您送出改期申請，因訂單已付款需由客服確認空房與價差，客服將盡快與您聯繫。",
        },
        409,
        corsHeaders,
      );
    }




    const { error: rpcErr } = await supabase.rpc("change_order_dates", {
      _order_id: order.id,
      _new_check_in: newCheckIn,
      _new_check_out: newCheckOut,
    });
    if (rpcErr) {
      const msg = rpcErr.message || "改期失敗";
      const isInventory = /Inventory exceeded|Room not available|包棟|不能同時成立/i.test(msg);
      return json(
        { success: false, message: isInventory ? "新日期已無空房，請改選其他日期" : msg },
        isInventory ? 409 : 500,
        corsHeaders,
      );
    }

    await supabase
      .from("orders")
      .update({
        notes: appendNote(
          `🔒 ${stamp} 會員自行改期：${order.check_in_date}~${order.check_out_date} → ${newCheckIn}~${newCheckOut}（${email}）`,
        ),
      })
      .eq("id", order.id);

    // 改期後重寄訂單確認函，信中標明日期已更改
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-order-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          orderNumber: order.order_number,
          triggerSource: "member_date_change",
          dateChange: {
            oldCheckIn: order.check_in_date,
            oldCheckOut: order.check_out_date,
            operator: "會員自行改期",
          },
        }),
      });
    } catch (mailErr) {
      console.error("[member-order-manage] resend confirmation failed", mailErr);
    }

    return json({ success: true, message: "訂單日期已更新" }, 200, corsHeaders);
  } catch (e) {
    return json({ success: false, message: (e as Error).message }, 500, buildCorsHeaders(req));
  }
});
