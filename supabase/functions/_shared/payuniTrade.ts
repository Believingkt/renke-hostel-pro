// PAYUNi 信用卡（W3）純規則與交易結果套用（applyPayuniTradeResult，冪等；card-charge／notify／query 共用）
// deno-lint-ignore-file no-explicit-any
import { applyOrderPaymentSuccess, type PaymentSuccessEffects } from "./orderPaymentSuccess.ts";

export type PayuniTradeKind = "P" | "A";
export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
export const SWEEP_MIN_AGE_MS = 15 * 60 * 1000;
export const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 與 packages/shared/src/utils/paymentDomain.ts 的 LIVE_DOMAINS 相同（Vitest 比對） */
export const PAYUNI_LIVE_DOMAINS = ["booking.lakeze.com", "hq.lakeze.com", "renke-hostel-pro.lovable.app"];
const SANDBOX_HOST_RE = /(^localhost$)|(\.emergentagent\.com$)/;

/** IFrameDomain：只接受 https 且在允許清單（sandbox 另允許預覽網域；localhost 可 http） */
export function resolveIframeDomain(origin: string | null | undefined, env: string, accDomains: string[] = []): string | null {
  if (!origin) return null;
  let u: URL;
  try { u = new URL(origin); } catch { return null; }
  if (u.origin !== origin.replace(/\/$/, "")) return null;
  const host = u.hostname.toLowerCase();
  const sandboxOk = env === "sandbox" && SANDBOX_HOST_RE.test(host);
  if (u.protocol !== "https:" && !(sandboxOk && host === "localhost")) return null;
  const live = PAYUNI_LIVE_DOMAINS.includes(host) || accDomains.map((d) => d.toLowerCase()).includes(host);
  return live || sandboxOk ? u.origin : null;
}

/** MerTradeNo = {order_number}-{kind}{n}；n = 同前綴既有最大值 + 1 */
export function nextMerTradeNo(orderNumber: string, kind: PayuniTradeKind, existing: string[]): string {
  const prefix = `${orderNumber}-${kind}`;
  let max = 0;
  for (const m of existing) {
    if (m.startsWith(prefix) && /^\d+$/.test(m.slice(prefix.length))) max = Math.max(max, Number(m.slice(prefix.length)));
  }
  const no = `${prefix}${max + 1}`;
  if (no.length > 25 || !/^[A-Za-z0-9_-]+$/.test(no)) throw new Error("MerTradeNo 格式不符");
  return no;
}

/** 金額一律由後端：booking = 應付全額（未付清部分）；supplement = final_price − paid_amount */
export function resolveChargeAmount(order: { final_price: number; paid_amount: number | null }): number {
  return Math.max(0, Math.round(Number(order.final_price) - Number(order.paid_amount || 0)));
}

export function isTokenExpired(createdAtIso: string, now = Date.now()): boolean {
  return now - Date.parse(createdAtIso) > TOKEN_TTL_MS;
}

/** sweep 篩選：建立超過 15 分鐘、24 小時內的 pending／unknown */
export function inSweepWindow(createdAtIso: string, now = Date.now()): boolean {
  const age = now - Date.parse(createdAtIso);
  return age >= SWEEP_MIN_AGE_MS && age <= SWEEP_MAX_AGE_MS;
}

/** 逾時以「最後一次付款嘗試」起算 30 分鐘 */
export function isPaymentTimedOut(latestAttemptIso: string, now = Date.now()): boolean {
  return now - Date.parse(latestAttemptIso) > PAYMENT_TIMEOUT_MS;
}

export function notifyExecuteTime(d: Record<string, string>): string | null {
  if (d.AuthDay || d.AuthTime) return `${d.AuthDay ?? ""}${d.AuthTime ?? ""}` || null;
  return d.PayTime ?? null;
}

export interface TradeDeps {
  admin: any;
  effects: PaymentSuccessEffects;
  sendAlert: (subject: string, html: string) => Promise<unknown>;
}

export interface TxRow {
  id: string;
  order_id: string;
  accommodation_id: string;
  mer_trade_no: string;
  amount: number;
  status: string;
  raw_response: Record<string, any> | null;
}

const nowIso = () => new Date().toISOString();

