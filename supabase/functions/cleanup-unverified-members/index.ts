// 排程：刪除建立後超過 N 天仍未驗證 Email 的會員帳號（可選擇先寄通知信）
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "人客多 Lakeze <noreply@lakeze.com>";

const DEFAULT_DAYS = 7;
const MAX_DELETE_PER_RUN = 200;

// 這些帳號不是真的 Email 註冊（社群登入佔位信箱），不處理
const SYNTHETIC_EMAIL_RE = /@(line|facebook)\.lakeze\.local$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function encodeNonAscii(s: string) {
  return s.replace(/[\u0080-\uFFFF]/g, (c) => `&#${c.codePointAt(0)};`);
}

async function sendNotice(to: string, days: number): Promise<boolean> {
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) return false;
  const subject = "您的帳號已因未完成驗證而移除";
  const html = encodeNonAscii(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f6f6f7;font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;color:#2d3344">
<div style="max-width:560px;width:100%;margin:0 auto;padding:24px;line-height:1.7">
  <h2 style="color:#d07218;font-size:20px;margin:0 0 16px">${subject}</h2>
  <p style="margin:0 0 12px">您好，</p>
  <p style="margin:0 0 12px">此信箱曾於人客多 Lakeze 建立帳號，但超過 ${days} 天未完成 Email 驗證，系統已自動移除該未啟用帳號，並清除相關資料。</p>
  <p style="margin:0 0 12px">若您仍想訂房，隨時可以重新以此信箱註冊，不會受到影響。</p>
  <p style="margin:0 0 12px">若這不是您本人的操作，也無需擔心，該帳號已不存在。</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#6b7280;font-size:12px;margin:0">此為系統自動發送，請勿直接回覆。</p>
</div></body></html>`);
  try {
    const r = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!r.ok) {
      console.error("[cleanup-unverified] email fail", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[cleanup-unverified] email throw", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // 排程可能不帶 body
  }

  const days = Number.isFinite(Number(body.days)) && Number(body.days) > 0
    ? Math.min(Math.floor(Number(body.days)), 365)
    : DEFAULT_DAYS;
  const notify = body.notify === true;
  const dryRun = body.dryRun === true;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // 1. 掃描 auth.users，找出逾期未驗證帳號
  const candidates: { id: string; email: string }[] = [];
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[cleanup-unverified] listUsers failed", error.message);
      return json({ error: "list_users_failed", detail: error.message }, 500);
    }
    const users = data?.users ?? [];
    for (const u of users) {
      const email = (u.email ?? "").toLowerCase();
      if (!email || SYNTHETIC_EMAIL_RE.test(email)) continue;
      if (u.email_confirmed_at || (u as any).confirmed_at) continue;
      if (u.phone_confirmed_at) continue;
      if (new Date(u.created_at).getTime() > cutoff) continue;
      if (u.last_sign_in_at) continue;
      candidates.push({ id: u.id, email });
    }
    if (users.length < 200) break;
  }

  if (candidates.length === 0) {
    return json({ ok: true, days, notify, dryRun, scanned: 0, deleted: 0, skipped: [] });
  }

  const ids = candidates.map((c) => c.id);
  const emails = candidates.map((c) => c.email);

  // 2. 排除有後台角色的帳號
  const { data: roleRows } = await admin.from("user_roles").select("user_id").in("user_id", ids);
  const staffIds = new Set((roleRows ?? []).map((r: any) => r.user_id));

  // 3. 排除有訂單紀錄的帳號（member_id 或 guest_email）
  const { data: memberRows } = await admin
    .from("platform_members")
    .select("id, user_id")
    .in("user_id", ids);
  const memberIdByUser = new Map((memberRows ?? []).map((m: any) => [m.user_id, m.id]));
  const memberIds = (memberRows ?? []).map((m: any) => m.id);

  const withOrderMemberIds = new Set<string>();
  if (memberIds.length) {
    const { data: o1 } = await admin.from("orders").select("member_id").in("member_id", memberIds);
    (o1 ?? []).forEach((o: any) => o.member_id && withOrderMemberIds.add(o.member_id));
  }
  const { data: o2 } = await admin.from("orders").select("guest_email").in("guest_email", emails);
  const emailsWithOrders = new Set((o2 ?? []).map((o: any) => (o.guest_email ?? "").toLowerCase()));

  const skipped: { email: string; reason: string }[] = [];
  const toDelete: { id: string; email: string }[] = [];
  for (const c of candidates) {
    if (staffIds.has(c.id)) {
      skipped.push({ email: c.email, reason: "has_role" });
      continue;
    }
    const memberId = memberIdByUser.get(c.id);
    if ((memberId && withOrderMemberIds.has(memberId)) || emailsWithOrders.has(c.email)) {
      skipped.push({ email: c.email, reason: "has_orders" });
      continue;
    }
    toDelete.push(c);
  }

  const batch = toDelete.slice(0, MAX_DELETE_PER_RUN);
  let deleted = 0;
  let notified = 0;
  const failed: { email: string; error: string }[] = [];

  for (const c of batch) {
    if (dryRun) {
      deleted++;
      continue;
    }
    if (notify) {
      const sent = await sendNotice(c.email, days);
      if (sent) notified++;
    }
    // platform_members 及相關資料透過 FK ON DELETE CASCADE 一併移除
    const { error } = await admin.auth.admin.deleteUser(c.id);
    if (error) {
      console.error("[cleanup-unverified] delete failed", c.email, error.message);
      failed.push({ email: c.email, error: error.message });
      continue;
    }
    deleted++;
  }

  console.log(
    `[cleanup-unverified] days=${days} candidates=${candidates.length} deleted=${deleted} notified=${notified} skipped=${skipped.length} failed=${failed.length} dryRun=${dryRun}`,
  );

  return json({
    ok: true,
    days,
    notify,
    dryRun,
    candidates: candidates.length,
    deleted,
    notified,
    skipped,
    failed,
    remaining: Math.max(0, toDelete.length - batch.length),
  });
});
