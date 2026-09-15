// E2 點擊追蹤：GET /functions/v1/remarketing-track?s=<send_id>&u=<encoded url>
// 記錄 clicked_at 後 302 導向目標頁（僅允許白名單網域）
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_HOSTS = ["lakeze.com", "renke-hostel-pro.lovable.app", "lovable.app"];

function isAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sendId = url.searchParams.get("s") ?? "";
  const target = url.searchParams.get("u") ?? "";

  if (sendId) {
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
      await admin.from("remarketing_sends")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", sendId)
        .is("clicked_at", null);
    } catch (e) {
      console.error("[remarketing-track] update failed", e);
    }
  }

  const dest = isAllowed(target) ? target : "https://booking.lakeze.com/";
  return new Response(null, { status: 302, headers: { Location: dest } });
});
