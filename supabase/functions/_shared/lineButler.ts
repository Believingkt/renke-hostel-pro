/**
 * 小安 LINE 管家核心邏輯（C4）
 * - 對話狀態機存於 line_sessions.state
 * - 房況判讀沿用 get_adjusted_room_inventory_batch + room_inventory_pricing 鎖房規則
 * - 回覆一律以 LINE Messaging API reply/push 發送
 * 不改動既有金流與 portal-ai-chat。
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { parseIntent, type ParsedIntent, type TripAttributes, type TripScenario } from "./lineIntent.ts";
import { VENUE_ALIASES, accommodationMatchesVenue } from "./lineVenueAlias.ts";
import { taipeiToday } from "./taipeiDate.ts";
import { askLlm, logLineConversation } from "./lineLlm.ts";
import {
  archiveTripAttributes,
  recommendTrip,
  saveTripSnapshot,
  scenarioQuickReply,
  SCENARIO_LABEL,
  tripFlex,
} from "./lineTrip.ts";
import { writeMetric } from "./metric.ts";
import { lowestPackagePricesForRooms } from "./packagePricing.ts";
import { fetchVenueAddons, type VenueAddon } from "./venueAddons.ts";
export { fetchVenueAddons, type VenueAddon };

export interface ButlerCartStay {
  kind: "stay";
  roomTypeId: string;
  accommodationId: string;
  roomName: string;
  accommodationName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** 顯示用每晚均價（僅顯示，不參與加總） */
  unitPrice: number;
  /** 單一房間整段 stay 的實價（唯一計價來源） */
  stayTotal?: number;
  qty: number;
  coverUrl?: string | null;
  /** 啟用方案 id（帶入 /book 走與官網同一條方案計價） */
  packageId?: string | null;
}

export interface ButlerCartProduct {
  kind: "product";
  productId: string;
  name: string;
  type: string;
  unitPrice: number;
  qty: number;
  coverUrl?: string | null;
}

/** 館別原生加購（addon_settings）；結帳走 BookingFlow 原生加購路徑 */
export interface ButlerCartVenueAddon {
  kind: "venue_addon";
  addonType: string;
  name: string;
  unitPrice: number;
  unitLabel: string;
  qty: number;
  /** per_night ×晚數；per_stay 固定 */
  pricingMode: "per_night" | "per_stay";
  nights: number;
}

export type ButlerCartItem = ButlerCartStay | ButlerCartProduct | ButlerCartVenueAddon;

export interface ButlerState {
  intent?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  adults?: number;
  children?: number;
  keyword?: string;
  venue?: string;
  venueLabel?: string;
  scenario?: TripScenario;
  tripAttributes?: TripAttributes;
  cart?: ButlerCartItem[];
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/* ---------------- LINE messaging ---------------- */

export interface OutgoingMessage {
  // deno-lint-ignore no-explicit-any
  [k: string]: any;
}

export async function lineReply(token: string, replyToken: string, messages: OutgoingMessage[]) {
  const r = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!r.ok) console.error("[butler] reply failed", r.status, await r.text());
}

export async function linePush(token: string, to: string, messages: OutgoingMessage[]) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.error("[butler] push failed", r.status, body);
    throw new Error(`LINE push failed ${r.status}: ${body}`);
  }
}

export function textMsg(text: string): OutgoingMessage {
  return { type: "text", text };
}

function quickMenu(): OutgoingMessage {
  return {
    type: "text",
    text: "想先看哪一個呢？😊",
    quickReply: {
      items: [
        { type: "action", action: { type: "message", label: "🔍 找房", text: "我想找房" } },
        { type: "action", action: { type: "message", label: "🎁 加購", text: "有什麼加購體驗" } },
        { type: "action", action: { type: "message", label: "🗺️ 排行程", text: "幫我排行程" } },
        { type: "action", action: { type: "message", label: "❤️ 我的收藏", text: "我的收藏" } },
        { type: "action", action: { type: "message", label: "🛒 結帳", text: "我要結帳" } },
      ],
    },
  };
}

export function welcomeMessages(): OutgoingMessage[] {
  return [
    textMsg("嗨嗨～我是小安 🧸 人客多的 AI 旅宿管家！\n告訴我日期跟人數，我馬上幫你找有空的房 ✨"),
    quickMenu(),
  ];
}

/* ---------------- Session ---------------- */

export async function loadSession(sb: SupabaseClient, lineUserId: string) {
  const { data } = await sb
    .from("line_sessions")
    .select("id, line_user_id, member_user_id, state, last_intent")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await sb
    .from("line_sessions")
    .insert({ line_user_id: lineUserId, state: {} })
    .select("id, line_user_id, member_user_id, state, last_intent")
    .single();
  return created!;
}

export async function saveSession(sb: SupabaseClient, lineUserId: string, state: ButlerState, intent?: string) {
  await sb
    .from("line_sessions")
    .update({ state, last_intent: intent ?? null, updated_at: new Date().toISOString() })
    .eq("line_user_id", lineUserId);
}

/* ---------------- Availability（沿用既有鎖房規則） ---------------- */

