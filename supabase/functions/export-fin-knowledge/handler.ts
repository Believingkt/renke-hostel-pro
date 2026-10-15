// export-fin-knowledge 請求處理：x-api-key（FIN_API_KEY，與 fin-availability 同一把、同樣 safeEqual）、查詢、輸出。
import { fetchAll, fetchIn, safeEqual } from "../fin-availability/handler.ts";
import { type AccommodationBundle, renderAccommodationMarkdown, taipeiDate } from "./core.ts";
import { renderPlatformMarkdown } from "./platform.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
const markdown = (body: string) =>
  new Response(body, { headers: { ...corsHeaders, "Content-Type": "text/markdown; charset=utf-8" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 只選對客公開欄位；不含 email／銀行帳號／內部設定
const ACC_COLS = "id, name, short_url_alias, region_1, region_2, address, nearby_station, phone, line_id, website_url, description, check_in_notice, show_room_facilities_whole, show_room_facilities_single";
const SETTINGS_COLS = "accommodation_id, check_in_time, check_out_time, cancellation_policy, pet_policy, other_notes";

const groupBy = (rows: any[], key: string) => {
  const m = new Map<string, any[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) || []), r]);
  return m;
};

async function loadBundles(client: any, accs: any[]): Promise<AccommodationBundle[]> {
  const ids = accs.map((a) => a.id);
  const [settings, roomTypes, facilities, packages, faqs, knowledge] = await Promise.all([
    fetchIn(ids, (p) => client.from("booking_settings").select(SETTINGS_COLS).in("accommodation_id", p).order("id", { ascending: true })),
    fetchIn(ids, (p) => client.from("room_types").select("id, accommodation_id, name, capacity, size_sqm, description, is_exclusive_package, display_order")
      .in("accommodation_id", p).order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })),
    fetchIn(ids, (p) => client.from("accommodation_facilities").select("accommodation_id, facility_name, room_scope, is_available")
      .in("accommodation_id", p).in("room_scope", ["whole", "single"]).order("id", { ascending: true })),
    fetchIn(ids, (p) => client.from("accommodation_packages")
      .select("accommodation_id, name, subtitle, guest_count, guest_count_max, guest_count_label, applicable_tiers, original_price, sale_price, tier_prices, room_allocation, includes, child_age_note, display_order")
      .in("accommodation_id", p).eq("enabled", true)
      .order("display_order", { ascending: true }).order("guest_count", { ascending: true }).order("id", { ascending: true })),
    fetchIn(ids, (p) => client.from("faqs").select("accommodation_id, question, answer, display_order")
      .in("accommodation_id", p).eq("is_published", true)
      .order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })),
    fetchIn(ids, (p) => client.from("ai_knowledge").select("accommodation_id, category, title, content, tags, priority")
      .in("accommodation_id", p).eq("is_active", true)
      .order("priority", { ascending: false }).order("id", { ascending: true })),
  ]);
  const amenities = await fetchIn(roomTypes.map((r) => r.id), (p) => client.from("room_amenities")
    .select("room_type_id, amenity_name").in("room_type_id", p).order("id", { ascending: true }));

  const sBy = groupBy(settings, "accommodation_id"), rtBy = groupBy(roomTypes, "accommodation_id");
  const fBy = groupBy(facilities, "accommodation_id"), pBy = groupBy(packages, "accommodation_id");
  const qBy = groupBy(faqs, "accommodation_id"), kBy = groupBy(knowledge, "accommodation_id");
  const amBy = groupBy(amenities, "room_type_id");
  return accs.map((acc) => {
    const rts = rtBy.get(acc.id) || [];
    return {
      acc,
      settings: (sBy.get(acc.id) || [])[0] ?? null,
      roomTypes: rts,
      facilities: fBy.get(acc.id) || [],
      amenities: rts.flatMap((r) => amBy.get(r.id) || []),
      packages: pBy.get(acc.id) || [],
      faqs: qBy.get(acc.id) || [],
      knowledge: kBy.get(acc.id) || [],
    };
  });
}

export async function handleExport(req: Request, deps: { client: any; apiKey: string | undefined; now?: Date }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "只支援 GET" }, 405);
  try {
    if (!deps.apiKey) return json({ error: "伺服器設定錯誤：尚未設定 FIN_API_KEY" }, 500);
    const provided = req.headers.get("x-api-key") || "";
    if (!provided || !safeEqual(provided, deps.apiKey)) return json({ error: "API 金鑰錯誤或未提供" }, 401);

    const url = new URL(req.url);
    const date = taipeiDate(deps.now);
    const accId = url.searchParams.get("accommodation_id");
    const activeAccs = () => deps.client.from("accommodation_info").select(ACC_COLS).eq("is_active", true);

    if (url.searchParams.get("all") === "1") {
      const accs = await fetchAll(() => activeAccs().order("name", { ascending: true }).order("id", { ascending: true }));
      const bundles = await loadBundles(deps.client, accs);
      return json(bundles.map((b) => ({ alias: b.acc.short_url_alias || b.acc.id, name: b.acc.name, markdown: renderAccommodationMarkdown(b, date) })));
    }
    if (accId === "platform") {
      const knowledge = await fetchAll(() => deps.client.from("ai_knowledge").select("accommodation_id, category, title, content, tags, priority")
        .is("accommodation_id", null).eq("is_active", true)
        .order("priority", { ascending: false }).order("id", { ascending: true }));
      return markdown(renderPlatformMarkdown(date, knowledge));
    }
    if (!accId) return json({ error: "請提供 accommodation_id（館別 uuid 或 platform）或 all=1" }, 400);
    if (!UUID_RE.test(accId)) return json({ error: "找不到此館別" }, 404);

    const { data, error } = await activeAccs().eq("id", accId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return json({ error: "找不到此館別" }, 404);
    const [bundle] = await loadBundles(deps.client, [data]);
    return markdown(renderAccommodationMarkdown(bundle, date));
  } catch (e) {
    console.error("[export-fin-knowledge]", (e as Error).message);
    return json({ error: "匯出知識庫時發生錯誤，請稍後再試" }, 500);
  }
}
