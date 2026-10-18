// PAYUNi 信用卡（W3）edge function 核心邏輯；依賴注入（DB、PAYUNi 呼叫、副作用）方便以 mock 測試。不記卡號、不 log 解密內容。
// deno-lint-ignore-file no-explicit-any
import type { PayuniCall, PayuniResult, ParseNotifyResult } from "./payuni.ts";
import {
  applyPayuniTradeResult, extractQueryResult, inSweepWindow, maskPayNo, updateTx, isPaymentTimedOut, isTokenExpired, nextMerTradeNo, notifyExecuteTime,
  resolveChargeAmount, resolveIframeDomain, SWEEP_MAX_AGE_MS, TOKEN_TTL_MS, type TradeDeps, type TxRow,
} from "./payuniTrade.ts";
import { PAYUNI_ATM_METHOD, PAYUNI_PAYMENT_METHOD } from "./orderPaymentSuccess.ts";
import { handleRefundTradeNotify, sweepRefunds } from "./payuniRefund.ts";

export interface PayuniTradeDeps extends TradeDeps {
  env: "sandbox" | "production";
  /** PAYUNI_ATM_BANK_TYPE（004／822／013）；未設定為 null */
  atmBankType?: string | null;
  notifyBase: string;
  callPayuni: (call: PayuniCall) => Promise<PayuniResult>;
  now?: () => number;
}
export type Res = { status: number; body: Record<string, unknown> };
export const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
export const ts = (now: number) => String(Math.floor(now / 1000));
const ORDER_COLS = "id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, guest_email, payment_method, created_at";

export async function loadAcc(admin: any, id: string) {
  const { data } = await admin.from("accommodation_info")
    .select("id, name, custom_domain, short_url_alias, payment_provider_active, payuni_mer_id, payuni_mer_status, payuni_payment_tools")
    .eq("id", id).maybeSingle();
  return data;
}
const creditReady = (acc: any) =>
  acc && acc.payment_provider_active === "payuni" && acc.payuni_mer_status === 1 && Number(acc.payuni_payment_tools?.CREDIT) === 1 && !!acc.payuni_mer_id;