function eachDate(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const d = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface RoomOffer {
  roomTypeId: string;
  accommodationId: string;
  accommodationName: string;
  name: string;
  capacity: number;
  totalPrice: number;
  availableRooms: number;
  coverUrl: string | null;
  /** 是否貼合人數（非包棟且不會過大） */
  fitsGuests: boolean;
  isExclusivePackage: boolean;
  /** 啟用方案（與官網同一套方案售價）；無方案時為 null，價格退回房況庫存價 */
  packageId?: string | null;
  packageName?: string | null;
  originalPrice?: number | null;
}

export interface FindRoomsResult {
  offers: RoomOffer[];
  /** 使用者有指定館別且成功對應到 accommodation */
  venueLabel?: string;
  venueResolved: boolean;
  /** 指定館別無房時的其他館替代建議 */
  alternatives: RoomOffer[];
}

/** 任一包棟被訂走即整天關閉（沿用前台 sensan availability rule） */
const STRICT_PACKAGE_ANY_BOOKED_IDS = new Set<string>([
  "5f764d55-ae11-4631-80fe-2e611853deae", // 森山寫照
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8", // 奧莉薇雅生活小酒店
  "8e3e8866-3cb0-4654-91f3-d9b09a543301", // 淞湘卉館
]);
const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";

interface AdjRow {
  date_value?: string;
  date?: string;
  available_rooms?: number;
  is_blocked?: boolean;
}

async function adjustedRows(
  sb: SupabaseClient,
  roomTypeId: string,
  accommodationId: string,
  dates: string[],
): Promise<Map<string, { available_rooms: number; is_blocked: boolean }>> {
  const map = new Map<string, { available_rooms: number; is_blocked: boolean }>();
  const { data } = await sb.rpc("get_adjusted_room_inventory_batch", {
    p_room_type_id: roomTypeId,
    p_dates: dates,
    p_accommodation_id: accommodationId,
  });
  for (const row of ((data as AdjRow[]) || [])) {
    const key = row.date_value ?? row.date;
    if (!key) continue;
    map.set(key, { available_rooms: row.available_rooms ?? 0, is_blocked: row.is_blocked === true });
  }
  return map;
}

/**
 * 館別鎖房規則：回傳每個館「整天關閉」的日期集合。
 * 不自行重算庫存，一律走 get_adjusted_room_inventory_batch。
 */
async function computeLockedDates(
  sb: SupabaseClient,
  accIds: string[],
  dates: string[],
): Promise<Map<string, Set<string>>> {
  const locked = new Map<string, Set<string>>();
  const targets = accIds.filter(
    (id) => STRICT_PACKAGE_ANY_BOOKED_IDS.has(id) || id === HAKUNA_ACCOMMODATION_ID,
  );
  if (targets.length === 0) return locked;

  const { data: exclusiveTypes } = await sb
    .from("room_types")
    .select("id, accommodation_id")
    .in("accommodation_id", targets)
    .eq("is_exclusive_package", true);

  const byAcc = new Map<string, string[]>();
  for (const rt of exclusiveTypes || []) {
    const list = byAcc.get(rt.accommodation_id!) || [];
    list.push(rt.id);
    byAcc.set(rt.accommodation_id!, list);
  }

  for (const [accId, ids] of byAcc.entries()) {
    if (ids.length === 0) continue;
    const rowsList = await Promise.all(ids.map((id) => adjustedRows(sb, id, accId, dates)));
    const threshold = accId === HAKUNA_ACCOMMODATION_ID ? 2 : 1;
    const closed = new Set<string>();
    for (const date of dates) {
      let soldOut = 0;
      for (const rows of rowsList) {
        const r = rows.get(date);
        if (!r || r.is_blocked || r.available_rooms <= 0) soldOut += 1;
      }
      if (soldOut >= threshold) closed.add(date);
    }
    if (closed.size > 0) locked.set(accId, closed);
  }
  return locked;
}

async function buildOffers(
  sb: SupabaseClient,
  accList: { id: string; name: string }[],
  opts: { checkIn: string; checkOut: string; guests?: number; limit?: number },
): Promise<RoomOffer[]> {
  const dates = eachDate(opts.checkIn, opts.checkOut);
  if (accList.length === 0 || dates.length === 0) return [];
  const accMap = new Map(accList.map((a) => [a.id, a]));

  let rtQuery = sb
    .from("room_types")
    .select("id, name, base_price, capacity, accommodation_id, is_exclusive_package")
    .in("accommodation_id", accList.map((a) => a.id));
  if (opts.guests) rtQuery = rtQuery.gte("capacity", opts.guests);
  const { data: roomTypes } = await rtQuery;
  if (!roomTypes || roomTypes.length === 0) return [];
  const roomTypeIds = roomTypes.map((r) => r.id);

  const { data: inventory } = await sb
    .from("room_inventory_pricing")
    .select("room_type_id, date, price, is_available")
    .in("room_type_id", roomTypeIds)
    .is("pricing_template_id", null)
    .gte("date", opts.checkIn)
    .lt("date", opts.checkOut);

  const baseIndex = new Map<string, { is_available: boolean; price: number | null }>();
  for (const inv of inventory || []) {
    baseIndex.set(`${inv.room_type_id}:${inv.date}`, {
      is_available: inv.is_available !== false,
      price: inv.price && Number(inv.price) > 0 ? Number(inv.price) : null,
    });
  }

  const [adjusted, lockedDates] = await Promise.all([
    Promise.all(
      roomTypes.map(async (rt) => ({
        roomTypeId: rt.id,
        rows: await adjustedRows(sb, rt.id, rt.accommodation_id!, dates),
      })),
    ),
    computeLockedDates(sb, accList.map((a) => a.id), dates),
  ]);
  const adjIndex = new Map<string, { available_rooms: number; is_blocked: boolean }>();
  for (const { roomTypeId, rows } of adjusted) {
    for (const [date, v] of rows.entries()) adjIndex.set(`${roomTypeId}:${date}`, v);
  }

  const { data: photos } = await sb
    .from("room_photos")
    .select("room_type_id, photo_url, display_order")
    .in("room_type_id", roomTypeIds)
    .order("display_order", { ascending: true, nullsFirst: false });
  const photoIndex = new Map<string, string>();
  for (const p of photos || []) {
    if (p.room_type_id && !photoIndex.has(p.room_type_id)) photoIndex.set(p.room_type_id, p.photo_url);
  }

  const offers: RoomOffer[] = [];
  // 方案售價（與官網同源）：有啟用方案以方案售價為準，無則退回房況庫存價
  const pkgByRoom = await lowestPackagePricesForRooms(
    sb,
    accList.length === 1 ? accList[0].id : "",
    roomTypeIds,
    dates,
  );
  // 多館情境逐館查（活動入口通常單館；多館時合併）
  if (accList.length > 1) {
    const perAcc = await Promise.all(
      accList.map((a) =>
        lowestPackagePricesForRooms(
          sb,
          a.id,
          roomTypes.filter((r) => r.accommodation_id === a.id).map((r) => r.id),
          dates,
        )
      ),
    );
    for (const m of perAcc) for (const [k, v] of m.entries()) pkgByRoom.set(k, v);
  }
  for (const rt of roomTypes) {
    const accClosed = lockedDates.get(rt.accommodation_id!);
    let total = 0;
    let minRooms: number | null = null;
    let bookable = true;
    for (const date of dates) {
      const base = baseIndex.get(`${rt.id}:${date}`);
      const adj = adjIndex.get(`${rt.id}:${date}`);
      if (
        accClosed?.has(date) ||
        !base ||
        base.is_available === false ||
        !adj ||
        adj.is_blocked ||
        adj.available_rooms <= 0
      ) {
        bookable = false;
        minRooms = 0;
        break;
      }
      total += base.price ?? Number(rt.base_price ?? 0);
      minRooms = minRooms === null ? adj.available_rooms : Math.min(minRooms, adj.available_rooms);
    }
    if (!bookable) continue;
    const isExclusive = rt.is_exclusive_package === true;
    const capacity = Number(rt.capacity ?? 0);
    const fitsGuests = opts.guests
      ? !isExclusive && capacity >= opts.guests && capacity <= opts.guests + 1
      : !isExclusive;
    const pkg = pkgByRoom.get(rt.id);
    // 佔用閘門：超過該方案人數上限則不推薦（與官網「人數超過上限」一致）
    if (opts.guests && pkg?.guestMax != null && opts.guests > pkg.guestMax) continue;
    offers.push({
      roomTypeId: rt.id,
      accommodationId: rt.accommodation_id!,
      accommodationName: accMap.get(rt.accommodation_id!)?.name ?? "",
      name: rt.name,
      capacity,
      totalPrice: pkg ? pkg.saleTotal : total,
      availableRooms: minRooms ?? 0,
      coverUrl: photoIndex.get(rt.id) ?? null,
      fitsGuests,
      isExclusivePackage: isExclusive,
      packageId: pkg?.packageId ?? null,
      packageName: pkg?.packageName ?? null,
      originalPrice: pkg?.originalTotal ?? null,
    });
  }
  // 先按適配度分組，組內按價格排序
  offers.sort((a, b) => {
    if (a.fitsGuests !== b.fitsGuests) return a.fitsGuests ? -1 : 1;
    return a.totalPrice - b.totalPrice;
  });
  return offers.slice(0, opts.limit ?? 5);
}

async function activeAccommodations(sb: SupabaseClient) {
  const { data } = await sb
    .from("accommodation_info")
    .select("id, name, region_1, region_2, is_active, show_on_portal")
    .eq("is_active", true);
  return (data || []).filter((a) => a.show_on_portal !== false);
}

export async function findRoomsDetailed(
  sb: SupabaseClient,
  opts: {
    checkIn: string;
    checkOut: string;
    guests?: number;
    keyword?: string;
    venue?: string;
    limit?: number;
  },
): Promise<FindRoomsResult> {
  const all = await activeAccommodations(sb);
  if (all.length === 0) return { offers: [], venueResolved: false, alternatives: [] };

  const venueAlias = opts.venue ? VENUE_ALIASES.find((v) => v.canonical === opts.venue) : undefined;

  // 1) 指定館別 → 只查該館
  if (venueAlias) {
    const scoped = all.filter((a) => accommodationMatchesVenue(a.name, venueAlias));
    if (scoped.length > 0) {
      const offers = await buildOffers(sb, scoped, opts);
      let alternatives: RoomOffer[] = [];
      if (offers.length === 0) {
        const others = all.filter((a) => !scoped.some((s) => s.id === a.id));
        alternatives = await buildOffers(sb, others, { ...opts, limit: 3 });
      }
      return { offers, venueResolved: true, venueLabel: venueAlias.label, alternatives };
    }
  }

  // 2) 其他關鍵字（地區）
  let accList = all;
  if (opts.keyword) {
    const kw = opts.keyword;
    const matched = all.filter(
      (a) =>
        (a.name && kw.includes(a.name)) ||
        (a.name && a.name.includes(kw)) ||
        (a.region_1 && kw.includes(a.region_1)) ||
        (a.region_2 && kw.includes(a.region_2)),
    );
    if (matched.length > 0) accList = matched;
  }
  const offers = await buildOffers(sb, accList, opts);
  return { offers, venueResolved: false, venueLabel: venueAlias?.label, alternatives: [] };
}

export async function findRooms(
  sb: SupabaseClient,
  opts: {
    checkIn: string;
    checkOut: string;
    guests?: number;
    keyword?: string;
    venue?: string;
    limit?: number;
  },
): Promise<RoomOffer[]> {
  const r = await findRoomsDetailed(sb, opts);
  return r.offers;
}


/* ---------------- Flex builders ---------------- */

function money(n: number) {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

/** 加購價格顯示：0（含）以下顯示「免費」 */
function addonPriceText(n: number) {
  return Number(n) > 0 ? money(n) : "免費";
}

/** 從 jsonb/字串多語名稱取中文顯示名 */
// deno-lint-ignore no-explicit-any
function localizedName(v: any, fallback = "加購項目"): string {
  if (v == null) return fallback;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return fallback;
    // 可能為雙重編碼的 JSON 字串
    if (s.startsWith("{")) {
      try { return localizedName(JSON.parse(s), fallback); } catch { return s; }
    }
    return s;
  }
  if (typeof v === "object") {
    for (const k of ["zh", "zh-TW", "zh-Hant", "zh_TW", "zh-CN", "cmn", "en", "ja"]) {
      const val = v[k];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    for (const val of Object.values(v)) {
      if (typeof val === "string" && val.trim()) return val.trim();
    }
  }
  return fallback;
}


/** 加購分類英文代碼 → 中文標籤 */
function addonTypeLabel(type?: string | null): string {
  const map: Record<string, string> = {
    attraction: "景點",
    ticket: "票券",
    experience: "體驗",
    activity: "體驗",
    meal: "餐食",
    food: "餐食",
    transport: "接送",
    shuttle: "接送",
    tea: "下午茶",
  };
  const key = String(type ?? "").toLowerCase();
  return map[key] ?? (type && /[\u4e00-\u9fff]/.test(type) ? type : "加購");
}

export function roomCarousel(offers: RoomOffer[], checkIn: string, checkOut: string, nights: number): OutgoingMessage {
  return {
    type: "flex",
    altText: `找到 ${offers.length} 間有空的房型`,
    contents: {
      type: "carousel",
      contents: offers.map((o) => ({
        type: "bubble",
        size: "kilo",
        ...(o.coverUrl
          ? { hero: { type: "image", url: o.coverUrl, size: "full", aspectRatio: "20:13", aspectMode: "cover" } }
          : {}),
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            { type: "text", text: o.accommodationName, size: "xs", color: "#999999" },
            { type: "text", text: o.name, weight: "bold", size: "md", wrap: true },
            { type: "text", text: `${checkIn} → ${checkOut}・${nights} 晚`, size: "xs", color: "#888888" },
            ...(o.fitsGuests
              ? []
              : [{ type: "text", text: "適合多人", size: "xs", color: "#8A6FCF" }]),
            {
              type: "text",
              text: o.availableRooms > 0 ? `餘 ${o.availableRooms} 間` : "已滿",
              size: "xs",
              color: o.availableRooms > 0 ? "#E8792B" : "#B00020",
            },
            ...(o.packageName ? [{ type: "text", text: o.packageName, size: "xs", color: "#8A6FCF", wrap: true }] : []),
            ...(o.originalPrice && o.originalPrice > o.totalPrice
              ? [{ type: "text", text: `原價 ${money(o.originalPrice)}`, size: "xs", color: "#AAAAAA", decoration: "line-through" }]
              : []),
            { type: "text", text: money(o.totalPrice), weight: "bold", size: "lg", color: "#E8792B" },
          ],
        },
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#E8792B",
              action: {
                type: "postback",
                label: "選這間",
                data: `action=pick_room&room=${o.roomTypeId}&ci=${checkIn}&co=${checkOut}${o.packageId ? `&pkg=${o.packageId}` : ""}`,
                displayText: `我選 ${o.name}`,
              },
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: {
                type: "postback",
                label: "❤️",
                data: `action=fav&type=room&id=${o.roomTypeId}`,
                displayText: "收藏這間",
              },
            },
          ],
        },
      })),
    },
  };
}

