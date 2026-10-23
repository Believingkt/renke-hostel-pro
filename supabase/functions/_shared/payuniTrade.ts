// PAYUNi 信用卡（W3）純規則與交易結果套用（applyPayuniTradeResult，冪等；card-charge／notify／query 共用）
// deno-lint-ignore-file no-explicit-any
import { applyOrderPaymentSuccess, type PaymentSuccessEffects } from "./orderPaymentSuccess.ts";

export type PayuniTradeKind = "P" | "A" | "D" | "F";
export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
export const SWEEP_MIN_AGE_MS = 15 * 60 * 1000;
export const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** = packages/shared/src/utils/paymentDomain.ts 的 LIVE_DOMAINS 去掉 *.lovable.app（Vitest 比對） */
export const PAYUNI_LIVE_DOMAINS = ["booking.lakeze.com", "hq.lakeze.com"];
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

/** 虛擬帳號遮中間：前 4 後 4 */
export function maskPayNo(p: unknown): string | null {
  const v = typeof p === "string" ? p : "";
  if (!v) return null;
  return v.length <= 8 ? `${v.slice(0, 2)}****` : `${v.slice(0, 4)}${"*".repeat(v.length - 8)}${v.slice(-4)}`;
}

export function notifyExecuteTime(d: Record<string, string>): string | null {
  if (d.AuthDay || d.AuthTime) return `${d.AuthDay ?? ""}${d.AuthTime ?? ""}` || null;
  return d.PayTime ?? null;
}

/** 交易查詢回傳可能是平鋪或 Result[0][...]；取第一筆（待 Sandbox 確認實際格式） */
export function extractQueryResult(d: Record<string, string> | undefined): Record<string, string> | null {
  if (!d) return null;
  if (d.TradeStatus != null) return d;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    const m = /^Result\[0\]\[(\w+)\]$/.exec(k);
    if (m) out[m[1]] = v;
  }
  return Object.keys(out).length ? out : null;
}

const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : null; } catch { return null; } };
const strRecord = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])) as Record<string, string>;

/** 取全部筆數（W8 撥款查詢）：Result[n][欄位] 平鋪、Result 為 JSON 陣列字串，或只有單筆平鋪；依 n 排序 */
export function extractQueryResults(d: Record<string, string> | undefined): Record<string, string>[] {
  if (!d) return [];
  const nested = parseJson(d.Result);
  if (Array.isArray(nested)) return nested.filter((r) => r && typeof r === "object").map(strRecord);
  if (nested && typeof nested === "object") return Object.keys(nested).sort((a, b) => Number(a) - Number(b)).map((k) => strRecord(nested[k]));
  const byIdx = new Map<number, Record<string, string>>();
  for (const [k, v] of Object.entries(d)) {
    const m = /^Result\[(\d+)\]\[(\w+)\]$/.exec(k);
    if (!m) continue;
    const i = Number(m[1]);
    if (!byIdx.has(i)) byIdx.set(i, {});
    byIdx.get(i)![m[2]] = v;
  }
  if (byIdx.size) return [...byIdx.keys()].sort((a, b) => a - b).map((i) => byIdx.get(i)!);
  return d.TradeNo != null || d.MerTradeNo != null ? [d] : [];
}

