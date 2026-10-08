// E2 再行銷發送（email 走既有 Resend 機制；line_share 產出可貼文案）
// POST /functions/v1/remarketing-send
//   正式：{ campaign_id, dry_run?, limit? }
//   測試：{ campaign_id, mode:"test", test_emails:[...] }  只寄測試信箱、不碰分群名單、不改活動狀態
// 冪等：同一活動同一旅客已 sent 不重發（部分唯一索引 WHERE is_test=false）
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchSegment, summarizeSegment, type TravelerRow } from "../_shared/remarketingSegment.ts";
import { sanitizePhotoUrl, buildFeatureLine } from "../_shared/roomCards.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ADMIN_ROLES = ["super_admin", "admin", "hotel_admin", "owner"];
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "人客多 Lakeze <noreply@lakeze.com>";
const BRAND = { primary: "#d07218", foreground: "#2d3344", muted: "#6b7280" };
const SITE_BASE = "https://booking.lakeze.com";

type Card = { name: string; price: number | null; cover_url: string | null; url: string; accommodation_name?: string; subtitle?: string };

function cardHtml(p: Card, wrap: (u: string) => string): string {
  return `
    <a href="${wrap(p.url)}" style="display:block;text-decoration:none;border:1px solid #eee;border-radius:10px;overflow:hidden;margin:0 0 12px;">
      ${p.cover_url ? `<img src="${p.cover_url}" alt="" width="100%" style="display:block;width:100%;max-height:180px;object-fit:cover;"/>` : ""}
      <div style="padding:12px 14px;">
        ${p.accommodation_name ? `<div style="color:${BRAND.muted};font-size:12px;margin:0 0 2px;">${p.accommodation_name}</div>` : ""}
        <div style="color:${BRAND.foreground};font-size:15px;font-weight:600;">${p.name}</div>
        ${p.subtitle ? `<div style="color:${BRAND.muted};font-size:12px;margin-top:2px;">${p.subtitle}</div>` : ""}
        ${p.price == null ? "" : `<div style="color:${BRAND.primary};font-size:15px;font-weight:700;margin-top:4px;">${p.price === 0 ? "免費" : `NT$ ${Number(p.price).toLocaleString()} 起`}</div>`}
      </div>
    </a>`;
}
function cardsSectionHtml(title: string, cards: Card[], wrap: (u: string) => string): string {
  if (!cards.length) return "";
  return `<div style="margin:8px 0 4px;"><p style="color:${BRAND.muted};font-size:13px;margin:0 0 10px;">${title}</p>${cards.map((c) => cardHtml(c, wrap)).join("")}</div>`;
}

