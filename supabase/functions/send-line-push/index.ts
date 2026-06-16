import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface PushRequest {
  channel_id?: string;
  targets?: string[];
  roles?: string[];
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

  // 2. resolve targets by roles
  const targetSet = new Set<string>();
  (body.targets ?? []).forEach((t) => t && targetSet.add(t));

  if (body.roles && body.roles.length > 0) {
    const { data: roleTargets, error: rtErr } = await supabase
      .from("line_push_targets")
      .select("target_id, roles")
      .eq("is_active", true)
      .overlaps("roles", body.roles);
    if (rtErr) {
      return new Response(JSON.stringify({ error: rtErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    (roleTargets ?? []).forEach((t: any) => t.target_id && targetSet.add(t.target_id));
  }

  if (targetSet.size === 0) {
    return new Response(
      JSON.stringify({ error: "No targets resolved", sent: 0, results: [] }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 3. push
  const results: Array<{ target: string; ok: boolean; status: number; body: string }> = [];
  for (const to of targetSet) {
    try {
      const r = await pushOne(channel.channel_access_token, to, body.message);
      results.push({ target: to, ...r });
    } catch (e) {
      results.push({ target: to, ok: false, status: 0, body: String(e) });
    }
  }

  const success = results.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({
      channel_id: channel.id,
      total: results.length,
      success,
      failed: results.length - success,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
