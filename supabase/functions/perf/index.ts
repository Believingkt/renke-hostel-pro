// perf：場域績效短網址 API（AM 儀表板 / AI 用）
//   GET /perf?from=YYYY-MM-DD&to=YYYY-MM-DD[&venue=id|名稱[,…]][&source=a[,b]]
//       → Key 範圍內全部場域（未帶 venue）或指定場域；每館 summary+daily，另附跨館 total
//   GET /perf/venues → 這把 Key 能看的場域清單（id / name / short_name）
//   GET /perf/version → 公開
// 認證：x-api-key / Authorization: Bearer / ?key=（三擇一）。計算邏輯與 accommodation-api /performance 完全相同。
import { authenticateApiKey } from "../_shared/accommodationApiKey.ts";
import { ACCOMMODATION_API_READ_LIMIT, consumeRateLimit, rateLimitHeaders } from "../_shared/apiRateLimit.ts";
import { daysBetweenInclusive, isValidDateStr } from "../_shared/availability.ts";
import { normalizeVenueText } from "../_shared/venueMatch.ts";
import {
  buildPerformance,
  EXCLUDED_TEST_SOURCES,
  MAX_PERFORMANCE_RANGE_DAYS,
  PERFORMANCE_DEFINITIONS,
  taipeiDayRangeUtc,
  type BookedBucket,
  type PerformanceResult,
  type StayBucket,
} from "../accommodation-api/performance.ts";

const API_VERSION = "1.0.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

interface VenueRow { id: string; name: string | null; short_name: string | null; is_active: boolean | null }

async function loadScopeVenues(sb: any, ids: Set<string>): Promise<VenueRow[]> {
  const { data } = await sb
    .from("accommodation_info")
    .select("id, name, short_name, is_active")
    .in("id", Array.from(ids));
  const byId = new Map<string, VenueRow>((data || []).map((v: VenueRow) => [v.id, v]));
  return Array.from(ids).map((id) => byId.get(id) ?? { id, name: null, short_name: null, is_active: null });
}

/** venue 參數：uuid 或名稱／簡稱（去 emoji 空白、不分大小寫），需在 Key 範圍內 */
function resolveVenues(param: string, venues: VenueRow[]): { ids: string[] } | { unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of param.split(",").map((s) => s.trim()).filter(Boolean)) {
    const n = normalizeVenueText(raw);
    const hit = venues.find((v) =>
      v.id === raw || normalizeVenueText(v.name) === n || normalizeVenueText(v.short_name) === n
    );
    if (hit) ids.push(hit.id);
    else unknown.push(raw);
  }
  if (unknown.length) return { unknown };
  return { ids: Array.from(new Set(ids)) };
}

const ORDER_COLS =
  "id, order_date, created_at, order_status, check_in_date, check_out_date, final_price, paid_amount, room_quantity, room_type_id, lock_whole_building, order_source";

