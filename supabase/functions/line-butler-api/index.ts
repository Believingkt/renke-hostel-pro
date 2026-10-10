/**
 * line-butler-api：供 LIFF 頁面（/liff/checkout、/liff/favorites）讀寫 LINE 管家資料。
 * 不含金流；金流仍由既有 BookingFlow / TapPay / LINE Pay Edge Functions 處理。
 *
 * actions:
 *  - config          取得 LIFF_ID（前端 liff.init 用）
 *  - get_cart        取回 line_sessions.state.cart
 *  - clear_cart      清空暫存購物
 *  - list_favorites  收藏清單
 *  - remove_favorite 移除收藏
 *  - link_member     綁定會員（user_id）並合併 line_user_id 收藏
 *  - mark_order      成單後記錄 order_meta.line_user_id 並推播訂單確認
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { linePush, textMsg } from "../_shared/lineButler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** 從 Authorization 取會員 user_id（anon key／無效 token → null） */
async function jwtUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data?.user?.id ?? null;
}

/** 已驗證綁定的會員（line_sessions.member_user_id 只由 link_member 驗證後寫入） */
async function boundMemberId(lineUserId: string): Promise<string | null> {
  const { data } = await supabase.from("line_sessions").select("member_user_id").eq("line_user_id", lineUserId).maybeSingle();
  return data?.member_user_id ?? null;
}

type VerifyResult = { sub: string } | { error: string; description: string };

/** 以 LINE verify API 驗證 LIFF ID token（client_id＝LINE Login channel ID） */
async function verifyLiffIdToken(idToken: string, channelId: string): Promise<VerifyResult> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  const j = await res.json().catch(() => null);
  if (res.ok && typeof j?.sub === "string") return { sub: j.sub };
  return { error: String(j?.error ?? `http_${res.status}`), description: String(j?.error_description ?? "") };
}

/** 驗證用 channel ID 候選：LIFF_ID 前綴優先，LIFF_CHANNEL_ID 不同時再試 */
function liffChannelCandidates(): string[] {
  const prefix = (Deno.env.get("LIFF_ID") ?? "").split("-")[0].trim();
  const explicit = (Deno.env.get("LIFF_CHANNEL_ID") ?? "").trim();
  if (prefix && explicit && prefix !== explicit) {
    console.warn("[link_member] LIFF_CHANNEL_ID 與 LIFF_ID 前綴不一致，將依序嘗試");
  }
  return [...new Set([prefix, explicit].filter(Boolean))];
}

