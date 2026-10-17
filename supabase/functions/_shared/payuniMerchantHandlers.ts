// PAYUNi 合作商店（W2）edge function 核心邏輯；依賴以參數注入（DB client、PAYUNi 呼叫、告警），方便以 mock 測試。
// 安全：不 log 任何表單個資；MCID 只放進送出的 payload，不落庫、不進 snapshot。
// deno-lint-ignore-file no-explicit-any
import type { PayuniCall, PayuniConfig, PayuniResult } from "./payuni.ts";
import { parseNotify } from "./payuni.ts";
import { sendPaymentAlertEmail } from "./paymentAlert.ts";
import {
  backSettingAlertKeys, buildBindPayload, buildMerUrl, canSwitchToPayuni, extractPaymentTools, isBindable,
  maskUbnForStorage, merStatusLabel, nextMerId, parseStatus, PAYUNI_BACK_SETTING_KEYS, PAYUNI_MCC_INVALID, PAYUNI_SETTING_KEYS, pickKeys,
  shouldAutoDisablePayuni, snapshotWithoutMcid, validateBindForm, type PayuniBindForm,
} from "./payuniMerchant.ts";

export type HandlerResult = { status: number; body: Record<string, unknown> };
export type CallPayuniFn = (call: PayuniCall) => Promise<PayuniResult>;

