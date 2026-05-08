/**
 * owlting-cm-snapshot — Inventory & Rate snapshot for OwlTing reconciliation
 *
 * GET /functions/v1/owlting-cm-snapshot?hotel_code=SENSAN&date_from=2026-05-01&date_to=2026-05-31[&kind=inventory|rates|all]
 *
 * Auth: header `x-owlting-username` + `x-owlting-password` (matches owlting_credentials)
 *
 * Returns JSON snapshot of:
 *   - rooms     : [{ code, room_type_id, name }]
 *   - rate_plans: [{ code, template_id, name, room_type_id }]
 *   - inventory : [{ date, room_type_code, available_rooms, is_closed }]
 *   - rates     : [{ date, room_type_code, rate_plan_code|null, price, is_closed_plan }]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-owlting-username, x-owlting-password",
  "Content-Type": "application/json",
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const hotelCode = url.searchParams.get("hotel_code");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const kind = url.searchParams.get("kind") ?? "all";

  if (!hotelCode || !dateFrom || !dateTo) {
    return json({ error: "hotel_code, date_from, date_to required" }, 400);
  }

  const username = req.headers.get("x-owlting-username");
  const password = req.headers.get("x-owlting-password");
  if (!username || !password) return json({ error: "Missing credentials" }, 401);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: cred } = await supabase
    .from("owlting_credentials")
    .select("accommodation_id, hotel_code, password_hash, is_active")
    .eq("username", username).maybeSingle();
  if (!cred || !cred.is_active) return json({ error: "Invalid credentials" }, 401);
  if (cred.password_hash !== await sha256Hex(password)) return json({ error: "Invalid credentials" }, 401);
  if (cred.hotel_code !== hotelCode) return json({ error: "HotelCode mismatch" }, 403);

  const accId = cred.accommodation_id;

  const [roomsRes, plansRes, ripRes, lockRes] = await Promise.all([
    supabase.from("room_types").select("id,name,numeric_code").eq("accommodation_id", accId).order("display_order"),
    supabase.from("pricing_templates").select("id,template_name,room_type_id,numeric_code").eq("accommodation_id", accId),
    supabase.from("room_inventory_pricing")
      .select("room_type_id, pricing_template_id, date, price, available_rooms, is_available")
      .gte("date", dateFrom).lte("date", dateTo),
    supabase.from("pricing_template_availability")
      .select("template_id, date, is_closed")
      .gte("date", dateFrom).lte("date", dateTo),
  ]);

  const rooms = (roomsRes.data ?? []).map((r: any) => ({
    code: String(r.numeric_code), room_type_id: r.id, name: r.name,
  }));
  const roomById = new Map(rooms.map((r) => [r.room_type_id, r.code]));
  const accRoomIds = new Set(rooms.map((r) => r.room_type_id));

  const ratePlans = (plansRes.data ?? []).map((p: any) => ({
    code: String(p.numeric_code), template_id: p.id, name: p.template_name, room_type_id: p.room_type_id,
  }));
  const planById = new Map(ratePlans.map((p) => [p.template_id, p.code]));
  const lockSet = new Set((lockRes.data ?? []).filter((l: any) => l.is_closed).map((l: any) => `${l.template_id}|${l.date}`));

  const ripRows = (ripRes.data ?? []).filter((r: any) => accRoomIds.has(r.room_type_id));

  const inventory = ripRows
    .filter((r: any) => !r.pricing_template_id)
    .map((r: any) => ({
      date: r.date,
      room_type_code: roomById.get(r.room_type_id),
      available_rooms: r.available_rooms,
      is_closed: r.is_available === false,
    }));

  const rates = ripRows.map((r: any) => ({
    date: r.date,
    room_type_code: roomById.get(r.room_type_id),
    rate_plan_code: r.pricing_template_id ? planById.get(r.pricing_template_id) ?? null : null,
    price: r.price,
    is_closed_plan: r.pricing_template_id ? lockSet.has(`${r.pricing_template_id}|${r.date}`) : false,
  }));

  const result: any = { hotel_code: hotelCode, date_from: dateFrom, date_to: dateTo, rooms, rate_plans: ratePlans };
  if (kind === "all" || kind === "inventory") result.inventory = inventory;
  if (kind === "all" || kind === "rates") result.rates = rates;
  return json(result);
});
