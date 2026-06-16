import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function hmacSha256Base64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  let bin = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function findMatchingChannel(rawBody: string, signature: string) {
  const { data: channels } = await supabase
    .from("line_oa_channels")
    .select("id, channel_secret, channel_access_token")
    .eq("is_active", true);
  if (!channels) return null;
  for (const ch of channels) {
    if (!ch.channel_secret) continue;
    const expected = await hmacSha256Base64(ch.channel_secret, rawBody);
    if (expected === signature) return ch;
  }
  return null;
}

async function fetchGroupSummary(token: string, groupId: string) {
  try {
    const r = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      await r.text();
      return null;
    }
    const j = await r.json();
    return j as { groupName?: string };
  } catch (_e) {
    return null;
  }
}

async function handleEvents(channel: any, events: any[]) {
  for (const ev of events) {
    try {
      console.log('[line-webhook] event:', ev.type, JSON.stringify(ev.source));
      if (ev.type === "join" && ev.source?.type === "group") {
        const groupId = ev.source.groupId;
        const summary = await fetchGroupSummary(channel.channel_access_token, groupId);
        const displayName = summary?.groupName ?? null;

        const { data: existing } = await supabase
          .from("line_push_targets")
          .select("id")
          .eq("target_type", "group")
          .eq("target_id", groupId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("line_push_targets")
            .update({
              display_name: displayName,
              channel_id: channel.id,
              is_active: true,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("line_push_targets").insert({
            target_type: "group",
            target_id: groupId,
            display_name: displayName,
            channel_id: channel.id,
            roles: [],
            is_active: true,
          });
        }
      } else if (ev.type === "follow" && ev.source?.type === "user") {
        const userId = ev.source.userId;
        const { data: existing } = await supabase
          .from("line_push_targets")
          .select("id")
          .eq("target_type", "user")
          .eq("target_id", userId)
          .maybeSingle();

        if (!existing) {
          await supabase.from("line_push_targets").insert({
            target_type: "user",
            target_id: userId,
            channel_id: channel.id,
            roles: [],
            is_active: true,
          });
        }
      }
    } catch (e) {
      console.error("event handle error", e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("x-line-signature") ?? "";
  const rawBody = await req.text();

  const channel = await findMatchingChannel(rawBody, signature);
  if (!channel) {
    console.warn("LINE webhook signature mismatch");
    return new Response("invalid signature", { status: 401, headers: corsHeaders });
  }

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  // Process asynchronously to respond fast (<1s)
  handleEvents(channel, events).catch((e) => console.error(e));

  return new Response("ok", {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});
