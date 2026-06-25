// Daily performance notification — invoked by pg_cron every minute.
// Sends email to service@lakeze.com for each accommodation whose
// performance_notification_settings.notify_time matches current Taipei time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "noreply@sensaninn.lakeze.com";
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

// ── Email rendering ────────────────────────────────────────
function defaultTemplate(hasFranchise: boolean): string {
  const general = `{日期}
【{民宿名稱}進單業績】

今日訂單：{今日訂單筆數} 筆，金額 {今日訂單}
今日訂單取消：{今日取消筆數} 筆，金額 {今日取消金額}

本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月({M}月)訂房達成率：{達成率}%

前月累積訂房業績：{前月累積}
年度累積訂房金額：{年度累積}`;

  if (hasFranchise) {
    return `{日期}\n【{民宿名稱}特許加盟紀錄報表】\n\n今日特許加盟銷售：{今日加盟銷售}\n本月累積銷售額：{加盟月累積}\n目標月銷售：{加盟月目標}/月\n\n本月銷售達成率({加盟月目標})：{加盟月達成率}%\n累積銷售業績：{加盟年累積}\n累積銷售達成率({加盟年目標})：{加盟年達成率}%\n-------------\n今日特許加盟訂房業績：{今日加盟訂房}萬\n本月累積訂房業績：{加盟訂房月累積}\n目標特許加盟訂房：{加盟訂房月目標}/月\n本月累積訂房達成率：{加盟訂房達成率}%\n\n特許加盟年度累積訂房金額：{加盟訂房年累積}\n------------\n【{民宿名稱}進單業績】\n\n今日一般訂房業績：{今日訂單}\n本月累積訂房業績：{月累積}\n目標訂房業績：{月目標}／月\n本月({M}月)累積訂房達成率：{達成率}%\n\n年度累積訂房金額：{年度累積}`;
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
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") || Deno.env.get("RESEND_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

  const html = `<pre style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size:14px; white-space:pre-wrap; line-height:1.7; color:#222;">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
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

    // Parse optional test_mode / test_date body
    let testMode = false;
    let testAccId: string | null = null;
    let testDate: string | null = null; // "YYYY-MM-DD" in Taipei
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && body.test_mode === true && typeof body.accommodation_id === "string") {
          testMode = true;
          testAccId = body.accommodation_id;
        }
        if (body && typeof body.test_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.test_date)) {
          testDate = body.test_date;
        }
      } catch { /* no body */ }
    }

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
      const { data: settingsRows, error: sErr } = await supabase
        .from("performance_notification_settings")
        .select("*")
        .eq("enabled", true)
        .eq("notify_time", hhmm);
      if (sErr) throw sErr;
      settings = settingsRows ?? [];
      if (settings.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, hhmm, matched: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const results: Array<{ accommodation_id: string; ok: boolean; error?: string }> = [];

    for (const s of settings) {
      const accId: string = s.accommodation_id;
      try {
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

        // ── General booking metrics ────────────────────────
        // Today orders (non-cancelled) — order_date is timestamptz, use Taipei-day UTC range
        const { data: todayOrders } = await applyTiansongExclusions(
          supabase
            .from("orders")
            .select("final_price, order_status")
            .eq("accommodation_id", accId)
            .gte("order_date", todayStartUtc)
            .lt("order_date", tomorrowStartUtc)
            .neq("order_status", "cancelled"),
        );
        const todayCount = (todayOrders ?? []).length;
        const todaySales = (todayOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Today cancellations (by updated_at within Taipei day)
        const { data: cancelOrders } = await applyTiansongExclusions(
          supabase
            .from("orders")
            .select("final_price")
            .eq("accommodation_id", accId)
            .eq("order_status", "cancelled")
            .gte("updated_at", todayStartUtc)
            .lt("updated_at", tomorrowStartUtc),
        );
        const cancelCount = (cancelOrders ?? []).length;
        const cancelAmount = (cancelOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Month accumulated (Taipei month → UTC range)
        const { data: monthOrders } = await applyTiansongExclusions(
          supabase
            .from("orders")
            .select("final_price")
            .eq("accommodation_id", accId)
            .neq("order_status", "cancelled")
            .gte("order_date", monthStartUtc)
            .lt("order_date", monthEndUtc),
        );
        const monthSales = (monthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Previous month accumulated
        const { data: prevMonthOrders } = await applyTiansongExclusions(
          supabase
            .from("orders")
            .select("final_price")
            .eq("accommodation_id", accId)
            .neq("order_status", "cancelled")
            .gte("order_date", prevMonthStartUtc)
            .lt("order_date", prevMonthEndUtc),
        );
        const prevMonthSales = (prevMonthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Year accumulated
        const { data: yearOrders } = await applyTiansongExclusions(
          supabase
            .from("orders")
            .select("final_price")
            .eq("accommodation_id", accId)
            .neq("order_status", "cancelled")
            .gte("order_date", yearStartUtc)
            .lt("order_date", yearEndUtc),
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
          "加盟訂房月累積": fmtMoney(franchiseBookingMonth),
          "加盟訂房月目標": toWan(fBookingTarget),
          "加盟訂房達成率": fmtPct(franchiseBookingMonth, fBookingTarget),
          "加盟訂房年累積": fmtMoney(franchiseBookingYear),
        };

        const tpl = (s.email_template && String(s.email_template).trim().length > 0)
          ? String(s.email_template)
          : defaultTemplate(hasFranchise);
        let body = applyVars(tpl, vars);

        // ── 異動提醒：今日 updated_at 在範圍內，但 order_date 不在範圍內，且未取消 ──
        const { data: modifiedOrders } = await supabase
          .from("orders")
          .select("order_number, order_date, order_status")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .gte("updated_at", todayStartUtc)
          .lt("updated_at", tomorrowStartUtc);
        const modifiedList = (modifiedOrders ?? []).filter((o: any) => {
          const od = o.order_date as string | null;
          if (!od) return true;
          return od < todayStartUtc || od >= tomorrowStartUtc;
        });
        if (modifiedList.length > 0) {
          const nums = modifiedList
            .map((o: any) => o.order_number)
            .filter((n: any) => !!n)
            .join("、");
          body += `\n\n⚠️ 今日有 ${modifiedList.length} 筆歷史訂單異動（不計入今日訂單）\n訂單編號：${nums}`;
        }

        const subject = `【${accName}紀錄報表】${dateLabel}`;

        await sendEmail(subject, body);

        // Also push to LINE (failure does not affect email flow)
        try {
          const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-line-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({
              event_type: "daily_performance",
              accommodation_id: accId,
              message: body,
            }),
          });
          if (!pushRes.ok) {
            const t = await pushRes.text().catch(() => "");
            console.error(`[send-daily-performance] line-push ${accId} failed: ${pushRes.status} ${t}`);
          }
        } catch (pushErr) {
          console.error(`[send-daily-performance] line-push ${accId} error:`, pushErr);
        }

        results.push({ accommodation_id: accId, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[send-daily-performance] ${accId} failed:`, msg);
        results.push({ accommodation_id: accId, ok: false, error: msg });
      }
    }

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