/** PageInfo[Current]／PageInfo[Total]，或 PageInfo 為 JSON 字串 */
export function extractPageInfo(d: Record<string, string> | undefined): { current: number | null; total: number | null } {
  const n = (v: unknown) => (v == null || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  if (!d) return { current: null, total: null };
  const j = parseJson(d.PageInfo);
  if (j && typeof j === "object") return { current: n(j.Current), total: n(j.Total) };
  return { current: n(d["PageInfo[Current]"]), total: n(d["PageInfo[Total]"]) };
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
  payment_type?: number | null;
}

const nowIso = () => new Date().toISOString();

export async function updateTx(admin: any, id: string, values: Record<string, unknown>) {
  // 已 paid 的交易不可被改成 failed／cancelled／unknown／expired
  const { error } = await admin.from("payment_transactions").update({ ...values, updated_at: nowIso() }).eq("id", id).neq("status", "paid");
  if (error) throw new Error(`payment_transactions update failed: ${error.message}`);
}

/** ATM 錯帳：NewMerTradeNo 是另一個訂單編號才算；空字串、空白、"-"（PAYUNi 表示無錯帳）或等於本筆 MerTradeNo 都不算 */
export function isAtmMisTransfer(data: Record<string, string>, tx: Pick<TxRow, "mer_trade_no">): boolean {
  const n = String(data.NewMerTradeNo ?? "").trim();
  if (!n || n === "-") return false;
  return n !== String(data.MerTradeNo ?? tx.mer_trade_no ?? "").trim();
}

/** 依 PAYUNi 交易結果（TradeStatus）更新交易列與訂單；已 paid 的交易不重做任何事 */
export async function applyPayuniTradeResult(
  deps: TradeDeps, tx: TxRow, data: Record<string, string>,
): Promise<{ status: string; changed: boolean; error?: string }> {
  if (tx.status === "paid") return { status: "paid", changed: false };
  const ts = String(data.TradeStatus ?? "");
  const raw: Record<string, any> = { ...(tx.raw_response ?? {}), last_status: data.Status ?? null, last_message: data.Message ?? null, trade_status: ts };
  delete raw.sdk_token;
  const isAtm = Number(tx.payment_type) === 2;
  if (isAtm && ts === "4") {
    // 繳費期限到期：只改交易；訂單取消交給 cancel-expired-atm-orders
    await updateTx(deps.admin, tx.id, { status: "expired", raw_response: raw });
    return { status: "expired", changed: true };
  }

  if (ts === "1" && (data.TradeAmt == null || String(data.TradeAmt).trim() === "")) {
    // 缺 TradeAmt 不入帳，等 Notify 或 sweep
    await updateTx(deps.admin, tx.id, { raw_response: { ...raw, awaiting_notify: true } });
    return { status: tx.status, changed: false };
  }
  if (isAtm && ts === "1") {
    const reason = isAtmMisTransfer(data, tx) ? `NewMerTradeNo=${data.NewMerTradeNo}`
      : Number(data.TradeAmt) !== Number(tx.amount) ? `expected=${tx.amount} got=${data.TradeAmt}` : null;
    if (reason) return await flagAtmMismatch(deps, tx, raw, reason, data);
    raw.account5 = data.Account5No ? String(data.Account5No).slice(-5) : null;
    raw.pay_time = data.PayTime ?? null;
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
    const { data: order, error } = await deps.admin.from("orders")
      .select("id, order_number, final_price, paid_amount, payment_status, order_status, notes, discount_code")
      .eq("id", tx.order_id).maybeSingle();
    if (error || !order) throw new Error(`order read failed: ${error?.message ?? "not found"}`);
    const afterCancel = order.order_status === "cancelled";
    const mismatchNote = `AMOUNT_MISMATCH expected=${tx.amount} got=${data.TradeAmt}`;
    const anomalyRaw = afterCancel
      ? { ...raw, anomaly: "PAID_AFTER_CANCEL", ...(mismatch ? { amount_mismatch: mismatchNote } : {}) }
      : mismatch ? { ...raw, anomaly: mismatchNote } : raw;
    // 以「非 paid 才更新」搶佔，避免 card-charge 與 Notify 同時入帳兩次
    const { data: claimed, error: claimErr } = await deps.admin.from("payment_transactions")
      .update({ ...fields, raw_response: anomalyRaw, updated_at: nowIso() })
      .eq("id", tx.id).neq("status", "paid").select("id").maybeSingle();
    if (claimErr) throw new Error(`payment_transactions update failed: ${claimErr.message}`);
    if (!claimed) return { status: "paid", changed: false };
    if (afterCancel) {
      // 訂單已取消：交易照記 paid，不復活訂單，交總部人工處理
      const { data: acc } = await deps.admin.from("accommodation_info").select("name").eq("id", tx.accommodation_id).maybeSingle();
      const mismatchText = mismatch ? `（金額不符：應付 NT$${tx.amount}）` : "";
      const msg = `${acc?.name ?? ""} 訂單 ${order.order_number} 已逾時取消但 PAYUNi 回報付款成功 NT$${data.TradeAmt}${mismatchText}，請人工處理（退款或恢復訂單）`;
      await deps.admin.from("notifications").insert({
        accommodation_id: tx.accommodation_id, type: "payment", title: "PAYUNi 取消後付款成功",
        description: msg, order_id: tx.order_id, is_read: false,
      });
      await deps.sendAlert(`[PAYUNi] 取消後付款成功 ${order.order_number}`, `<p>${msg}</p><p>MerTradeNo ${tx.mer_trade_no}</p>`)
        .catch((e) => console.error(`[payuniTrade] alert failed: ${e instanceof Error ? e.message : e}`));
      return { status: "paid", changed: true };
    }
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
    await applyOrderPaymentSuccess(deps.admin, deps.effects, order, paidAmt,
      { merTradeNo: tx.mer_trade_no, tradeNo: data.TradeNo ?? null, authCode: data.AuthCode ?? null, channel: isAtm ? "atm" : "card" });
    return { status: "paid", changed: true };
  }
  const next = ts === "2" ? "failed" : ts === "3" ? "cancelled" : ts === "8" ? "unknown" : null;
  if (!next) return { status: tx.status, changed: false };
  await updateTx(deps.admin, tx.id, { status: next, raw_response: raw });
  return { status: next, changed: true };
}

/** ATM 錯帳／金額不符：交易狀態不動、訂單不動；記異常（稽核頁可見）並告警，同一筆只告警一次 */
async function flagAtmMismatch(deps: TradeDeps, tx: TxRow, raw: Record<string, any>, reason: string, data: Record<string, string>) {
  if (!String(tx.raw_response?.anomaly ?? "").startsWith("ATM_MISMATCH")) {
    await updateTx(deps.admin, tx.id, { raw_response: { ...raw, anomaly: `ATM_MISMATCH ${reason}` } });
    const msg = `ATM 交易 ${tx.mer_trade_no} 應繳 NT$${tx.amount}，PAYUNi 回報 NT$${data.TradeAmt ?? "—"}（${reason}），訂單未自動入帳，請人工核對。`;
    await deps.admin.from("notifications").insert({
      accommodation_id: tx.accommodation_id, type: "payment", title: "PAYUNi ATM 入帳異常", description: msg, order_id: tx.order_id, is_read: false,
    });
    await deps.sendAlert(`[PAYUNi] ATM 入帳異常 ${tx.mer_trade_no}`, `<p>${msg}</p>`)
      .catch((e) => console.error(`[payuniTrade] alert failed: ${e instanceof Error ? e.message : e}`));
  }
  return { status: tx.status, changed: false, error: "ATM_MISMATCH" };
}
