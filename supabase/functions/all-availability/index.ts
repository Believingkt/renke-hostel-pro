// All-Accommodations Availability API (internal / BI use)
// Requires a single master API key stored in env: PLATFORM_MASTER_API_KEY
// Header: x-api-key: <master-key>
//
// GET /all-availability?from=YYYY-MM-DD&to=YYYY-MM-DD[&accommodation_ids=uuid,uuid][&include=packages,inventory,rates,room_types]
//
// Response:
// {
//   from, to, currency: "TWD",
//   accommodations: [
//     {
//       id, name,
//       room_types: [...],       // same shape as accommodation-api /availability
//       packages: [...]          // accommodation_packages with numeric_code
//     }
//   ]
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ACTIVE_ORDER_STATUSES,
  buildAvailability,
  daysBetweenInclusive,
  enumerateDates,
  isValidDateStr,
  MAX_RANGE_DAYS,
} from "../accommodation-api/availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER_KEY = Deno.env.get("PLATFORM_MASTER_API_KEY") ?? "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time-ish comparison
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const provided =
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "";
    if (!MASTER_KEY) return jsonResponse({ error: "Server misconfigured: PLATFORM_MASTER_API_KEY missing" }, 500);
    if (!provided || !safeEqual(provided, MASTER_KEY)) {
      return jsonResponse({ error: "Invalid or missing master API key" }, 401);
    }

    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!from || !to) return jsonResponse({ error: "from and to are required (YYYY-MM-DD)" }, 400);
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return jsonResponse({ error: "Invalid date format, expected YYYY-MM-DD" }, 400);
    }
    if (to < from) return jsonResponse({ error: "'to' must be on or after 'from'" }, 400);
    const span = daysBetweenInclusive(from, to);
    if (span > MAX_RANGE_DAYS) {
      return jsonResponse({ error: `Date range exceeds ${MAX_RANGE_DAYS} days (got ${span})` }, 400);
    }

    const includeParam = (url.searchParams.get("include") || "room_types,packages")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const wantRoomTypes = includeParam.includes("room_types");
    const wantPackages = includeParam.includes("packages");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Accommodation filter
    let accQuery = supabase
      .from("accommodation_info")
      .select("id, name")
      .order("name", { ascending: true });
    const accIdsParam = url.searchParams.get("accommodation_ids");
    if (accIdsParam) {
      const ids = accIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length) accQuery = accQuery.in("id", ids);
    }
    const { data: accs, error: accErr } = await accQuery;
    if (accErr) return jsonResponse({ error: accErr.message }, 500);
    if (!accs || accs.length === 0) {
      return jsonResponse({ from, to, currency: "TWD", accommodations: [] });
    }

    const accIds = accs.map((a: any) => a.id);
    const dates = enumerateDates(from, to);

    // Batched cross-accommodation queries
    const [roomTypesRes, tmplRes, ordersRes, holRes, pkgsRes] = await Promise.all([
      wantRoomTypes
        ? supabase
            .from("room_types")
            .select("id, accommodation_id, name, capacity, room_count, display_order, is_exclusive_package, is_bound_to_exclusive, bound_exclusive_ids")
            .in("accommodation_id", accIds)
            .order("display_order", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [], error: null } as any),
      wantRoomTypes
        ? supabase
            .from("pricing_templates")
            .select("accommodation_id, room_type_id, template_name, project_name, price, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, room_overrides, season_segments, valid_from, valid_until, extra_dates, excluded_dates, display_order, default_package_id, numeric_code")
            .in("accommodation_id", accIds)
            .order("display_order", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [], error: null } as any),
      wantRoomTypes
        ? supabase
            .from("orders")
            .select("id, accommodation_id, room_type_id, check_in_date, check_out_date, order_status, lock_whole_building")
            .in("accommodation_id", accIds)
            .in("order_status", ACTIVE_ORDER_STATUSES)
            .gt("check_out_date", from)
            .lte("check_in_date", to)
        : Promise.resolve({ data: [], error: null } as any),
      wantRoomTypes
        ? supabase
            .from("public_holidays")
            .select("accommodation_id, holiday_date, holiday_type")
            .in("accommodation_id", accIds)
            .gte("holiday_date", dates[0])
            .lte("holiday_date", dates[dates.length - 1])
        : Promise.resolve({ data: [], error: null } as any),
      wantPackages
        ? supabase
            .from("accommodation_packages")
            .select("id, accommodation_id, name, numeric_code, base_price, room_type_ids, room_type_allocation, is_active, display_order")
            .in("accommodation_id", accIds)
            .order("display_order", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (roomTypesRes.error) return jsonResponse({ error: roomTypesRes.error.message }, 500);
    if (tmplRes.error) return jsonResponse({ error: tmplRes.error.message }, 500);
    if (ordersRes.error) return jsonResponse({ error: ordersRes.error.message }, 500);
    if (holRes.error) return jsonResponse({ error: holRes.error.message }, 500);
    if (pkgsRes.error) return jsonResponse({ error: pkgsRes.error.message }, 500);

    const roomTypes = (roomTypesRes.data || []) as any[];
    const rtIds = roomTypes.map((r) => r.id);

    // Inventory + order_rooms only if we have room types
    const [invRes, orRes] = await Promise.all([
      rtIds.length
        ? supabase
            .from("room_inventory_pricing")
            .select("room_type_id, date, price, price_2_meals, price_3_meals, available_rooms, is_available")
            .in("room_type_id", rtIds)
            .is("pricing_template_id", null)
            .gte("date", from)
            .lte("date", to)
        : Promise.resolve({ data: [], error: null } as any),
      (ordersRes.data || []).length
        ? supabase
            .from("order_rooms")
            .select("order_id, room_type_id, quantity")
            .in("order_id", (ordersRes.data as any[]).map((o) => o.id))
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (invRes.error) return jsonResponse({ error: invRes.error.message }, 500);
    if (orRes.error) return jsonResponse({ error: orRes.error.message }, 500);

    const rtByAcc = new Map<string, any[]>();
    for (const rt of roomTypes) {
      const list = rtByAcc.get(rt.accommodation_id) || [];
      list.push(rt);
      rtByAcc.set(rt.accommodation_id, list);
    }
    const tmplByAcc = new Map<string, any[]>();
    for (const t of (tmplRes.data || []) as any[]) {
      const list = tmplByAcc.get(t.accommodation_id) || [];
      list.push(t);
      tmplByAcc.set(t.accommodation_id, list);
    }
    const ordersByAcc = new Map<string, any[]>();
    for (const o of (ordersRes.data || []) as any[]) {
      const list = ordersByAcc.get(o.accommodation_id) || [];
      list.push(o);
      ordersByAcc.set(o.accommodation_id, list);
    }
    const holByAcc = new Map<string, any[]>();
    for (const h of (holRes.data || []) as any[]) {
      const list = holByAcc.get(h.accommodation_id) || [];
      list.push(h);
      holByAcc.set(h.accommodation_id, list);
    }
    const pkgByAcc = new Map<string, any[]>();
    for (const p of (pkgsRes.data || []) as any[]) {
      const list = pkgByAcc.get(p.accommodation_id) || [];
      list.push(p);
      pkgByAcc.set(p.accommodation_id, list);
    }
    const invByRt = new Map<string, any[]>();
    for (const i of (invRes.data || []) as any[]) {
      const list = invByRt.get(i.room_type_id) || [];
      list.push(i);
      invByRt.set(i.room_type_id, list);
    }
    const orderRoomsData = (orRes.data || []) as any[];

    const output = accs.map((acc: any) => {
      const rtList = rtByAcc.get(acc.id) || [];
      const roomTypesResult = wantRoomTypes
        ? buildAvailability({
            from,
            to,
            roomTypes: rtList as any,
            inventory: rtList.flatMap((r) => invByRt.get(r.id) || []) as any,
            orders: (ordersByAcc.get(acc.id) || []) as any,
            orderRooms: orderRoomsData as any,
            templates: (tmplByAcc.get(acc.id) || []) as any,
            holidays: (holByAcc.get(acc.id) || []) as any,
          })
        : undefined;

      return {
        id: acc.id,
        name: acc.name,
        ...(wantRoomTypes ? { room_types: roomTypesResult } : {}),
        ...(wantPackages ? { packages: pkgByAcc.get(acc.id) || [] } : {}),
      };
    });

    return jsonResponse({
      from,
      to,
      currency: "TWD",
      accommodations: output,
    });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