function emailHtml(opts: { name: string; body: string; ctaText: string; ctaUrl: string; productsHtml: string; unsubUrl: string; openPixelUrl: string }) {
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="padding:24px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:${BRAND.primary};padding:24px;text-align:center;color:#fff;font-size:18px;font-weight:700;">人客多 Lakeze</div>
      <div style="padding:32px 28px;">
        <h1 style="color:${BRAND.foreground};font-size:20px;margin:0 0 16px;">${opts.name} 您好</h1>
        <p style="color:${BRAND.muted};font-size:15px;line-height:1.8;margin:0 0 20px;white-space:pre-wrap;">${opts.body}</p>
        ${opts.productsHtml}
        ${opts.ctaUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;">${opts.ctaText}</a></p>` : ""}
      </div>
      <div style="background:#fafafa;padding:18px;text-align:center;border-top:1px solid #eee;color:#999;font-size:12px;">
        © ${new Date().getFullYear()} 人客多 Lakeze<br/>
        ${opts.unsubUrl ? `<a href="${opts.unsubUrl}" style="color:#999;text-decoration:underline;">不想再收到這類信件？點此退訂</a>` : ""}
      </div>
    </div>
  </div>
  ${opts.openPixelUrl ? `<img src="${opts.openPixelUrl}" alt="" width="1" height="1" style="display:none"/>` : ""}
</body></html>`;
}

const localized = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return String(v.zh ?? v["zh-TW"] ?? v.en ?? Object.values(v)[0] ?? "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let callerEmail = "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "").trim() !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      callerEmail = String(userData.user.email ?? "").trim().toLowerCase();
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r: any) => ADMIN_ROLES.includes(r.role))) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaign_id ?? "");
    if (!campaignId) return json({ error: "campaign_id is required" }, 400);
    const isTestMode = body?.mode === "test";
    const testEmails: string[] = isTestMode && Array.isArray(body?.test_emails)
      ? body.test_emails.map((e: any) => String(e ?? "").trim().toLowerCase()).filter(Boolean)
      : [];
    const maxSend = Math.min(Math.max(Number(body?.limit) || 200, 1), 500);

    const { data: campaign, error: cErr } = await admin
      .from("remarketing_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (cErr) return json({ error: cErr.message }, 500);
    if (!campaign) return json({ error: "找不到活動" }, 404);

    const channel = campaign.channel === "line_share" ? "line_share" : "email";
    if (isTestMode && channel === "line_share") {
      return json({ error: "LINE 渠道不支援測試發送（本批僅支援 Email）" }, 400);
    }

    const content = (campaign.content ?? {}) as any;
    const baseBody = String(content.body ?? "");
    const subject = String(content.subject ?? `人客多 — ${campaign.name}`);
    const ctaText = String(content.cta_text ?? "立即查看");
    const rawCta = String(content.cta_url ?? "");
    const funcBase = `${supabaseUrl}/functions/v1`;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");

    // 推薦主題行程卡（trip_products；價格取自 DB 即時資料）
    const ids: string[] = Array.isArray(campaign.recommend_products) ? campaign.recommend_products : [];
    const productCards: Card[] = [];
    if (ids.length) {
      const { data: prods } = await admin.from("trip_products").select("id,name,price,cover_url").in("id", ids);
      for (const p of prods ?? []) {
        productCards.push({
          name: localized((p as any).name),
          price: (p as any).price == null ? null : Number((p as any).price),
          cover_url: (p as any).cover_url ?? null,
          url: `${SITE_BASE}/trip-products/${(p as any).id}`,
        });
      }
    }

    // 分群名單
    const { data: profiles, error: pErr } = await admin
      .from("traveler_profiles")
      .select("id,display_name,email,phone,interest_tags,custom_needs,consumption,updated_at,customer_key")
      .limit(5000);
    if (pErr) return json({ error: pErr.message }, 500);
    let targets = ((profiles ?? []) as TravelerRow[]).filter((p) => matchSegment(p, campaign.segment));

    // 已成功發送者略過（僅看正式列）
    const { data: existing } = await admin
      .from("remarketing_sends").select("traveler_profile_id,status,is_test").eq("campaign_id", campaignId);
    const sentSet = new Set((existing ?? []).filter((r: any) => r.status === "sent" && !r.is_test).map((r: any) => r.traveler_profile_id));
    const allTargets = targets.slice();
    targets = targets.filter((t) => !sentSet.has(t.id)).slice(0, maxSend);

    // 退訂名單
    const { data: suppressed } = await admin.from("suppressed_emails").select("email");
    const suppressedSet = new Set((suppressed ?? []).map((r: any) => String(r.email).trim().toLowerCase()));

    // 訂單對應：email/手機 → 最新訂房館別；手機 → email 補件（單次查詢建表）
    const phoneToEmail = new Map<string, string>();
    const emailToAcc = new Map<string, string>();
    const phoneToAcc = new Map<string, string>();
    if (channel === "email") {
      const { data: od } = await admin
        .from("orders").select("guest_email,guest_phone,accommodation_id,order_date")
        .order("order_date", { ascending: false }).limit(5000);
      for (const o of od ?? []) {
        const em = String((o as any).guest_email ?? "").trim();
        const emLow = em.toLowerCase();
        const ph = String((o as any).guest_phone ?? "").replace(/\D/g, "").slice(-8);
        const acc = String((o as any).accommodation_id ?? "");
        if (ph && em && !phoneToEmail.has(ph)) phoneToEmail.set(ph, em);
        if (acc && emLow && !emailToAcc.has(emLow)) emailToAcc.set(emLow, acc);
        if (acc && ph && !phoneToAcc.has(ph)) phoneToAcc.set(ph, acc);
      }
    }
    const resolveEmail = (t: any): string => {
      if (t.email) return String(t.email).trim();
      const ck = String(t.customer_key ?? "");
      if (ck.startsWith("email:")) return ck.slice("email:".length).trim();
      if (t.phone) return phoneToEmail.get(String(t.phone).replace(/\D/g, "").slice(-8)) ?? "";
      return "";
    };
    const resolveAcc = (t: any): string => {
      const em = resolveEmail(t).toLowerCase();
      if (em && emailToAcc.has(em)) return emailToAcc.get(em)!;
      const ph = String(t.phone ?? "").replace(/\D/g, "").slice(-8);
      if (ph && phoneToAcc.has(ph)) return phoneToAcc.get(ph)!;
      return "";
    };

    // 範例旅客挑選：跳過測試/QA 帳號；優先選「有訂房館別」者（確保房型卡出現）
    const isTestProfile = (p: any): boolean => {
      const em = (resolveEmail(p) || String(p.email ?? "")).toLowerCase();
      if (em.endsWith("@example.com")) return true;
      return /測試|驗收|test|qa/i.test(String(p.display_name ?? ""));
    };
    const maskName = (name: string): string => {
      const n = String(name ?? "").trim();
      if (n.length <= 1) return n || "旅客";
      if (n.length === 2) return `${n[0]}○`;
      return `${n[0]}${"○".repeat(n.length - 2)}${n[n.length - 1]}`;
    };
    const realTargets = allTargets.filter((t: any) => !isTestProfile(t));
    const pickExample = (): any | null => realTargets.find((t: any) => resolveAcc(t)) ?? realTargets[0] ?? allTargets[0] ?? null;

    // 房型卡載入（依指定館別）：售價用 room_inventory_pricing 未來 30 天最低可售價，
    // 包棟方案（accommodation_packages/package_date_prices）為 fallback；照片用房型照片，缺則館別封面。
    let roomCards: Card[] = [];
    const loadRoomCards = async (accId: string): Promise<Card[]> => {
      if (!accId) return [];
      const { data: rts } = await admin
        .from("room_types").select("id,name,description,capacity,size_sqm,room_photos(photo_url,display_order)")
        .eq("accommodation_id", accId).order("display_order").limit(3);
      const rooms = (rts ?? []) as any[];
      if (!rooms.length) return [];
      const roomIds = rooms.map((r) => r.id);

      const today = new Date().toISOString().slice(0, 10);
      const until = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();

      // 1) 房況日價：未來 30 天最低可售價
      const minPrice = new Map<string, number>();
      const { data: inv } = await admin
        .from("room_inventory_pricing").select("room_type_id, price, is_available, date")
        .in("room_type_id", roomIds).is("pricing_template_id", null)
        .gte("date", today).lte("date", until);
      for (const row of inv ?? []) {
        if ((row as any).is_available === false) continue;
        const p = Number((row as any).price ?? 0);
        if (p > 0) { const cur = minPrice.get((row as any).room_type_id); if (cur == null || p < cur) minPrice.set((row as any).room_type_id, p); }
      }
      // 2) fallback：同名包棟方案售價（未來 30 天最低）
      const missing = rooms.filter((r) => !minPrice.get(r.id));
      if (missing.length) {
        const { data: pkgs } = await admin
          .from("accommodation_packages").select("id,name,sale_price")
          .eq("accommodation_id", accId).in("name", missing.map((r) => r.name));
        const pkgList = (pkgs ?? []) as any[];
        if (pkgList.length) {
          const { data: dp } = await admin
            .from("package_date_prices").select("package_id, sale_price, date")
            .in("package_id", pkgList.map((p) => p.id)).gte("date", today).lte("date", until);
          const pkgMin = new Map<string, number>();
          for (const d2 of dp ?? []) {
            const sp = Number((d2 as any).sale_price ?? 0);
            if (sp > 0) { const c = pkgMin.get((d2 as any).package_id); if (c == null || sp < c) pkgMin.set((d2 as any).package_id, sp); }
          }
          for (const r of missing) {
            const pkg = pkgList.find((p) => p.name === r.name);
            if (!pkg) continue;
            const price = pkgMin.get(pkg.id) ?? Number(pkg.sale_price ?? 0);
            if (price > 0) minPrice.set(r.id, price);
          }
        }
      }

      // 館別名稱與封面（房型無照片時 fallback）
      const { data: accInfo } = await admin.from("accommodation_info").select("name").eq("id", accId).maybeSingle();
      const accName = String((accInfo as any)?.name ?? "");
      let accCover = "";
      try {
        const { data: accPhoto } = await admin.from("accommodation_photos")
          .select("photo_url,display_order").eq("accommodation_id", accId)
          .order("display_order", { ascending: true }).limit(1).maybeSingle();
        accCover = sanitizePhotoUrl((accPhoto as any)?.photo_url);
      } catch { /* 無封面 */ }

      const cards: Card[] = [];
      for (const rt of rooms) {
        const photos = (rt.room_photos ?? []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const photo = sanitizePhotoUrl(photos.map((p: any) => p?.photo_url).find((u: any) => !!u) ?? "") || accCover;
        const features = buildFeatureLine(rt.name, rt.description, [
          rt.capacity ? `${rt.capacity}人` : "",
          rt.size_sqm ? `${rt.size_sqm}坪` : "",
        ]);
        const price = minPrice.get(rt.id) ?? null;
        cards.push({
          name: rt.name,
          price: price != null && price > 0 ? price : null, // 房型不可顯示「免費」：查無有效售價即不顯示價格列
          cover_url: photo || null,
          accommodation_name: accName || undefined,
          subtitle: features || undefined,
          url: `${SITE_BASE}/book?accId=${encodeURIComponent(accId)}&roomId=${encodeURIComponent(rt.id)}`,
        });
      }
      return cards;
    };

    // 房型卡 + 行程卡共用同一套點擊追蹤（帶 send id）
    const buildCards = (sendId: string) => {
      const wrap = (u: string) => `${funcBase}/remarketing-track?s=${sendId}&c=${encodeURIComponent(campaignId)}&ch=email&u=${encodeURIComponent(u)}`;
      return cardsSectionHtml("推薦房型", roomCards, wrap) + cardsSectionHtml("主題行程", productCards, wrap);
    };
    const ensureUnsubUrl = async (email: string): Promise<string> => {
      try {
        const em = email.trim().toLowerCase();
        const { data: tok } = await admin.from("email_unsubscribe_tokens").select("token").eq("email", em).maybeSingle();
        let token = tok?.token as string | undefined;
        if (!token) {
          token = crypto.randomUUID().replace(/-/g, "");
          await admin.from("email_unsubscribe_tokens").upsert({ email: em, token }, { onConflict: "email" });
        }
        return `${funcBase}/remarketing-track?mode=unsub&t=${token}`;
      } catch (e) { console.error("[remarketing-send] unsub token failed", e); return ""; }
    };
    const personalize = (t: any): string => {
      const name = t?.display_name || "旅人";
      const tags = (t?.interest_tags ?? []).slice(0, 4);
      return tags.length
        ? `${name}，看您先前對「${tags.join("、")}」特別有興趣，小安幫您挑了幾個回訪好選擇。\n${baseBody}`.trim()
        : baseBody;
    };

    // 正式發送寫入：不依賴 ON CONFLICT（部分唯一索引帶 WHERE 條件，PostgREST upsert 無法指定 index predicate）。
    // 先查本活動該旅客的「正式列」(is_test=false) → 有則 update、無則 insert。
    const upsertRealSend = async (row: any): Promise<{ id: string | null; error: any }> => {
      const { data: ex } = await admin.from("remarketing_sends")
        .select("id").eq("campaign_id", campaignId).eq("traveler_profile_id", row.traveler_profile_id).eq("is_test", false).maybeSingle();
      if (ex?.id) {
        const { error } = await admin.from("remarketing_sends").update({ ...row, is_test: false }).eq("id", ex.id);
        return { id: ex.id, error };
      }
      const { data: ins, error } = await admin.from("remarketing_sends").insert({ ...row, is_test: false }).select("id").maybeSingle();
      return { id: (ins as any)?.id ?? null, error };
    };

    // 測試範例候選名單（供前端下拉）：命中名單前 10 位、跳過測試帳號、姓名遮蔽、標示是否有館別
    if (body?.mode === "test_candidates") {
      const cands = realTargets.slice(0, 10).map((t: any) => ({
        id: t.id,
        masked_name: maskName(t.display_name || "旅人"),
        has_accommodation: !!resolveAcc(t),
      }));
      const def = cands.find((c) => c.has_accommodation) ?? cands[0] ?? null;
      return json({ success: true, candidates: cands, default_id: def?.id ?? null });
    }

    // ===== 測試發送模式 =====
    if (isTestMode) {
      if (!testEmails.length) return json({ error: "測試模式需提供至少 1 個測試信箱" }, 400);
      if (testEmails.length > 5) return json({ error: "測試信箱最多 5 個" }, 400);
      const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const badFmt = testEmails.filter((e) => !emailRe.test(e));
      if (badFmt.length) return json({ error: `測試信箱格式錯誤：${badFmt.join("、")}` }, 400);
      const travelerEmailSet = new Set((profiles ?? []).map((p: any) => String(p.email ?? "").trim().toLowerCase()).filter(Boolean));
      const disallowed = testEmails.filter((e) => e !== callerEmail && travelerEmailSet.has(e));
      if (disallowed.length) {
        return json({ error: `測試信箱不可為真實旅客 Email：${disallowed.join("、")}（請改用管理員或非旅客信箱）` }, 400);
      }
      if (!RESEND_API_KEY) return json({ error: "Resend 未設定，無法測試發送" }, 500);

      const sampleId = typeof body?.sample_profile_id === "string" ? body.sample_profile_id : "";
      const example = (sampleId ? allTargets.find((t: any) => t.id === sampleId) : null) ?? pickExample();
      const exampleId = example?.id ?? null;
      if (!exampleId) return json({ error: "找不到可作為範例的旅客（分群 0 命中或皆為測試帳號）" }, 400);
      const exName = (example as any)?.display_name || "旅人";
      const personalBody = personalize(example);
      roomCards = await loadRoomCards(
        typeof content.accommodation_id === "string" && content.accommodation_id ? content.accommodation_id : resolveAcc(example),
      );

      const out: any[] = [];
      for (const email of testEmails) {
        const { data: pre, error: preErr } = await admin.from("remarketing_sends")
          .insert({ campaign_id: campaignId, traveler_profile_id: exampleId, channel: "email", recipient: email, message_body: personalBody, is_test: true, status: "sent" })
          .select("id").maybeSingle();
        if (preErr) { out.push({ email, error: preErr.message }); continue; }
        const sendId = (pre as any)?.id as string;
        const trackCta = rawCta ? `${funcBase}/remarketing-track?s=${sendId}&c=${encodeURIComponent(campaignId)}&ch=email&u=${encodeURIComponent(rawCta)}` : "";
        const unsubUrl = await ensureUnsubUrl(email);
        const openPixelUrl = `${funcBase}/remarketing-track?mode=open&s=${sendId}`;
        const html = emailHtml({ name: exName, body: `【測試信】此為內部測試，不會寄給分群名單。\n\n${personalBody}`, ctaText, ctaUrl: trackCta, productsHtml: buildCards(sendId), unsubUrl, openPixelUrl });
        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `[測試] ${subject}`, html }),
        });
        if (!resp.ok) {
          const t = await resp.text();
          console.error(`[remarketing-send:test] Resend ${resp.status}: ${t}`);
          await admin.from("remarketing_sends").update({ status: "failed", error_message: `Resend ${resp.status}: ${t.slice(0, 300)}` }).eq("id", sendId);
          out.push({ email, error: `Resend ${resp.status}` });
        } else {
          out.push({ email, ok: true });
        }
      }
      // 測試模式：不更新 campaign.status
      return json({
        success: true, mode: "test", example_traveler_id: exampleId, sample_profile_id: exampleId,
        trip_cards: productCards.length, room_cards: roomCards.length,
        matched: allTargets.length, sent: out.filter((o) => o.ok).length, results: out,
      });
    }

    // ===== 正式發送 =====
    roomCards = await loadRoomCards(
      typeof content.accommodation_id === "string" && content.accommodation_id ? content.accommodation_id : resolveAcc(pickExample() ?? {}),
    );
    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const t of targets) {
      const name = t.display_name || "旅人";
      const personalBody = personalize(t);
      const resolvedEmail = channel === "email" ? resolveEmail(t) : "";
      const sendRow: any = {
        campaign_id: campaignId,
        traveler_profile_id: t.id,
        channel,
        recipient: channel === "email" ? resolvedEmail : t.phone,
        message_body: personalBody,
      };

      if (channel === "line_share") {
        sendRow.status = "skipped";
        sendRow.error_message = "LINE 官方推播尚未介接，文案供人工複製發送";
        skipped++;
        const lineCta = rawCta
          ? `${funcBase}/remarketing-track?c=${encodeURIComponent(campaignId)}&ch=line&u=${encodeURIComponent(rawCta)}`
          : "";
        results.push({ traveler_id: t.id, name, text: `${subject}\n${personalBody}\n${lineCta || rawCta}` });
      } else if (!sendRow.recipient) {
        sendRow.status = "skipped";
        sendRow.error_message = "旅客無 Email";
        skipped++;
      } else if (suppressedSet.has(String(sendRow.recipient).toLowerCase())) {
        sendRow.status = "skipped";
        sendRow.error_message = "已退訂";
        skipped++;
      } else if (body?.dry_run) {
        sendRow.status = "skipped";
        sendRow.error_message = "dry_run";
        skipped++;
      } else if (!RESEND_API_KEY) {
        sendRow.status = "failed";
        sendRow.error_message = "Resend 未設定";
        failed++;
      } else {
        const { id: sendId, error: preErr } = await upsertRealSend({ ...sendRow, status: "sent" });
        if (preErr || !sendId) { failed++; results.push({ traveler_id: t.id, error: preErr?.message ?? "寫入失敗" }); continue; }

        const trackUrl = rawCta
          ? `${funcBase}/remarketing-track?s=${sendId}&c=${encodeURIComponent(campaignId)}&ch=email&u=${encodeURIComponent(rawCta)}`
          : "";
        const unsubUrl = await ensureUnsubUrl(String(sendRow.recipient));
        const openPixelUrl = `${funcBase}/remarketing-track?mode=open&s=${sendId}`;
        const html = emailHtml({ name, body: personalBody, ctaText, ctaUrl: trackUrl, productsHtml: buildCards(sendId), unsubUrl, openPixelUrl });

        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: FROM_EMAIL, to: [sendRow.recipient], subject, html }),
        });
        const respBody = await resp.text();
        if (!resp.ok) {
          failed++;
          console.error(`[remarketing-send] Resend ${resp.status}: ${respBody}`);
          await admin.from("remarketing_sends").update({ status: "failed", error_message: `Resend ${resp.status}: ${respBody.slice(0, 300)}` }).eq("id", sendId);
          results.push({ traveler_id: t.id, error: `Resend ${resp.status}` });
        } else {
          sent++;
          results.push({ traveler_id: t.id, email: sendRow.recipient, ok: true });
        }
        continue;
      }

      const { error: iErr } = await upsertRealSend(sendRow);
      if (iErr) results.push({ traveler_id: t.id, error: iErr.message });
    }

    if (!body?.dry_run && (sent > 0 || (channel === "line_share" && targets.length > 0))) {
      await admin.from("remarketing_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaignId);
    }

    return json({
      success: true,
      summary: summarizeSegment(campaign.segment),
      matched: targets.length,
      sent, failed, skipped,
      channel,
      results: results.slice(0, 100),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
