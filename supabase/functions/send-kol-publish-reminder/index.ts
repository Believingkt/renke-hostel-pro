// Daily KOL publish deadline reminder
// Trigger: pg_cron (daily 09:30 Taipei = 01:30 UTC)
// Finds KOL profiles with check_in_date = today (Taipei) - 14 days, is_error=false
//（含同住合拍的附屬記錄），且「成功訂房」以訂單狀態派生判定（與 TeamKOL 畫面一致：
// 有訂單編號時以 PMS 訂單 order_status 為準，無編號時保留 DB booking_status），
// then pushes a LINE reminder to line_push_targets
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

  // 測試用參數（僅供人工乾跑）：?dry_run=1&target_date=YYYY-MM-DD
  // dry_run 時只回傳組好的訊息，不推播、不寫 dedup。篩選邏輯完全共用。
  const url = new URL(req.url);
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry_run") ?? "").toLowerCase());
  const overrideDate = url.searchParams.get("target_date");

  const today = taipeiToday();
  const targetCheckIn = /^\d{4}-\d{2}-\d{2}$/.test(overrideDate ?? "")
    ? overrideDate!
    : addDays(today, -14);

  try {
    // 1. 撈 KOL 主要記錄（不再以 booking_status 欄位篩選，改為與畫面一致的派生判定）
    const { data: kolsRaw, error: kolErr } = await supabase
      .from("kol_profiles")
      .select("id, name, ig_handle, short_url, check_in_date, scout_id, publish_date, publish_url, venue_name, venue_id, accommodation_id, order_number, booking_status")
      .eq("check_in_date", targetCheckIn)
      // 同住合拍的附屬記錄也要收到發文提醒（各自都要發影片），故不再排除子檔
      .eq("is_error", false);

    if (kolErr) throw kolErr;

    // 1b. 依 order_number 批次查 orders.order_status，派生「成功訂房」（比照 TeamKOL 畫面邏輯）
    const orderNumbers = Array.from(
      new Set(
        (kolsRaw ?? [])
          .map((k: any) => (k.order_number ?? "").trim())
          .filter((s: string) => s.length > 0)
      )
    );
    const orderStatusMap = new Map<string, string>();
    if (orderNumbers.length > 0) {
      const { data: ordRows, error: ordErr } = await supabase
        .from("orders")
        .select("order_number, order_status")
        .in("order_number", orderNumbers);
      if (ordErr) throw ordErr;
      (ordRows ?? []).forEach((o: any) => {
        if (o.order_number) orderStatusMap.set(o.order_number, o.order_status);
      });
    }
    // 派生規則與畫面 deriveBookingStatus 完全一致：
    // 無訂單編號 → 保留 DB booking_status；有編號時以 PMS 訂單狀態為準
    // confirmed → 成功訂房；cancelled → 已取消；查無此單 → 保留 DB 原值（非 PMS 館別）；其他 → 訂房確認中
    const deriveBookingStatus = (orderNumber: any, fallback: any): string => {
      const key = (orderNumber ?? "").trim();
      if (!key) return fallback ?? "";
      const os = orderStatusMap.get(key);
      if (os === "confirmed") return "成功訂房";
      if (os === "cancelled") return "已取消";
      if (os === undefined) return fallback ?? "";
      return "訂房確認中";
    };
    const eligibleByStatus = (kolsRaw ?? []).filter(
      (k: any) => deriveBookingStatus(k.order_number, k.booking_status) === "成功訂房"
    );

    // 方案 A：保留 14 天範圍內所有「成功訂房」的 KOL。
    // 有 publish_url 視為「已上片」，通知帶連結；
    // 無 publish_url 視為「未上片」，維持原追蹤提醒。
    // 不再因 publish_date 也有值就排除。
    const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== "";
    const kols = eligibleByStatus;

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

    // 2b. 撈館別名稱（venue_name 為空時，依 venue_id / accommodation_id 補）
    const venueIds = Array.from(new Set(kols.map((k: any) => k.venue_id).filter(Boolean)));
    const accIds = Array.from(new Set(kols.map((k: any) => k.accommodation_id).filter(Boolean)));
    const venueMap = new Map<string, string>();
    const accMap = new Map<string, string>();
    if (venueIds.length > 0) {
      const { data: vs } = await supabase.from("kol_venues").select("id, name").in("id", venueIds);
      (vs ?? []).forEach((v: any) => venueMap.set(v.id, v.name));
    }
    if (accIds.length > 0) {
      const { data: as_ } = await supabase.from("accommodation_info").select("id, name").in("id", accIds);
      (as_ ?? []).forEach((a: any) => accMap.set(a.id, a.name));
    }
    const venueOf = (k: any) =>
      (hasVal(k.venue_name) && k.venue_name) ||
      (k.venue_id && venueMap.get(k.venue_id)) ||
      (k.accommodation_id && accMap.get(k.accommodation_id)) ||
      "未提供";

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

    // 5. 組訊息 - 依 publish_url 有無分兩種格式
    const pendingBlocks: string[] = []; // 無 publish_url → 請星探追蹤
    const uploadedBlocks: string[] = []; // 有 publish_url → 已上片帶連結
    for (const k of kols as any[]) {
      const social = hasVal(k.ig_handle) ? k.ig_handle : "未提供";
      const scoutName = k.scout_id ? (scoutMap.get(k.scout_id) || "未指定") : "未指定";
      const venue = venueOf(k);
      const hasUrl = hasVal(k.publish_url);

      if (!hasUrl) {
        const deadline = addDays(k.check_in_date, 14);
        pendingBlocks.push(
          `網紅名稱：${k.name || "未提供"}\n網紅社群連結：${social}\n入住館別：${venue}\n入住日期：${k.check_in_date}\n上片期限：${deadline}\n負責星探：${scoutName}`,
        );
      } else {
        const publishDate = hasVal(k.publish_date) ? k.publish_date : "未填發布日期";
        uploadedBlocks.push(
          `網紅名稱：${k.name || "未提供"}\n網紅社群連結：${social}\n入住館別：${venue}\n入住日期：${k.check_in_date}\n發布日期：${publishDate}\n上片連結：${k.publish_url}\n負責星探：${scoutName}`,
        );
      }
    }

    const sections: string[] = [];
    if (pendingBlocks.length > 0) {
      sections.push(`KOL上片期限通知‼️請星探追蹤\n\n${pendingBlocks.join("\n\n")}`);
    }
    if (uploadedBlocks.length > 0) {
      sections.push(`KOL上片期限通知 ✅ 已上片\n\n${uploadedBlocks.join("\n\n")}`);
    }
    const message = sections.join("\n\n");

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          today,
          target_check_in: targetCheckIn,
          kol_count: kols.length,
          pending_count: pendingBlocks.length,
          uploaded_count: uploadedBlocks.length,
          target_count: targets.length,
          message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
