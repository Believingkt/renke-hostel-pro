// fin-availability 請求處理：認證、rate limit、查詢（與 all-availability 同源）、扁平化輸出。
// client 可注入以便測試；正式由 index.ts 傳入 service role client。
import {
  ACTIVE_ORDER_STATUSES,
  buildAvailability,
} from "../_shared/availability.ts";
import {
  bookingUrl, capacityFits, discountLabel, finalize, packageCapacity, packageRoomTypeId, parseFinQuery,
  summarizePackage, summarizeRoomType, type FinResultRow, type PackageRow, type PkgDateOverride,
} from "./core.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// 與 all-availability 相同的常數時間比對
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 與 accommodation-ai-chat 相同的記憶體 rate limit（每個 isolate 各自計算）
const RATE_LIMIT_WINDOW = 60 * 1000;
export const RATE_LIMIT_PER_MIN = 60;
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const rec = rateLimitMap.get(key);
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (rec.count >= max) return false;
  rec.count++;
  return true;
}
export function resetRateLimit() { rateLimitMap.clear(); }

const PAGE = 1000;
const ID_CHUNK = 150;
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** PostgREST 單次最多回 1000 列：以 range 分頁取完 */
export async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await build().range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/** id 清單過長會讓 URL 超限：分批 in() 後合併 */
export async function fetchIn(ids: string[], build: (part: string[]) => any): Promise<any[]> {
  if (!ids.length) return [];
  const parts = await Promise.all(chunk(ids, ID_CHUNK).map((p) => fetchAll(() => build(p))));
  return parts.flat();
}

const groupBy = (rows: any[], key: string) => {
  const m = new Map<string, any[]>();
  for (const r of rows) {
    const list = m.get(r[key]) || [];
    list.push(r);
    m.set(r[key], list);
  }
  return m;
};

function activeAccQuery(client: any, select: string, opts?: { count?: "exact"; head?: boolean }) {
  // 所有可訂的館：只看 is_active（show_on_portal 僅為首頁精選）
  return client.from("accommodation_info").select(select, opts).eq("is_active", true);
}

const HOLIDAY_TYPES_AS_WEEKEND = ["holiday", "compensatory_day_off"];

