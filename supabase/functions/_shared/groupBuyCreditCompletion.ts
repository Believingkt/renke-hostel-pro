// 團購信用卡「付款成功 → 建立正式訂單」安全內核（Phase G2 / G2-C）
//
// 同時被兩條路徑呼叫，必須保證同一張 draft 最多只會轉出一張正式 orders：
//   A. 前端 3DS 回程：group-buy-complete-paid-order
//   B. TapPay backend callback：tappay-notify（客人關掉瀏覽器的補救）
//
// 競態防護（G2-C 後）：
//   1. 條件式 UPDATE 搶佔（claim）：pending/payment_processing/failed → paid
//   2. 真正的建單交由 DB RPC convert_group_buy_payment_draft 在單一 transaction 完成
//      （draft FOR UPDATE + converted_order_id 檢查 + orders + commission + events + converted）
//      → 即使 claim 之後行程中斷，重試也不可能建出第二張 order。
//   3. Email 以 draft 的 guest_email_sent_at / venue_email_sent_at 條件式 UPDATE 搶佔，
//      保證 exactly-once（前端回程與 callback 同時完成也只寄一次）。
// deno-lint-ignore-file no-explicit-any

import {
  convertGroupBuyDraftToOrderAtomic,
  validateAndPriceGroupBuyBooking,
} from "./groupBuyBooking.ts";
import { queryTapPayRecord, refundTapPay } from "./tappay.ts";
import { buildAdminGroupBuyUrl, buildEmailOrder } from "./groupBuy.ts";
import { renderDepositReceived, renderVenueNewOrder, sendGroupBuyEmail } from "./groupBuyEmail.ts";
import { resolveOrderNotifyEmails } from "./notifyRecipients.ts";

/** 搶佔後若超過此時間仍未完成建單，視為前一次處理中斷，允許重新搶佔 */
const STALE_CLAIM_MS = 3 * 60_000;

const PROVIDER_LABEL = "信用卡（3D 驗證）";

export interface CompleteResult {
  ok: boolean;
  /** 已存在／新建立的正式訂單編號 */
  orderNumber?: string;
  orderId?: string;
  alreadyConverted?: boolean;
  /** 需人工處理（含已自動退款） */
  manualReview?: boolean;
  refunded?: boolean;
  error?: string;
  status?: number;
}

async function loadDraft(admin: any, params: { draftId?: string | null; recTradeId?: string | null; idempotencyKey?: string | null }) {
  let q = admin.from("group_buy_payment_drafts").select("*");
  if (params.draftId) q = q.eq("id", params.draftId);
  else if (params.recTradeId) q = q.eq("rec_trade_id", params.recTradeId);
  else if (params.idempotencyKey) q = q.eq("idempotency_key", params.idempotencyKey);
  else return null;
  const { data } = await q.maybeSingle();
  return data ?? null;
}

async function orderNumberOf(admin: any, orderId: string): Promise<string | null> {
  const { data } = await admin.from("orders").select("order_number").eq("id", orderId).maybeSingle();
  return data?.order_number ?? null;
}

/** 站內管理員通知（B4：付款成功但流程異常一律要有人看得到） */
async function notifyAdmins(
  admin: any,
  params: { accommodationId: string | null; title: string; description: string },
) {
  try {
    await admin.from("notifications").insert({
      accommodation_id: params.accommodationId,
      type: "payment",
      title: params.title,
      description: params.description.slice(0, 1000),
      is_read: false,
    });
  } catch (e) {
    console.error("[groupBuyCreditCompletion] notification insert failed", e);
  }
}

/**
 * 轉單後的副作用：旅客訂單成立信 + 民宿新單通知信。
 * 一律以 draft 欄位的條件式 UPDATE 搶佔寄信權 → exactly once。
 * 寄信失敗不 rollback 已完成的付款訂單，只記錄 email_failed 供後續補寄。
 */