export interface AddonProduct {
  id: string;
  name: string;
  type: string;
  price: number;
  cover_url: string | null;
  accommodation_id: string | null;
}

export function addonCarousel(products: AddonProduct[]): OutgoingMessage {
  return {
    type: "flex",
    altText: "加購推薦",
    contents: {
      type: "carousel",
      contents: products.map((p) => ({
        type: "bubble",
        size: "kilo",
        ...(p.cover_url
          ? { hero: { type: "image", url: p.cover_url, size: "full", aspectRatio: "20:13", aspectMode: "cover" } }
          : {}),
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            { type: "text", text: addonTypeLabel(p.type), size: "xs", color: "#999999" },
            { type: "text", text: p.name, weight: "bold", wrap: true },
            { type: "text", text: addonPriceText(p.price), weight: "bold", color: "#E8792B" },
          ],
        },
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#E8792B",
              action: {
                type: "postback",
                label: "加入",
                data: `action=add_product&id=${p.id}`,
                displayText: `加購 ${p.name}`,
              },
            },
            {
              type: "button",
              style: "secondary",
              height: "sm",
              action: { type: "postback", label: "❤️", data: `action=fav&type=product&id=${p.id}` },
            },
          ],
        },
      })),
    },
  };
}

/** 館別加購卡（addon_settings） */
export function venueAddonCarousel(addons: VenueAddon[]): OutgoingMessage {
  return {
    type: "flex",
    altText: "加購推薦",
    contents: {
      type: "carousel",
      contents: addons.map((a) => ({
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            { type: "text", text: a.name, weight: "bold", wrap: true },
            {
              type: "text",
              text: `${addonPriceText(a.pricePerUnit)} / ${a.unitLabel}${a.pricingMode === "per_night" ? "・每晚" : ""}`,
              size: "sm",
              color: "#E8792B",
              wrap: true,
            },
          ],
        },
        footer: {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#E8792B",
              action: {
                type: "postback",
                label: "加入",
                data: `action=add_venue_addon&type=${encodeURIComponent(a.addonType)}`,
                displayText: `加購 ${a.name}`,
              },
            },
          ],
        },
      })),
    },
  };
}