export async function handleFin(req: Request, deps: { client: any; apiKey: string | undefined }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "只支援 GET" }, 405);

  try {
    if (!deps.apiKey) return json({ error: "伺服器設定錯誤：尚未設定 FIN_API_KEY" }, 500);
    const provided = req.headers.get("x-api-key") || "";
    if (!provided || !safeEqual(provided, deps.apiKey)) return json({ error: "API 金鑰錯誤或未提供" }, 401);
    if (!checkRateLimit("fin", RATE_LIMIT_PER_MIN)) return json({ error: "查詢太頻繁，請稍後再試（每分鐘上限 60 次）" }, 429);

    const url = new URL(req.url);
    const client = deps.client;

    if (url.searchParams.get("ping") === "1") {
      const { count, error } = await activeAccQuery(client, "id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return json({ ok: true, accommodations: count ?? 0 });
    }

    const parsed = parseFinQuery(url.searchParams);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const q = parsed.q;
    const from = q.checkIn;
    const to = q.lastNight; // 退房前一晚

    const accs = await fetchAll(() => {
      let b = activeAccQuery(client, "id, name, region_1, region_2, short_url_alias");
      const groups: string[] = [];
      if (q.region) groups.push(`or(region_1.ilike.%${q.region}%,region_2.ilike.%${q.region}%)`);
      if (q.accommodation) groups.push(`or(name.ilike.%${q.accommodation}%,short_url_alias.ilike.%${q.accommodation}%)`);
      // 單一 or= 參數內以 and(...) 明確組合，避免依賴重複 or= 參數的語意
      if (groups.length) b = b.or(`and(${groups.join(",")})`);
      return b.order("name", { ascending: true }).order("id", { ascending: true });
    });
    const base = { check_in: q.checkIn, check_out: q.checkOut, nights: q.nights, guests: q.guests, currency: "TWD" };
    if (!accs.length) return json({ ...base, ...finalize([], 0) });

    const accIds = accs.map((a) => a.id);
    const nowIso = new Date().toISOString();
    // 房型／範本／假日與 all-availability 相同；訂單與付款保留對齊結帳端 RPC get_adjusted_room_inventory_batch
    const [roomTypes, templates, rawOrders, holidays, holds, packages, pkgOverrides] = await Promise.all([
      fetchIn(accIds, (p) => client.from("room_types")
        .select("id, accommodation_id, name, capacity, room_count, display_order, is_exclusive_package, is_bound_to_exclusive, bound_exclusive_ids, blocks_all_inventory, blocks_all_target_ids")
        .in("accommodation_id", p).order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })),
      fetchIn(accIds, (p) => client.from("pricing_templates")
        .select("accommodation_id, room_type_id, template_name, project_name, price, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, room_overrides, season_segments, valid_from, valid_until, extra_dates, excluded_dates, display_order, default_package_id, numeric_code")
        .in("accommodation_id", p).order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })),
      fetchIn(accIds, (p) => client.from("orders")
        .select("id, accommodation_id, room_type_id, check_in_date, check_out_date, order_status, lock_whole_building")
        .in("accommodation_id", p).neq("order_status", "cancelled")
        .gt("check_out_date", from).lte("check_in_date", to).order("id", { ascending: true })),
      fetchIn(accIds, (p) => client.from("public_holidays")
        .select("accommodation_id, holiday_date, holiday_type")
        .in("accommodation_id", p).gte("holiday_date", from).lte("holiday_date", to).order("id", { ascending: true })),
      // 團購信用卡有效保留：未轉單，且（付款中未過期 或 已付款待建單）
      fetchIn(accIds, (p) => client.from("group_buy_payment_drafts")
        .select("id, accommodation_id, room_type_id, check_in_date, check_out_date, room_quantity")
        .in("accommodation_id", p).is("converted_order_id", null)
        .gt("check_out_date", from).lte("check_in_date", to)
        .or(`and(status.in.(pending,payment_processing),expires_at.gt.${nowIso}),status.eq.paid`)
        .order("id", { ascending: true })),
      fetchIn(accIds, (p) => client.from("accommodation_packages")
        .select("id, accommodation_id, name, guest_count, guest_count_max, applicable_tiers, primary_room_type_id, room_type_ids, original_price, sale_price, tier_prices, excluded_date_ranges, display_order")
        .in("accommodation_id", p).eq("enabled", true)
        .order("display_order", { ascending: true }).order("guest_count", { ascending: true }).order("id", { ascending: true })),
      fetchIn(accIds, (p) => client.from("package_date_prices")
        .select("package_id, date, sale_price, original_price, is_available")
        .in("accommodation_id", p).gte("date", from).lte("date", to).order("id", { ascending: true })),
    ]);

    // buildAvailability 只扣 ACTIVE_ORDER_STATUSES；RPC 為 cancelled 以外全扣 → 正規化狀態，付款保留轉為虛擬訂單
    const holdStatus = ACTIVE_ORDER_STATUSES[0];
    const orders = [
      ...rawOrders.map((o) => ({ ...o, order_status: holdStatus })),
      ...holds.map((h) => ({
        id: `hold-${h.id}`, accommodation_id: h.accommodation_id, room_type_id: h.room_type_id,
        check_in_date: h.check_in_date, check_out_date: h.check_out_date, order_status: holdStatus, lock_whole_building: false,
      })),
    ];
    const holdRooms = holds.map((h) => ({ order_id: `hold-${h.id}`, room_type_id: h.room_type_id, quantity: Math.max(Number(h.room_quantity ?? 1), 1) }));

    const rtIds = roomTypes.map((r) => r.id);
    const [inventory, orderRooms] = await Promise.all([
      fetchIn(rtIds, (p) => client.from("room_inventory_pricing")
        .select("room_type_id, date, price, price_2_meals, price_3_meals, available_rooms, is_available")
        .in("room_type_id", p).is("pricing_template_id", null).gte("date", from).lte("date", to).order("id", { ascending: true })),
      fetchIn(rawOrders.map((o) => o.id), (p) => client.from("order_rooms")
        .select("order_id, room_type_id, quantity").in("order_id", p).order("id", { ascending: true })),
    ]);

    const rtByAcc = groupBy(roomTypes, "accommodation_id");
    const tmplByAcc = groupBy(templates, "accommodation_id");
    const ordersByAcc = groupBy(orders, "accommodation_id");
    const holByAcc = groupBy(holidays, "accommodation_id");
    const invByRt = groupBy(inventory, "room_type_id");
    const pkgByAcc = groupBy(packages, "accommodation_id");
    const ovMap = new Map<string, PkgDateOverride>(pkgOverrides.map((o) => [`${o.package_id}_${o.date}`, o]));
    const allOrderRooms = [...orderRooms, ...holdRooms];

    const rows: FinResultRow[] = [];
    let unavailable = 0;
    for (const acc of accs) {
      const rtList = rtByAcc.get(acc.id) || [];
      if (!rtList.length) continue;
      const accHolidays = holByAcc.get(acc.id) || [];
      const computed = buildAvailability({
        from, to,
        roomTypes: rtList as any,
        inventory: rtList.flatMap((r) => invByRt.get(r.id) || []) as any,
        orders: (ordersByAcc.get(acc.id) || []) as any,
        orderRooms: allOrderRooms as any,
        templates: (tmplByAcc.get(acc.id) || []) as any,
        holidays: accHolidays as any,
      });
      const common = {
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        region: [acc.region_1, acc.region_2].filter(Boolean).join(" "),
        booking_url: bookingUrl(acc, q),
      };
      const priced = (list: number | null, total: number | null) => {
        const label = discountLabel(list, total);
        return {
          list_price: list,
          ...(label ? { discount_label: label } : {}),
          total_price: total,
          avg_nightly_price: total == null ? null : Math.round(total / q.nights),
          ...(total == null ? { price_note: "請洽客服" } : {}),
        };
      };

      const accPkgs = (pkgByAcc.get(acc.id) || []) as PackageRow[];
      if (accPkgs.length) {
        // 有啟用方案的館：與前台館別頁一致，以方案為單位
        const holidaySet = new Set(accHolidays.filter((h) => HOLIDAY_TYPES_AS_WEEKEND.includes(h.holiday_type)).map((h) => h.holiday_date));
        for (const pkg of accPkgs) {
          const capacity = packageCapacity(pkg);
          if (!capacityFits(capacity, q.guests)) continue;
          const rtRes = computed.find((r) => r.room_type_id === packageRoomTypeId(pkg));
          if (!rtRes) continue; // 未綁房型無法驗庫存
          const s = summarizePackage(pkg, rtRes, q.nights, holidaySet, ovMap);
          if (!s.available) { unavailable++; continue; }
          rows.push({
            ...common,
            room_type_id: rtRes.room_type_id, room_type_name: rtRes.name, plan_name: pkg.name,
            capacity, available: true, remaining: s.remaining,
            ...priced(s.list_price, s.total_price),
          });
        }
        continue;
      }

      for (const rtRes of computed) {
        const capacity = rtList.find((r) => r.id === rtRes.room_type_id)?.capacity ?? null;
        if (!capacityFits(capacity, q.guests)) continue;
        const s = summarizeRoomType(rtRes, q.nights);
        if (!s.available) { unavailable++; continue; }
        rows.push({
          ...common,
          room_type_id: rtRes.room_type_id, room_type_name: rtRes.name, plan_name: null,
          capacity, available: true, remaining: s.remaining,
          ...priced(s.total_price, s.total_price),
        });
      }
    }
    return json({ ...base, ...finalize(rows, unavailable) });
  } catch (e) {
    console.error("[fin-availability]", (e as Error).message);
    return json({ error: "查詢房況時發生錯誤，請稍後再試" }, 500);
  }
}
