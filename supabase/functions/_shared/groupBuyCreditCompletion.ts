// 團購信用卡「付款成功 → 建立正式訂單」安全內核（Phase G2）
//
// 同時被兩條路徑呼叫，必須保證同一張 draft 最多只會轉出一張正式 orders：
//   A. 前端 3DS 回程：group-buy-complete-paid-order
//   B. TapPay backend callback：tappay-notify（客人關掉瀏覽器的補救）
//
// 競態防護：以「條件式 UPDATE 搶佔（claim）」達成互斥 —
//   claim 只允許 status ∈ (pending, payment_processing, failed) → 'paid'
//   搶到的那一方才可建單；另一方會拿到 0 rows，改為等待／回報既有結果。
//   DB 端另有 unique index group_buy_payment_drafts_converted_order_key 作為最後防線。
// deno-lint-ignore-file no-explicit-any

import { createGroupBuyOrderCore, validateAndPriceGroupBuyBooking } from "./groupBuyBooking.ts";
import { queryTapPayRecord, refundTapPay } from "./tappay.ts";

/** 搶佔後若超過此時間仍未完成建單，視為前一次處理中斷，允許重新搶佔 */
const STALE_CLAIM_MS = 3 * 60_000;

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
    return {
      ok: true,
      alreadyConverted: true,
      orderId: draft.converted_order_id,
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
      return {
        ok: true,
        alreadyConverted: true,
        orderId: fresh.converted_order_id,
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
    // 付款成功但無法建單 → 自動全額退款 + 人工處理通知（絕不默默吞掉付款）
    const refund = await refundTapPay(partnerKey, recTradeId, verifiedAmount);
    await admin
      .from("group_buy_payment_drafts")
      .update({
        status: "manual_review",
        last_error: `${expired ? "expired_and_" : ""}unavailable: ${validated.error}${
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
        `付款成功但已無法建單（draft:${claimed.id}／${expired ? "保留已逾時／" : ""}原因:${validated.error}）${refund.success ? "，已自動全額退款" : `，自動退款失敗：${refund.msg ?? "unknown"}，需人工處理`}`,
    });
    try {
      await admin.from("notifications").insert({
        accommodation_id: claimed.accommodation_id,
        type: "payment",
        title: refund.success ? "團購信用卡付款已自動退款" : "團購信用卡付款需人工處理",
        description:
          `付款保留 ${claimed.id} 於付款成功後已無庫存（${claimed.check_in_date} → ${claimed.check_out_date}，NT$${verifiedAmount}）。${
            refund.success ? "系統已自動全額退款。" : "自動退款失敗，請立即人工處理。"
          }`,
        is_read: false,
      });
    } catch (nErr) {
      console.error("[groupBuyCreditCompletion] notification insert failed", nErr);
    }
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

  // ── 4) 建立正式訂單（金額一律沿用 draft 落地時的快照）──
  const plan = validated.plan;
  plan.total = Math.round(Number(claimed.total_price) || plan.total);
  plan.deposit = Math.round(Number(claimed.deposit_amount) || plan.deposit);
  plan.balance = Math.max(0, plan.total - plan.deposit);
  plan.priceSnapshot = {
    ...(claimed.price_snapshot ?? plan.priceSnapshot),
    payment_draft_id: claimed.id,
    amount_charged: verifiedAmount,
  };

  const created = await createGroupBuyOrderCore(admin, plan, {
    paymentProvider: "tappay",
    paymentMethod: "credit_card_3ds",
    paid: { amount: verifiedAmount, recTradeId, authCode: params.authCode ?? null },
    draftId: claimed.id,
    excludeDraftId: claimed.id,
    extraNoteLines: [
      `[3DS] ${nowIso} - 信用卡訂金付款成功 NT$${verifiedAmount} (rec_trade_id: ${recTradeId}${
        params.authCode ? `, auth_code: ${params.authCode}` : ""
      })`,
      `[GroupBuy] payment_draft: ${claimed.id}`,
      expired ? "【系統】付款保留逾時後付款成功，已重新確認庫存並建立訂單" : null,
    ].filter(Boolean) as string[],
  });

  if (!created.ok) {
    await admin
      .from("group_buy_payment_drafts")
      .update({ status: "manual_review", last_error: created.error })
      .eq("id", claimed.id)
      .is("converted_order_id", null);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: claimed.campaign_id,
      order_id: null,
      event_type: "manual_review",
      amount: verifiedAmount,
      actor_label: "system",
      note: `付款成功但建單失敗（draft:${claimed.id}）：${created.error}`,
    });
    return { ok: false, manualReview: true, error: "付款成功但訂單建立失敗，客服將盡快與您聯繫", status: 500 };
  }

  const order = created.order;

  // ── 5) draft → converted（unique index 保證一張 draft 只對應一張 order）──
  const { error: convErr } = await admin
    .from("group_buy_payment_drafts")
    .update({
      status: "converted",
      converted_order_id: order.id,
      converted_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", claimed.id)
    .is("converted_order_id", null);
  if (convErr) console.error("[groupBuyCreditCompletion] draft convert update failed", convErr);

  await admin.from("group_buy_payment_events").insert({
    campaign_id: claimed.campaign_id,
    order_id: order.id,
    event_type: "credit_card_paid",
    amount: verifiedAmount,
    actor_label: params.source === "callback" ? "system(callback)" : "system(frontend)",
    note:
      `信用卡訂金付款成功並建立正式訂單（draft:${claimed.id}／rec_trade_id:${recTradeId}／NT$${verifiedAmount}）`,
  });

  return { ok: true, orderId: order.id, orderNumber: order.order_number };
}