/** 單一價格來源：住宿用 stayTotal（整段實價）；館別加購依 pricing_mode；其餘單價×數量 */
export function cartLineTotal(i: ButlerCartItem): number {
  if (i.kind === "stay") {
    const stayTotal = Number(i.stayTotal ?? 0) ||
      Math.round(i.unitPrice * Math.max(1, i.nights));
    return stayTotal * Math.max(1, i.qty);
  }
  if (i.kind === "venue_addon") {
    const mult = i.pricingMode === "per_night" ? Math.max(1, i.nights) : 1;
    return i.unitPrice * i.qty * mult;
  }
  return i.unitPrice * i.qty;
}

export function cartSummary(items: ButlerCartItem[], liffUrl: string | null): OutgoingMessage {
  const lines = items.map((i) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      {
        type: "text",
        text: i.kind === "stay" ? `${i.accommodationName}・${i.roomName}` : i.name,
        size: "sm",
        wrap: true,
        flex: 5,
      },
      {
        type: "text",
        text: i.kind === "stay" ? money(cartLineTotal(i)) : addonPriceText(cartLineTotal(i)),
        size: "sm",
        align: "end",
        flex: 3,
      },
    ],
  }));
  const total = items.reduce((s, i) => s + cartLineTotal(i), 0);
  return {
    type: "flex",
    altText: "購物清單",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "🛒 你的購物清單", weight: "bold", size: "md" },
          ...(lines.length ? lines : [{ type: "text", text: "目前是空的喔", size: "sm", color: "#999999" }]),
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              { type: "text", text: "合計", weight: "bold", size: "sm" },
              { type: "text", text: money(total), weight: "bold", size: "sm", align: "end", color: "#E8792B" },
            ],
          },
        ],
      },
      footer: liffUrl
        ? {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#E8792B",
                action: { type: "uri", label: "前往結帳", uri: liffUrl },
              },
            ],
          }
        : undefined,
    },
  };
}

