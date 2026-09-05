// 團購通知信「全模板樣本寄送」：僅供最高管理者測試，用假資料渲染所有團購通知信並寄到指定信箱。
// 不讀取、不寫入任何真實訂單資料。
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { forbiddenResponse, isSuperAdmin, resolveCaller, unauthorizedResponse } from "../_shared/authz.ts";
import {
  type GroupBuyEmailOrder,
  renderAtmDeadlineExpired,
  renderBookingWithBankInfo,
  renderDepositReceived,
  renderExpiredCancelled,
  renderGuestCancelRequested,
  renderOrderCancelled,
  renderRefundProcessed,
  renderVenueCancelRequested,
  renderVenueNewOrder,
  renderVenueOrderSelfCancelled,
  renderVenueTransferReported,
  sendGroupBuyEmail,
  type VenueNotifyOrder,
} from "../_shared/groupBuyEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sample: GroupBuyEmailOrder = {
  orderNumber: "SAMPLE99",
  guestName: "範例旅客",
  campaignTitle: "【範例】團購活動",
  accommodationName: "範例民宿",
  packageName: "包棟兩晚方案",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-03",
  guestCount: 4,
  totalPrice: 24000,
  depositAmount: 8000,
  balanceAmount: 16000,
  deadlineText: "2026/09/08 23:59",
  orderUrl: "https://booking.lakeze.com/group-buy/order",
  cancellationPolicy: "deposit",
  nights: 2,
  roomQuantity: 1,
  roomTypeName: "全棟",
  guestCompositionText: "成人 4",
  contactPhone: "0912-345-678",
  contactEmail: "sample@example.com",
  paidAmount: 8000,
  paymentMethodText: "ATM 虛擬帳號轉帳",
  refundChannelText: "人工匯款退款",
  venueAddress: "宜蘭縣範例鄉範例路 1 號",
  venuePhone: "03-000-0000",
  arrivalNotice: "入住時間 15:00 後，退房 11:00 前。",
  isCardOrder: false,
  fullPrepayment: false,
};

const venueSample: VenueNotifyOrder = {
  ...sample,
  guestPhone: "0912-345-678",
  guestEmail: "sample@example.com",
  adultCount: 4,
  childCount: 0,
  toddlerCount: 0,
  infantCount: 0,
  paymentStatusText: "待匯款",
  adminUrl: "https://hq.lakeze.com/admin/group-buy",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const internalKey = Deno.env.get("GROUP_BUY_RESEND_INTERNAL_KEY");
    const isInternal = !!internalKey && req.headers.get("x-internal-key") === internalKey;
    const caller = isInternal
      ? await resolveCaller(new Request(req.url, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` } }))
      : await resolveCaller(req);
    if (!caller.ok) {
      return new Response(JSON.stringify({ error: caller.error }), {
        status: caller.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ctx = caller.ctx;
    if (!ctx.userId && !ctx.isServiceRole) return unauthorizedResponse(corsHeaders);
    if (!ctx.isServiceRole && !(await isSuperAdmin(ctx))) return forbiddenResponse(corsHeaders);

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      return new Response(JSON.stringify({ error: "invalid_to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bank = {
      bankName: "範例銀行",
      bankCode: "000",
      branchName: "範例分行",
      accountName: "範例民宿有限公司",
      accountNumber: "000-000-000000",
      note: "請以訂單編號為備註",
    };

    /** 信用卡全額付款樣本：取消政策必須為全額預收制 */
    const cardSample: GroupBuyEmailOrder = {
      ...sample,
      isCardOrder: true,
      fullPrepayment: true,
      paidAmount: 24000,
      depositAmount: 0,
      balanceAmount: 0,
      cancellationPolicy: "full_prepayment",
      paymentMethodText: "信用卡（3D 驗證）",
      refundChannelText: "原信用卡退刷（TapPay）",
    };

    const mails: { key: string; mail: { subject: string; html: string } }[] = [
      { key: "guest_booking_with_bank_info", mail: renderBookingWithBankInfo(sample, bank) },
      { key: "guest_deposit_received", mail: renderDepositReceived(sample, { providerLabel: "ATM 虛擬帳號轉帳", paidThisTime: 8000 }) },
      {
        key: "guest_full_payment_received",
        mail: renderDepositReceived(cardSample, {
          providerLabel: "信用卡（3D 驗證）",
          paidThisTime: 24000,
          fullPayment: true,
        }),
      },

      { key: "guest_expired_cancelled", mail: renderExpiredCancelled(sample) },
      { key: "guest_atm_deadline_expired", mail: renderAtmDeadlineExpired(sample, "2026/09/08 23:59") },
      {
        key: "guest_order_cancelled",
        mail: renderOrderCancelled(sample, {
          cancelledAtText: "2026/09/05 18:00",
          paidAmount: 8000,
          refundedTotal: 0,
          refundStatus: "pending_manual",
          reason: "旅客行程異動",
          handlingFee: 30,
          atmNoTransferNotice: true,
          venueContact: { phone: "03-000-0000", email: "venue@example.com", lineId: "@example" },
        }),
      },
      {
        key: "guest_refund_processed",
        mail: renderRefundProcessed(sample, {
          refundAmount: 7970,
          refundedTotal: 7970,
          paidAmount: 8000,
          refundStatus: "refunded",
          refundedAtText: "2026/09/06 10:00",
          refundFee: 30,
          refundFeeTotal: 30,
        }),
      },
      {
        key: "guest_cancel_requested",
        mail: renderGuestCancelRequested(sample, {
          requestedAtText: "2026/09/05 18:00",
          reason: "行程異動",
          paidAmount: 8000,
          handlingFee: 30,
        }),
      },
      { key: "venue_new_order", mail: renderVenueNewOrder(venueSample) },
      { key: "venue_new_order_full_payment", mail: renderVenueNewOrder(venueSample, { fullPayment: true }) },
      {
        key: "venue_transfer_reported",
        mail: renderVenueTransferReported(venueSample, {
          accountLast5: "12345",
          transferDateText: "2026/09/05",
          transferTimeText: "14:30",
        }),
      },
      {
        key: "venue_cancel_requested",
        mail: renderVenueCancelRequested(venueSample, {
          requestedAtText: "2026/09/05 18:00",
          reason: "行程異動",
          paidAmount: 8000,
          handlingFee: 30,
        }),
      },
      {
        key: "venue_order_self_cancelled",
        mail: renderVenueOrderSelfCancelled(venueSample, {
          cancelledAtText: "2026/09/05 18:05",
          reason: "旅客自助取消",
          paidAmount: 8000,
          refundedAmount: 7970,
          refundStatus: "已退款",
          refundChannelText: "人工匯款退款",
        }),
      },
    ];

    const rawKeys = Array.isArray(body?.keys) ? body.keys.map((k: unknown) => String(k)) : null;
    const selected = rawKeys && rawKeys.length > 0 ? mails.filter((m) => rawKeys.includes(m.key)) : mails;

    const results: { key: string; subject: string; ok: boolean; reason?: string }[] = [];
    for (const m of selected) {
      const subject = `[測試樣本] ${m.mail.subject}`;
      const r = await sendGroupBuyEmail(to, { subject, html: m.mail.html });
      results.push({ key: m.key, subject, ok: r.ok, reason: r.reason });
      await new Promise((res) => setTimeout(res, 600)); // Resend rate limit
    }

    return new Response(
      JSON.stringify({ to, total: results.length, sent: results.filter((r) => r.ok).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[group-buy-email-preview-send]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
