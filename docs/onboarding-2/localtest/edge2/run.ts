// 用法：deno run -A --no-lock --import-map=import_map.json run.ts <functions 目錄>
// 2a-3：11 支後端程式 × 各身分的權限測試（假 Supabase／假 Resend，不會真的寄信）
import { calls, A, B, AUTH_USERS } from "./fake_supabase.ts";
import { sent } from "./fake_resend.ts";

const fnDir = Deno.args[0];
for (const [k, v] of Object.entries({
  SUPABASE_URL: "http://local.test", SUPABASE_SERVICE_ROLE_KEY: "service-key-local", SUPABASE_ANON_KEY: "anon-key-local",
  LLM_MODE: "gateway", LOVABLE_API_KEY: "fake-llm", RESEND_API_KEY: "fake-resend", RAGIC_API_KEY: "fake-ragic",
})) Deno.env.set(k, v);

const resendFetch: any[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(`fetch:${new URL(url).host}`);
  if (url.includes("/auth/v1/admin/users")) return new Response(JSON.stringify({ users: AUTH_USERS }), { status: 200 });
  if (url.includes("resend.com")) { resendFetch.push(JSON.parse(String(init?.body ?? "{}"))); return new Response(JSON.stringify({ id: "m1" }), { status: 200 }); }
  if (url.includes("ragic.com")) return new Response("{}", { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
}) as typeof fetch;

const handlers: Record<string, (r: Request) => Promise<Response>> = {};
let current = "";
(globalThis as any).__capture = (h: any) => { handlers[current] = h; };
(Deno as any).serve = (h: any) => { handlers[current] = typeof h === "function" ? h : h.handler; return {} as any; };
const FNS = ["send-cancellation-email", "send-invite-email", "traveler-tagging", "traveler-sync", "kol-bonus-public", "fetch-ragic-kol-payforms",
  "ai-ops-insights", "preview-closer-commission", "closer-team-pool", "test-email", "team-view-query"];
for (const f of FNS) { current = f; await import(`${fnDir}/${f}/index.ts`); }

const ALL = ["u-owner", "u-staff", "u-super", "u-admin", "u-finance", "u-am"];
const LABEL: Record<string, string> = { "u-owner": "單館業主", "u-staff": "本館 staff", "u-super": "super_admin", "u-admin": "全域 admin", "u-finance": "finance", "u-am": "am", "u-scoutmgr": "scout_manager", "u-closer": "closer", "u-hadmin": "館別 admin", "service-key-local": "service role" };
type Case = { fn: string; who: string; body: unknown; ok: boolean; note?: string; check?: () => string | null; before?: () => void; after?: () => void };
const cases: Case[] = [];
const allow = (fn: string, body: unknown, allowed: string[], extra: string[] = []) =>
  [...ALL, ...extra].forEach((who) => cases.push({ fn, who, body, ok: allowed.includes(who) }));

// 1. 取消信：只收 order_id；收件人固定為訂單旅客
const lastTo = () => (resendFetch.at(-1)?.to ?? []).join(",");
allow("send-cancellation-email", { order_id: "o-a-cancel" }, ["u-owner", "u-staff", "u-super"]);
cases.push({ fn: "send-cancellation-email", who: "u-owner", body: { order_id: "o-b-cancel" }, ok: false, note: "別館訂單" });
cases.push({ fn: "send-cancellation-email", who: "u-owner", body: { order_id: "o-a-cancel", guestEmail: "attacker@evil.com" }, ok: true, note: "夾帶別人信箱",
  check: () => lastTo() === "guest-a@example.org" ? null : `寄到 ${lastTo()}` });
cases.push({ fn: "send-cancellation-email", who: "u-owner", body: { guestEmail: "attacker@evil.com", orderNumber: "X" }, ok: false, note: "沒有 order_id（舊格式）" });
cases.push({ fn: "send-cancellation-email", who: "u-owner", body: { order_id: "o-a-active" }, ok: false, note: "訂單未取消" });
// 2. 邀請信：目標館、本公司網域、收件人已在該館
const inv = (o: Record<string, unknown> = {}) => ({ email: "staff@a.tw", inviteLink: "https://booking.lakeze.com/a/auth", accommodation_id: A, ...o });
allow("send-invite-email", inv(), ["u-owner", "u-super"]);
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ accommodation_id: B }), ok: false, note: "別館" });
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://evil.com/login" }), ok: false, note: "外部網域連結" });
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://lakeze.com.evil.com/x" }), ok: false, note: "偽裝網域" });
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ email: "attacker@evil.com" }), ok: false, note: "收件人不在該館" });
// 2-1. 白名單補正：實際使用網域可過；偽裝／非 https／帳密前綴一律擋
for (const link of ["https://booking.lakeze.com/reset-password?token=t", "https://booking.lakeze.com/auth", "https://sensaninn.lakeze.com/admin", "https://star.lakeze.com/", "https://lakeze.co/"])
  cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: link }), ok: true, note: `允許 ${link}` });