async function sendConversionEmails(
  admin: any,
  draft: any,
  orderId: string,
  paidAmount: number,
): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return;

  const { data: campaign } = await admin
    .from("group_buy_campaigns")
    .select("*")
    .eq("id", draft.campaign_id)
    .maybeSingle();

  const { data: acc } = order.accommodation_id
    ? await admin
      .from("accommodation_info")
      .select("name, address, phone")
      .eq("id", order.accommodation_id)
      .maybeSingle()
    : { data: null as any };

  // 民宿聯絡資訊／入住前提醒：團購介紹優先，缺項時回退 accommodation_info
  const { data: intro } = order.accommodation_id
    ? await admin
      .from("group_buy_venue_intros")
      .select("address, phone, check_in_notice")
      .eq("accommodation_id", order.accommodation_id)
      .maybeSingle()
    : { data: null as any };

  const { data: roomType } = order.room_type_id
    ? await admin.from("room_types").select("name").eq("id", order.room_type_id).maybeSingle()
    : { data: null as any };

  const packageName = (draft.booking_payload as any)?.package_name ??
    String(order.notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? null;
  const origin = (draft.booking_payload as any)?.origin ?? null;

  const emailOrder = buildEmailOrder({
    order,
    campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: 72 },
    accommodationName: (acc as any)?.name ?? null,
    packageName,
    frontendOrigin: origin,
  });
  const balance = Math.max(0, Math.round(Number(order.total_price) - Number(order.paid_amount ?? 0)));

  /** 旅客信明細補充（信用卡＝合併一封「訂房確認＋付款完成」，內容必須完整） */
  const guestDetails = {
    nights: Number((draft.booking_payload as any)?.nights ?? 0) || null,
    roomQuantity: Number(order.room_quantity ?? draft.room_quantity ?? 0) || null,
    roomTypeName: (roomType as any)?.name ?? null,
    guestCompositionText: [
      `成人 ${Number(order.adult_count ?? 0)}`,
      `兒童 ${Number(order.child_count ?? 0)}`,
      `幼兒 ${Number(order.toddler_count ?? 0)}`,
      `嬰兒 ${Number(order.infant_count ?? 0)}`,
    ].join("　"),
    contactPhone: order.guest_phone ?? null,
    contactEmail: order.guest_email ?? null,
    paidAmount: Math.round(Number(order.paid_amount ?? 0)),
    paymentMethodText: PROVIDER_LABEL,
    venueAddress: (intro as any)?.address || (acc as any)?.address || null,
    venuePhone: (intro as any)?.phone || (acc as any)?.phone || null,
    arrivalNotice: (order as any).group_buy_booking_notice_snapshot?.post_booking_notice ??
      (intro as any)?.check_in_notice ?? null,
  };

  // ── 旅客：訂單成立 + 信用卡訂金已收 ──
  const { data: guestClaim } = await admin
    .from("group_buy_payment_drafts")
    .update({ guest_email_sent_at: nowIso })
    .eq("id", draft.id)
    .is("guest_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (guestClaim) {
    const mail = await sendGroupBuyEmail(
      order.guest_email,
      renderDepositReceived(
        { ...emailOrder, ...guestDetails, balanceAmount: balance },
        { providerLabel: PROVIDER_LABEL, paidThisTime: paidAmount, fullPayment: true },
      ),
    );
    if (!mail.ok) {
      // 釋放搶佔，讓後續補寄機制可再試
      await admin.from("group_buy_payment_drafts").update({ guest_email_sent_at: null }).eq("id", draft.id);
    }
    await admin.from("group_buy_payment_events").insert({
      campaign_id: draft.campaign_id,
      order_id: orderId,
      event_type: mail.ok ? "email_sent" : "email_failed",
      actor_label: "system",
      note: mail.ok
        ? "recipient_type:guest／template_type:full_payment_received／recipient_count:1／provider:tappay／payment_type:credit_card"
        : `recipient_type:guest／template_type:full_payment_received／provider:tappay／payment_type:credit_card／reason:${mail.reason ?? "unknown"}`,

    });
  }

  // ── 民宿／管理者：新團購訂單（已收信用卡訂金）──
  const { data: venueClaim } = await admin
    .from("group_buy_payment_drafts")
    .update({ venue_email_sent_at: nowIso })
    .eq("id", draft.id)
    .is("venue_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (venueClaim) {
    try {
      const { emails: venueEmails, source } = await resolveOrderNotifyEmails(admin, {
        accommodationId: order.accommodation_id ?? draft.accommodation_id,
        campaignId: draft.campaign_id,
      });
      if (venueEmails.length === 0) {
        await admin.from("group_buy_payment_events").insert({
          campaign_id: draft.campaign_id,
          order_id: orderId,
          event_type: "note",
          actor_label: "system",
          note: "venue_email_skipped／recipient_type:venue／template_type:venue_new_order／no_recipients",
        });
      } else {
        const nights = Number((draft.booking_payload as any)?.nights ?? 0) || null;
        const venueMail = await sendGroupBuyEmail(
          venueEmails,
          renderVenueNewOrder({
            ...emailOrder,
            balanceAmount: balance,
            guestPhone: order.guest_phone ?? null,
            guestEmail: order.guest_email ?? null,
            nights,
            adultCount: order.adult_count,
            childCount: order.child_count,
            toddlerCount: order.toddler_count,
            infantCount: order.infant_count,
            paymentStatusText: `已全額收款 NT$${paidAmount.toLocaleString("en-US")}（信用卡）`,
            adminUrl: buildAdminGroupBuyUrl({
              accommodationId: order.accommodation_id ?? draft.accommodation_id ?? null,
              campaignId: draft.campaign_id,
              orderNumber: order.order_number,
            }),
          }, { fullPayment: true }),
        );
        if (!venueMail.ok) {
          await admin.from("group_buy_payment_drafts").update({ venue_email_sent_at: null }).eq("id", draft.id);
        }
        await admin.from("group_buy_payment_events").insert({
          campaign_id: draft.campaign_id,
          order_id: orderId,
          event_type: venueMail.ok ? "email_sent" : "email_failed",
          actor_label: "system",
          note: `recipient_type:venue／template_type:venue_new_order／payment_type:credit_card／recipient_count:${venueEmails.length}／source:${source}${
            venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
          }`,
        });
      }
    } catch (e) {
      console.error("[groupBuyCreditCompletion] venue notify threw", e);
      await admin.from("group_buy_payment_drafts").update({ venue_email_sent_at: null }).eq("id", draft.id);
    }
  }
}