export function liffCheckoutUrl(lineUserId: string): string | null {
  const liffId = Deno.env.get("LIFF_ID");
  if (!liffId) return null;
  return `https://liff.line.me/${liffId}?page=checkout&u=${encodeURIComponent(lineUserId)}`;
}

export function liffFavoritesUrl(lineUserId: string): string | null {
  const liffId = Deno.env.get("LIFF_ID");
  if (!liffId) return null;
  return `https://liff.line.me/${liffId}?page=favorites&u=${encodeURIComponent(lineUserId)}`;
}

/* ---------------- Main event handling ---------------- */

/** 立即回覆的訊息 + 需要較久處理、稍後 push 的延遲訊息 */
interface ButlerReply {
  messages: OutgoingMessage[];
  deferred?: () => Promise<OutgoingMessage[]>;
}

// deno-lint-ignore no-explicit-any
export async function handleButlerEvent(sb: SupabaseClient, accessToken: string | null, ev: any): Promise<OutgoingMessage[]> {
  const lineUserId: string | undefined = ev?.source?.userId;
  if (!lineUserId) return [];
  const session = await loadSession(sb, lineUserId);
  const state: ButlerState = (session.state as ButlerState) || {};
  const today = taipeiToday();
  let reply: ButlerReply = { messages: [] };

  if (ev.type === "follow") {
    reply = { messages: welcomeMessages() };
    await saveSession(sb, lineUserId, state, "greeting");
  } else if (ev.type === "postback") {
    const data = String(ev.postback?.data || "");
    const scenario = new URLSearchParams(data).get("scenario");
    if (new URLSearchParams(data).get("action") === "trip" && scenario) {
      reply = tripReply(sb, lineUserId, state, scenario as TripScenario);
    } else {
      reply = { messages: await handlePostback(sb, lineUserId, state, data, session.member_user_id ?? null) };
    }
  } else if (ev.type === "message" && ev.message?.type === "text") {
    reply = await handleText(sb, lineUserId, state, String(ev.message.text || ""), today, session.member_user_id ?? null);
  }

  if (accessToken && reply.messages.length > 0) {
    if (ev.replyToken) await lineReply(accessToken, ev.replyToken, reply.messages);
    else await linePush(accessToken, lineUserId, reply.messages);
  }

  let all = reply.messages;
  if (reply.deferred) {
    // 先回覆佔位訊息，正式回覆改走 push（整段 pipeline 由 webhook await 完成，不用 fire-and-forget）
    let later: OutgoingMessage[] = [];
    try {
      later = await reply.deferred();
    } catch (e) {
      console.error("[butler] deferred failed", e);
      await logLineConversation(sb, {
        lineUserId,
        userText: `[deferred:${ev?.type}]`,
        assistantText: `error: ${String(e)}`,
        promptVersion: null,
      });
      later = [textMsg("排行程時出了點狀況，請再試一次 🙏")];
    }
    if (later.length > 0) {
      if (accessToken) await linePush(accessToken, lineUserId, later);
      all = [...all, ...later];
    }
  }
  return all;
}

/** 行程推薦：先回「小安規劃中…」再 push 完整卡片 */
function tripReply(
  sb: SupabaseClient,
  lineUserId: string,
  state: ButlerState,
  scenario: TripScenario,
  attrs: TripAttributes = {},
): ButlerReply {
  return {
    messages: [textMsg(`好的！我用「${SCENARIO_LABEL[scenario]}」的調性排行程，請稍等 🧸✨`)],
    deferred: async () => {
      const merged: TripAttributes = { ...(state.tripAttributes || {}), ...attrs };
      try {
        await archiveTripAttributes(sb, lineUserId, merged);
      } catch (e) {
        console.error("[butler-trip] archive failed", e);
      }
      try {
        const trip = await recommendTrip(scenario, merged);
        if (!trip) throw new Error("trip-recommend returned null");
        const tripId = await saveTripSnapshot(sb, lineUserId, scenario, merged, trip);
        void writeMetric(sb, {
          event_type: "trip_rec_shown",
          ref_type: "trip",
          ref_id: tripId,
          channel: "line",
          line_user_id: lineUserId,
          metadata: { scenario },
        });
        return [tripFlex(scenario, trip, tripId)];
      } catch (e) {
        console.error("[butler-trip] plan failed", scenario, e);
        await logLineConversation(sb, {
          lineUserId,
          userText: `[trip:${scenario}]`,
          assistantText: `error: ${String(e)}`,
          promptVersion: null,
        });
        return [textMsg("排行程時出了點狀況，請再試一次 🙏")];
      }
    },
  };
}

