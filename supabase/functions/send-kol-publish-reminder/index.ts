// Daily KOL publish deadline reminder
// Trigger: pg_cron (daily 09:30 Taipei = 01:30 UTC)
// Finds KOL profiles with check_in_date = today (Taipei) - 14 days, booking_status='成功訂房',
// primary_profile_id IS NULL, is_error=false, and pushes a LINE reminder to line_push_targets
// subscribed to event_type 'kol_publish_reminder'.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function currentMinuteBucket(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

async function pushOne(token: string, to: string, message: string) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text: message }] }),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const today = taipeiToday();
  const targetCheckIn = addDays(today, -14);

  try {
    // 1. 撈 KOL 主要記錄
    const { data: kolsRaw, error: kolErr } = await supabase
      .from("kol_profiles")
      .select("id, name, ig_handle, short_url, check_in_date, scout_id, publish_date, publish_url")
      .eq("check_in_date", targetCheckIn)
      .eq("booking_status", "成功訂房")
      .is("primary_profile_id", null)
      .eq("is_error", false);

    if (kolErr) throw kolErr;

    // 過濾：排除 publish_date 與 publish_url 皆有值（非空字串）的已完成記錄
    const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== "";
    const kols = (kolsRaw ?? []).filter((k: any) => !(hasVal(k.publish_date) && hasVal(k.publish_url)));

    if (!kols || kols.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, today, target_check_in: targetCheckIn, kol_count: 0, sent: 0, note: "no eligible KOL" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. 撈星探 display_name
    const scoutIds = Array.from(new Set(kols.map((k: any) => k.scout_id).filter(Boolean)));
    const scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: scouts } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      (scouts ?? []).forEach((s: any) => scoutMap.set(s.user_id, s.display_name));
    }

    // 3. 撈推播目標
    const { data: targets, error: tErr } = await supabase
      .from("line_push_targets")
      .select("target_id")
      .eq("is_active", true)
      .contains("event_types", ["kol_publish_reminder"]);
    if (tErr) throw tErr;

    if (!targets || targets.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, today, target_check_in: targetCheckIn, kol_count: kols.length, sent: 0, note: "no push targets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. 撈頻道
    const { data: channels, error: chErr } = await supabase
      .from("line_oa_channels")
      .select("channel_access_token")
      .eq("is_active", true)
      .limit(1);
    if (chErr) throw chErr;
    const token = channels?.[0]?.channel_access_token;
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: "No active LINE channel" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. 組訊息 - 依 publish_date / publish_url 狀態分兩種格式
    const pendingBlocks: string[] = []; // 兩者皆空 → 第一種
    const partialBlocks: string[] = []; // 任一有值但未完成 → 第二種
    for (const k of kols as any[]) {
      const social = hasVal(k.ig_handle) ? k.ig_handle : "未提供";
      const scoutName = k.scout_id ? (scoutMap.get(k.scout_id) || "未指定") : "未指定";
      const hasDate = hasVal(k.publish_date);
      const hasUrl = hasVal(k.publish_url);

      if (!hasDate && !hasUrl) {
        const deadline = addDays(k.check_in_date, 14);
        pendingBlocks.push(
          `網紅名稱：${k.name || "未提供"}\n網紅社群連結：${social}\n入住日期：${k.check_in_date}\n上片期限：${deadline}\n負責星探：${scoutName}`,
        );
      } else {
        partialBlocks.push(
          `網紅名稱：${k.name || "未提供"}\n網紅社群連結：${social}\n發布日期：${hasDate ? k.publish_date : "請補填"}\n發布連結：${hasUrl ? k.publish_url : "請補填"}\n負責星探：${scoutName}`,
        );
      }
    }

    const sections: string[] = [];
    if (pendingBlocks.length > 0) {
      sections.push(`KOL上片期限通知‼️請星探追蹤\n\n${pendingBlocks.join("\n\n")}`);
    }
    if (partialBlocks.length > 0) {
      sections.push(`KOL上片期限通知 ⚠️ 請補填資訊\n\n${partialBlocks.join("\n\n")}`);
    }
    const message = sections.join("\n\n");

    const messageHash = await sha256Hex(message);
    const minuteBucket = currentMinuteBucket();

    // 6. 逐一推播 + dedup
    const results: any[] = [];
    for (const t of targets as any[]) {
      const to = t.target_id;
      if (!to) continue;

      const { error: dedupErr } = await supabase
        .from("line_push_dedup_log")
        .insert({ target_id: to, message_hash: messageHash, minute_bucket: minuteBucket });
      if (dedupErr && (dedupErr as any).code === "23505") {
        results.push({ target: to, deduped: true });
        continue;
      }

      const r = await pushOne(token, to, message);
      results.push({ target: to, ...r });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        today,
        target_check_in: targetCheckIn,
        kol_count: kols.length,
        target_count: targets.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-kol-publish-reminder] error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