const accDomains = (acc: any) => [
  acc?.custom_domain ? String(acc.custom_domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "",
  acc?.short_url_alias ? `${acc.short_url_alias}.lakeze.com` : "",
].filter(Boolean);

// ---------------- payuni-embed-token ----------------
export async function handleEmbedToken(deps: PayuniTradeDeps, body: any, origin: string | null): Promise<Res> {
  const now = deps.now?.() ?? Date.now();
  const orderNumber = String(body?.order_number ?? "");
  const purpose = body?.purpose === "supplement" ? "supplement" : body?.purpose === "booking" ? "booking" : null;
  if (!/^[A-Za-z0-9]{4,20}$/.test(orderNumber) || !purpose) return res(400, { error: "參數不正確" });
  const { data: order } = await deps.admin.from("orders").select(ORDER_COLS).eq("order_number", orderNumber).maybeSingle();
  if (!order || order.order_status === "cancelled") return res(404, { error: "找不到訂單" });
  const acc = await loadAcc(deps.admin, order.accommodation_id);
  if (!creditReady(acc)) return res(400, { error: "此館尚未開通線上刷卡" });
  const iframeDomain = resolveIframeDomain(origin, deps.env, accDomains(acc));
  if (!iframeDomain) return res(400, { error: "付款網域不在允許清單" });

  const kind = purpose === "booking" ? "full" : "addon";
  const { data: txs } = await deps.admin.from("payment_transactions").select("mer_trade_no, kind, status")
    .eq("order_id", order.id).eq("provider", "payuni");
  if (purpose === "booking" && (txs ?? []).some((t: any) => t.kind === "full" && t.status === "paid")) return res(409, { error: "已付款" });
  const amount = resolveChargeAmount(order);
  if (amount <= 0) return res(purpose === "booking" ? 409 : 400, { error: purpose === "booking" ? "已付款" : "無需付款" });
  const merTradeNo = nextMerTradeNo(order.order_number, purpose === "booking" ? "P" : "A", (txs ?? []).map((t: any) => t.mer_trade_no));

  const r = await deps.callPayuni({
    kind: "merchant", merId: acc.payuni_mer_id, path: "/api/iframe/token_get", version: "3.0",
    payload: { MerID: acc.payuni_mer_id, Timestamp: ts(now), IFrameDomain: iframeDomain },
  });
  const sdkToken = r.data?.Token ?? r.data?.SDKToken ?? null;
  if (!r.ok || !sdkToken) return res(502, { error: "取得付款元件失敗", status: r.status, message: r.message ?? null });
  const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString();
  const { error } = await deps.admin.from("payment_transactions").insert({
    order_id: order.id, accommodation_id: order.accommodation_id, provider: "payuni", mer_id: acc.payuni_mer_id,
    mer_trade_no: merTradeNo, kind, payment_type: 1, amount, status: "pending",
    raw_response: { sdk_token: sdkToken, iframe_domain: iframeDomain, token_expired: r.data?.TokenExpired ?? expiresAt, purpose },
    created_at: new Date(now).toISOString(),
  });
  if (error) throw new Error(`payment_transactions insert failed: ${error.message}`);
  return res(200, { sdk_token: sdkToken, env: deps.env === "production" ? "P" : "S", mer_trade_no: merTradeNo, amount, expires_at: expiresAt });
}

async function loadTx(admin: any, merTradeNo: string): Promise<TxRow & { created_at: string; mer_id: string; kind: string } | null> {
  const { data } = await admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("mer_trade_no", merTradeNo).maybeSingle();
  return data ?? null;
}

// ---------------- payuni-card-charge ----------------
export async function handleCardCharge(deps: PayuniTradeDeps, body: any, forwardedFor: string | null): Promise<Res> {
  const now = deps.now?.() ?? Date.now();
  const merTradeNo = String(body?.mer_trade_no ?? "");
  if (!/^[A-Za-z0-9_-]{1,25}$/.test(merTradeNo)) return res(400, { error: "參數不正確" });
  const tx = await loadTx(deps.admin, merTradeNo);
  if (!tx || tx.status !== "pending") return res(409, { ok: false, code: "INVALID_STATE" });
  const raw = tx.raw_response ?? {};
  const cleared = { ...raw };
  delete cleared.sdk_token;
  if (isTokenExpired(tx.created_at, now) || !raw.sdk_token) {
    await updateTx(deps.admin, tx.id, { status: "expired", raw_response: cleared });
    return res(200, { ok: false, code: "TOKEN_EXPIRED" });
  }
  const { data: order } = await deps.admin.from("orders").select(ORDER_COLS).eq("id", tx.order_id).maybeSingle();
  const acc = await loadAcc(deps.admin, tx.accommodation_id);
  if (!order || !creditReady(acc)) return res(400, { ok: false, message: "此館尚未開通線上刷卡" });
  const ip = (forwardedFor ?? "").split(",")[0].trim();
  const payload: Record<string, string | number> = {
    MerID: tx.mer_id, MerTradeNo: tx.mer_trade_no, Token: raw.sdk_token, TradeAmt: tx.amount, Timestamp: ts(now),
    ProdDesc: `${acc.name} 訂房 ${order.order_number}`.slice(0, 550), API3D: 1,
    NotifyURL: `${deps.notifyBase}/payuni-trade-notify`, ReturnURL: `${deps.notifyBase}/payuni-trade-return`,
  };
  if (order.guest_email) payload.UsrMail = order.guest_email;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) payload.UserIP = ip;
  // 搶佔：仍為 pending 且 sdk_token 尚在才清掉並繼續；同時送出的另一個請求搶不到 → 409（Token 只能用一次）
  const { data: claimed, error: claimErr } = await deps.admin.from("payment_transactions")
    .update({ raw_response: cleared, updated_at: new Date(now).toISOString() })
    .eq("id", tx.id).eq("status", "pending").not("raw_response->>sdk_token", "is", null).select("id").maybeSingle();
  if (claimErr) throw new Error(`payment_transactions claim failed: ${claimErr.message}`);
  if (!claimed) return res(409, { ok: false, code: "INVALID_STATE" });
  const r = await deps.callPayuni({ kind: "merchant", merId: tx.mer_id, path: "/api/iframe/merchant_trade", version: "1.0", payload });
  const d = r.data ?? {};
  if (r.ok && d.URL) return res(200, { ok: true, redirect_url: d.URL });
  if (r.ok && String(d.TradeStatus) === "1") {
    await applyPayuniTradeResult(deps, { ...tx, raw_response: cleared }, d);
    return res(200, { ok: true, paid: true });
  }
  if (r.status === "UNKNOWN") {
    await updateTx(deps.admin, tx.id, { status: "unknown", raw_response: { ...cleared, last_status: r.status } });
    return res(200, { ok: true, pending: true });
  }
  await updateTx(deps.admin, tx.id, { status: "failed", raw_response: { ...cleared, last_status: r.status, last_message: r.message ?? null } });
  return res(200, { ok: false, message: r.message ?? "付款失敗" });
}