async function computeVenue(
  sb: any,
  accId: string,
  from: string,
  to: string,
  sourceFilter: string[] | null,
): Promise<PerformanceResult | { error: string }> {
  const { data: ruleRows } = await sb
    .from("performance_notification_source_rules")
    .select("source, included")
    .eq("accommodation_id", accId);
  const excluded = new Set<string>(EXCLUDED_TEST_SOURCES);
  for (const r of ruleRows || []) if (r.included === false && r.source) excluded.add(String(r.source));
  const excludedList = Array.from(excluded).map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
  const applyFilters = (q: any) => {
    q = q.eq("accommodation_id", accId).neq("order_status", "hold");
    q = q.or(`order_source.is.null,order_source.not.in.(${excludedList})`);
    if (sourceFilter) q = q.in("order_source", sourceFilter);
    return q;
  };

  const rtRes = await sb.from("room_types").select("id, room_count, is_exclusive_package").eq("accommodation_id", accId);
  if (rtRes.error) return { error: rtRes.error.message };
  const rtIds = (rtRes.data || []).map((r: any) => r.id);
  const { startUtc, endUtc } = taipeiDayRangeUtc(from, to);

  const [invRes, bookedRes, stayRes] = await Promise.all([
    rtIds.length > 0
      ? sb.from("room_inventory_pricing")
        .select("room_type_id, date, available_rooms, is_available")
        .in("room_type_id", rtIds).is("pricing_template_id", null).gte("date", from).lte("date", to)
      : Promise.resolve({ data: [], error: null }),
    applyFilters(sb.from("orders").select(ORDER_COLS)).gte("order_date", startUtc).lt("order_date", endUtc),
    applyFilters(sb.from("orders").select(ORDER_COLS)).gt("check_out_date", from).lte("check_in_date", to),
  ]);
  const err = invRes.error || bookedRes.error || stayRes.error;
  if (err) return { error: err.message };

  const orders = [...(bookedRes.data || []), ...(stayRes.data || [])];
  const orderIds = Array.from(new Set(orders.map((o: any) => o.id)));
  let orderRooms: any[] = [];
  if (orderIds.length > 0) {
    const { data } = await sb.from("order_rooms").select("order_id, room_type_id, quantity").in("order_id", orderIds);
    orderRooms = data || [];
  }
  return buildPerformance({ from, to, roomTypes: rtRes.data || [], inventory: invRes.data || [], orders, orderRooms });
}

const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 10000 : null);

