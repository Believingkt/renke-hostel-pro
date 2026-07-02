// Accommodation Public API: 房型新增與查詢 + 可售房量查詢
// Endpoints:
//   GET  /accommodation-api/room-types              -> 列出所有房型
//   GET  /accommodation-api/room-types/:id          -> 查詢單一房型
//   POST /accommodation-api/room-types              -> 新增房型（含設施與圖片）
//   GET  /accommodation-api/availability            -> 每日剩餘房量 / 房價 / 開關房
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ACTIVE_ORDER_STATUSES,
  buildAvailability,
  daysBetweenInclusive,
  enumerateDates,
  isValidDateStr,
  MAX_RANGE_DAYS,
} from "./availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request) {
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!apiKey) {
    return { error: jsonResponse({ error: "Missing API key" }, 401) };
  }
  const keyHash = await sha256Hex(apiKey);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc("verify_accommodation_api_key", {
    p_key_hash: keyHash,
  });
  if (error || !data || data.length === 0) {
    return { error: jsonResponse({ error: "Invalid or inactive API key" }, 401) };
  }
  return { supabase, accommodationId: data[0].accommodation_id as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Path after function name: e.g. /accommodation-api/room-types/:id
    const parts = url.pathname.split("/").filter(Boolean);
    const fnIdx = parts.indexOf("accommodation-api");
    const route = parts.slice(fnIdx + 1); // ["room-types", ":id?"]

    const auth = await authenticate(req);
    if ("error" in auth) return auth.error;
    const { supabase, accommodationId } = auth;

    // ---- ROOM TYPES ----
    if (route[0] === "room-types") {
      // GET /room-types
      if (req.method === "GET" && route.length === 1) {
        const { data, error } = await supabase
          .from("room_types")
          .select("*, room_amenities(category, amenity_name), room_photos(photo_url, display_order)")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true });
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ data });
      }

      // GET /room-types/:id
      if (req.method === "GET" && route.length === 2) {
        const { data, error } = await supabase
          .from("room_types")
          .select("*, room_amenities(category, amenity_name), room_photos(photo_url, display_order)")
          .eq("accommodation_id", accommodationId)
          .eq("id", route[1])
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, 500);
        if (!data) return jsonResponse({ error: "Room type not found" }, 404);
        return jsonResponse({ data });
      }

      // POST /room-types
      if (req.method === "POST" && route.length === 1) {
        let body: any;
        try {
          body = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        // Field validation
        const name = (body.name ?? "").toString().trim();
        const capacity = Number(body.capacity);
        const base_price = Number(body.base_price);
        if (!name) return jsonResponse({ error: "name is required" }, 400);
        if (!Number.isFinite(capacity) || capacity < 1 || capacity > 50)
          return jsonResponse({ error: "capacity must be 1-50" }, 400);
        if (!Number.isFinite(base_price) || base_price < 0)
          return jsonResponse({ error: "base_price must be >= 0" }, 400);

        const insertPayload = {
          accommodation_id: accommodationId,
          name,
          name_en: body.name_en ?? null,
          description: body.description ?? null,
          capacity,
          base_price,
          room_count: body.room_count ?? 1,
          size_sqm: body.size_sqm ?? null,
          double_room_count: body.double_room_count ?? null,
          triple_room_count: body.triple_room_count ?? null,
          quad_room_count: body.quad_room_count ?? null,
          is_exclusive_package: !!body.is_exclusive_package,
          is_bound_to_exclusive: !!body.is_bound_to_exclusive,
          display_order: body.display_order ?? 0,
        };

        const { data: roomType, error: rtErr } = await supabase
          .from("room_types")
          .insert(insertPayload)
          .select()
          .single();
        if (rtErr) return jsonResponse({ error: rtErr.message }, 500);

        // Optional: amenities
        if (Array.isArray(body.amenities) && body.amenities.length > 0) {
          const amenityRows = body.amenities
            .filter((a: any) => a && a.amenity_name)
            .map((a: any) => ({
              room_type_id: roomType.id,
              amenity_name: String(a.amenity_name),
              category: a.category ?? null,
              amenity_icon: a.amenity_icon ?? null,
            }));
          if (amenityRows.length) {
            const { error: amErr } = await supabase.from("room_amenities").insert(amenityRows);
            if (amErr) return jsonResponse({ error: `Room created, amenities failed: ${amErr.message}` }, 500);
          }
        }

        // Optional: photos (accept either photo_url OR photo_base64)
        if (Array.isArray(body.photos) && body.photos.length > 0) {
          const MAX_BYTES = 10 * 1024 * 1024; // 10MB
          const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
          const photoRows: Array<{ room_type_id: string; photo_url: string; display_order: number }> = [];

          for (let idx = 0; idx < body.photos.length; idx++) {
            const p = body.photos[idx];
            if (!p) continue;
            const order = p.display_order ?? idx;

            // Case 1: direct URL provided
            if (p.photo_url) {
              photoRows.push({
                room_type_id: roomType.id,
                photo_url: String(p.photo_url),
                display_order: order,
              });
              continue;
            }

            // Case 2: base64 upload
            if (p.photo_base64) {
              const raw = String(p.photo_base64);
              const match = raw.match(/^data:([\w/+.-]+);base64,(.+)$/);
              const mime = match ? match[1].toLowerCase() : (p.mime_type || "image/jpeg").toLowerCase();
              const b64 = match ? match[2] : raw;

              if (!allowedMime.includes(mime)) {
                return jsonResponse({ error: `Photo #${idx}: unsupported mime ${mime}. Allowed: ${allowedMime.join(", ")}` }, 400);
              }

              let bytes: Uint8Array;
              try {
                const bin = atob(b64.replace(/\s/g, ""));
                bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              } catch {
                return jsonResponse({ error: `Photo #${idx}: invalid base64` }, 400);
              }
              if (bytes.byteLength > MAX_BYTES) {
                return jsonResponse({ error: `Photo #${idx}: file exceeds 10MB` }, 400);
              }

              const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
              const filename = `${accommodationId}/${roomType.id}/${crypto.randomUUID()}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("room-photos")
                .upload(filename, bytes, { contentType: mime, upsert: false });
              if (upErr) {
                return jsonResponse({ error: `Photo #${idx} upload failed: ${upErr.message}` }, 500);
              }
              const { data: pub } = supabase.storage.from("room-photos").getPublicUrl(filename);
              photoRows.push({
                room_type_id: roomType.id,
                photo_url: pub.publicUrl,
                display_order: order,
              });
            }
          }

          if (photoRows.length) {
            const { error: phErr } = await supabase.from("room_photos").insert(photoRows);
            if (phErr) return jsonResponse({ error: `Room created, photos failed: ${phErr.message}` }, 500);
          }
        }

        // Return full record
        const { data: full } = await supabase
          .from("room_types")
          .select("*, room_amenities(category, amenity_name), room_photos(photo_url, display_order)")
          .eq("id", roomType.id)
          .single();
        return jsonResponse({ data: full }, 201);
      }
    }

    // ---- AVAILABILITY ----
    if (route[0] === "availability" && req.method === "GET" && route.length === 1) {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const rtParam = url.searchParams.get("room_type_id");

      if (!from || !to) return jsonResponse({ error: "from and to are required (YYYY-MM-DD)" }, 400);
      if (!isValidDateStr(from) || !isValidDateStr(to)) {
        return jsonResponse({ error: "Invalid date format, expected YYYY-MM-DD" }, 400);
      }
      if (to < from) return jsonResponse({ error: "'to' must be on or after 'from'" }, 400);
      const span = daysBetweenInclusive(from, to);
      if (span > MAX_RANGE_DAYS) {
        return jsonResponse({ error: `Date range exceeds ${MAX_RANGE_DAYS} days (got ${span})` }, 400);
      }

      // Fetch room types for this accommodation (optionally filtered)
      let rtQuery = supabase
        .from("room_types")
        .select("id, name, capacity, room_count, display_order, is_exclusive_package, is_bound_to_exclusive, bound_exclusive_ids")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true, nullsFirst: false });
      if (rtParam) {
        const requested = rtParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (requested.length > 0) rtQuery = rtQuery.in("id", requested);
      }
      const { data: roomTypes, error: rtErr } = await rtQuery;
      if (rtErr) return jsonResponse({ error: rtErr.message }, 500);
      if (!roomTypes || roomTypes.length === 0) {
        return jsonResponse({
          accommodation_id: accommodationId,
          from,
          to,
          currency: "TWD",
          room_types: [],
        });
      }

      const rtIds = roomTypes.map((r: any) => r.id);
      const dates = enumerateDates(from, to);

      const [invRes, ordersRes, tmplRes, holRes] = await Promise.all([
        supabase
          .from("room_inventory_pricing")
          .select("room_type_id, date, price, available_rooms, is_available")
          .in("room_type_id", rtIds)
          .is("pricing_template_id", null)
          .gte("date", from)
          .lte("date", to),
        supabase
          .from("orders")
          .select("id, room_type_id, check_in_date, check_out_date, order_status, lock_whole_building")
          .eq("accommodation_id", accommodationId)
          .in("order_status", ACTIVE_ORDER_STATUSES)
          .gt("check_out_date", from)
          .lte("check_in_date", to),
        supabase
          .from("pricing_templates")
          .select("room_type_id, price, weekday_price, peak_price, weekend_price, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true, nullsFirst: false }),
        supabase
          .from("public_holidays")
          .select("holiday_date, holiday_type")
          .eq("accommodation_id", accommodationId)
          .gte("holiday_date", dates[0])
          .lte("holiday_date", dates[dates.length - 1]),
      ]);

      let orderRoomsData: any[] = [];
      const orderIds = (ordersRes.data || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const { data: orRows } = await supabase
          .from("order_rooms")
          .select("order_id, room_type_id, quantity")
          .in("order_id", orderIds);
        orderRoomsData = orRows || [];
      }

      const result = buildAvailability({
        from,
        to,
        roomTypes: roomTypes as any,
        inventory: (invRes.data || []) as any,
        orders: (ordersRes.data || []) as any,
        orderRooms: orderRoomsData as any,
        templates: (tmplRes.data || []) as any,
        holidays: (holRes.data || []) as any,
      });

      return jsonResponse({
        accommodation_id: accommodationId,
        from,
        to,
        currency: "TWD",
        room_types: result,
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
