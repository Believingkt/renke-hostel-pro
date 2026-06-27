import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface PushRequest {
  channel_id?: string;
  // 直接指定模式：跳過所有篩選，直接推給這些 target_id
  targets?: string[];
  // 事件廣播模式：依 event_types 查 line_push_targets
  event_type?: string;
  accommodation_id?: string;
  venue_name?: string;
  // 排除清單：最終 target 集合會移除這些 ID（避免重複推播）
  exclude_targets?: string[];
  message: string;
}

async function pushOne(token: string, to: string, message: string) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: message }],
    }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function currentMinuteBucket(): string {
  // YYYY-MM-DD HH:MM (UTC)
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: PushRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. resolve channel
  let channelQuery = supabase
    .from("line_oa_channels")
    .select("id, channel_access_token, is_active")
    .eq("is_active", true);
  if (body.channel_id) {
    channelQuery = supabase
      .from("line_oa_channels")
      .select("id, channel_access_token, is_active")
      .eq("id", body.channel_id);
  }
  const { data: channels, error: chErr } = await channelQuery.limit(1);
  if (chErr || !channels || channels.length === 0) {
    return new Response(JSON.stringify({ error: "No active channel found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const channel = channels[0];
  if (!channel.channel_access_token) {
    return new Response(JSON.stringify({ error: "Channel has no access token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. resolve targets
  const targetSet = new Set<string>();

  // 2a. 直接指定模式 (targets[])：完全跳過篩選
  (body.targets ?? []).forEach((t) => t && targetSet.add(t));

  // 2b. 事件廣播模式 (event_type)：用 event_types 篩選 line_push_targets
  if (body.event_type) {
    const { data: evTargets, error: evErr } = await supabase
      .from("line_push_targets")
      .select("target_id, event_types, accommodation_ids, custom_venue_names")
      .eq("is_active", true)
      .contains("event_types", [body.event_type]);
    if (evErr) {
      return new Response(JSON.stringify({ error: evErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    (evTargets ?? []).forEach((t: any) => {
      if (!t.target_id) return;
      const accIds: string[] = t.accommodation_ids ?? [];
      const venueNames: string[] = t.custom_venue_names ?? [];
      const isAllVenues = accIds.length === 0 && venueNames.length === 0;
      if (!isAllVenues) {
        const accMatch = body.accommodation_id && accIds.includes(body.accommodation_id);
        const venueMatch = body.venue_name && venueNames.includes(body.venue_name);
        if (!accMatch && !venueMatch) return;
      }
      targetSet.add(t.target_id);
    });
  }

  // 2c. 排除清單
  (body.exclude_targets ?? []).forEach((t) => t && targetSet.delete(t));

  if (targetSet.size === 0) {
    return new Response(
      JSON.stringify({ error: "No targets resolved", sent: 0, results: [], deduped: 0 }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. 計算 dedup key（message hash + 分鐘 bucket）
  const messageHash = await sha256Hex(body.message);
  const minuteBucket = currentMinuteBucket();

  // 4. push（每個 target 先嘗試寫 dedup log，撞 UNIQUE 則跳過）
  const results: Array<{ target: string; ok: boolean; status: number; body: string; deduped?: boolean }> = [];
  const dedupedTargets: string[] = [];

  for (const to of targetSet) {
    // 4a. 嘗試插入 dedup log
    const { error: dedupErr } = await supabase
      .from("line_push_dedup_log")
      .insert({
        target_id: to,
        message_hash: messageHash,
        minute_bucket: minuteBucket,
      });

    if (dedupErr) {
      const code = (dedupErr as any).code;
      if (code === "23505") {
        // 同一分鐘內、同一對象、同一訊息已推過 → 跳過
        console.log(
          `[send-line-push] DEDUPED target=${to} hash=${messageHash.slice(0, 12)} bucket=${minuteBucket}`,
        );
        dedupedTargets.push(to);
        results.push({
          target: to,
          ok: true,
          status: 0,
          body: "deduped (duplicate within same minute)",
          deduped: true,
        });
        continue;
      }
      // 其他錯誤（例如 DB 暫時不可用）→ 為保險起見仍嘗試推播，但記錄
      console.error(`[send-line-push] dedup log insert error for ${to}:`, dedupErr);
    }

    // 4b. 正常推播
    try {
      const r = await pushOne(channel.channel_access_token, to, body.message);
      results.push({ target: to, ...r });
    } catch (e) {
      results.push({ target: to, ok: false, status: 0, body: String(e) });
    }
  }

  const success = results.filter((r) => r.ok && !r.deduped).length;
  const deduped = dedupedTargets.length;
  return new Response(
    JSON.stringify({
      channel_id: channel.id,
      total: results.length,
      success,
      failed: results.length - success - deduped,
      deduped,
      deduped_targets: dedupedTargets,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