/** verify 錯誤 → 前端顯示用代碼 */
function verifyFailCode(r: { error: string; description: string }): "token_expired" | "channel_mismatch" | "verify_failed" {
  const d = r.description.toLowerCase();
  if (d.includes("expired")) return "token_expired";
  if (d.includes("audience") || d.includes("client_id") || d.includes("channel")) return "channel_mismatch";
  return "verify_failed";
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405, cors);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400, cors);
  }

  const action = String(body.action ?? "");
  const lineUserId = body.line_user_id ? String(body.line_user_id) : null;

  try {
    if (action === "config") {
      return json({ liff_id: Deno.env.get("LIFF_ID") ?? null }, 200, cors);
    }

    if (!lineUserId) return json({ error: "line_user_id required" }, 400, cors);

    if (action === "get_cart") {
      const { data } = await supabase
        .from("line_sessions")
        .select("state, member_user_id")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const state = (data?.state as any) ?? {};
      return json({ cart: state.cart ?? [], state, member_user_id: data?.member_user_id ?? null }, 200, cors);
    }

    if (action === "clear_cart") {
      const { data } = await supabase
        .from("line_sessions")
        .select("state")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const state = { ...((data?.state as any) ?? {}), cart: [] };
      await supabase.from("line_sessions").update({ state }).eq("line_user_id", lineUserId);
      return json({ ok: true }, 200, cors);
    }

    if (action === "list_favorites") {
      // user_id 只採信 JWT 或已驗證綁定，不採信 body.user_id
      const userId = (await jwtUserId(req)) ?? (await boundMemberId(lineUserId));
      const query = supabase
        .from("trip_favorites")
        .select("id, ref_type, ref_id, meta, created_at, user_id, line_user_id")
        .order("created_at", { ascending: false });
      const { data } = userId
        ? await query.or(`line_user_id.eq.${lineUserId},user_id.eq.${userId}`)
        : await query.eq("line_user_id", lineUserId);
      return json({ favorites: data ?? [] }, 200, cors);
    }

    if (action === "remove_favorite") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id required" }, 400, cors);
      const ownerId = (await jwtUserId(req)) ?? (await boundMemberId(lineUserId));
      await supabase
        .from("trip_favorites")
        .delete()
        .eq("id", id)
        .or(ownerId ? `line_user_id.eq.${lineUserId},user_id.eq.${ownerId}` : `line_user_id.eq.${lineUserId}`);
      return json({ ok: true }, 200, cors);
    }

    if (action === "link_member") {
      // 安全失敗：未設定 LIFF_CHANNEL_ID、未登入或 ID token 不符一律拒絕
      const channels = liffChannelCandidates();
      if (!channels.length) {
        console.warn("[link_member] reject: no channel id (LIFF_ID / LIFF_CHANNEL_ID 皆未設定)");
        return json({ error: "會員綁定暫未開放（channel 未設定）", code: "not_configured" }, 503, cors);
      }
      const userId = await jwtUserId(req);
      if (!userId) {
        console.warn("[link_member] reject: no valid member session (JWT)");
        return json({ error: "請先登入會員再綁定", code: "not_logged_in" }, 401, cors);
      }
      const idToken = body.id_token ? String(body.id_token) : "";
      if (!idToken) {
        console.warn("[link_member] reject: frontend sent no id_token");
        return json({ error: "沒有取得 LINE ID token，請從 LINE 內重新開啟此頁", code: "no_id_token" }, 400, cors);
      }
      let sub: string | null = null;
      let lastFail: { error: string; description: string } | null = null;
      for (const [i, ch] of channels.entries()) {
        const r = await verifyLiffIdToken(idToken, ch);
        if ("sub" in r) { sub = r.sub; break; }
        lastFail = r;
        console.warn(`[link_member] verify failed (candidate ${i + 1}/${channels.length}): ${r.error} ${r.description}`);
        if (verifyFailCode(r) === "token_expired") break;
      }
      if (!sub) {
        const code = lastFail ? verifyFailCode(lastFail) : "verify_failed";
        const msg = code === "token_expired"
          ? "LINE 登入已過期，請重新從 LINE 開啟此頁"
          : code === "channel_mismatch"
            ? "LINE 身分驗證失敗（channel 不符）"
            : "LINE 身分驗證失敗，請重新從 LINE 開啟";
        return json({ error: msg, code, detail: lastFail?.description ?? "" }, 403, cors);
      }
      if (sub !== lineUserId) {
        console.warn("[link_member] reject: id_token sub 與 line_user_id 不一致");
        return json({ error: "LINE 身分與目前帳號不一致，請重新從 LINE 開啟", code: "sub_mismatch" }, 403, cors);
      }
      await supabase
        .from("line_sessions")
        .upsert({ line_user_id: lineUserId, member_user_id: userId }, { onConflict: "line_user_id" });
      await supabase
        .from("trip_favorites")
        .update({ user_id: userId })
        .eq("line_user_id", lineUserId)
        .is("user_id", null);
      return json({ ok: true }, 200, cors);
    }

    if (action === "mark_order") {
      const orderId = String(body.order_id ?? "");
      if (!orderId) return json({ error: "order_id required" }, 400, cors);
      // 防護：只接受 30 分鐘內建立、尚未標記 LINE 的訂單
      const { data: target } = await supabase.from("orders").select("id, created_at").eq("id", orderId).maybeSingle();
      if (!target || Date.now() - new Date(target.created_at).getTime() > 30 * 60 * 1000) {
        return json({ error: "order not eligible" }, 400, cors);
      }
      const { data: existingMeta } = await supabase
        .from("order_meta")
        .select("line_user_id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (existingMeta?.line_user_id) return json({ ok: true, already: true }, 200, cors);
      await supabase
        .from("order_meta")
        .upsert({ order_id: orderId, line_user_id: lineUserId }, { onConflict: "order_id" });

      const { data: order } = await supabase
        .from("orders")
        .select("order_number, check_in_date, check_out_date, final_price")
        .eq("id", orderId)
        .maybeSingle();

      const token = Deno.env.get("LINE_BUTLER_ACCESS_TOKEN") ?? Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
      if (token && order) {
        await linePush(token, lineUserId, [
          textMsg(
            `訂房成功囉 🎉 訂單編號 ${order.order_number}\n${order.check_in_date} → ${order.check_out_date}\n金額 NT$ ${Number(
              order.final_price ?? 0,
            ).toLocaleString("en-US")}，期待與你相見 🧸`,
          ),
        ]);
      }
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "unknown action" }, 400, cors);
  } catch (e) {
    console.error("[line-butler-api]", e);
    return json({ error: String(e) }, 500, cors);
  }
});