// ---------------- payuni-trade-return ----------------
export const RETURN_ERROR_URL = "https://booking.lakeze.com/payment-result?error=1";
export async function handleTradeReturn(admin: any, parsed: ParseNotifyResult): Promise<Response> {
  const go = (url: string) => new Response(null, { status: 303, headers: { Location: url } });
  if (!parsed.ok) return go(RETURN_ERROR_URL);
  const tx = await loadTx(admin, String(parsed.data.MerTradeNo ?? ""));
  const domain = tx?.raw_response?.iframe_domain;
  if (!tx || typeof domain !== "string" || !/^https?:\/\/[^/?#]+$/.test(domain)) return go(RETURN_ERROR_URL);
  const { data: order } = await admin.from("orders").select("order_number").eq("id", tx.order_id).maybeSingle();
  if (!order) return go(RETURN_ERROR_URL);
  return go(`${domain}/payment-result?order=${encodeURIComponent(order.order_number)}&tx=${encodeURIComponent(tx.mer_trade_no)}`);
}

// ---------------- payuni-trade-notify ----------------
const okText = () => new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
export async function handleTradeNotify(deps: PayuniTradeDeps, parsed: ParseNotifyResult): Promise<Response> {
  const outer = parsed.ok ? parsed.outer : (parsed.outer ?? {});
  const data = parsed.ok ? parsed.data : null;
  const tsv = String(data?.TradeStatus ?? "");
  const isRefund = data?.RefundStatus != null || data?.RefundAmt != null;
  const notifyType = isRefund ? "refund" : data?.PayNo && tsv === "1" ? "atm_paid" : tsv === "4" ? "expired" : "credit";
  const { data: ev, error: insErr } = await deps.admin.from("payuni_notify_events").insert({
    source: "trade", notify_type: notifyType, mer_id: data?.MerID ?? outer.MerID ?? null, trade_no: data?.TradeNo ?? null,
    execute_time: data ? notifyExecuteTime(data) : null, hash_valid: parsed.ok || parsed.reason === "DECRYPT_FAILED",
    payload_raw: outer, decrypted: data, processed: false, process_error: parsed.ok ? null : parsed.reason,
  }).select("id").single();
  if (insErr) {
    if (insErr.code !== "23505") console.error(`[payuni-trade-notify] event insert failed: ${insErr.message}`);
    return okText();
  }
  if (!data) return okText();
  let processed = false;
  let processError: string | null = null;
  try {
    const tx = await loadTx(deps.admin, String(data.MerTradeNo ?? ""));
    const refund = tx ? await handleRefundTradeNotify(deps, tx, data) : null;
    if (!tx) processError = "UNKNOWN_TRADE";
    else if (refund) {
      processed = refund.processed;
      processError = refund.error;
    } else {
      const r = await applyPayuniTradeResult(deps, tx, data);
      processed = true;
      processError = r.error ?? null;
    }
  } catch (e) {
    processError = e instanceof Error ? e.message.slice(0, 500) : "UNKNOWN_ERROR";
  }
  await deps.admin.from("payuni_notify_events").update({ processed, process_error: processError }).eq("id", ev.id);
  return okText();
}

// ---------------- payuni-trade-query ----------------
export { extractQueryResult };

async function queryAndApply(deps: PayuniTradeDeps, tx: any, now: number) {
  const r = await deps.callPayuni({
    kind: "merchant", merId: tx.mer_id, path: "/api/trade/query", version: "2.0",
    payload: { MerID: tx.mer_id, MerTradeNo: tx.mer_trade_no, Timestamp: ts(now) },
  });
  const q = r.ok ? extractQueryResult(r.data) : null;
  if (!q) return { ok: false as const, status: r.status };
  const applied = await applyPayuniTradeResult(deps, tx, q);
  return { ok: true as const, trade_status: q.TradeStatus ?? null, close_status: q.CloseStatus ?? null, refund_status: q.RefundStatus ?? null, tx_status: applied.status };
}

export async function handleTradeQuery(
  deps: PayuniTradeDeps, body: any,
  caller: { isService: boolean; isSuperAdmin: boolean; isAccommodationAdmin: (id: string) => Promise<boolean> },
): Promise<Res> {
  const now = deps.now?.() ?? Date.now();
  if (body?.action === "sweep") {
    if (!caller.isService) return res(403, { error: "Forbidden" });
    return res(200, await sweep(deps, now));
  }
  if (body?.action === "list") {
    // PaymentAudit：該館 PAYUNi 交易（異常、pending、unknown、所有 ATM，近 30 天）
    const accId = String(body?.accommodation_id ?? "");
    if (!accId || (!caller.isSuperAdmin && !(await caller.isAccommodationAdmin(accId)))) return res(403, { error: "Forbidden" });
    const { data } = await deps.admin.from("payment_transactions").select("mer_trade_no, amount, status, payment_type, kind, refund_source, refund_pending_reason, raw_response, notified_at, created_at")
      .eq("provider", "payuni").eq("accommodation_id", accId).gte("created_at", new Date(now - 30 * 86400000).toISOString());
    const rows = (data ?? [])
      .filter((t: any) => t.raw_response?.anomaly || t.status === "pending" || t.status === "unknown" || Number(t.payment_type) === 2 || t.kind === "refund")
      .map((t: any) => ({
        mer_trade_no: t.mer_trade_no, amount: t.amount, status: t.status, anomaly: t.raw_response?.anomaly ?? null, created_at: t.created_at,
        ...(t.kind === "refund" ? {
          refund: { action: t.raw_response?.action ?? null, reason: t.refund_pending_reason ?? null, source: t.refund_source ?? null, stale_alerted: !!t.raw_response?.stale_alerted },
        } : {}),
        ...(Number(t.payment_type) === 2 && t.kind !== "refund" ? {
          atm: {
            pay_no: maskPayNo(t.raw_response?.PayNo), bank_type: t.raw_response?.BankType ?? null, expire_at: t.raw_response?.expire_at ?? null,
            paid_at: t.status === "paid" ? (t.notified_at ?? null) : null, account5: t.raw_response?.account5 ?? null,
          },
        } : {}),
      }))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    return res(200, { ok: true, rows });
  }
  const tx = await loadTx(deps.admin, String(body?.mer_trade_no ?? ""));
  if (!tx) return res(404, { error: "找不到交易" });
  if (body?.action === "status") {
    // 付款結果頁輪詢：只回狀態，不含個資（權限等級同 embed-token／card-charge）
    const { data: o } = await deps.admin.from("orders").select("order_number, payment_status, order_status, final_price, paid_amount").eq("id", tx.order_id).maybeSingle();
    if (!o || o.order_number !== String(body?.order_number ?? "")) return res(404, { error: "找不到交易" });
    return res(200, {
      tx_status: tx.status, payment_status: o.payment_status, order_status: o.order_status,
      amount_due: resolveChargeAmount(o), accommodation_id: tx.accommodation_id,
    });
  }
  if (!caller.isSuperAdmin && !(await caller.isAccommodationAdmin(tx.accommodation_id))) return res(403, { error: "Forbidden" });
  if (tx.kind === "refund") return res(400, { error: "退款列請查詢原付款交易" });
  return res(200, await queryAndApply(deps, tx, now));
}

async function sweep(deps: PayuniTradeDeps, now: number) {
  const since = new Date(now - SWEEP_MAX_AGE_MS).toISOString();
  const { data: txs } = await deps.admin.from("payment_transactions").select("*")
    .eq("provider", "payuni").neq("kind", "refund").in("status", ["pending", "unknown"]).gte("created_at", since);
  const queryFailed = new Set<string>();
  const queriedIds = new Set<string>();
  let queried = 0;
  for (const tx of (txs ?? []).filter((t: any) => inSweepWindow(t.created_at, now))) {
    queried++;
    queriedIds.add(tx.id);
    try {
      const r = await queryAndApply(deps, tx, now);
      if (!r.ok) queryFailed.add(tx.order_id);
    } catch (e) {
      queryFailed.add(tx.order_id);
      console.error(`[payuni-sweep] query ${tx.mer_trade_no} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 逾時取消：PAYUNi 待付款訂單，以最後一次付款嘗試起算 30 分鐘；有 paid／unknown 或本輪查詢失敗就不取消。
  // ATM 單只處理尚無虛擬帳號者（已有 atm_vacc_no 的交給 cancel-expired-atm-orders）
  const { data: orders } = await deps.admin.from("orders").select("id, order_number, notes, created_at, payment_status, paid_amount, payment_method, atm_vacc_no")
    .in("payment_method", [PAYUNI_PAYMENT_METHOD, PAYUNI_ATM_METHOD]).eq("payment_status", "pending_payment").neq("order_status", "cancelled")
    .gte("created_at", new Date(now - 2 * SWEEP_MAX_AGE_MS).toISOString());
  const cancelled: string[] = [];
  for (const o of orders ?? []) {
    if (o.payment_method === PAYUNI_ATM_METHOD && o.atm_vacc_no) continue;
    if (queryFailed.has(o.id) || Number(o.paid_amount || 0) > 0) continue;
    const loadList = async () => (await deps.admin.from("payment_transactions").select("*").eq("order_id", o.id).eq("provider", "payuni")).data ?? [];
    let all = await loadList();
    const latest = all.map((t: any) => t.created_at).sort().pop() ?? o.created_at;
    if (!isPaymentTimedOut(latest, now)) continue;
    // 取消前：本輪沒查過的 pending 交易（含 24 小時外；ATM 另含 unknown 取號交易）補查一次；查詢失敗就不取消
    let skip = false;
    const needsQuery = (t: any) => t.status === "pending" || (Number(t.payment_type) === 2 && t.status === "unknown");
    for (const t of all.filter((t: any) => needsQuery(t) && !queriedIds.has(t.id))) {
      try {
        if (!(await queryAndApply(deps, t, now)).ok) skip = true;
      } catch { skip = true; }
    }
    if (skip) continue;
    all = await loadList();
    if (all.some((t: any) => t.status === "paid" || t.status === "unknown")) continue;
    const { data: fresh } = await deps.admin.from("orders").select("id, notes, payment_status, order_status, paid_amount, atm_vacc_no").eq("id", o.id).maybeSingle();
    if (fresh?.atm_vacc_no) continue;
    if (!fresh || fresh.payment_status !== "pending_payment" || fresh.order_status === "cancelled" || Number(fresh.paid_amount || 0) > 0) continue;
    const iso = new Date(now).toISOString();
    const note = `[PAYUNi payment_timeout] ${iso} - 最後一次付款嘗試逾 30 分鐘未完成，系統自動取消`;
    const { error: cancelErr } = await deps.admin.rpc("update_order_with_context", {
      p_order_id: o.id,
      p_patch: { order_status: "cancelled", cancelled_at: iso, notes: fresh.notes ? `${fresh.notes}\n${note}` : note },
      p_source: "payuni_payment_timeout",
      p_reason: "PAYUNi 付款逾時（最後一次付款嘗試逾 30 分鐘）",
      p_actor_label: "PAYUNi",
      p_actor_type: "system",
    });
    if (cancelErr) {
      console.error(`[payuni-sweep] cancel ${o.order_number} failed: ${cancelErr.message}`);
      continue;
    }
    for (const t of all.filter((t: any) => t.status === "pending")) await updateTx(deps.admin, t.id, { status: "expired" });
    cancelled.push(o.order_number);
    console.log(`[payuni-sweep] payment_timeout cancelled ${o.order_number}`);
  }

  // 超過 24 小時仍 unknown：每筆只告警一次，請總部至稽核頁手動查詢
  const { data: stale } = await deps.admin.from("payment_transactions").select("*")
    .eq("provider", "payuni").neq("kind", "refund").eq("status", "unknown").lt("created_at", since);
  const staleAlerted: string[] = [];
  for (const t of (stale ?? []).filter((t: any) => !t.raw_response?.stale_alerted)) {
    try {
      const sent = await deps.sendAlert(`[PAYUNi] 交易狀態未明逾 24 小時 ${t.mer_trade_no}`,
        `<p>MerTradeNo ${t.mer_trade_no}（NT$${t.amount}）建立超過 24 小時仍為 unknown，系統不再自動查詢，請至付款稽核頁手動查詢。</p>`);
      if (sent === false) continue;
    } catch (e) {
      console.error(`[payuni-sweep] stale alert ${t.mer_trade_no} failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    await updateTx(deps.admin, t.id, { raw_response: { ...(t.raw_response ?? {}), stale_alerted: true } });
    staleAlerted.push(t.mer_trade_no);
  }
  let refunds: Record<string, unknown> = {};
  try {
    refunds = await sweepRefunds(deps, now);
  } catch (e) {
    console.error(`[payuni-sweep] refund sweep failed: ${e instanceof Error ? e.message : e}`);
  }
  return { ok: true, queried, cancelled, staleAlerted, ...refunds };
}