async function handleText(
  sb: SupabaseClient,
  lineUserId: string,
  state: ButlerState,
  text: string,
  today: string,
  memberUserId: string | null,
): Promise<ButlerReply> {
  const parsed: ParsedIntent = parseIntent(text, today);
  const mergedAttrs: TripAttributes = { ...(state.tripAttributes || {}), ...(parsed.tripAttributes || {}) };
  const next: ButlerState = {
    ...state,
    intent: parsed.intent,
    checkIn: parsed.checkIn ?? state.checkIn,
    checkOut: parsed.checkOut ?? state.checkOut,
    guests: parsed.guests ?? state.guests,
    adults: parsed.adults ?? state.adults,
    children: parsed.children ?? state.children,
    keyword: parsed.keyword ?? state.keyword,
    venue: parsed.venue ?? state.venue,
    venueLabel: parsed.venueLabel ?? state.venueLabel,
    scenario: parsed.scenario ?? state.scenario,
    tripAttributes: mergedAttrs,
  };

  let messages: OutgoingMessage[] = [];

  if (parsed.intent === "favorites") {
    messages = await favoriteListMessages(sb, lineUserId, memberUserId);
  } else if (parsed.intent === "checkout") {
    const items = next.cart || [];
    messages = items.length
      ? [textMsg("幫你整理好囉，確認後就能結帳 💳"), cartSummary(items, liffCheckoutUrl(lineUserId))]
      : [textMsg("購物車還是空的耶 😅 先跟我說日期跟人數，我幫你找房！")];
  } else if (parsed.intent === "addon") {
    const stay = (next.cart || []).find((i) => i.kind === "stay") as ButlerCartStay | undefined;
    const accId = stay?.accommodationId ?? null;
    const venueAddons = await fetchVenueAddons(sb, accId, next.keyword);
    if (venueAddons.length) {
      for (const a of venueAddons) {
        void writeMetric(sb, { event_type: "addon_rec_shown", ref_type: "addon_setting", ref_id: a.addonType, accommodation_id: accId, channel: "line", line_user_id: lineUserId });
      }
      messages = [textMsg("這些是這間可加購的項目 🎁 想要哪個？"), venueAddonCarousel(venueAddons)];
    } else {
      // 次要來源：使用者明確提到票券/行程/體驗才查 trip_products（限該館）
      const wantsTicket = /票券|門票|行程|體驗|景點/.test(next.keyword ?? "");
      const products = wantsTicket ? await fetchAddons(sb, { accommodationId: accId, keyword: next.keyword }) : [];
      if (products.length) {
        trackAddonShown(sb, lineUserId, products);
        messages = [textMsg("這些是推薦的加購 🎁 想要哪個？"), addonCarousel(products)];
      } else {
        messages = [textMsg("這間目前沒有可加購的項目耶 🙈")];
      }
    }
  } else if (parsed.intent === "search_rooms") {
    if (!next.checkIn || !next.checkOut) {
      messages = [textMsg("好的 😊 想住哪幾天呢？（例如：8/20 住 2 晚、4 人）")];
    } else if (!next.guests) {
      messages = [textMsg("好的！請問總共幾位入住呢？😊 有兒童的話也告訴我（例如：2 大 1 小），我才能幫你推薦合適的房型。")];
    } else {
      const nights = Math.max(
        1,
        Math.round(
          (new Date(`${next.checkOut}T00:00:00Z`).getTime() -
            new Date(`${next.checkIn}T00:00:00Z`).getTime()) / 86400000,
        ),
      );
      const result = await findRoomsDetailed(sb, {
        checkIn: next.checkIn,
        checkOut: next.checkOut,
        guests: next.guests,
        keyword: next.keyword,
        venue: next.venue,
      });
      const scope = result.venueResolved && result.venueLabel ? `${result.venueLabel} ` : "";
      if (result.offers.length > 0) {
        const guestNote = next.guests ? `（${next.guests} 人適合的優先）` : "";
        messages = [
          textMsg(`${scope}找到 ${result.offers.length} 間有空的房型 ✨ 幫你按價格排好了${guestNote}`),
          roomCarousel(result.offers, next.checkIn, next.checkOut, nights),
        ];
      } else if (result.venueResolved && result.venueLabel) {
        messages = [
          textMsg(`${result.venueLabel} ${next.checkIn}–${next.checkOut} 目前沒有可訂房型 😢`),
        ];
        if (result.alternatives.length > 0) {
          messages.push(textMsg("這幾間同期間還有空房，要不要看看？"));
          messages.push(roomCarousel(result.alternatives, next.checkIn, next.checkOut, nights));
        } else {
          messages.push(textMsg("換個日期我再幫你找找！"));
        }
      } else {
        messages = [textMsg("這幾天剛好都被訂滿了 😢 換個日期或人數，我再幫你找找！")];
      }
    }
  } else if (parsed.intent === "trip_plan") {
    await saveSession(sb, lineUserId, next, parsed.intent);
    if (next.scenario) {
      return tripReply(sb, lineUserId, next, next.scenario, mergedAttrs);
    }
    return { messages: [scenarioQuickReply()] };
  } else if (parsed.intent === "greeting") {
    messages = welcomeMessages();
  } else {
    // Fallback：交給 LLM（沿用網頁版 prompt／知識庫／範例／樣板）
    await saveSession(sb, lineUserId, next, parsed.intent);
    return {
      messages: [textMsg("小安想一下下… 🧸")],
      deferred: async () => {
        const answer = await askLlm(sb, { text });
        await logLineConversation(sb, {
          lineUserId,
          userText: text,
          assistantText: answer.text,
          promptVersion: answer.promptVersion,
        });
        return [textMsg(answer.text), quickMenu()];
      },
    };
  }

  await saveSession(sb, lineUserId, next, parsed.intent);
  return { messages };
}

async function fetchAddons(
  sb: SupabaseClient,
  opts?: { accommodationId?: string | null; keyword?: string | null },
): Promise<AddonProduct[]> {
  const accId = opts?.accommodationId ?? null;
  const kw = opts?.keyword ?? "";
  let q = sb
    .from("trip_products")
    .select("id, name, type, price, cover_url, accommodation_id, is_active")
    .eq("is_active", true);
  // 綁定當前館別：只列該館專屬商品，查無就照實說沒有（不拿別館/其他區域湊數）
  if (accId) q = q.eq("accommodation_id", accId);
  const { data } = await q.limit(24);
  const all: AddonProduct[] = (data || []).map((p) => ({
    id: p.id,
    name: localizedName(p.name),
    type: p.type ?? "加購",
    price: Number(p.price ?? 0),
    cover_url: p.cover_url ?? null,
    accommodation_id: p.accommodation_id ?? null,
  }));
  // 關鍵字對應：有命中就優先列出，沒命中才列熱門
  const syn = ADDON_SYNONYMS.find((s) => s.match.test(kw));
  const matched = syn
    ? all.filter((p) => {
        const hay = `${p.name} ${p.type}`.toLowerCase();
        return syn.terms.some((t) => hay.includes(t));
      })
    : [];
  return (matched.length ? matched : all).slice(0, 8);
}