export interface MerchantDeps {
  admin: any;
  userId: string | null;
  isSuperAdmin: boolean;
  isAccommodationAdmin: (accommodationId: string) => Promise<boolean>;
  agentId: string;
  callPayuni: CallPayuniFn;
  /** 未注入時用 paymentAlert 寄總部告警 */
  sendAlert?: (subject: string, html: string) => Promise<unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const res = (status: number, body: Record<string, unknown>): HandlerResult => ({ status, body });
const nowIso = () => new Date().toISOString();

async function loadAccommodation(admin: any, id: string) {
  const { data, error } = await admin
    .from("accommodation_info")
    .select("id, name, short_url_alias, payuni_mer_id, payuni_mer_status, payuni_member_status, payuni_payment_tools, payment_provider_active, payuni_status_synced_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`accommodation_info read failed: ${error.message}`);
  return data;
}

async function loadPrivateSettings(admin: any, accommodationId: string): Promise<Record<string, any>> {
  const { data, error } = await admin
    .from("accommodation_payuni_private")
    .select("payuni_settings")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();
  if (error) throw new Error(`accommodation_payuni_private read failed: ${error.message}`);
  return (data?.payuni_settings as Record<string, any>) ?? {};
}

async function upsertPrivate(admin: any, accommodationId: string, values: Record<string, unknown>) {
  const { error } = await admin
    .from("accommodation_payuni_private")
    .upsert({ accommodation_id: accommodationId, ...values, updated_at: nowIso() }, { onConflict: "accommodation_id" });
  if (error) throw new Error(`accommodation_payuni_private upsert failed: ${error.message}`);
}

async function updateAccommodation(admin: any, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("accommodation_info").update(values).eq("id", id);
  if (error) throw new Error(`accommodation_info update failed: ${error.message}`);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const taipeiNow = () => new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

/** 商店非啟用且仍用 payuni 收款 → 切回 none、追加 providerLog、通知總部；回傳是否切換 */
async function autoDisablePayuni(
  admin: any,
  acc: { id: string; name: string; payment_provider_active: string | null },
  merId: string,
  status: number | null,
  reason: string | null,
  by: "system:agent-notify" | "system:status-sync",
  sendAlert: (subject: string, html: string) => Promise<unknown>,
): Promise<boolean> {
  if (!shouldAutoDisablePayuni(status, acc.payment_provider_active)) return false;
  await updateAccommodation(admin, acc.id, { payment_provider_active: "none" });
  const settings = await loadPrivateSettings(admin, acc.id);
  const providerLog = Array.isArray(settings.providerLog) ? settings.providerLog : [];
  await upsertPrivate(admin, acc.id, {
    payuni_settings: { ...settings, providerLog: [...providerLog, { from: "payuni", to: "none", by, at: nowIso() }] },
  });
  const lines = [`館名：${acc.name}`, `MerID：${merId}`, `商店狀態：${merStatusLabel(status)}`, `時間：${taipeiNow()}`];
  if (reason) lines.push(`原因：${reason}`);
  await sendAlert(
    `[PAYUNi] ${acc.name}（${merId}）商店非啟用，線上收款已暫停`,
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`,
  ).catch((e) => console.error(`[payuni] auto-disable alert failed: ${e instanceof Error ? e.message : e}`));
  return true;
}

// ---------------- payuni-merchant-bind ----------------

export async function handleBind(deps: MerchantDeps, body: any): Promise<HandlerResult> {
  if (!deps.isSuperAdmin) return res(403, { error: "Forbidden" });
  const accommodationId = String(body?.accommodation_id ?? "");
  if (!UUID_RE.test(accommodationId)) return res(400, { error: "accommodation_id 格式不正確" });

  const acc = await loadAccommodation(deps.admin, accommodationId);
  if (!acc) return res(404, { error: "找不到館別" });
  if (!isBindable(acc.payuni_mer_id, acc.payuni_mer_status)) return res(409, { error: "已建店", mer_id: acc.payuni_mer_id });

  const form = (body?.form ?? {}) as PayuniBindForm;
  const errors = validateBindForm(form);
  if (Object.keys(errors).length > 0) {
    // 只有 MCC 有誤時，error 直接回「MCC 格式不正確」
    const onlyMcc = Object.keys(errors).length === 1 && errors.mer_mcc === PAYUNI_MCC_INVALID;
    return res(400, { error: onlyMcc ? PAYUNI_MCC_INVALID : "VALIDATION_FAILED", errors });
  }

  let merId: string = acc.payuni_mer_id ?? "";
  if (!merId) {
    const { data: rows, error } = await deps.admin
      .from("accommodation_info")
      .select("payuni_mer_id")
      .like("payuni_mer_id", `${deps.agentId}%`);
    if (error) throw new Error(`mer_id scan failed: ${error.message}`);
    merId = nextMerId(deps.agentId, (rows ?? []).map((r: any) => r.payuni_mer_id));
  }

  const payload = buildBindPayload(form, merId, buildMerUrl(acc.short_url_alias));
  const result = await deps.callPayuni({ kind: "agent", path: "/api/agent/bind_merchant", version: "1.0", payload });

  const { error: appErr } = await deps.admin.from("payuni_merchant_applications").insert({
    accommodation_id: accommodationId,
    mer_id: merId,
    request_snapshot: { ...snapshotWithoutMcid(payload), UBN: maskUbnForStorage(payload.UBN) },
    response_status: result.status,
    response_message: result.message ?? null,
    submitted_by: deps.userId,
  });
  if (appErr) console.error(`[payuni-merchant-bind] application log failed mer=${merId}: ${appErr.message}`);

  if (!result.ok) return res(200, { ok: false, status: result.status, message: result.message ?? null });

  await updateAccommodation(deps.admin, accommodationId, {
    payuni_mer_id: merId,
    payuni_mer_status: 9,
    payuni_member_status: 9,
    payuni_mer_eng_name: String(payload.MerEngName),
    payuni_applied_at: nowIso(),
  });
  await upsertPrivate(deps.admin, accommodationId, {
    payuni_legal_name: String(payload.Name),
    payuni_ubn: maskUbnForStorage(payload.UBN),
    payuni_member_email: String(payload.Email),
  });
  return res(200, { ok: true, mer_id: merId });
}

// ---------------- payuni-merchant-status ----------------

const CONTACT_FIELDS = ["ContactName", "ContactTel", "ContactMobile", "MerEmail", "MerAddr", "MerAddrPost", "MerTel"] as const;

function validateContact(c: Record<string, unknown>): Record<string, string> {
  const e: Record<string, string> = {};
  const s = (k: string) => (c[k] == null ? "" : String(c[k]).trim());
  if (s("ContactTel") && !/^0\d{1,3}-\d{5,8}(#\d{1,6})?$/.test(s("ContactTel"))) e.ContactTel = "聯絡電話格式不正確";
  if (s("ContactMobile") && !/^09\d{8}$/.test(s("ContactMobile"))) e.ContactMobile = "手機格式不正確";
  if (s("MerEmail") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s("MerEmail"))) e.MerEmail = "Email 格式不正確";
  if (s("MerAddrPost") && !/^\d{3}$/.test(s("MerAddrPost"))) e.MerAddrPost = "郵遞區號須為 3 碼";
  if (s("MerTel") && !/^0\d{1,3}-\d{5,8}(#\d{1,6})?$/.test(s("MerTel"))) e.MerTel = "商店電話格式不正確";
  return e;
}

export async function handleStatus(deps: MerchantDeps, body: any): Promise<HandlerResult> {
  const action = String(body?.action ?? "query");

  if (action === "list_reasons") {
    if (!deps.isSuperAdmin) return res(403, { error: "Forbidden" });
    const { data, error } = await deps.admin.from("accommodation_payuni_private").select("accommodation_id, payuni_status_reason");
    if (error) throw new Error(`reasons read failed: ${error.message}`);
    const reasons: Record<string, string> = {};
    for (const r of data ?? []) if (r.payuni_status_reason) reasons[r.accommodation_id] = r.payuni_status_reason;
    return res(200, { ok: true, reasons });
  }

  const accommodationId = String(body?.accommodation_id ?? "");
  if (!UUID_RE.test(accommodationId)) return res(400, { error: "accommodation_id 格式不正確" });

  if (action === "query") {
    if (!deps.isSuperAdmin && !(await deps.isAccommodationAdmin(accommodationId))) return res(403, { error: "Forbidden" });
  } else if (action === "update_contact" || action === "set_provider") {
    if (!deps.isSuperAdmin) return res(403, { error: "Forbidden" });
  } else {
    return res(400, { error: "未知的 action" });
  }

  const acc = await loadAccommodation(deps.admin, accommodationId);
  if (!acc) return res(404, { error: "找不到館別" });

  if (action === "set_provider") return setProvider(deps, acc, String(body?.provider ?? ""));
  if (!acc.payuni_mer_id) return res(400, { error: "此館尚未建店" });

  if (action === "update_contact") {
    const contact = (body?.contact ?? {}) as Record<string, unknown>;
    const errors = validateContact(contact);
    if (Object.keys(errors).length > 0) return res(400, { error: "VALIDATION_FAILED", errors });
    const payload: Record<string, string> = { MerID: acc.payuni_mer_id };
    for (const k of CONTACT_FIELDS) if (contact[k] != null && String(contact[k]).trim()) payload[k] = String(contact[k]).trim();
    if (Object.keys(payload).length === 1) return res(400, { error: "沒有要更新的欄位" });
    const r = await deps.callPayuni({ kind: "agent", path: "/api/agent/update_merchant", version: "1.0", payload });
    return res(200, { ok: r.ok, status: r.status, message: r.message ?? null });
  }

  const r = await deps.callPayuni({
    kind: "agent", path: "/api/agent/search_merchant_status", version: "1.0", payload: { MerID: acc.payuni_mer_id },
  });
  if (!r.ok || !r.data) return res(200, { ok: false, status: r.status, message: r.message ?? null });

  const synced = {
    payuni_mer_status: parseStatus(r.data.MerStatus),
    payuni_member_status: parseStatus(r.data.MemberStatus),
    payuni_payment_tools: extractPaymentTools(r.data),
    payuni_status_synced_at: nowIso(),
  };
  const reason = r.data.Reason ? String(r.data.Reason) : null;
  await updateAccommodation(deps.admin, accommodationId, synced);
  await upsertPrivate(deps.admin, accommodationId, { payuni_status_reason: reason });
  const providerChanged = await autoDisablePayuni(
    deps.admin, acc, acc.payuni_mer_id, synced.payuni_mer_status, reason, "system:status-sync",
    deps.sendAlert ?? ((s, h) => sendPaymentAlertEmail(deps.admin, s, h)),
  );
  return res(200, {
    ok: true, payuni_mer_id: acc.payuni_mer_id, ...synced, payuni_status_reason: reason,
    payment_provider_active: providerChanged ? "none" : acc.payment_provider_active, provider_changed: providerChanged,
  });
}

async function setProvider(deps: MerchantDeps, acc: any, to: string): Promise<HandlerResult> {
  if (!["tappay", "payuni", "none"].includes(to)) return res(400, { error: "provider 只能是 tappay / payuni / none" });
  if (to === "payuni") {
    const check = canSwitchToPayuni(acc.payuni_mer_status, acc.payuni_payment_tools);
    if (!check.ok) return res(409, { error: check.reason });
  }
  const from = acc.payment_provider_active ?? null;
  await updateAccommodation(deps.admin, acc.id, { payment_provider_active: to });
  const settings = await loadPrivateSettings(deps.admin, acc.id);
  const providerLog = Array.isArray(settings.providerLog) ? settings.providerLog : [];
  await upsertPrivate(deps.admin, acc.id, {
    payuni_settings: { ...settings, providerLog: [...providerLog, { from, to, by: deps.userId, at: nowIso() }] },
  });
  return res(200, { ok: true, payment_provider_active: to });
}

// ---------------- payuni-agent-notify ----------------

export interface NotifyDeps {
  admin: any;
  config: PayuniConfig;
  sendAlert: (subject: string, html: string) => Promise<unknown>;
}

const ONLY_LOG_TYPES = new Set(["Close", "CancelClose", "Refund", "CancelRefund", "Cancel"]);
const okText = () => new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function handleAgentNotify(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const parsed = await parseNotify(req, { config: deps.config });
  const outer = parsed.ok ? parsed.outer : (parsed.outer ?? {});
  const data = parsed.ok ? parsed.data : null;
  const hashValid = parsed.ok || parsed.reason === "DECRYPT_FAILED";

  const { data: ev, error: insErr } = await deps.admin
    .from("payuni_notify_events")
    .insert({
      source: "agent",
      notify_type: data?.NotifyType ?? null,
      mer_id: data?.MerID ?? outer.MerID ?? null,
      trade_no: data?.TradeNo ?? null,
      execute_time: data?.ExecuteTime ?? null,
      hash_valid: hashValid,
      payload_raw: outer,
      decrypted: data,
      processed: false,
      process_error: parsed.ok ? null : parsed.reason,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") return okText();
    console.error(`[payuni-agent-notify] event insert failed: ${insErr.message}`);
    return okText();
  }
  if (!data) return okText();

  let processed = false;
  let processError: string | null = null;
  try {
    const out = await processAgentNotify(deps, data);
    processed = out.processed;
    processError = out.error;
  } catch (e) {
    processError = e instanceof Error ? e.message.slice(0, 500) : "UNKNOWN_ERROR";
  }
  const { error: updErr } = await deps.admin
    .from("payuni_notify_events")
    .update({ processed, process_error: processError })
    .eq("id", ev.id);
  if (updErr) console.error(`[payuni-agent-notify] event update failed: ${updErr.message}`);
  return okText();
}

async function processAgentNotify(deps: NotifyDeps, data: Record<string, string>): Promise<{ processed: boolean; error: string | null }> {
  const type = data.NotifyType ?? "";
  const merId = data.MerID ?? "";
  const { data: acc, error } = await deps.admin
    .from("accommodation_info")
    .select("id, name, payuni_mer_status, payment_provider_active, payuni_payment_tools")
    .eq("payuni_mer_id", merId)
    .maybeSingle();
  if (error) throw new Error(`accommodation_info read failed: ${error.message}`);
  if (!acc) return { processed: false, error: "UNKNOWN_MER" };

  const alert = (title: string, lines: string[]) =>
    deps.sendAlert(
      `[PAYUNi] ${acc.name}（${merId}）${title}`,
      `<p><b>${escapeHtml(acc.name)}</b>（MerID ${escapeHtml(merId)}）</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`,
    ).catch((e) => console.error(`[payuni-agent-notify] alert failed: ${e instanceof Error ? e.message : e}`));

  if (type === "MerStatus") {
    const next = parseStatus(data.Status);
    if (next === null) return { processed: false, error: "INVALID_STATUS" };
    const prev = acc.payuni_mer_status ?? null;
    const reason = data.Reason ? String(data.Reason) : null;
    await updateAccommodation(deps.admin, acc.id, { payuni_mer_status: next });
    await upsertPrivate(deps.admin, acc.id, { payuni_status_reason: reason });
    await autoDisablePayuni(deps.admin, acc, merId, next, reason, "system:agent-notify", deps.sendAlert);
    if (next === 1 && prev !== 1) await alert("商店已啟用", [`商店狀態：${merStatusLabel(prev)} → 啟用`]);
    return { processed: true, error: null };
  }

  if (type === "MerPayment") {
    const tools = { ...(acc.payuni_payment_tools ?? {}), ...extractPaymentTools(data) };
    await updateAccommodation(deps.admin, acc.id, { payuni_payment_tools: tools });
    return { processed: true, error: null };
  }

  if (type === "MerSetting" || type === "BackSetting") {
    const settings = await loadPrivateSettings(deps.admin, acc.id);
    const key = type === "MerSetting" ? "setting" : "backSetting";
    const picked = pickKeys(data, type === "MerSetting" ? PAYUNI_SETTING_KEYS : PAYUNI_BACK_SETTING_KEYS);
    await upsertPrivate(deps.admin, acc.id, { payuni_settings: { ...settings, [key]: picked } });
    if (type === "BackSetting") {
      const hits = backSettingAlertKeys(picked);
      if (hits.length > 0) await alert("後台設定通知", hits.map((k) => `${k} = 2`));
    }
    return { processed: true, error: null };
  }

  if (ONLY_LOG_TYPES.has(type)) return { processed: true, error: null };
  return { processed: false, error: "UNKNOWN_NOTIFY_TYPE" };
}
