import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60 * 1000;

function checkRateLimit(id: string): boolean {
  const now = Date.now();
  const rec = rateLimitMap.get(id);
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (rec.count >= RATE_LIMIT_MAX) return false;
  rec.count++;
  return true;
}

const SCENARIOS: Record<string, string> = {
  family: "家庭親子：親子友善、遊戲空間、步調輕鬆、避免太早或太晚的行程",
  couple: "情侶約會：雙人湯屋、夕陽景點、浪漫氛圍、傍晚與夜間安排",
  friends: "好友出遊：打卡熱點、夜間活動、體驗刺激有趣",
  villa: "包棟聚會：整棟別墅、派對 BBQ、團體活動、以住宿為核心",
  outdoor: "戶外探索：步道單車、生態導覽、體力型活動、早上出發",
};

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

/** 兩點間距離（km，Haversine） */
function distanceKm(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 解析 "09:00-17:00" → [540, 1020]；全日開放回傳 null（不設限） */
function parseWindow(text: unknown): [number, number] | null {
  const s = typeof text === "string" ? text : "";
  const m = s.match(/(\d{1,2}):(\d{2})\s*[-~—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotFromMinutes(min: number): "morning" | "afternoon" | "evening" {
  if (min < 12 * 60) return "morning";
  if (min < 17 * 60) return "afternoon";
  return "evening";
}

interface Product {
  id: string;
  type: string;
  name: unknown;
  price: number;
  duration_min: number | null;
  lat: number | null;
  lng: number | null;
  open_hours: Record<string, string> | null;
  available_slots: unknown;
}

function slots(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

/**
 * 排序：① 建議時段（上午/下午/傍晚）② 各點營業時間窗約束 ③ 同時段內距離最短路徑（貪婪最近鄰）
 */
function sortItems(picked: Product[], startFrom: { lat: number | null; lng: number | null }) {
  const withSlot = picked.map((p) => {
    const cand = slots(p.available_slots)
      .map(toMinutes)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    const win = parseWindow(p.open_hours?.zh);
    const startMin = cand.length ? cand[0] : win ? win[0] : 10 * 60;
    return { product: p, startMin, win, cand };
  });

  const groups: Record<string, typeof withSlot> = { morning: [], afternoon: [], evening: [] };
  withSlot.forEach((it) => groups[slotFromMinutes(it.startMin)].push(it));

  const result: Array<{
    product: Product;
    slot: string;
    start_time: string;
    end_time: string;
    within_open_hours: boolean;
    open_hours_label: string | null;
    distance_km: number;
  }> = [];

  let cursor = startFrom;
  let totalDistance = 0;

  (["morning", "afternoon", "evening"] as const).forEach((slot) => {
    const pool = [...groups[slot]];
    while (pool.length) {
      // 貪婪：挑距離目前位置最近的一點
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      pool.forEach((it, i) => {
        const d = distanceKm(cursor, it.product);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      const [chosen] = pool.splice(bestIdx, 1);
      const dist = Number.isFinite(bestDist) ? bestDist : 0;
      totalDistance += dist;
      cursor = { lat: chosen.product.lat, lng: chosen.product.lng };

      const duration = chosen.product.duration_min ?? 60;
      const start = chosen.startMin;
      const end = start + duration;
      const within = chosen.win ? start >= chosen.win[0] && end <= chosen.win[1] + 30 : true;

      result.push({
        product: chosen.product,
        slot,
        start_time: fmt(start),
        end_time: fmt(end),
        within_open_hours: within,
        open_hours_label: chosen.product.open_hours?.zh ?? null,
        distance_km: Math.round(dist * 10) / 10,
      });
    }
  });

  result.sort(
    (a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9) || a.start_time.localeCompare(b.start_time),
  );

  return { result, totalDistance: Math.round(totalDistance * 10) / 10 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(`trip-recommend:${ip}`)) {
      return new Response(JSON.stringify({ error: "請求過於頻繁，請稍後再試" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const scenario = typeof body?.scenario === "string" ? body.scenario : "";
    if (!SCENARIOS[scenario]) {
      return new Response(JSON.stringify({ error: "情境參數錯誤" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const attributes = body?.attributes && typeof body.attributes === "object" ? body.attributes : {};
    const exclude: string[] = Array.isArray(body?.exclude) ? body.exclude.map(String).slice(0, 20) : [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: productRows }, { data: roomRows }] = await Promise.all([
      supabase
        .from("trip_products")
        .select("id, type, name, price, duration_min, lat, lng, open_hours, available_slots, accommodation_id")
        .eq("is_active", true)
        .limit(60),
      supabase
        .from("room_types")
        .select("id, name, name_en, base_price, capacity, accommodation_id, is_exclusive_package")
        .order("display_order", { ascending: true })
        .limit(60),
    ]);

    const products = (productRows || []) as Product[];
    const rooms = (roomRows || []) as Array<{
      id: string;
      name: string;
      name_en: string | null;
      base_price: number;
      capacity: number;
      accommodation_id: string | null;
      is_exclusive_package: boolean;
    }>;

    if (!products.length) {
      return new Response(JSON.stringify({ error: "目前沒有可用的行程品項" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY && body?.fast !== true) throw new Error("ANTHROPIC_API_KEY is not configured");

    const catalog = products.map((p) => ({
      id: p.id,
      type: p.type,
      name: (p.name as Record<string, string>)?.zh || "",
      price: p.price,
      duration_min: p.duration_min,
      open_hours: p.open_hours?.zh ?? null,
    }));
    const roomCatalog = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.base_price,
      capacity: r.capacity,
      exclusive: r.is_exclusive_package,
    }));

    const fast = body?.fast === true;

    const system = fast
      ? `你是日月潭旅遊行程策展人。依「旅客屬性」與「情境模板」，從清單挑 3~4 個行程點與 1 個房型。

情境：${scenario}（${SCENARIOS[scenario]}）

嚴格規則：
- 只能使用清單中的 id，不可捏造。
- 不要輸出任何價格數字。
- 只輸出繁體中文，文字要短（標題 ≤ 16 字、摘要 ≤ 30 字、每點一句 ≤ 20 字）。
- match_score 為 60~99 的整數。
${exclude.length ? `- 盡量避開：${exclude.join(", ")}` : ""}

只輸出一段 JSON（不要 markdown）：
{"title":"","match_score":85,"reason":"","room_type_id":"","product_ids":["",""],"guides":{"<product_id>":""}}`
      : `你是日月潭旅遊行程策展人。依「旅客屬性」與「情境模板」，從提供的品項清單中挑選 3~5 個行程點，並挑選 1 個合適房型。

情境：${scenario}（${SCENARIOS[scenario]}）

嚴格規則：
- 只能使用清單中的 id，不可自行捏造。
- 不要輸出任何價格數字（價格由系統以資料庫實價計算）。
- 標題與導引說明都要同時給 zh / ja / en 三語。
- match_score 為 60~99 的整數，代表與旅客屬性的契合度。
${exclude.length ? `- 請盡量避開這些上一組已用過的品項 id：${exclude.join(", ")}` : ""}

只輸出一段 JSON（不要 markdown）：
{"title":{"zh":"","ja":"","en":""},"match_score":85,"reason":{"zh":"","ja":"","en":""},"room_type_id":"","product_ids":["",""],"guides":{"<product_id>":{"zh":"","ja":"","en":""}}}`;

    const userContent = `旅客屬性：${JSON.stringify(attributes)}\n\n可選行程品項：${JSON.stringify(catalog)}\n\n可選房型：${JSON.stringify(roomCatalog)}`;

    let raw = "";

    if (fast) {
      // LINE 情境：低延遲模型 + 只生中文 + 極短輸出
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          max_tokens: 2000,
          reasoning_effort: "none",

          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error("fast model error", r.status, errText);
        return new Response(JSON.stringify({ error: r.status === 429 ? "使用量超過限制，請稍後再試" : "AI 服務暫時無法回應" }), {
          status: r.status === 429 ? 429 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const j = await r.json();
      raw = (j?.choices?.[0]?.message?.content || "").trim();
      console.log("[trip-recommend] fast raw length", raw.length, "finish", j?.choices?.[0]?.finish_reason);

    } else {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 2000,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Anthropic error", resp.status, errText);
        return new Response(JSON.stringify({ error: resp.status === 429 ? "使用量超過限制，請稍後再試" : "AI 服務暫時無法回應" }), {
          status: resp.status === 429 ? 429 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      raw = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
    }

    let parsed: any = {};
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      parsed = JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw);
    } catch {
      parsed = {};
    }


    const byId = new Map(products.map((p) => [p.id, p]));
    const pickedIds: string[] = Array.isArray(parsed?.product_ids)
      ? parsed.product_ids.map(String).filter((id: string) => byId.has(id))
      : [];
    const picked = (pickedIds.length ? pickedIds : products.slice(0, 4).map((p) => p.id))
      .map((id) => byId.get(id)!)
      .filter(Boolean)
      .slice(0, 6);

    const room = rooms.find((r) => r.id === parsed?.room_type_id) || rooms[0] || null;

    const { result, totalDistance } = sortItems(picked, {
      lat: picked[0]?.lat ?? null,
      lng: picked[0]?.lng ?? null,
    });

    const guides = parsed?.guides && typeof parsed.guides === "object" ? parsed.guides : {};
    const tri = (v: any) => {
      // fast 模式只生中文（字串），其餘語系先以中文帶入，之後可 lazy 補生成
      if (typeof v === "string") {
        const zh = v.slice(0, 300);
        return { zh, ja: "", en: "" };
      }
      return {
        zh: typeof v?.zh === "string" ? v.zh.slice(0, 300) : "",
        ja: typeof v?.ja === "string" ? v.ja.slice(0, 300) : "",
        en: typeof v?.en === "string" ? v.en.slice(0, 300) : "",
      };
    };


    const items = result.map((r, idx) => ({
      ref_type: "product" as const,
      ref_id: r.product.id,
      qty: 1,
      day: 1,
      order: idx + 1,
      slot: r.slot,
      start_time: r.start_time,
      end_time: r.end_time,
      type: r.product.type,
      name: r.product.name,
      price: Number(r.product.price) || 0,
      duration_min: r.product.duration_min,
      open_hours: r.open_hours_label,
      within_open_hours: r.within_open_hours,
      distance_km: r.distance_km,
      guide: tri(guides?.[r.product.id]),
    }));

    if (room) {
      items.push({
        ref_type: "room" as any,
        ref_id: room.id,
        qty: 1,
        day: 1,
        order: items.length + 1,
        slot: "evening",
        start_time: "16:00",
        end_time: "",
        type: "room",
        name: { zh: room.name, ja: room.name, en: room.name_en || room.name } as unknown as string,
        price: Number(room.base_price) || 0,
        duration_min: null,
        open_hours: null,
        within_open_hours: true,
        distance_km: 0,
        guide: tri(null),
      } as any);
    }

    const total_price = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.qty || 1), 0);
    const match_score = Math.min(99, Math.max(60, Math.round(Number(parsed?.match_score) || 82)));

    const payload = {
      scenario,
      title: tri(parsed?.title),
      guide: tri(parsed?.reason),
      match_score,
      items,
      total_price,
      total_distance_km: totalDistance,
      room_type_id: room?.id ?? null,
      accommodation_id: room?.accommodation_id ?? null,
    };

    // 快照落地 + 背景三語補寫（fast 模式只先生中文，ja/en 由 trip-translate 補齊）
    let snapshot_id: string | null = null;
    let translation_status: "pending" | "ready" = fast ? "pending" : "ready";
    if (body?.persist === true) {
      const { data: snap, error: snapErr } = await supabase
        .from("trip_generations")
        .insert({
          scenario,
          source: typeof body?.source === "string" ? body.source : "web",
          attributes,
          payload,
          translation_status,
        })
        .select("id")
        .single();
      if (snapErr) console.error("[trip-recommend] snapshot insert failed", snapErr);
      snapshot_id = snap?.id ?? null;

      if (snapshot_id && fast) {
        const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/trip-translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          },
          body: JSON.stringify({ id: snapshot_id }),
        }).catch((e) => console.error("[trip-recommend] translate kick failed", e));
        // deno-lint-ignore no-explicit-any
        const rt = (globalThis as any).EdgeRuntime;
        if (rt?.waitUntil) rt.waitUntil(kick);
      } else if (snapshot_id) {
        translation_status = "ready";
      }
    }

    return new Response(
      JSON.stringify({ ...payload, snapshot_id, translation_status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("trip-recommend error", e);
    return new Response(JSON.stringify({ error: "系統錯誤，請稍後再試" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