/** 加購意圖關鍵字 → 比對品名/分類的詞 */
const ADDON_SYNONYMS: { match: RegExp; terms: string[] }[] = [
  { match: /早餐|晚餐|餐券|餐食|吃/, terms: ["餐", "早餐", "晚餐", "buffet", "breakfast", "dinner", "food"] },
  { match: /烤肉|BBQ|燒烤|炭烤/i, terms: ["烤肉", "bbq", "燒烤", "炭烤"] },
  { match: /下午茶/, terms: ["下午茶", "afternoon", "tea"] },
  { match: /門票|票券|票/, terms: ["門票", "票", "ticket"] },
  { match: /體驗|手作|diy/i, terms: ["體驗", "手作", "diy", "experience"] },
  { match: /接送|導覽/, terms: ["接送", "導覽", "shuttle", "guide"] },
];

/** 加購卡曝光埋點：每個品項記一次 addon_rec_shown（channel=line） */
function trackAddonShown(sb: SupabaseClient, lineUserId: string, products: AddonProduct[]) {
  for (const p of products) {
    void writeMetric(sb, {
      event_type: "addon_rec_shown",
      ref_type: "trip_product",
      ref_id: p.id,
      accommodation_id: p.accommodation_id,
      channel: "line",
      line_user_id: lineUserId,
    });
  }
}

