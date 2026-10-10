// 館別比對（LINE 管家與電腦版小安共用）：名單一律即時取自 DB（is_active && show_on_portal≠false）。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface ActiveVenue {
  id: string;
  name: string | null;
  short_name: string | null;
  region_1: string | null;
  region_2: string | null;
}

/** 補充別名（錯字／英文），以 accommodation_id 為 key；館名、short_name、詞幹已自動涵蓋者不需列入 */
const EXTRA_ALIASES: Record<string, string[]> = {
  "6b6ac0dc-602b-4dec-9167-7791ac412ba3": ["哈庫納", "hakuna"], // 哈庫納馬塔塔
  "8e3e8866-3cb0-4654-91f3-d9b09a543301": ["松湘卉館", "松湘"], // 淞湘卉館
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8": ["奧莉薇", "olivia"], // 奧莉薇雅生活小酒店
};

/** 館名常見後綴詞，去掉後取詞幹（櫻家小築→櫻家、雲岫海景渡假會館→雲岫） */
const NAME_SUFFIXES = [
  "生活小酒店", "渡假會館", "度假會館", "渡假村", "度假村", "海景", "小酒店", "小築", "民宿", "會館", "卉館", "寫照", "旅店", "villa",
];

/** 去 emoji／空白並轉小寫（short_name 可能含「🌸 櫻家小築」） */
export function normalizeVenueText(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F\u20E3]/gu, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function stem(name: string): string {
  let s = name;
  for (let changed = true; changed;) {
    changed = false;
    for (const suf of NAME_SUFFIXES) {
      if (s.length > suf.length && s.endsWith(suf)) {
        s = s.slice(0, -suf.length);
        changed = true;
      }
    }
  }
  return s;
}

function venueAliases(v: ActiveVenue): string[] {
  const out = new Set<string>();
  for (const raw of [v.name, v.short_name]) {
    const n = normalizeVenueText(raw);
    if (n.length >= 2) out.add(n);
    const st = stem(n);
    if (st.length >= 2) out.add(st);
  }
  for (const a of EXTRA_ALIASES[v.id] ?? []) out.add(normalizeVenueText(a));
  return [...out];
}

export interface VenueDirectory {
  /** 可查房：is_active && show_on_portal≠false */
  active: ActiveVenue[];
  /** 隱藏／停用館：僅供辨識館名後婉拒，不可查房 */
  hidden: ActiveVenue[];
}

let cache: { t: number; dir: VenueDirectory } | null = null;

/** 館別名單（函式內快取 60 秒） */
export async function loadVenueDirectory(sb: SupabaseClient): Promise<VenueDirectory> {
  if (cache && Date.now() - cache.t < 60_000) return cache.dir;
  const { data } = await sb
    .from("accommodation_info")
    .select("id, name, short_name, region_1, region_2, is_active, show_on_portal");
  const dir: VenueDirectory = { active: [], hidden: [] };
  // deno-lint-ignore no-explicit-any
  for (const a of (data || []) as any[]) {
    (a.is_active === true && a.show_on_portal !== false ? dir.active : dir.hidden).push(a as ActiveVenue);
  }
  cache = { t: Date.now(), dir };
  return dir;
}

/** 上架館名單（查房範圍與入口顯示綁定） */
export async function loadActiveVenues(sb: SupabaseClient): Promise<ActiveVenue[]> {
  return (await loadVenueDirectory(sb)).active;
}

/** 文字是否指向隱藏／停用館（與上架館一起比最長命中，命中隱藏館才回傳） */
export function matchHiddenVenue(text: string, dir: VenueDirectory): { id: string; name: string } | undefined {
  const hit = matchVenue(text, [...dir.active, ...dir.hidden]);
  return hit && dir.hidden.some((h) => h.id === hit.id) ? hit : undefined;
}

export const HIDDEN_VENUE_REPLY = (name: string) =>
  `不好意思，目前無法透過線上客服預訂「${name}」🙏 如需協助請直接聯繫館方；也可以告訴我其他想住的館別或地區，我再幫你找！`;

/** 從文字找出指定館別（取最長命中別名） */
export function matchVenue(text: string, venues: ActiveVenue[]): { id: string; name: string } | undefined {
  const t = normalizeVenueText(text);
  if (!t) return undefined;
  let best: { v: ActiveVenue; len: number } | undefined;
  for (const v of venues) {
    for (const a of venueAliases(v)) {
      if (a && t.includes(a) && (!best || a.length > best.len)) best = { v, len: a.length };
    }
  }
  return best ? { id: best.v.id, name: (best.v.name ?? "").trim() } : undefined;
}
