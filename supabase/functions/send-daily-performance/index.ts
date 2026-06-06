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

// ── Time helpers (Taipei = UTC+8) ──────────────────────────
function taipeiNow(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function currentHHMM(): string {
  const d = taipeiNow();
  return d.toISOString().slice(11, 16); // HH:MM
}
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
function todayLabel(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK_ZH[d.getUTCDay()]}）`;
}
function monthRange(d: Date): { start: string; end: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return { start: ymd(start), end: ymd(end) };
}
function prevMonthRange(d: Date): { start: string; end: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: ymd(start), end: ymd(end) };
}
function yearRange(d: Date): { start: string; end: string } {
  const y = d.getUTCFullYear();
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
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
  if (hasFranchise) {
    return `{日期}
【{民宿名稱}特許加盟紀錄報表】

今日特許加盟銷售：{今日加盟銷售}
本月累積銷售額：{加盟月累積}
目標月銷售：{加盟月目標}/月
本月銷售達成率：{加盟月達成率}%
累積銷售業績：{加盟年累積}
累積銷售達成率：{加盟年達成率}%
-------------
今日特許加盟訂房業績：{今日加盟訂房}
本月累積訂房業績：{加盟訂房月累積}
目標特許加盟訂房：{加盟訂房月目標}/月
本月累積訂房達成率：{加盟訂房達成率}%
特許加盟年度累積訂房金額：{加盟訂房年累積}
------------
【{民宿名稱}進單業績】

今日一般訂房業績：{今日訂單}
本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月訂房達成率：{達成率}%
年度累積訂房金額：{年度累積}`;
  }
  return `{日期}
【{民宿名稱}進單業績】

今日一般訂房業績：{今日訂單}
本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月訂房達成率：{達成率}%
年度累積訂房金額：{年度累積}`;
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

    const now = taipeiNow();
    const today = ymd(now);
    const hhmm = currentHHMM();
    const month = monthRange(now);
    const prevMonth = prevMonthRange(now);
    const year = yearRange(now);
    const dateLabel = todayLabel(now);

    // Parse optional test_mode body
    let testMode = false;
    let testAccId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && body.test_mode === true && typeof body.accommodation_id === "string") {
          testMode = true;
          testAccId = body.accommodation_id;
        }
      } catch { /* no body */ }
    }

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

        // ── General booking metrics ────────────────────────
        // Today orders (non-cancelled)
        const { data: todayOrders } = await supabase
          .from("orders")
          .select("final_price, order_status")
          .eq("accommodation_id", accId)
          .eq("order_date", today)
          .neq("order_status", "cancelled");
        const todaySales = (todayOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Today cancellations (by updated_at within Taipei day)
        const todayStartUtc = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 8 * 60 * 60 * 1000,
        ).toISOString();
        const todayEndUtc = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - 8 * 60 * 60 * 1000,
        ).toISOString();
        const { data: cancelOrders } = await supabase
          .from("orders")
          .select("final_price")
          .eq("accommodation_id", accId)
          .eq("order_status", "cancelled")
          .gte("updated_at", todayStartUtc)
          .lt("updated_at", todayEndUtc);
        const cancelCount = (cancelOrders ?? []).length;
        const cancelAmount = (cancelOrders ?? []).reduce(
          (sum, o: any) => sum + Number(o.final_price || 0),
          0,
        );

        // Month accumulated
        const { data: monthOrders } = await supabase
          .from("orders")
          .select("final_price")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .gte("order_date", month.start)
          .lt("order_date", month.end);
        const monthSales = (monthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Previous month accumulated
        const { data: prevMonthOrders } = await supabase
          .from("orders")
          .select("final_price")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .gte("order_date", prevMonth.start)
          .lt("order_date", prevMonth.end);
        const prevMonthSales = (prevMonthOrders ?? []).reduce(
          (s, o: any) => s + Number(o.final_price || 0),
          0,
        );

        // Year accumulated
        const { data: yearOrders } = await supabase
          .from("orders")
          .select("final_price")
          .eq("accommodation_id", accId)
          .neq("order_status", "cancelled")
          .gte("order_date", year.start)
          .lt("order_date", year.end);
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
            // Internal franchise_orders by plan_name (sold_at)
            const { data: foAll } = await supabase
              .from("franchise_orders")
              .select("plan_price, quantity, sold_at")
              .in("plan_name", projectNames)
              .gte("sold_at", year.start)
              .lt("sold_at", year.end);
            for (const r of foAll ?? []) {
              const amt = Number((r as any).plan_price || 0) * Number((r as any).quantity || 1);
              const d = (r as any).sold_at as string | null;
              if (!d) continue;
              franchiseYearSales += amt;
              if (d >= month.start && d < month.end) franchiseMonthSales += amt;
              if (d === today) franchiseTodayCount += 1;
            }

            // External franchise_external_orders by project_name (signed_at acts as sold_at)
            const { data: feAll } = await supabase
              .from("franchise_external_orders")
              .select("plan_price, unit_count, signed_at")
              .in("project_name", projectNames)
              .gte("signed_at", year.start)
              .lt("signed_at", year.end);
            for (const r of feAll ?? []) {
              const amt = Number((r as any).plan_price || 0) * Number((r as any).unit_count || 1);
              const d = (r as any).signed_at as string | null;
              if (!d) continue;
              franchiseYearSales += amt;
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
                .gte("order_date", year.start)
                .lt("order_date", year.end);
              for (const o of bookingYear ?? []) {
                const amt = Number((o as any).final_price || 0);
                const d = (o as any).order_date as string | null;
                if (!d) continue;
                franchiseBookingYear += amt;
                if (d >= month.start && d < month.end) franchiseBookingMonth += amt;
                if (d === today) franchiseBookingToday += amt;
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
          "今日訂單": fmtMoney(todaySales),
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
        const body = applyVars(tpl, vars);
        const subject = `【${accName}紀錄報表】${dateLabel}`;

        await sendEmail(subject, body);
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
