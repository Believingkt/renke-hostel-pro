// E2 點擊追蹤：GET /functions/v1/remarketing-track?s=<send_id>&u=<encoded url>
// 記錄 clicked_at 後 302 導向目標頁（僅允許白名單網域）
import { matchesExtraHost } from "../_shared/previewHosts.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_HOSTS = ["lakeze.com", "renke-hostel-pro.lovable.app", "lovable.app"];

function isAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return matchesExtraHost(host) || ALLOWED_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "click";
  const sendId = url.searchParams.get("s") ?? "";
  const target = url.searchParams.get("u") ?? "";
  const unsubToken = url.searchParams.get("t") ?? "";

  const admin = () => createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 開啟追蹤：1x1 透明 GIF
  if (mode === "open") {
    if (sendId) {
      try {
        await admin().from("remarketing_sends")
          .update({ opened_at: new Date().toISOString() })
          .eq("id", sendId).is("opened_at", null);
      } catch (e) { console.error("[remarketing-track] open update failed", e); }
    }
    const gif = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ]);
    return new Response(gif, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
  }

  // 退訂：沿用 email_unsubscribe_tokens，寫入 suppressed_emails（reason=unsubscribe）
  if (mode === "unsub") {
    let ok = false;
    if (unsubToken) {
      try {
        const sb = admin();
        const { data: tok } = await sb.from("email_unsubscribe_tokens")
          .select("email").eq("token", unsubToken).maybeSingle();
        if (tok?.email) {
          await sb.from("suppressed_emails")
            .upsert({ email: tok.email, reason: "unsubscribe", metadata: { source: "remarketing" } }, { onConflict: "email" });
          await sb.from("email_unsubscribe_tokens").update({ used_at: new Date().toISOString() }).eq("token", unsubToken);
          ok = true;
        }
      } catch (e) { console.error("[remarketing-track] unsub failed", e); }
    }
    const msg = ok ? "您已成功退訂，日後不會再收到行銷信件。" : "退訂連結無效或已過期。";
    return new Response(
      `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>退訂</title></head><body style="font-family:-apple-system,sans-serif;background:#f5f5f5;margin:0;padding:48px 16px;text-align:center;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 24px;"><h1 style="font-size:20px;color:#2d3344;">人客多 Lakeze</h1><p style="color:#6b7280;font-size:15px;line-height:1.8;">${msg}</p></div></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // 點擊追蹤（預設）：寫 clicked_at，並在轉址帶 UTM 供既有歸因（order_attributions）計 N1
  if (sendId) {
    try {
      await admin().from("remarketing_sends")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", sendId)
        .is("clicked_at", null);
    } catch (e) {
      console.error("[remarketing-track] update failed", e);
    }
  }

  const base = isAllowed(target) ? target : "https://booking.lakeze.com/";
  let dest = base;
  try {
    const d = new URL(base);
    d.searchParams.set("utm_source", "remarketing");
    d.searchParams.set("utm_medium", url.searchParams.get("ch") === "line" ? "line" : "email");
    const camp = url.searchParams.get("c");
    if (camp) d.searchParams.set("utm_campaign", camp);
    if (sendId) d.searchParams.set("utm_content", sendId);
    dest = d.toString();
  } catch { /* 非標準 URL 則用原目的地 */ }
  return new Response(null, { status: 302, headers: { Location: dest } });
});
