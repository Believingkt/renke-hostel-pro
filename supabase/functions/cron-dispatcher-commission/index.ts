// Cron dispatcher for commission/payout calculations.
//
// Why this exists: `create-commission-snapshots`, `create-commission-adjustments`
// and `calculate-scout-payout` all require a super_admin (or service-role) caller
// via `_shared/authz.ts`. pg_cron can only send the public anon apikey, so those
// jobs were rejected with 401. This dispatcher performs NO caller authentication
// and instead uses its own runtime SUPABASE_SERVICE_ROLE_KEY to call the three
// downstream functions through the existing service-role fast path in authz.ts.
//
// Known risk (accepted, out of scope for now): this endpoint is unauthenticated.
// It takes no request parameters and only calls a fixed whitelist of idempotent
// functions, so the blast radius is limited to re-running the calculations.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { reportBackendError } from "../_shared/errorReporter.ts";

const FUNCTION_NAME = "cron-dispatcher-commission";

/** Current date parts in Asia/Taipei (never rely on server UTC for period math). */
function taipeiToday(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Mirrors the original `calculate-scout-payout-daily` cron SQL:
 *   day <= 10 -> period '10' (current month)
 *   day <= 25 -> period '25' (current month)
 *   day  > 25 -> period '10' of the NEXT month
 */
function resolveScoutPeriod(): { year: number; month: number; period: string } {
  const { year, month, day } = taipeiToday();
  if (day <= 10) return { year, month, period: "10" };
  if (day <= 25) return { year, month, period: "25" };
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return { year: nextYear, month: nextMonth, period: "10" };
}

interface StepResult {
  fn: string;
  ok: boolean;
  status: number | null;
  body: unknown;
  error?: string;
}

async function callFunction(fn: string, body: Record<string, unknown>): Promise<StepResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return { fn, ok: false, status: null, body: null, error: "Supabase env not configured" };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Existing service-role fast path in _shared/authz.ts
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }

    const result: StepResult = { fn, ok: res.ok, status: res.status, body: parsed };
    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      console.error(`[${FUNCTION_NAME}] ${fn} failed`, res.status, text?.slice(0, 500));
      await reportBackendError({
        functionName: FUNCTION_NAME,
        category: "cron_dispatch",
        step: fn,
        errorMessage: `${fn} returned HTTP ${res.status}: ${String(text).slice(0, 500)}`,
        errorCode: res.status,
        context: { requestBody: body },
      });
    } else {
      console.log(`[${FUNCTION_NAME}] ${fn} ok`, res.status);
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}] ${fn} threw`, message);
    await reportBackendError({
      functionName: FUNCTION_NAME,
      category: "cron_dispatch",
      step: fn,
      errorMessage: `${fn} threw: ${message}`,
      context: { requestBody: body },
    });
    return { fn, ok: false, status: null, body: null, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  // Optional manual backfill overrides (cron sends no body):
  //   { year, month, period, snapshot_month: "YYYY-MM" }
  const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const auto = resolveScoutPeriod();
  const scout = {
    year: Number(reqBody?.year ?? auto.year),
    month: Number(reqBody?.month ?? auto.month),
    period: String(reqBody?.period ?? auto.period),
  };
  const snapshotMonth =
    typeof reqBody?.snapshot_month === "string" && /^\d{4}-\d{2}$/.test(reqBody.snapshot_month)
      ? reqBody.snapshot_month
      : null;
  const snapshotBody: Record<string, unknown> = snapshotMonth
    ? { test_mode: true, test_month: snapshotMonth }
    : {};

  console.log(`[${FUNCTION_NAME}] start`, { startedAt, scout, snapshotMonth });

  const results: StepResult[] = [];

  // Sequential on purpose: snapshots/adjustments produce the commission records
  // that the scout payout aggregation reads.
  results.push(await callFunction("create-commission-snapshots", snapshotBody));
  results.push(await callFunction("create-commission-adjustments", snapshotBody));
  results.push(
    await callFunction("calculate-scout-payout", {
      year: scout.year,
      month: scout.month,
      period: Number(scout.period),
    }),
  );


  const succeeded = results.filter((r) => r.ok).map((r) => r.fn);
  const failed = results.filter((r) => !r.ok).map((r) => r.fn);

  console.log(`[${FUNCTION_NAME}] done`, { succeeded, failed });

  return new Response(
    JSON.stringify({
      ok: failed.length === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      scoutPeriod: scout,
      succeeded,
      failed,
      results,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});