export async function updateTx(admin: any, id: string, values: Record<string, unknown>) {
  // 已 paid 的交易不可被改成 failed／cancelled／unknown／expired
  const { error } = await admin.from("payment_transactions").update({ ...values, updated_at: nowIso() }).eq("id", id).neq("status", "paid");
  if (error) throw new Error(`payment_transactions update failed: ${error.message}`);
}

/** 依 PAYUNi 交易結果（TradeStatus）更新交易列與訂單；已 paid 的交易不重做任何事 */
export async function applyPayuniTradeResult(deps: TradeDeps, tx: TxRow, data: Record<string, string>): Promise<{ status: string; changed: boolean }> {
  if (tx.status === "paid") return { status: "paid", changed: false };
  const ts = String(data.TradeStatus ?? "");
  const raw: Record<string, any> = { ...(tx.raw_response ?? {}), last_status: data.Status ?? null, last_message: data.Message ?? null, trade_status: ts };
  delete raw.sdk_token;

  if (ts === "1" && (data.TradeAmt == null || String(data.TradeAmt).trim() === "")) {
    // 缺 TradeAmt 不入帳，等 Notify 或 sweep
    await updateTx(deps.admin, tx.id, { raw_response: { ...raw, awaiting_notify: true } });
    return { status: tx.status, changed: false };
  }
  if (ts === "1") {
    const paidAmt = Number(data.TradeAmt);
    const fields = {
      status: "paid",
      provider_trade_no: data.TradeNo ?? null,
      card_first6: data.Card6No ?? null,
      card_last4: data.Card4No ?? null,
      auth_code: data.AuthCode ?? null,
      notified_at: nowIso(),
    };
    const mismatch = paidAmt !== Number(tx.amount);
    // 以「非 paid 才更新」搶佔，避免 card-charge 與 Notify 同時入帳兩次
    const { data: claimed, error: claimErr } = await deps.admin.from("payment_transactions")
      .update({ ...fields, raw_response: mismatch ? { ...raw, anomaly: `AMOUNT_MISMATCH expected=${tx.amount} got=${data.TradeAmt}` } : raw, updated_at: nowIso() })
      .eq("id", tx.id).neq("status", "paid").select("id").maybeSingle();
    if (claimErr) throw new Error(`payment_transactions update failed: ${claimErr.message}`);
    if (!claimed) return { status: "paid", changed: false };
    if (mismatch) {
      await deps.admin.from("notifications").insert({
        accommodation_id: tx.accommodation_id, type: "payment", title: "PAYUNi 付款金額異常",
        description: `交易 ${tx.mer_trade_no} 應付 NT$${tx.amount}，PAYUNi 回報 NT$${data.TradeAmt}，訂單未自動確認，請人工核對。`,
        order_id: tx.order_id, is_read: false,
      });
      await deps.sendAlert(`[PAYUNi] 付款金額異常 ${tx.mer_trade_no}`,
        `<p>MerTradeNo ${tx.mer_trade_no}：應付 NT$${tx.amount}，PAYUNi 回報 NT$${String(data.TradeAmt ?? "")}。訂單未自動確認。</p>`)
        .catch((e) => console.error(`[payuniTrade] alert failed: ${e instanceof Error ? e.message : e}`));
      return { status: "paid", changed: true };
    }
    const { data: order, error } = await deps.admin.from("orders")
      .select("id, order_number, final_price, paid_amount, payment_status, order_status, notes, discount_code")
      .eq("id", tx.order_id).maybeSingle();
    if (error || !order) throw new Error(`order read failed: ${error?.message ?? "not found"}`);
    await applyOrderPaymentSuccess(deps.admin, deps.effects, order, paidAmt,
      { merTradeNo: tx.mer_trade_no, tradeNo: data.TradeNo ?? null, authCode: data.AuthCode ?? null });
    return { status: "paid", changed: true };
  }
  const next = ts === "2" ? "failed" : ts === "3" ? "cancelled" : ts === "8" ? "unknown" : null;
  if (!next) return { status: tx.status, changed: false };
  await updateTx(deps.admin, tx.id, { status: next, raw_response: raw });
  return { status: next, changed: true };
}
