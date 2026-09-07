// Daily performance notification — invoked by pg_cron every minute.
// Sends email to service@lakeze.com for each accommodation whose
// performance_notification_settings.notify_time matches current Taipei time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "noreply@lakeze.com";
const TO_EMAIL = "service@lakeze.com";

// ── Time helpers (Taipei = UTC+8, via Intl) ────────────────
// Returns Taipei wall-clock parts for a given UTC instant.
function getTaipeiParts(d: Date = new Date()): {
  y: number; m: number; day: number; hour: number; minute: number;
} {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "00" : parts.hour),
    minute: Number(parts.minute),
  };
}
const pad2 = (n: number) => String(n).padStart(2, "0");
// Date string "YYYY-MM-DD" from Taipei (y,m,d); month/day overflow handled by Date.UTC.
function taipeiDateStr(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
// UTC ISO of the instant when Taipei wall-clock is (y,m,d) 00:00:00.
// Taipei 00:00 == UTC of previous day 16:00 → use hour=-8 in Date.UTC.
function taipeiMidnightUtcISO(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0)).toISOString();
}
// Convert a timestamptz ISO string to Taipei date string "YYYY-MM-DD".
function isoToTaipeiDateStr(iso: string): string {
  const p = getTaipeiParts(new Date(iso));
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
}
function currentHHMM(): string {
  const p = getTaipeiParts();
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
function todayLabel(y: number, m: number, d: number): string {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}（${WEEK_ZH[dow]}）`;
}

// ── Format helpers ─────────────────────────────────────────
function fmtMoney(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US");
}
function fmtPct(num: number, denom: number): string {
  if (!denom || denom <= 0) return "0.00";
  return ((num / denom) * 100).toFixed(2);
}
function toWan(n: number): string {
  return `${Math.floor((n || 0) / 10000)}萬`;
}

// ── 訂單來源顯示名稱 ────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  website: "官網訂房",
  manual: "現場訂房",
  line: "Line@",
  agoda: "Agoda",
  booking: "Booking",
  trip: "Trip",
  travel_agency: "旅行社",
  peer_trade: "同業",
  kol: "KOL互惠",
  points_starchain: "星鏈會員",
  official_use: "公務使用",
  franchise_diff: "加盟價差",
  owner_provided: "業主自帶",
  accommodation_voucher: "住宿票卷",
  group_buy: "網紅團購",
  owlting: "奧丁丁",
};
function sourceLabel(v: string | null | undefined): string {
  const key = (v ?? "").trim();
  if (!key) return "未指定來源";
  return SOURCE_LABELS[key] ?? key;
}
// 依來源彙總金額／筆數，產生明細文字
function buildSourceBreakdown(
  rows: Array<{ final_price?: unknown; order_source?: string | null }> | null | undefined,
  title: string,
): string {
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows ?? []) {
    const key = sourceLabel(r.order_source);
    const cur = map.get(key) ?? { amount: 0, count: 0 };
    cur.amount += Number(r.final_price || 0);
    cur.count += 1;
    map.set(key, cur);
  }
  const list = [...map.entries()]
    .filter(([, v]) => v.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount);
  if (list.length === 0) return "";
  return `${title}\n` +
    list.map(([k, v]) => `・${k} NT$${fmtMoney(v.amount)}（${v.count} 筆）`).join("\n");
}

// ── Email rendering ────────────────────────────────────────
function defaultTemplate(hasFranchise: boolean): string {
  const general = `{日期}
【{民宿名稱}進單業績】

今日訂單：{今日訂單筆數} 筆，金額 {今日訂單}
今日訂單取消：{今日取消筆數} 筆，金額 {今日取消金額}

{今日來源明細}

本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月({M}月)訂房達成率：{達成率}%

前月累積訂房業績：{前月累積}
年度累積訂房金額：{年度累積}`;


  if (hasFranchise) {
    return `{日期}\n【{民宿名稱}特許加盟紀錄報表】\n\n今日特許加盟銷售：{今日加盟銷售}\n本月累積銷售額：{加盟月累積}\n目標月銷售：{加盟月目標}/月\n\n本月銷售達成率({加盟月目標})：{加盟月達成率}%\n累積銷售業績：{加盟年累積}\n累積銷售達成率({加盟年目標})：{加盟年達成率}%\n-------------\n今日特許加盟訂房業績：{今日加盟訂房筆數} 筆，金額 {今日加盟訂房}萬\n本月累積訂房業績：{加盟訂房月累積}\n目標特許加盟訂房：{加盟訂房月目標}/月\n本月累積訂房達成率：{加盟訂房達成率}%\n\n特許加盟年度累積訂房金額：{加盟訂房年累積}\n------------\n【{民宿名稱}進單業績】\n\n今日一般訂房業績：{今日訂單筆數} 筆，金額 {今日訂單}\n\n{今日來源明細}\n\n本月累積訂房業績：{月累積}\n目標訂房業績：{月目標}／月\n本月({M}月)累積訂房達成率：{達成率}%\n\n年度累積訂房金額：{年度累積}`;
  }
  return general;
}

function applyVars(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

// ── Resend ─────────────────────────────────────────────────
async function sendEmail(subject: string, text: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_LAKEZE") || Deno.env.get("RESEND_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

  const html = `<pre style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size:14px; white-space:pre-wrap; line-height:1.7; color:#222;">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject,
      html,
      text,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// ── 排程日誌 ────────────────────────────────────────────────
// 每一次推播／寄信都留下館別、時間、狀態與錯誤原因。
// 寫入 performance_notification_dispatch_log（若資料表尚未建立則僅寫 console，不影響發送）。
type DispatchLogRow = {
  run_id: string;
  run_mode: string;
  accommodation_id: string | null;
  accommodation_name?: string | null;
  sent_date: string;
  notify_time: string;
  channel: string; // run | line | email
  status: string; // started | success | failed | skipped
  target?: string | null;
  detail?: string | null;
  error?: string | null;
  duration_ms?: number | null;
};

async function logDispatch(supabase: any, row: DispatchLogRow) {
  console.log(`[send-daily-performance] ${JSON.stringify({ ...row, at: new Date().toISOString() })}`);
  try {
    const { error } = await supabase
      .from("performance_notification_dispatch_log")
      .insert({ ...row, created_at: new Date().toISOString() });
    if (error) {
      console.warn(`[send-daily-performance] dispatch log skipped: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[send-daily-performance] dispatch log exception: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Main ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const realTp = getTaipeiParts();
    const hhmm = `${pad2(realTp.hour)}:${pad2(realTp.minute)}`;

    // Parse optional test_mode / test_date / backfill body
    let testMode = false;
    let testAccId: string | null = null;
    let testDate: string | null = null; // "YYYY-MM-DD" in Taipei
    let backfill = false; // 手動補發：忽略 notify_time，仍保留同日同館去重
    let backfillAccId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && body.test_mode === true && typeof body.accommodation_id === "string") {
          testMode = true;
          testAccId = body.accommodation_id;
        }
        if (body && body.backfill === true) {
          backfill = true;
          if (typeof body.accommodation_id === "string") backfillAccId = body.accommodation_id;
        }
        if (body && typeof body.test_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.test_date)) {
          testDate = body.test_date;
        }
      } catch { /* no body */ }
    }
    // 補發模式不套用 test_mode 的跳過去重行為
    if (backfill) testMode = false;
    const runId = crypto.randomUUID();
    const runMode = backfill ? "backfill" : testMode ? "test" : "cron";




    // Effective "today" — overridden by test_date when provided
    const tp = testDate
      ? (() => {
          const [yy, mm, dd] = testDate.split("-").map(Number);
          return { y: yy, m: mm, day: dd, hour: realTp.hour, minute: realTp.minute };
        })()
      : realTp;
    const today = taipeiDateStr(tp.y, tp.m, tp.day);

    // UTC ISO boundaries for timestamptz columns (orders.order_date / updated_at)
    const todayStartUtc = taipeiMidnightUtcISO(tp.y, tp.m, tp.day);
    const tomorrowStartUtc = taipeiMidnightUtcISO(tp.y, tp.m, tp.day + 1);
    const monthStartUtc = taipeiMidnightUtcISO(tp.y, tp.m, 1);
    const monthEndUtc = taipeiMidnightUtcISO(tp.y, tp.m + 1, 1);
    const prevMonthStartUtc = taipeiMidnightUtcISO(tp.y, tp.m - 1, 1);
    const prevMonthEndUtc = monthStartUtc;
    const yearStartUtc = taipeiMidnightUtcISO(tp.y, 1, 1);
    const yearEndUtc = taipeiMidnightUtcISO(tp.y + 1, 1, 1);

    // Plain date strings (for `date`-typed columns like franchise sold_at/signed_at)
    const month = { start: taipeiDateStr(tp.y, tp.m, 1), end: taipeiDateStr(tp.y, tp.m + 1, 1) };
    const prevMonth = { start: taipeiDateStr(tp.y, tp.m - 1, 1), end: month.start };
    const year = { start: `${tp.y}-01-01`, end: `${tp.y + 1}-01-01` };
    const dateLabel = todayLabel(tp.y, tp.m, tp.day);

    let settings: any[] = [];
    if (testMode && testAccId) {
      const { data, error } = await supabase
        .from("performance_notification_settings")
        .select("*")
        .eq("accommodation_id", testAccId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        settings = [data];
      } else {
        // Fall back to defaults if no row exists yet
        settings = [{
          accommodation_id: testAccId,
          enabled: false,
          notify_time: hhmm,
          general_booking_target: 0,
          franchise_sales_target: 0,
          franchise_sales_year_target: 0,
          franchise_booking_target: 0,
          email_template: null,
        }];
      }
    } else {
      let q = supabase
        .from("performance_notification_settings")
        .select("*")
        .eq("enabled", true);
      // 補發模式：忽略 notify_time（可指定單一館別）
      if (backfill) {
        if (backfillAccId) q = q.eq("accommodation_id", backfillAccId);
      } else {
        q = q.eq("notify_time", hhmm);
      }
      const { data: settingsRows, error: sErr } = await q;
      if (sErr) throw sErr;
      settings = settingsRows ?? [];
      if (settings.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, hhmm, matched: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    const results: Array<{
      accommodation_id: string;
      ok: boolean;
      error?: string;
      email_ok?: boolean;
      line_pushed?: number;
      line_failed?: number;
    }> = [];

    await logDispatch(supabase, {
      run_id: runId,
      run_mode: runMode,
      accommodation_id: null,
      sent_date: today,
      notify_time: hhmm,
      channel: "run",
      status: "started",
      detail: `matched=${settings.length}`,
    });

    for (const s of settings) {
      const accId: string = s.accommodation_id;
      const notifyTimeKey = String(s.notify_time || hhmm);
      // 去重改為「分管道」：LINE 與 Email 各自記錄，成功後才寫入。
      let alreadyLine = false;
      let alreadyEmail = false;
      try {
        if (!testMode) {
          const { data: sentRows, error: sentErr } = await supabase
            .from("performance_notification_sent_log")
            .select("channel")
            .eq("accommodation_id", accId)
            .eq("sent_date", today)
            .eq("notify_time", notifyTimeKey);
          if (sentErr) throw sentErr;
          for (const r of sentRows ?? []) {
            const ch = String((r as any).channel ?? "line");
            if (ch === "email") alreadyEmail = true;
            else alreadyLine = true;
          }
          if (alreadyLine && alreadyEmail) {
            await logDispatch(supabase, {
              run_id: runId,
              run_mode: runMode,
              accommodation_id: accId,
              sent_date: today,
              notify_time: notifyTimeKey,
              channel: "run",
              status: "skipped",
              detail: "duplicate_skipped",
            });
            results.push({ accommodation_id: accId, ok: true, error: "duplicate_skipped" } as any);
            continue;
          }
        }


        // Accommodation name
        const { data: acc } = await supabase
          .from("accommodation_info")
          .select("name")
          .eq("id", accId)
          .maybeSingle();
        const accName = acc?.name ?? "(未命名)";

        // has_franchise flag
        const { data: flags } = await supabase
          .from("accommodation_info_flags")
          .select("has_franchise")
          .eq("accommodation_id", accId)
          .maybeSingle();
        const hasFranchise = !!flags?.has_franchise;

        // ── 天送幸福和苑：額外排除「團媽」(notes) 與「票卷訂房」(order_source) ──
        const TIANSONG_ID = "4ee31aca-5641-4d05-80e2-1c67626be83d";
        const isTiansong = accId === TIANSONG_ID;
        const applyTiansongExclusions = <T extends { not: Function; neq: Function }>(q: T): T => {
          if (!isTiansong) return q;
          // notes 不含「團媽」(含 null) + order_source != '票卷訂房' (含 null)
          return q
            .not("notes", "ilike", "%團媽%")
            .or("order_source.is.null,order_source.neq.票卷訂房") as T;
        };

        // ── 業績推播來源設定：被關閉的來源不計入 ──────────────
        const { data: sourceRuleRows } = await supabase
          .from("performance_notification_source_rules")
          .select("source, included")
          .eq("accommodation_id", accId);
        const excludedSources = (sourceRuleRows ?? [])
          .filter((r: any) => r.included === false)
          .map((r: any) => String(r.source))
          .filter((v: string) => v.length > 0);
        const applySourceRules = <T extends any>(qb: T): T => {
          if (excludedSources.length === 0) return qb;
          const list = excludedSources
            .map((v) => `"${v.replace(/"/g, '\\"')}"`)
            .join(",");
          // null 來源視為「未指定」，仍然計入
          return (qb as any).or(`order_source.is.null,order_source.not.in.(${list})`) as T;
        };

        // ── General booking metrics ────────────────────────
        // 全館別一致：期間以 order_date 為準，並排除「保留單」與 final_price <= 0 的訂單。
        // 天送另加：團媽/票卷訂房排除。
        const applyBookingFilters = <T extends any>(qb: T): T => {
          let q: any = applyTiansongExclusions(qb as any);
          q = q.neq("order_status", "hold").gt("final_price", 0);
          q = applySourceRules(q);
          return q as T;
        };


        const applyPeriodFilter = <T extends any>(qb: T, startDay: string, endDay: string): T => {
          let q: any = qb;
          if (isTiansong) {
            // 維持以 order_date timestamptz UTC 區間為準
            const startUtc = new Date(`${startDay}T00:00:00+08:00`).toISOString();
            // endDay 為「結束日（含）」，轉成隔日 00:00 為 exclusive 上界
            const [ey, em, ed] = endDay.split("-").map(Number);
            const endUtc = new Date(Date.UTC(ey, em - 1, ed + 1, -8, 0, 0)).toISOString();
            q = q.gte("order_date", startUtc).lt("order_date", endUtc);
          } else {
            // 期間基準統一為 order_date（與正式分潤試算一致）
            // 修正:date 字串在 PostgREST 比較 timestamptz 時會被當成 00:00,
            //      需展開為 UTC timestamptz 區間(台北 [start 00:00, endDay+1 00:00))才能涵蓋整天。
            const startUtc = new Date(`${startDay}T00:00:00+08:00`).toISOString();
            const [ey, em, ed] = endDay.split("-").map(Number);
            const endUtc = new Date(Date.UTC(ey, em - 1, ed + 1, -8, 0, 0)).toISOString();
            q = q.gte("order_date", startUtc).lt("order_date", endUtc);

          }
          return q as T;
        };

        // 期間字串（YYYY-MM-DD，含頭含尾）
        const todayStr = today;
        const monthStartStr = taipeiDateStr(tp.y, tp.m, 1);
        const monthEndStr = taipeiDateStr(tp.y, tp.m + 1, 0); // 上個月加一個月的「第 0 天」= 本月最後一天
        const prevMonthStartStr = taipeiDateStr(tp.y, tp.m - 1, 1);
        const prevMonthEndStr = taipeiDateStr(tp.y, tp.m, 0);
        const yearStartStr = `${tp.y}-01-01`;
        const yearEndStr = `${tp.y}-12-31`;

        // Today orders (non-cancelled)
        const { data: todayOrders } = await applyPeriodFilter(
          applyBookingFilters(
            supabase
              .from("orders")
              .select("final_price, order_status, order_source")
              .eq("accommodation_id", accId)
              .neq("order_status", "cancelled"),
          ),
          todayStr,
          todayStr,
        );
        const todayCount = (todayOrders ?? []).length;
        const todaySales = (todayOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Today cancellations (以 cancelled_at 為準；DB trigger 保證取消時必有值，
        // 避免批次更新刷新 updated_at 造成歷史取消單誤報)
        const { data: cancelOrders } = await applyBookingFilters(
          supabase
            .from("orders")
            .select("final_price")
            .eq("accommodation_id", accId)
            .eq("order_status", "cancelled")
            .gte("cancelled_at", todayStartUtc)
            .lt("cancelled_at", tomorrowStartUtc),
        );
        const cancelCount = (cancelOrders ?? []).length;
        const cancelAmount = (cancelOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Month accumulated
        const { data: monthOrders } = await applyPeriodFilter(
          applyBookingFilters(
            supabase
              .from("orders")
              .select("final_price, order_source")
              .eq("accommodation_id", accId)
              .neq("order_status", "cancelled"),
          ),
          monthStartStr,
          monthEndStr,
        );
        const monthSales = (monthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Previous month accumulated
        const { data: prevMonthOrders } = await applyPeriodFilter(
          applyBookingFilters(
            supabase
              .from("orders")
              .select("final_price")
              .eq("accommodation_id", accId)
              .neq("order_status", "cancelled"),
          ),
          prevMonthStartStr,
          prevMonthEndStr,
        );
        const prevMonthSales = (prevMonthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Year accumulated
        const { data: yearOrders } = await applyPeriodFilter(
          applyBookingFilters(
            supabase
              .from("orders")
              .select("final_price")
              .eq("accommodation_id", accId)
              .neq("order_status", "cancelled"),
          ),
          yearStartStr,
          yearEndStr,
        );
        const yearSales = (yearOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );


        const generalTarget = Number(s.general_booking_target || 0);

        // ── Franchise metrics (only if has_franchise) ──────
        let franchiseTodayCount = 0;
        let franchiseMonthSales = 0;
        let franchiseYearSales = 0;
        let franchiseBookingToday = 0;
        let franchiseBookingTodayCount = 0;
        let franchiseBookingMonth = 0;
        let franchiseBookingYear = 0;

        if (hasFranchise) {
          // Projects bound to this accommodation
          const { data: projects } = await supabase
            .from("franchise_projects")
            .select("id, name, accommodation_id")
            .eq("accommodation_id", accId);
          const projectNames = (projects ?? []).map((p: any) => p.name);

          if (projectNames.length > 0) {
            // Internal franchise_orders by plan_name — all-time for cumulative sales
            const { data: foAll } = await supabase
              .from("franchise_orders")
              .select("plan_price, quantity, sold_at")
              .in("plan_name", projectNames);
            for (const r of foAll ?? []) {
              const amt = Number((r as any).plan_price || 0) * Number((r as any).quantity || 1);
              const d = (r as any).sold_at as string | null;
              franchiseYearSales += amt; // all-time cumulative
              if (!d) continue;
              if (d >= month.start && d < month.end) franchiseMonthSales += amt;
              if (d === today) franchiseTodayCount += 1;
            }

            // External franchise_external_orders by project_name — all-time for cumulative sales
            const { data: feAll } = await supabase
              .from("franchise_external_orders")
              .select("plan_price, unit_count, signed_at")
              .in("project_name", projectNames);
            for (const r of feAll ?? []) {
              const amt = Number((r as any).plan_price || 0) * Number((r as any).unit_count || 1);
              const d = (r as any).signed_at as string | null;
              franchiseYearSales += amt; // all-time cumulative
              if (!d) continue;
              if (d >= month.start && d < month.end) franchiseMonthSales += amt;
              if (d === today) franchiseTodayCount += 1;
            }

            // Franchise booking via order_meta.franchise_project
            const { data: metaRows } = await supabase
              .from("order_meta")
              .select("order_id, franchise_project")
              .in("franchise_project", projectNames);
            const metaOrderIds = (metaRows ?? []).map((m: any) => m.order_id).filter(Boolean);

            if (metaOrderIds.length > 0) {
              const { data: bookingYear } = await supabase
                .from("orders")
                .select("id, final_price, order_date, order_status")
                .in("id", metaOrderIds)
                .neq("order_status", "cancelled")
                .neq("order_status", "hold")
                .gt("final_price", 0)

                .gte("order_date", yearStartUtc)
                .lt("order_date", yearEndUtc);
              for (const o of bookingYear ?? []) {
                const amt = Number((o as any).final_price || 0);
                const iso = (o as any).order_date as string | null;
                if (!iso) continue;
                const d = isoToTaipeiDateStr(iso); // YYYY-MM-DD in Taipei
                franchiseBookingYear += amt;
                if (d >= month.start && d < month.end) franchiseBookingMonth += amt;
                if (d === today) {
                  franchiseBookingToday += amt;
                  franchiseBookingTodayCount += 1;
                }
              }
            }
          }
        }

        // ── Build variable map ─────────────────────────────
        const fSalesTarget = Number(s.franchise_sales_target || 0);
        const fSalesYearTarget = Number(s.franchise_sales_year_target || 0);
        const fBookingTarget = Number(s.franchise_booking_target || 0);

        const vars: Record<string, string> = {
          "日期": dateLabel,
          "民宿名稱": accName,
          "M": String(tp.m),
          "今日訂單": fmtMoney(todaySales),
          "今日訂單筆數": String(todayCount),
          "今日取消筆數": String(cancelCount),
          "今日取消金額": fmtMoney(cancelAmount),
          "月累積": fmtMoney(monthSales),
          "月目標": toWan(generalTarget),
          "達成率": fmtPct(monthSales, generalTarget),
          "前月累積": fmtMoney(prevMonthSales),
          "年度累積": fmtMoney(yearSales),
          "今日加盟銷售": String(franchiseTodayCount),
          "加盟月累積": fmtMoney(franchiseMonthSales),
          "加盟月目標": toWan(fSalesTarget),
          "加盟月達成率": fmtPct(franchiseMonthSales, fSalesTarget),
          "加盟年累積": toWan(franchiseYearSales),
          "加盟年目標": toWan(fSalesYearTarget),
          "加盟年達成率": fmtPct(franchiseYearSales, fSalesYearTarget),
          "今日加盟訂房": fmtMoney(franchiseBookingToday),
          "今日加盟訂房筆數": String(franchiseBookingTodayCount),
          "加盟訂房月累積": fmtMoney(franchiseBookingMonth),
          "加盟訂房月目標": toWan(fBookingTarget),
          "加盟訂房達成率": fmtPct(franchiseBookingMonth, fBookingTarget),
          "加盟訂房年累積": fmtMoney(franchiseBookingYear),
          "今日來源明細": buildSourceBreakdown(todayOrders as any, "📊 今日來源明細"),
          "本月來源明細": buildSourceBreakdown(monthOrders as any, "📊 本月來源明細"),
        };


        // ── 載入該館通報模板（方案 B：多模板）──────────────
        const { data: tplRows } = await supabase
          .from("performance_notification_templates")
          .select("id, name, body, is_primary, include_modified_notice, enabled, display_order")
          .eq("accommodation_id", accId)
          .eq("enabled", true)
          .order("display_order", { ascending: true });
        const templates = (tplRows ?? []) as any[];
        const primaryTpl = templates.find((t) => t.is_primary) ?? null;

        const fallbackBody = (s.email_template && String(s.email_template).trim().length > 0)
          ? String(s.email_template)
          : defaultTemplate(hasFranchise);

        // ── 異動提醒：今日 updated_at 在範圍內，但 order_date 不在範圍內，且未取消 ──
        //    排除保留單（hold）與 0 元單，避免未成交訂單被列入通報
        const { data: modifiedOrders } = await supabase
          .from("orders")
          .select("order_number, order_date, order_status")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .neq("order_status", "hold")
          .gt("final_price", 0)
          .gte("updated_at", todayStartUtc)
          .lt("updated_at", tomorrowStartUtc);
        // 同一訂單當日多次修改：查詢結果本就是最終狀態，再依訂單編號去重一次
        const modifiedSeen = new Set<string>();
        const modifiedList = (modifiedOrders ?? []).filter((o: any) => {
          const od = o.order_date as string | null;
          const inRange = od ? od >= todayStartUtc && od < tomorrowStartUtc : false;
          if (inRange) return false;
          const key = String(o.order_number ?? "");
          if (key && modifiedSeen.has(key)) return false;
          if (key) modifiedSeen.add(key);
          return true;
        });
        const modifiedNotice = modifiedList.length > 0
          ? `\n\n⚠️ 今日有 ${modifiedList.length} 筆歷史訂單異動（金額／成交日變更，不計入今日訂單）\n訂單編號：${
            modifiedList.map((o: any) => o.order_number).filter((n: any) => !!n).join("、")
          }`
          : "";

        // ── 今日補登：created_at 為今日，但成交日（order_date）非今日 ──
        const taipeiDayOf = (iso: string | null | undefined) =>
          iso
            ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(iso))
            : "";
        const { data: createdToday } = await supabase
          .from("orders")
          .select("order_number, order_date, created_at, confirmed_at")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .neq("order_status", "hold")
          .gt("final_price", 0)
          .gte("created_at", todayStartUtc)
          .lt("created_at", tomorrowStartUtc);
        const backfillList = (createdToday ?? []).filter(
          (o: any) => o.order_date && taipeiDayOf(o.order_date) !== todayStr,
        );
        const backfillNotice = backfillList.length > 0
          ? `\n\n📝 今日補登 ${backfillList.length} 筆（依成交日計入該日業績）\n${
            backfillList
              .map((o: any) => `${o.order_number ?? "-"}（成交日 ${taipeiDayOf(o.order_date)}）`)
              .join("、")
          }`
          : "";

        // ── 保留轉正：今日轉正（confirmed_at 為今日）且建單日早於今日 ──
        const { data: confirmedToday } = await supabase
          .from("orders")
          .select("order_number, created_at, confirmed_at, order_date")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .neq("order_status", "hold")
          .gt("final_price", 0)
          .gte("confirmed_at", todayStartUtc)
          .lt("confirmed_at", tomorrowStartUtc);
        const holdConvertedList = (confirmedToday ?? []).filter(
          (o: any) => o.created_at && taipeiDayOf(o.created_at) !== todayStr,
        );
        const holdConvertedNotice = holdConvertedList.length > 0
          ? `\n\n🔁 保留轉正 ${holdConvertedList.length} 筆（成交日已更新為轉正日）\n${
            holdConvertedList.map((o: any) => o.order_number ?? "-").join("、")
          }`
          : "";

        const renderTemplate = (tpl: any | null): string => {
          const raw = tpl && String(tpl.body || "").trim().length > 0
            ? String(tpl.body)
            : fallbackBody;
          const withNotice = !tpl || tpl.include_modified_notice !== false;
          // 變數若為空字串（例如當日無來源明細），收斂多餘空行
          const rendered = applyVars(raw, vars).replace(/\n{3,}/g, "\n\n").trim();
          return rendered +
            (withNotice ? modifiedNotice + backfillNotice + holdConvertedNotice : "");
        };


        // 先推 LINE，再寄 Email；兩者互不影響，任一失敗都不中斷另一邊
        const body = renderTemplate(primaryTpl);
        const subject = `【${accName}紀錄報表】${dateLabel}`;

        // ── LINE：依群組所選模板分組推播 ────────────────────
        let linePushed = 0;
        let lineFailed = 0;
        if (alreadyLine) {
          await logDispatch(supabase, {
            run_id: runId,
            run_mode: runMode,
            accommodation_id: accId,
            accommodation_name: accName,
            sent_date: today,
            notify_time: notifyTimeKey,
            channel: "line",
            status: "skipped",
            detail: "already_pushed",
          });
        } else try {
          const { data: pushTargets } = await supabase
            .from("line_push_targets")
            .select("target_id, event_types, accommodation_ids, custom_venue_ids, custom_venue_names, performance_template_id")
            .eq("is_active", true)
            .contains("event_types", ["daily_performance"]);

          // 只取涵蓋本館的群組（空範圍 = 全部館別）
          const matched = (pushTargets ?? []).filter((t: any) => {
            if (!t.target_id) return false;
            const accIds: string[] = t.accommodation_ids ?? [];
            const venueIds: string[] = t.custom_venue_ids ?? [];
            const venueNames: string[] = t.custom_venue_names ?? [];
            const isAllVenues =
              accIds.length === 0 && venueIds.length === 0 && venueNames.length === 0;
            return isAllVenues || accIds.includes(accId);
          });

          // 依 template_id 分組（null → 完整版）
          const groups = new Map<string, string[]>();
          for (const t of matched) {
            const key = (t as any).performance_template_id ?? "__primary__";
            const arr = groups.get(key) ?? [];
            arr.push((t as any).target_id);
            groups.set(key, arr);
          }
          await logDispatch(supabase, {
            run_id: runId,
            run_mode: runMode,
            accommodation_id: accId,
            accommodation_name: accName,
            sent_date: today,
            notify_time: notifyTimeKey,
            channel: "line",
            status: "started",
            detail: `targets=${matched.length} groups=${groups.size}`,
          });

          for (const [key, targets] of groups) {
            const tpl = key === "__primary__"
              ? primaryTpl
              : (templates.find((t) => t.id === key) ?? primaryTpl);
            const message = renderTemplate(tpl);
            // LINE 單則上限 5000 字 → 過長切成多則
            const chunks: string[] = [];
            for (let i = 0; i < message.length; i += 4500) {
              chunks.push(message.slice(i, i + 4500));
            }
            for (let ci = 0; ci < chunks.length; ci++) {
              const chunk = chunks[ci];
              const startedAt = Date.now();
              try {
                const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-line-push`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceKey}`,
                    apikey: serviceKey,
                  },
                  body: JSON.stringify({ targets, message: chunk }),
                });
                const respText = await pushRes.text().catch(() => "");
                if (!pushRes.ok) {
                  lineFailed++;
                  await logDispatch(supabase, {
                    run_id: runId,
                    run_mode: runMode,
                    accommodation_id: accId,
                    accommodation_name: accName,
                    sent_date: today,
                    notify_time: notifyTimeKey,
                    channel: "line",
                    status: "failed",
                    target: targets.join(","),
                    detail: `tpl=${key} chunk=${ci + 1}/${chunks.length}`,
                    error: `${pushRes.status} ${respText}`.slice(0, 1000),
                    duration_ms: Date.now() - startedAt,
                  });
                } else {
                  linePushed++;
                  await logDispatch(supabase, {
                    run_id: runId,
                    run_mode: runMode,
                    accommodation_id: accId,
                    accommodation_name: accName,
                    sent_date: today,
                    notify_time: notifyTimeKey,
                    channel: "line",
                    status: "success",
                    target: targets.join(","),
                    detail: `tpl=${key} chunk=${ci + 1}/${chunks.length} resp=${respText.slice(0, 300)}`,
                    duration_ms: Date.now() - startedAt,
                  });
                }
              } catch (chunkErr) {
                lineFailed++;
                await logDispatch(supabase, {
                  run_id: runId,
                  run_mode: runMode,
                  accommodation_id: accId,
                  accommodation_name: accName,
                  sent_date: today,
                  notify_time: notifyTimeKey,
                  channel: "line",
                  status: "failed",
                  target: targets.join(","),
                  detail: `tpl=${key} chunk=${ci + 1}/${chunks.length}`,
                  error: chunkErr instanceof Error ? chunkErr.message : String(chunkErr),
                  duration_ms: Date.now() - startedAt,
                });
              }
            }
          }
        } catch (pushErr) {
          lineFailed++;
          await logDispatch(supabase, {
            run_id: runId,
            run_mode: runMode,
            accommodation_id: accId,
            accommodation_name: accName,
            sent_date: today,
            notify_time: notifyTimeKey,
            channel: "line",
            status: "failed",
            detail: "target_lookup_or_loop_error",
            error: pushErr instanceof Error ? pushErr.message : String(pushErr),
          });
        }

        // LINE 成功才寫入去重紀錄（失敗則保留可重送）
        if (!testMode && !alreadyLine && linePushed > 0) {
          await supabase
            .from("performance_notification_sent_log")
            .insert({
              accommodation_id: accId,
              sent_date: today,
              notify_time: notifyTimeKey,
              channel: "line",
            });
        }

        // ── Email：固定只寄「完整版」(is_primary)，一館一天一封 ──
        let emailOk = false;
        let emailErr: string | null = null;
        const emailStartedAt = Date.now();
        if (alreadyEmail) {
          emailOk = true;
          await logDispatch(supabase, {
            run_id: runId,
            run_mode: runMode,
            accommodation_id: accId,
            accommodation_name: accName,
            sent_date: today,
            notify_time: notifyTimeKey,
            channel: "email",
            status: "skipped",
            detail: "already_sent",
          });
        } else {
          try {
            const sent = await sendEmail(subject, body);
            emailOk = true;
            await supabase
              .from("performance_notification_sent_log")
              .insert({
                accommodation_id: accId,
                sent_date: today,
                notify_time: notifyTimeKey,
                channel: "email",
              });
            await logDispatch(supabase, {
              run_id: runId,
              run_mode: runMode,
              accommodation_id: accId,
              accommodation_name: accName,
              sent_date: today,
              notify_time: notifyTimeKey,
              channel: "email",
              status: "success",
              target: TO_EMAIL,
              detail: `from=${FROM_EMAIL} subject=${subject} id=${(sent as any)?.id ?? ""}`,
              duration_ms: Date.now() - emailStartedAt,
            });
          } catch (e) {
            emailErr = e instanceof Error ? e.message : String(e);
            await logDispatch(supabase, {
              run_id: runId,
              run_mode: runMode,
              accommodation_id: accId,
              accommodation_name: accName,
              sent_date: today,
              notify_time: notifyTimeKey,
              channel: "email",
              status: "failed",
              target: TO_EMAIL,
              detail: `from=${FROM_EMAIL} subject=${subject}`,
              error: emailErr.slice(0, 1000),
              duration_ms: Date.now() - emailStartedAt,
            });
          }
        }


        results.push({
          accommodation_id: accId,
          ok: emailOk || linePushed > 0,
          error: emailOk ? undefined : (emailErr ?? undefined),
          email_ok: emailOk,
          line_pushed: linePushed,
          line_failed: lineFailed,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logDispatch(supabase, {
          run_id: runId,
          run_mode: runMode,
          accommodation_id: accId,
          sent_date: today,
          notify_time: notifyTimeKey,
          channel: "run",
          status: "failed",
          error: msg.slice(0, 1000),
        });
        results.push({ accommodation_id: accId, ok: false, error: msg });
      }
    }


    await logDispatch(supabase, {
      run_id: runId,
      run_mode: runMode,
      accommodation_id: null,
      sent_date: today,
      notify_time: hhmm,
      channel: "run",
      status: "success",
      detail: `finished matched=${settings.length} ok=${results.filter((r) => r.ok).length}`,
    });

    return new Response(
      JSON.stringify({ ok: true, hhmm, matched: settings.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-daily-performance] fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
