// PAYUNi ATM 虛擬帳號（W4）：取號規則與 payuni-atm-create 核心邏輯（依賴注入，mock 可測）
// deno-lint-ignore-file no-explicit-any
import { nextMerTradeNo, resolveChargeAmount, updateTx } from "./payuniTrade.ts";
import { loadAcc, res, ts, type PayuniTradeDeps, type Res } from "./payuniTradeHandlers.ts";

export const PAYUNI_ATM_MAX_AMOUNT = 30000;
export const ATM_DEPOSIT_DEADLINE_MS = 20 * 60 * 1000;
export const ATM_SUPPLEMENT_DAYS = 3;
export const ATM_BANK_NAMES: Record<string, string> = { "004": "臺灣銀行", "822": "中國信託商業銀行", "013": "國泰世華商業銀行" };
export const ATM_OVER_LIMIT_MESSAGE = "金額超過 ATM 單筆上限，請改用信用卡";
export type AtmPurpose = "deposit" | "supplement" | "final";

const taipei = (ms: number) => {
  const d = new Date(ms + 8 * 3600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

/** PAYUNi ExpireDate 只到日期：訂金 20 分鐘制，台北 23:40 之後取隔天，避免 PAYUNi 截止早於本地期限 */
export function atmDeadlines(purpose: AtmPurpose, now: number): { expireDate: string; expireAt: string } {
  if (purpose === "deposit") {
    const t = taipei(now);
    const expireDate = t.minutes >= 23 * 60 + 40 ? taipei(now + 86400_000).date : t.date;
    return { expireDate, expireAt: new Date(now + ATM_DEPOSIT_DEADLINE_MS).toISOString() };
  }
  const expireDate = taipei(now + ATM_SUPPLEMENT_DAYS * 86400_000).date;
  return { expireDate, expireAt: new Date(`${expireDate}T23:59:59+08:00`).toISOString() };
}

const atmReady = (acc: any) =>
  acc && acc.payment_provider_active === "payuni" && acc.payuni_mer_status === 1 && Number(acc.payuni_payment_tools?.ATM) === 1 && !!acc.payuni_mer_id;

function view(tx: any, order: any) {
  const raw = tx.raw_response ?? {};
  const bank = String(raw.BankType ?? "");
  const unpaidAfter = Number(order.final_price) - Number(order.paid_amount || 0) - Number(tx.amount);
  return {
    ok: true, mer_trade_no: tx.mer_trade_no, bank_code: bank, bank_name: ATM_BANK_NAMES[bank] ?? null, pay_no: raw.PayNo,
    amount: tx.amount, expire_at: raw.expire_at, balance_on_site: tx.kind === "deposit" ? Math.max(0, unpaidAfter) : 0,
  };
}

const ORDER_COLS = "id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, guest_email, booking_deposit_amount, notes";

export async function handleAtmCreate(deps: PayuniTradeDeps, body: any): Promise<Res> {
  const now = deps.now?.() ?? Date.now();
  const orderNumber = String(body?.order_number ?? "");
  const purpose = (["deposit", "supplement", "final"] as const).find((p) => p === body?.purpose);
  if (!/^[A-Za-z0-9]{4,20}$/.test(orderNumber) || !purpose) return res(400, { error: "參數不正確" });
  const { data: order } = await deps.admin.from("orders").select(ORDER_COLS).eq("order_number", orderNumber).maybeSingle();
  if (!order || order.order_status === "cancelled") return res(404, { error: "找不到訂單" });
  const acc = await loadAcc(deps.admin, order.accommodation_id);
  if (!atmReady(acc)) return res(400, { error: "此館尚未開通 ATM" });
  const bankType = deps.atmBankType ?? "";
  if (!ATM_BANK_NAMES[bankType]) {
    console.error("[payuni-atm-create] PAYUNI_ATM_BANK_TYPE 未設定或不在 004／822／013");
    return res(500, { error: "ATM 代收銀行未設定" });
  }

  const { data: txs } = await deps.admin.from("payment_transactions").select("*").eq("order_id", order.id).eq("provider", "payuni");
  const atmPending = (txs ?? []).filter((t: any) => Number(t.payment_type) === 2 && t.status === "pending" && t.raw_response?.PayNo);
  // 一張訂單同時只有一組有效虛擬帳號
  const live = atmPending.find((t: any) => Date.parse(t.raw_response?.expire_at ?? "") > now);
  if (live) return res(200, { ...view(live, order), reused: true });

  const unpaid = resolveChargeAmount(order);
  let amount = unpaid;
  if (purpose === "deposit") {
    if (Number(order.paid_amount || 0) > 0) return res(409, { error: "已付款" });
    const dep = Number(order.booking_deposit_amount || 0);
    if (dep > 0) amount = Math.min(dep, unpaid);
  }
  if (amount <= 0) return res(400, { error: "無需付款" });
  if (amount > PAYUNI_ATM_MAX_AMOUNT) return res(400, { error: ATM_OVER_LIMIT_MESSAGE });
  const kind = purpose === "deposit" ? (amount >= Number(order.final_price) ? "full" : "deposit") : purpose === "final" ? "final" : "addon";
  const prefix = purpose === "deposit" ? "D" : purpose === "final" ? "F" : "A";

  for (const t of atmPending) await updateTx(deps.admin, t.id, { status: "expired" });
  const merTradeNo = nextMerTradeNo(order.order_number, prefix, (txs ?? []).map((t: any) => t.mer_trade_no));
  const { expireDate, expireAt } = atmDeadlines(purpose, now);
  const nowIso = new Date(now).toISOString();
  const { data: ins, error: insErr } = await deps.admin.from("payment_transactions").insert({
    order_id: order.id, accommodation_id: order.accommodation_id, provider: "payuni", mer_id: acc.payuni_mer_id,
    mer_trade_no: merTradeNo, kind, payment_type: 2, amount, status: "pending",
    raw_response: { purpose, BankType: bankType, expire_at: expireAt }, created_at: nowIso,
  }).select("id").single();
  if (insErr) {
    if (insErr.code === "23505") return res(409, { error: "取號中，請稍後再試" });
    throw new Error(`payment_transactions insert failed: ${insErr.message}`);
  }

  const desc = kind === "deposit" ? "訂房訂金" : kind === "full" ? "訂房款" : "訂房補款";
  const payload: Record<string, string | number> = {
    MerID: acc.payuni_mer_id, MerTradeNo: merTradeNo, TradeAmt: amount, Timestamp: ts(now), BankType: bankType, PaySet: 1,
    ExpireDate: expireDate, ProdDesc: `${acc.name} ${desc} ${order.order_number}`.slice(0, 550),
    NotifyURL: `${deps.notifyBase}/payuni-trade-notify`,
  };
  if (order.guest_email) payload.UsrMail = order.guest_email;
  const r = await deps.callPayuni({ kind: "merchant", merId: acc.payuni_mer_id, path: "/api/atm", version: "1.3", payload });
  const d = r.data ?? {};
  if (r.status === "UNKNOWN") {
    await updateTx(deps.admin, ins.id, { status: "unknown", raw_response: { purpose, BankType: bankType, expire_at: expireAt, last_status: r.status } });
    return res(200, { ok: false, message: "取號結果未明，請稍後再試" });
  }
  if (!r.ok || !d.PayNo || (d.TradeStatus != null && String(d.TradeStatus) !== "0")) {
    await updateTx(deps.admin, ins.id, { status: "failed", raw_response: { purpose, BankType: bankType, last_status: r.status, last_message: r.message ?? null } });
    return res(200, { ok: false, message: r.message ?? "取號失敗" });
  }
  const bank = String(d.BankType ?? bankType);
  const raw = { purpose, BankType: bank, PayNo: String(d.PayNo), ExpireDate: d.ExpireDate ?? expireDate, expire_at: expireAt };
  await updateTx(deps.admin, ins.id, { provider_trade_no: d.TradeNo ?? null, raw_response: raw });
  const note = `[PAYUNi ATM] ${nowIso} - 已開立虛擬帳號 ${bank}-${maskTail(raw.PayNo)}，NT$${amount}，本地期限 ${expireAt}（MerTradeNo: ${merTradeNo}）`;
  const { error: upErr } = await deps.admin.from("orders").update({
    atm_vacc_no: raw.PayNo, atm_vacc_bank_code: bank, atm_expire_at: expireAt, payment_link_created_at: nowIso,
    notes: order.notes ? `${order.notes}\n${note}` : note, updated_at: nowIso,
  }).eq("id", order.id);
  if (upErr) console.error(`[payuni-atm-create] order update failed: ${upErr.message}`);
  try { await deps.effects.sendAtmCreated(order.id); } catch (e) {
    console.error(`[payuni-atm-create] email failed: ${e instanceof Error ? e.message : e}`);
  }
  return res(200, view({ mer_trade_no: merTradeNo, kind, amount, raw_response: raw }, order));
}

const maskTail = (v: string) => `****${v.slice(-4)}`;