async function favoriteListMessages(
  sb: SupabaseClient,
  lineUserId: string,
  memberUserId: string | null,
): Promise<OutgoingMessage[]> {
  let q = sb
    .from("trip_favorites")
    .select("id, ref_type, ref_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  q = memberUserId
    ? q.or(`user_id.eq.${memberUserId},line_user_id.eq.${lineUserId}`)
    : q.eq("line_user_id", lineUserId);
  const { data } = await q;
  const favs = data || [];
  if (favs.length === 0) {
    return [textMsg("你還沒有收藏喔 ❤️ 看到喜歡的房型或行程按下愛心，我幫你記起來！")];
  }

  const tripFavs = favs.filter((f) => f.ref_type === "trip").slice(0, 10);
  const otherCount = favs.length - tripFavs.length;
  const msgs: OutgoingMessage[] = [];

  if (tripFavs.length > 0) {
    const { data: gens } = await sb
      .from("trip_generations")
      .select("id, scenario, payload")
      .in("id", tripFavs.map((f) => f.ref_id));
    const genMap = new Map((gens || []).map((g) => [g.id, g]));
    const bubbles = tripFavs
      .map((f) => {
        const g = genMap.get(f.ref_id);
        if (!g) return null;
        // 複用官網/LINE 既有行程卡樣式，取其 bubble 組成 carousel
        // deno-lint-ignore no-explicit-any
        return (tripFlex((g.scenario as TripScenario) || "friends", g.payload, g.id) as any).contents;
      })
      .filter(Boolean);
    if (bubbles.length > 0) {
      msgs.push(textMsg("你收藏的行程 ❤️"));
      msgs.push({ type: "flex", altText: "我的收藏行程", contents: { type: "carousel", contents: bubbles } });
    }
  }

  const url = liffFavoritesUrl(lineUserId);
  if (otherCount > 0 && url) {
    msgs.push({
      type: "template",
      altText: "管理收藏",
      template: {
        type: "buttons",
        text: `另外還有 ${otherCount} 項房型／加購收藏`,
        actions: [{ type: "uri", label: "打開收藏清單", uri: url }],
      },
    });
  }

  if (msgs.length === 0) {
    // 只有房型/商品收藏、無法以行程卡呈現時，提供 LIFF 清單
    return url
      ? [{
          type: "template",
          altText: "管理收藏",
          template: { type: "buttons", text: "你的收藏 ❤️", actions: [{ type: "uri", label: "打開收藏清單", uri: url }] },
        }]
      : [textMsg("你的收藏都在 LIFF 清單裡 ❤️")];
  }
  return msgs.slice(0, 5);
}

async function handlePostback(
  sb: SupabaseClient,
  lineUserId: string,
  state: ButlerState,
  data: string,
  memberUserId: string | null,
): Promise<OutgoingMessage[]> {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const next: ButlerState = { ...state, cart: state.cart ? [...state.cart] : [] };

  if (action === "fav") {
    const refType = params.get("type") || "room";
    const refId = params.get("id");
    if (!refId) return [textMsg("收藏失敗了 😅 再試一次好嗎？")];
    // 未綁定會員 → 引導綁定，不默默存
    if (!memberUserId) {
      const url = liffFavoritesUrl(lineUserId);
      const msgs: OutgoingMessage[] = [
        textMsg("要收藏得先綁定會員喔 😊 綁定後收藏會跟官網「我的行程」同步！"),
      ];
      if (url) {
        msgs.push({
          type: "template",
          altText: "綁定會員",
          template: { type: "buttons", text: "點下方綁定會員，再回來收藏 ❤️", actions: [{ type: "uri", label: "綁定會員", uri: url }] },
        });
      }
      return msgs;
    }
    const meta = await favoriteMeta(sb, refType, refId);
    // 以會員 user_id 寫入（與官網同一份）；冪等：先查再寫
    const { data: existingFav } = await sb
      .from("trip_favorites")
      .select("id")
      .eq("user_id", memberUserId)
      .eq("ref_type", refType)
      .eq("ref_id", refId)
      .maybeSingle();
    if (!existingFav) {
      const { error: favErr } = await sb
        .from("trip_favorites")
        .insert({ user_id: memberUserId, ref_type: refType, ref_id: refId, meta });
      if (favErr) {
        console.error("[butler] favorite insert failed", favErr);
        return [textMsg("收藏沒存成功耶 😢 等等再試一次好嗎？")];
      }
    }
    void writeMetric(sb, {
      event_type: "trip_favorite",
      ref_type: refType,
      ref_id: refId,
      // deno-lint-ignore no-explicit-any
      accommodation_id: (meta as any)?.accommodation_id ?? null,
      channel: "line",
      line_user_id: lineUserId,
    });
    return [textMsg("已收藏 ❤️ 隨時說「我的收藏」就能看到！")];
  }

  if (action === "pick_room") {
    const roomTypeId = params.get("room");
    const checkIn = params.get("ci") || state.checkIn;
    const checkOut = params.get("co") || state.checkOut;
    if (!roomTypeId || !checkIn || !checkOut) return [textMsg("資訊不齊全，再跟我說一次日期好嗎？😊")];
    const offers = await findRooms(sb, { checkIn, checkOut, limit: 50 });
    const picked = offers.find((o) => o.roomTypeId === roomTypeId);
    if (!picked) return [textMsg("這間剛剛被訂走了 😢 我再幫你找其他的！")];
    const nights = Math.max(
      1,
      Math.round(
        (new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86400000,
      ),
    );
    next.cart = [
      ...(next.cart || []).filter((i) => i.kind !== "stay"),
      {
        kind: "stay",
        roomTypeId: picked.roomTypeId,
        accommodationId: picked.accommodationId,
        roomName: picked.name,
        accommodationName: picked.accommodationName,
        checkIn,
        checkOut,
        nights,
        unitPrice: Math.round(picked.totalPrice / nights),
        stayTotal: picked.totalPrice,
        qty: 1,
        coverUrl: picked.coverUrl,
        packageId: picked.packageId ?? null,
      },
    ];
    next.checkIn = checkIn;
    next.checkOut = checkOut;
    await saveSession(sb, lineUserId, next, "pick_room");
    const venueAddons = await fetchVenueAddons(sb, picked.accommodationId);
    const msgs: OutgoingMessage[] = [textMsg(`收到！${picked.name} 已放進購物車 🛒`)];
    if (venueAddons.length) {
      for (const a of venueAddons) {
        void writeMetric(sb, { event_type: "addon_rec_shown", ref_type: "addon_setting", ref_id: a.addonType, accommodation_id: picked.accommodationId, channel: "line", line_user_id: lineUserId });
      }
      msgs.push(textMsg("要不要順便加購？🎁"), venueAddonCarousel(venueAddons));
    }
    msgs.push(cartSummary(next.cart, liffCheckoutUrl(lineUserId)));
    return msgs;
  }

  if (action === "add_venue_addon") {
    const addonType = decodeURIComponent(params.get("type") || "");
    if (!addonType) return [textMsg("加購失敗了 😅")];
    const stay = (next.cart || []).find((i) => i.kind === "stay") as ButlerCartStay | undefined;
    const accId = stay?.accommodationId;
    if (!accId) return [textMsg("先幫你選好房間，再加購會更準喔 😊")];
    const list = await fetchVenueAddons(sb, accId);
    const a = list.find((x) => x.addonType === addonType);
    if (!a) return [textMsg("這個加購目前無法選購 🙈")];
    const nights = Math.max(1, stay?.nights ?? 1);
    const existing = (next.cart || []).find((i) => i.kind === "venue_addon" && i.addonType === addonType) as
      | ButlerCartVenueAddon
      | undefined;
    if (existing) existing.qty = Math.min(a.maxQty || 99, existing.qty + 1);
    else
      next.cart!.push({
        kind: "venue_addon",
        addonType: a.addonType,
        name: a.name,
        unitPrice: a.pricePerUnit,
        unitLabel: a.unitLabel,
        qty: Math.max(1, a.minQty),
        pricingMode: a.pricingMode,
        nights,
      });
    await saveSession(sb, lineUserId, next, "add_venue_addon");
    return [textMsg(`已加入 ${a.name} 🛒`), cartSummary(next.cart, liffCheckoutUrl(lineUserId))];
  }

  if (action === "add_product") {
    const id = params.get("id");
    if (!id) return [textMsg("加購失敗了 😅")];
    const { data: p } = await sb
      .from("trip_products")
      .select("id, name, type, price, cover_url")
      .eq("id", id)
      .maybeSingle();
    if (!p) return [textMsg("這個品項目前無法加購 🙈")];
    const name = localizedName(p.name);
    const existing = (next.cart || []).find((i) => i.kind === "product" && i.productId === id) as
      | ButlerCartProduct
      | undefined;
    if (existing) existing.qty += 1;
    else
      next.cart!.push({
        kind: "product",
        productId: p.id,
        name,
        type: addonTypeLabel(p.type),
        unitPrice: Number(p.price ?? 0),
        qty: 1,
        coverUrl: p.cover_url ?? null,
      });
    await saveSession(sb, lineUserId, next, "addon");
    return [textMsg(`已加入「${name}」🎁`), cartSummary(next.cart!, liffCheckoutUrl(lineUserId))];
  }

  if (action === "favorites") return await favoriteListMessages(sb, lineUserId);

  return [textMsg("我沒聽懂這個動作 😅 再點一次好嗎？")];
}

async function favoriteMeta(sb: SupabaseClient, refType: string, refId: string) {
  if (refType === "room") {
    const { data } = await sb.from("room_types").select("name, accommodation_id").eq("id", refId).maybeSingle();
    return { name: data?.name ?? "房型", accommodation_id: data?.accommodation_id ?? null };
  }
  if (refType === "product") {
    const { data } = await sb.from("trip_products").select("name, price").eq("id", refId).maybeSingle();
    return { name: localizedName(data?.name), price: data?.price ?? 0 };
  }
  if (refType === "trip") {
    const { data } = await sb.from("trip_generations").select("scenario, payload").eq("id", refId).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const title = (data?.payload as any)?.title;
    return { name: typeof title === "string" ? title : (localizedName(title, "我的行程")), scenario: data?.scenario ?? null };
  }
  return {};
}
