// Fin 知識庫匯出：純函式（組 Markdown），不碰 IO，供單元測試。
import { BOOKING_BASE_URL } from "../fin-availability/core.ts";

type Row = Record<string, any>;

export interface AccommodationBundle {
  acc: Row;
  settings: Row | null; // booking_settings：只取入退房時間與對客政策欄位
  roomTypes: Row[];
  facilities: Row[]; // accommodation_facilities（room_scope whole/single）
  amenities: Row[]; // room_amenities（舊資料 fallback）
  packages: Row[];
  faqs: Row[];
  knowledge: Row[];
}

export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  room: "房型", facility: "設施", policy: "政策", location: "交通與位置", faq: "常見問答", other: "其他",
};
const TIER_LABELS: Record<string, string> = { weekday: "平日（週一至週四）", friday_sunday: "週五、週日", weekend: "週六、國定假日" };
const INCLUDE_LABELS: Record<string, string> = { yes: "含", optional: "可加購", no: "不含" };

export const FOOTER_LINE = "如需查即時房況與價格，請使用查房況工具（fin-availability）";

/** 台灣日期 YYYY-MM-DD */
export function taipeiDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** 後台富文字欄位存成 HTML（<p>、<br>…）→ 轉成段落純文字；&lt; &gt; 保留為實體，避免變成原始 HTML */
export function htmlToText(text: string): string {
  if (!/<\/?[a-z][^>]*>/i.test(text)) return text;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 內文行首的 # 會被當成標題、打亂層級 → 跳脫 */
export function escapeBlock(text: unknown): string {
  return htmlToText(str(text).replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\r\n?/g, "\n"))
    .replace(/^(\s{0,3})(#{1,6})(?=\s|$)/gm, "$1\\$2");
}
const inline = (text: unknown) => escapeBlock(text).replace(/\s*\n+\s*/g, " ");

/** 內容為空就不輸出標題 */
function section(heading: string, body: string): string {
  return body.trim() ? `${heading}\n\n${body.trim()}\n` : "";
}
const join = (parts: string[]) => parts.filter((p) => p.trim()).join("\n");
const money = (n: unknown) => (n == null || n === "" || isNaN(Number(n)) ? null : `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`);
const time = (t: unknown) => str(t).replace(/^(\d{1,2}:\d{2}):\d{2}$/, "$1");

export function bookingPageUrl(acc: Row): string {
  return acc.short_url_alias ? `${BOOKING_BASE_URL}/${encodeURIComponent(acc.short_url_alias)}` : `${BOOKING_BASE_URL}/booking/villa/${acc.id}`;
}

/** 與前台 roomScopeFacilities 相同：包棟房型取 whole、其餘取 single；無 scoped 資料才用 room_amenities */
export function roomFacilities(b: Pick<AccommodationBundle, "acc" | "roomTypes" | "facilities" | "amenities">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const showWhole = b.acc.show_room_facilities_whole !== false;
  const showSingle = b.acc.show_room_facilities_single !== false;
  if (!showWhole && !showSingle) return out;
  const byScope: Record<string, string[]> = { whole: [], single: [] };
  for (const f of b.facilities) {
    if (f.is_available === false || !byScope[f.room_scope]) continue;
    byScope[f.room_scope].push(str(f.facility_name));
  }
  if (!showWhole) byScope.whole = [];
  if (!showSingle) byScope.single = [];
  if (byScope.whole.length || byScope.single.length) {
    for (const rt of b.roomTypes) {
      const scope = rt.is_exclusive_package ? "whole" : "single";
      if (!(scope === "whole" ? showWhole : showSingle)) continue;
      out.set(rt.id, byScope[scope].length ? byScope[scope] : [...byScope.single, ...byScope.whole]);
    }
    return out;
  }
  for (const a of b.amenities) {
    if (!a.room_type_id) continue;
    out.set(a.room_type_id, [...(out.get(a.room_type_id) || []), str(a.amenity_name)]);
  }
  return out;
}

function renderRoomType(rt: Row, facilities: string[] | undefined): string {
  const lines: string[] = [];
  if (rt.capacity) lines.push(`- 容納人數：${rt.capacity} 人`);
  if (rt.size_sqm) lines.push(`- 坪數：約 ${Math.round((Number(rt.size_sqm) / 3.3058) * 10) / 10} 坪（${rt.size_sqm} 平方公尺）`);
  const fac = (facilities || []).filter(Boolean);
  if (fac.length) lines.push(`- 設施：${fac.map(inline).join("、")}`);
  const desc = escapeBlock(rt.description);
  return `#### ${inline(rt.name)}\n\n${join([lines.join("\n"), desc ? `\n${desc}` : ""])}\n`;
}

function guestRange(p: Row): string {
  if (str(p.guest_count_label)) return inline(p.guest_count_label);
  const min = Number(p.guest_count);
  const max = p.guest_count_max != null ? Number(p.guest_count_max) : null;
  return max && max > min ? `${min}–${max} 人` : `${min} 人`;
}

function priceLine(original: unknown, sale: unknown): string | null {
  const s = money(sale);
  if (!s) return null;
  const o = money(original);
  return o && Number(original) > Number(sale) ? `原價 ${o}／售價 ${s}` : `售價 ${s}`;
}

function renderPackage(p: Row): string {
  const lines: string[] = [];
  if (str(p.subtitle)) lines.push(`- 說明：${inline(p.subtitle)}`);
  lines.push(`- 適用人數：${guestRange(p)}`);
  const tiers: string[] = Array.isArray(p.applicable_tiers) ? p.applicable_tiers.filter((t: string) => TIER_LABELS[t]) : [];
  if (tiers.length) lines.push(`- 適用日期：${tiers.map((t) => TIER_LABELS[t]).join("、")}`);
  const base = priceLine(p.original_price, p.sale_price);
  const overrides = p.tier_prices && typeof p.tier_prices === "object" ? p.tier_prices : {};
  const tierPrices = Object.keys(TIER_LABELS)
    .filter((t) => overrides[t] && overrides[t].sale != null && (!tiers.length || tiers.includes(t)))
    .map((t) => `  - ${TIER_LABELS[t]}：${priceLine(overrides[t].original, overrides[t].sale)}`);
  if (base) lines.push(`- 每晚價格：${base}${tierPrices.length ? "（下列日型另計）" : ""}`);
  lines.push(...tierPrices);
  if (str(p.room_allocation)) lines.push(`- 房間配置：${inline(p.room_allocation)}`);
  const includes = (Array.isArray(p.includes) ? p.includes : []).filter((i: Row) => str(i?.text));
  if (includes.length) {
    lines.push("- 方案內容：");
    for (const i of includes) {
      const tag = INCLUDE_LABELS[i.available] ?? "";
      lines.push(`  - ${tag ? `${tag}｜` : ""}${inline(i.text)}${str(i.price_note) ? `（${inline(i.price_note)}）` : ""}`);
    }
  }
  if (str(p.child_age_note)) lines.push(`- 兒童說明：${inline(p.child_age_note)}`);
  return `#### ${inline(p.name)}\n\n${lines.join("\n")}\n`;
}

function renderKnowledge(rows: Row[]): string {
  const groups = new Map<string, Row[]>();
  const sorted = [...rows].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
  for (const k of sorted) {
    if (!str(k.title) && !str(k.content)) continue;
    const cat = KNOWLEDGE_CATEGORY_LABELS[k.category] ? k.category : "other";
    groups.set(cat, [...(groups.get(cat) || []), k]);
  }
  return [...groups.entries()].map(([cat, items]) => {
    const body = items.map((k) => {
      const tags = (Array.isArray(k.tags) ? k.tags : []).map(str).filter(Boolean);
      return join([`#### ${inline(k.title) || KNOWLEDGE_CATEGORY_LABELS[cat]}\n`, escapeBlock(k.content), tags.length ? `\n標籤：${tags.map(inline).join("、")}` : ""]) + "\n";
    }).join("\n");
    return `### ${KNOWLEDGE_CATEGORY_LABELS[cat]}\n\n${body}`;
  }).join("\n");
}

export function renderAccommodationMarkdown(b: AccommodationBundle, date: string): string {
  const { acc, settings } = b;
  const info: string[] = [];
  const region = [acc.region_1, acc.region_2].map(str).filter(Boolean).join(" ");
  if (region) info.push(`- 地區：${inline(region)}`);
  if (str(acc.address)) info.push(`- 地址：${inline(acc.address)}`);
  if (str(acc.nearby_station)) info.push(`- 鄰近車站：${inline(acc.nearby_station)}`);
  if (settings && time(settings.check_in_time)) info.push(`- 入住時間：${time(settings.check_in_time)} 起`);
  if (settings && time(settings.check_out_time)) info.push(`- 退房時間：${time(settings.check_out_time)} 前`);
  if (str(acc.phone)) info.push(`- 電話：${inline(acc.phone)}`);
  if (str(acc.line_id)) info.push(`- LINE：${inline(acc.line_id)}`);
  if (str(acc.website_url)) info.push(`- 官網：${inline(acc.website_url)}`);
  info.push(`- 訂房網址：${bookingPageUrl(acc)}`);

  const fac = roomFacilities(b);
  const rooms = b.roomTypes.map((rt) => renderRoomType(rt, fac.get(rt.id))).join("\n");
  const packages = b.packages.map(renderPackage).join("\n");
  const plans = join([
    section("### 房型", rooms),
    packages ? section("### 入住方案", `實際價格依日期而定，以查房況工具為準。\n\n${packages}`) : "",
  ]);
  const faqs = b.faqs
    .filter((f) => str(f.question) && str(f.answer))
    .map((f) => `### Q：${inline(f.question)}\n\nA：${escapeBlock(f.answer)}\n`).join("\n");

  return join([
    `來源：人客多系統匯出 ${date}\n`,
    `# ${inline(acc.name)}\n`,
    `${info.join("\n")}\n`,
    section("## 民宿介紹", escapeBlock(acc.description)),
    section("## 入住須知", escapeBlock(acc.check_in_notice)),
    section("## 取消政策", escapeBlock(settings?.cancellation_policy)),
    section("## 寵物規定", escapeBlock(settings?.pet_policy)),
    section("## 其他注意事項", escapeBlock(settings?.other_notes)),
    section("## 房型與方案", plans),
    section("## 常見問題", faqs),
    section("## 知識庫", renderKnowledge(b.knowledge)),
    `---\n\n${FOOTER_LINE}\n`,
  ]);
}