for (const link of ["https://lakeze.co.evil.com/x", "https://evil-lakeze.com/x", "https://booking.lakeze.com@evil.com/x", "http://booking.lakeze.com/auth", "javascript:alert(1)//lakeze.com"])
  cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: link }), ok: false, note: `擋下 ${link}` });
// 2-2. 環境變數 INVITE_LINK_ALLOWED_HOSTS 設定時，白名單只用它
const withEnv = (v: string | null) => () => { v === null ? Deno.env.delete("INVITE_LINK_ALLOWED_HOSTS") : Deno.env.set("INVITE_LINK_ALLOWED_HOSTS", v); };
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://pms.example-co.tw/auth" }), ok: true, note: "env 指定 example-co.tw 可過", before: withEnv(".example-co.tw") });
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://booking.lakeze.com/auth" }), ok: false, note: "env 指定後未列入的 lakeze.com 擋下", before: withEnv(".example-co.tw") });
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://example-co.tw.evil.com/x" }), ok: false, note: "env 網域偽裝擋下", before: withEnv(".example-co.tw"), after: withEnv(null) });
// 2-3. 官網網址來自 PUBLIC_SITE_ORIGIN 時一併加入白名單
cases.push({ fn: "send-invite-email", who: "u-owner", body: inv({ inviteLink: "https://www.site-origin.test/auth" }), ok: true, note: "PUBLIC_SITE_ORIGIN 網域可過",
  before: () => Deno.env.set("PUBLIC_SITE_ORIGIN", "https://www.site-origin.test"), after: () => Deno.env.delete("PUBLIC_SITE_ORIGIN") });
// 2-4. service role：目前無任何伺服器呼叫者；5aae089c3 起就會被 401（函式先用 auth.getUser 驗使用者），維持原狀
cases.push({ fn: "send-cancellation-email", who: "service-key-local", body: { order_id: "o-a-cancel" }, ok: false, note: "service role，維持原狀 401" });
cases.push({ fn: "send-invite-email", who: "service-key-local", body: inv(), ok: false, note: "service role，維持原狀 401" });
// 3～9
allow("traveler-tagging", { limit: 1 }, ["u-super", "u-admin"]);
allow("traveler-sync", { mode: "full" }, ["u-super", "u-admin"]);
allow("kol-bonus-public", { mode: "internal" }, ["u-super", "u-admin", "u-am", "u-scoutmgr"], ["u-scoutmgr"]);
allow("fetch-ragic-kol-payforms", {}, ["u-super", "u-scoutmgr"], ["u-scoutmgr"]);
allow("ai-ops-insights", { action: "metrics", accommodation_id: A }, ["u-owner", "u-super"]);
cases.push({ fn: "ai-ops-insights", who: "u-owner", body: { action: "metrics", accommodation_id: B }, ok: false, note: "別館" });
cases.push({ fn: "ai-ops-insights", who: "u-owner", body: { action: "metrics" }, ok: false, note: "全平台" });
cases.push({ fn: "ai-ops-insights", who: "u-super", body: { action: "metrics" }, ok: true, note: "全平台" });
allow("preview-closer-commission", { year: 2026, month: 10, scope: "team" }, ["u-super", "u-admin", "u-closer"], ["u-closer"]);
allow("closer-team-pool", { payout_month: "2026-10" }, ["u-super", "u-admin", "u-closer"], ["u-closer"]);
allow("test-email", { email: "qa@lakeze.com" }, ["u-super"]);
allow("team-view-query", { queries: [] }, ["u-super", "u-admin"], ["u-hadmin"]);

let pass = 0;
for (const c of cases) {
  calls.length = 0;
  const sentBefore = sent.length;
  c.before?.();
  const res = await handlers[c.fn](new Request(`http://local.test/${c.fn}`, {
    method: "POST", headers: { Authorization: `Bearer ${c.who}`, "Content-Type": "application/json" }, body: JSON.stringify(c.body),
  }));
  c.after?.();
  const text = (await res.text()).slice(0, 70).replace(/\s+/g, " ");
  const denied = res.status === 401 || res.status === 403 || (c.note !== undefined && res.status >= 400 && res.status < 500);
  const extraErr = c.check?.() ?? null;
  const mailed = calls.some((x) => x.startsWith("fetch:api.resend.com")) || sent.length > sentBefore;
  const good = (c.ok ? !denied : denied) && !extraErr && !(!c.ok && mailed);
  if (good) pass++;
  console.log(`${good ? "PASS" : "FAIL"} | ${c.fn} | ${LABEL[c.who]}${c.note ? `（${c.note}）` : ""} | 預期 ${c.ok ? "可用" : "擋下"} | 實際 ${res.status}${extraErr ? ` ${extraErr}` : ""} | ${text}`);
}
console.log(`\n結果：${pass}/${cases.length} 通過；假 Resend 實際送出 ${resendFetch.length + sent.length} 封（都是假的，沒有真的寄信）`);