/**
 * 付款成功後建立正式團購訂單。
 * 呼叫前不需自行驗證 TapPay：本函式一律以 transaction/query 為準重新驗證。
 */
export async function completeGroupBuyCreditOrder(
  admin: any,
  params: {
    draftId?: string | null;
    recTradeId?: string | null;
    idempotencyKey?: string | null;
    authCode?: string | null;
    /** 呼叫來源，寫入 audit */
    source: "frontend" | "callback";
  },
): Promise<CompleteResult> {
  const draft = await loadDraft(admin, params);
  if (!draft) return { ok: false, error: "查無此付款資料", status: 404 };

  // 已轉單 → 直接回既有訂單（PaymentResult 重整／callback 重送皆走此路）
  if (draft.converted_order_id) {
    // 不重寄信；僅在「首次完成時寄信失敗／中斷」的情況下由 claim 機制補寄一次
    await sendConversionEmails(admin, draft, draft.converted_order_id, Math.round(Number(draft.amount_to_charge) || 0))
      .catch((e) => console.error("[groupBuyCreditCompletion] email retry threw", e));
    return {
      ok: true,
      alreadyConverted: true,
      orderId: draft.converted_order_id,
      // TECH DEBT: orderNumberOf() 回傳 string | null，與 CompleteResult.orderNumber?: string 型別不符（TS2322，既有問題，非本次引入）。
      // 待整理：改為 orderNumber?: string | null 或在此處 ?? undefined。行為不受影響（呼叫端已容忍 null）。
      orderNumber: await orderNumberOf(admin, draft.converted_order_id),
    };
  }

  const recTradeId = String(params.recTradeId ?? draft.rec_trade_id ?? "").trim();
  if (!recTradeId) return { ok: false, error: "缺少交易編號", status: 400 };

  // ── 1) 一律以 TapPay transaction/query 驗證真實付款結果與金額 ──
  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY") ?? "";
  if (!partnerKey) return { ok: false, error: "付款系統設定錯誤，請聯繫客服", status: 500 };
  const record = await queryTapPayRecord({ partnerKey, recTradeId });
  if (!record.found) return { ok: false, error: "尚未取得付款結果，請稍後再試", status: 409 };
  const paidOk = record.recordStatus === 0 || record.recordStatus === 1;
  if (!paidOk) {
    await admin
      .from("group_buy_payment_drafts")
      .update({ status: "failed", rec_trade_id: recTradeId, last_error: `TapPay record_status=${record.recordStatus}` })
      .eq("id", draft.id)
      .is("converted_order_id", null);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: draft.campaign_id,
      order_id: null,
      event_type: "payment_failed",
      amount: draft.amount_to_charge,
      actor_label: "system",
      note: `信用卡付款未成功（draft:${draft.id}／rec_trade_id:${recTradeId}／record_status:${record.recordStatus}）`,
    });
    return { ok: false, error: "付款未成功，未建立訂單", status: 400 };
  }

  const verifiedAmount = Math.round(Number(record.amount) || 0);
  if (verifiedAmount !== Math.round(Number(draft.amount_to_charge) || 0)) {
    await admin
      .from("group_buy_payment_drafts")
      .update({
        status: "manual_review",
        rec_trade_id: recTradeId,
        last_error: `amount mismatch: charged ${verifiedAmount} / expected ${draft.amount_to_charge}`,
      })
      .eq("id", draft.id)
      .is("converted_order_id", null);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: draft.campaign_id,
      order_id: null,
      event_type: "manual_review",
      amount: verifiedAmount,
      actor_label: "system",
      note: `付款金額與應付金額不符，未建單（draft:${draft.id}／實收 ${verifiedAmount}／應收 ${draft.amount_to_charge}）`,
    });
    await notifyAdmins(admin, {
      accommodationId: draft.accommodation_id,
      title: "團購信用卡付款金額不符，未建立訂單",
      description:
        `付款保留 ${draft.id}（交易 ${recTradeId}）實收 NT$${verifiedAmount}，應收 NT$${draft.amount_to_charge}，` +
        `旅客 ${draft.guest_name}／${draft.check_in_date} → ${draft.check_out_date}。TapPay 已付款但未建單，需要人工處理。`,
    });
    return { ok: false, manualReview: true, error: "付款金額與訂單不符，我們已通知客服為您處理", status: 409 };
  }

  // ── 2) 搶佔 draft（互斥）──
  const nowIso = new Date().toISOString();
  let { data: claimed } = await admin
    .from("group_buy_payment_drafts")
    .update({ status: "paid", rec_trade_id: recTradeId, last_error: null })
    .eq("id", draft.id)
    .is("converted_order_id", null)
    .in("status", ["pending", "payment_processing", "failed"])
    .select("*")
    .maybeSingle();

  if (!claimed) {
    // 可能是：(a) 另一方正在建單 (b) 上一次建單中斷
    const fresh = await loadDraft(admin, { draftId: draft.id });
    if (fresh?.converted_order_id) {
      await sendConversionEmails(admin, fresh, fresh.converted_order_id, verifiedAmount)
        .catch((e) => console.error("[groupBuyCreditCompletion] email retry threw", e));
      return {
        ok: true,
        alreadyConverted: true,
        orderId: fresh.converted_order_id,
        // TECH DEBT: 同上（groupBuyCreditCompletion.ts:278）orderNumberOf() string | null vs CompleteResult.orderNumber?: string（TS2322，既有問題，非本次引入）。
        orderNumber: await orderNumberOf(admin, fresh.converted_order_id),
      };
    }
    const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const retry = await admin
      .from("group_buy_payment_drafts")
      .update({ status: "paid", rec_trade_id: recTradeId })
      .eq("id", draft.id)
      .is("converted_order_id", null)
      .eq("status", "paid")
      .lt("updated_at", staleCutoff)
      .select("*")
      .maybeSingle();
    claimed = retry.data ?? null;
    if (!claimed) {
      // 另一方正在處理中：不重複建單
      return { ok: false, error: "付款處理中，請稍候重新整理查看訂單", status: 202 };
    }
  }

  // ── 3) 逾時／庫存規則 ──
  const expired = new Date(claimed.expires_at).getTime() < Date.now();

  const validated = await validateAndPriceGroupBuyBooking(
    admin,
    {
      campaignId: claimed.campaign_id,
      campaignPackageId: claimed.campaign_package_id,
      checkInDate: String(claimed.check_in_date).slice(0, 10),
      checkOutDate: String(claimed.check_out_date).slice(0, 10),
      adultCount: claimed.adult_count,
      childCount: claimed.child_count,
      toddlerCount: claimed.toddler_count,
      infantCount: claimed.infant_count,
      guestName: claimed.guest_name,
      guestPhone: claimed.guest_phone,
      guestEmail: claimed.guest_email,
      guestNote: claimed.guest_note ?? "",
    },
    {
      expectProvider: "tappay",
      excludeDraftId: claimed.id,
      forceRoomTypeId: claimed.room_type_id,
      // 付款已完成，不可再以銷售期間／今天為由拒絕建單；庫存仍會重驗
      skipSaleWindow: true,
    },
  );

  if (!validated.ok) {
    const failReason = (validated as { error?: string }).error ?? "unavailable";

    // 付款成功但無法建單 → 自動全額退款 + 人工處理通知（絕不默默吞掉付款）
    const refund = await refundTapPay(partnerKey, recTradeId, verifiedAmount);
    await admin
      .from("group_buy_payment_drafts")
      .update({
        status: "manual_review",
        refunded_amount: refund.success ? verifiedAmount : 0,
        refund_status: refund.success ? "refunded" : "refund_failed",
        refund_checked_at: new Date().toISOString(),
        last_error: `${expired ? "expired_and_" : ""}unavailable: ${failReason}${
          refund.success ? "／已自動全額退款" : `／自動退款失敗:${refund.msg ?? "unknown"}`
        }`,
      })
      .eq("id", claimed.id)
      .is("converted_order_id", null);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: claimed.campaign_id,
      order_id: null,
      event_type: refund.success ? "refunded" : "manual_review",
      amount: verifiedAmount,
      actor_label: "system",
      note:
        `付款成功但已無法建單（draft:${claimed.id}／${expired ? "保留已逾時／" : ""}原因:${failReason}）${refund.success ? "，已自動全額退款" : `，自動退款失敗：${refund.msg ?? "unknown"}，需人工處理`}`,
    });
    await notifyAdmins(admin, {
      accommodationId: claimed.accommodation_id,
      title: refund.success ? "團購信用卡付款已自動退款" : "團購信用卡付款需人工處理",
      description:
        `付款保留 ${claimed.id}（交易 ${recTradeId}）於付款成功後已無庫存（${claimed.guest_name}／${claimed.check_in_date} → ${claimed.check_out_date}／NT$${verifiedAmount}）。${
          refund.success ? "系統已自動全額退款。" : "自動退款失敗，請立即人工處理。"
        }`,
    });
    return {
      ok: false,
      manualReview: true,
      refunded: refund.success,
      error: refund.success
        ? "很抱歉，該日期在付款完成前已被訂走，款項已全額退回，客服將與您聯繫。"
        : "很抱歉，該日期在付款完成前已被訂走，客服將盡快與您聯繫處理退款。",
      status: 409,
    };
  }

  // ── 4) 原子轉單（金額一律沿用 draft 落地時的快照）──
  const plan = validated.plan;
  plan.total = Math.round(Number(claimed.total_price) || plan.total);
  // 團購信用卡為全額付款：訂金 0、無尾款
  plan.deposit = 0;
  plan.balance = 0;
  plan.priceSnapshot = {
    ...(claimed.price_snapshot ?? plan.priceSnapshot),
    payment_draft_id: claimed.id,
    amount_charged: verifiedAmount,
  };

  const created = await convertGroupBuyDraftToOrderAtomic(admin, plan, {
    paymentProvider: "tappay",
    paymentMethod: "credit_card_3ds",
    fullPayment: true,
    paid: { amount: verifiedAmount, recTradeId, authCode: params.authCode ?? null },
    draftId: claimed.id,
    excludeDraftId: claimed.id,
    extraNoteLines: [
      `[3DS] ${nowIso} - 信用卡全額付款成功 NT$${verifiedAmount} (rec_trade_id: ${recTradeId}${
        params.authCode ? `, auth_code: ${params.authCode}` : ""
      })`,
      `[GroupBuy] payment_draft: ${claimed.id}`,
      expired ? "【系統】付款保留逾時後付款成功，已重新確認庫存並建立訂單" : null,
    ].filter(Boolean) as string[],
    events: [
      {
        campaign_id: claimed.campaign_id,
        event_type: "credit_card_paid",
        amount: verifiedAmount,
        actor_label: params.source === "callback" ? "system(callback)" : "system(frontend)",
        note:
          `信用卡全額付款成功並建立正式訂單（draft:${claimed.id}／rec_trade_id:${recTradeId}／NT$${verifiedAmount}）`,
      },
    ],
  });

  if (!created.ok) {
    const createError = (created as { error?: string }).error ?? "unknown";
    // transaction 已 rollback，不會留下半張 order
    await admin
      .from("group_buy_payment_drafts")
      .update({ status: "manual_review", last_error: createError })
      .eq("id", claimed.id)
      .is("converted_order_id", null);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: claimed.campaign_id,
      order_id: null,
      event_type: "manual_review",
      amount: verifiedAmount,
      actor_label: "system",
      note: `付款成功但建單失敗（draft:${claimed.id}）：${createError}`,
    });
    // B4：一定要有站內通知，不能只留 console / event
    await notifyAdmins(admin, {
      accommodationId: claimed.accommodation_id,
      title: "TapPay 已付款，但正式訂單建立失敗，需要人工處理",
      description:
        `團購活動：${plan.campaign?.title ?? claimed.campaign_id}／Draft ID：${claimed.id}／` +
        `rec_trade_id：${recTradeId}／已付款金額：NT$${verifiedAmount}／` +
        `旅客：${claimed.guest_name}（${claimed.guest_phone}）／日期：${claimed.check_in_date} → ${claimed.check_out_date}／` +
        `錯誤原因：${createError}。TapPay 已付款，但正式訂單建立失敗，需要人工處理。`,
    });
    return { ok: false, manualReview: true, error: "付款成功但訂單建立失敗，客服將盡快與您聯繫", status: 500 };
  }

  const order = created.order;

  // ── 5) 非關鍵副作用：通知信（失敗不影響已完成的付款訂單）──
  await sendConversionEmails(admin, claimed, order.id, verifiedAmount)
    .catch((e) => console.error("[groupBuyCreditCompletion] email threw", e));

  return { ok: true, orderId: order.id, orderNumber: order.order_number };
}