/** 跨館合計（daily 逐日相加、比率重算） */
function sumResults(results: PerformanceResult[], from: string, to: string) {
  const addB = (a: BookedBucket, b: BookedBucket) => {
    for (const k of Object.keys(b) as (keyof BookedBucket)[]) a[k] += b[k];
  };
  const addS = (a: StayBucket, b: StayBucket) => {
    a.occupied_room_nights += b.occupied_room_nights;
    a.available_room_nights += b.available_room_nights;
    a.revenue += b.revenue;
    a.check_ins += b.check_ins;
    a.cancelled_room_nights += b.cancelled_room_nights;
    a.cancelled_revenue += b.cancelled_revenue;
  };
  const blankB = (): BookedBucket => ({ orders: 0, gross_revenue: 0, cancelled_orders: 0, cancelled_revenue: 0, net_orders: 0, net_revenue: 0, collected_amount: 0, room_nights: 0 });
  const blankS = (): StayBucket => ({ occupied_room_nights: 0, available_room_nights: 0, occupancy_rate: null, revenue: 0, check_ins: 0, cancelled_room_nights: 0, cancelled_revenue: 0 });

  const daily = new Map<string, { date: string; booked: BookedBucket; stay: StayBucket }>();
  const sb = blankB();
  const ss = blankS();
  const bySource = new Map<string, { source: string; orders: number; gross_revenue: number; cancelled_orders: number; net_revenue: number }>();
  for (const r of results) {
    for (const d of r.daily) {
      const row = daily.get(d.date) ?? { date: d.date, booked: blankB(), stay: blankS() };
      addB(row.booked, d.booked);
      addS(row.stay, d.stay);
      daily.set(d.date, row);
    }
    const { cancellation_rate_by_orders: _a, cancellation_rate_by_revenue: _b, ...b } = r.summary.booked;
    addB(sb, b);
    addS(ss, r.summary.stay);
    for (const s of r.summary.by_source) {
      const cur = bySource.get(s.source) ?? { source: s.source, orders: 0, gross_revenue: 0, cancelled_orders: 0, net_revenue: 0 };
      cur.orders += s.orders; cur.gross_revenue += s.gross_revenue; cur.cancelled_orders += s.cancelled_orders; cur.net_revenue += s.net_revenue;
      bySource.set(s.source, cur);
    }
  }
  const dailyArr = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of dailyArr) row.stay.occupancy_rate = rate(row.stay.occupied_room_nights, row.stay.available_room_nights);
  ss.occupancy_rate = rate(ss.occupied_room_nights, ss.available_room_nights);
  return {
    from,
    to,
    summary: {
      booked: {
        ...sb,
        cancellation_rate_by_orders: rate(sb.cancelled_orders, sb.orders),
        cancellation_rate_by_revenue: rate(sb.cancelled_revenue, sb.gross_revenue),
      },
      stay: ss,
      by_source: Array.from(bySource.values()).sort((a, b) => b.gross_revenue - a.gross_revenue),
    },
    daily: dailyArr,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const route = parts.slice(parts.indexOf("perf") + 1);
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    if (route[0] === "version") {
      return json({
        name: "perf",
        version: API_VERSION,
        endpoints: ["GET /perf?from&to[&venue][&source][&key]", "GET /perf/venues", "GET /perf/version"],
        docs: "/docs/accommodation-performance-api.md",
        server_time: new Date().toISOString(),
      });
    }

    const authRes = await authenticateApiKey(req, { allowQueryKey: true });
    if ("error" in authRes) return json({ error: authRes.error.message }, authRes.error.status);
    const { supabase, keyHash, allowedAccommodationIds } = authRes.auth;

    const limit = consumeRateLimit(`${keyHash}:read`, ACCOMMODATION_API_READ_LIMIT);
    const limitHeaders = rateLimitHeaders(limit);
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return json({ error: "Rate limit exceeded", retry_after: retryAfter }, 429, { ...limitHeaders, "Retry-After": String(retryAfter) });
    }

    const venues = await loadScopeVenues(supabase, allowedAccommodationIds);

    if (route[0] === "venues") {
      return json({
        venues: venues.map((v) => ({ id: v.id, name: v.name, short_name: v.short_name, is_active: v.is_active })),
        hint: "venue 參數可用 id、name 或 short_name，逗號分隔多館；不帶 venue 代表全部",
      }, 200, limitHeaders);
    }
    if (route.length > 0) return json({ error: "Not found" }, 404);

    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!from || !to) return json({ error: "from and to are required (YYYY-MM-DD)" }, 400);
    if (!isValidDateStr(from) || !isValidDateStr(to)) return json({ error: "Invalid date format, expected YYYY-MM-DD" }, 400);
    if (to < from) return json({ error: "'to' must be on or after 'from'" }, 400);
    const span = daysBetweenInclusive(from, to);
    if (span > MAX_PERFORMANCE_RANGE_DAYS) return json({ error: `Date range exceeds ${MAX_PERFORMANCE_RANGE_DAYS} days (got ${span})` }, 400);

    const venueParam = url.searchParams.get("venue");
    let targetIds = venues.map((v) => v.id);
    if (venueParam !== null) {
      const r = resolveVenues(venueParam, venues);
      if ("unknown" in r) {
        return json({
          error: "Unknown venue or outside this API key's scope",
          unknown: r.unknown,
          available: venues.map((v) => ({ id: v.id, name: v.name, short_name: v.short_name })),
        }, 403);
      }
      if (r.ids.length === 0) return json({ error: "venue must not be empty" }, 400);
      targetIds = r.ids;
    }

    const sourceParam = url.searchParams.get("source");
    const sourceFilter = sourceParam
      ? Array.from(new Set(sourceParam.split(",").map((s) => s.trim()).filter(Boolean)))
      : null;
    if (sourceFilter && sourceFilter.length === 0) return json({ error: "source must not be empty" }, 400);

    const results: Array<{ accommodation_id: string; name: string | null; short_name: string | null } & PerformanceResult> = [];
    for (const accId of targetIds) {
      const r = await computeVenue(supabase, accId, from, to, sourceFilter);
      if ("error" in r) return json({ error: r.error, accommodation_id: accId }, 500);
      const v = venues.find((x) => x.id === accId)!;
      results.push({ accommodation_id: accId, name: v.name, short_name: v.short_name, ...r });
    }

    return json({
      from,
      to,
      currency: "TWD",
      timezone: PERFORMANCE_DEFINITIONS.timezone,
      source_filter: sourceFilter,
      venue_count: results.length,
      total: sumResults(results, from, to),
      venues: results,
      definitions: PERFORMANCE_DEFINITIONS,
    }, 200, limitHeaders);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
