/**
 * 館別簡稱對照 — 供小安（LINE 管家）把「森山」「雲岫」等口語簡稱對應到 accommodation。
 * canonical 為 accommodation_info.name 的關鍵子字串（用 includes 比對）。
 */
export interface VenueAlias {
  canonical: string;
  label: string;
  aliases: string[];
}

export const VENUE_ALIASES: VenueAlias[] = [
  { canonical: "森山", label: "森山寫照", aliases: ["森山寫照", "森山"] },
  { canonical: "雲岫", label: "雲岫海景渡假會館", aliases: ["雲岫海景渡假會館", "雲岫海景", "雲岫"] },
  { canonical: "哈庫納", label: "哈庫納馬塔塔", aliases: ["哈庫納馬塔塔", "哈庫納", "hakuna"] },
  { canonical: "淞湘", label: "淞湘卉館", aliases: ["淞湘卉館", "淞湘", "松湘卉館", "松湘"] },
  { canonical: "天送", label: "天送", aliases: ["天送埤", "天送"] },
  { canonical: "奧莉薇雅", label: "奧莉薇雅生活小酒店", aliases: ["奧莉薇雅生活小酒店", "奧莉薇雅", "奧莉薇", "olivia"] },
  { canonical: "旅行日", label: "旅行日", aliases: ["旅行日"] },
];

/** 從文字中找出指定館別（取最長的命中別名，避免「森山」蓋過「森山寫照」） */
export function matchVenueAlias(text: string): VenueAlias | undefined {
  const t = (text || "").toLowerCase();
  let best: { alias: VenueAlias; len: number } | undefined;
  for (const v of VENUE_ALIASES) {
    for (const a of v.aliases) {
      if (t.includes(a.toLowerCase()) && (!best || a.length > best.len)) {
        best = { alias: v, len: a.length };
      }
    }
  }
  return best?.alias;
}

/** 判斷某個 accommodation 名稱是否屬於該館別 */
export function accommodationMatchesVenue(name: string | null | undefined, venue: VenueAlias): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes(venue.canonical.toLowerCase())) return true;
  return venue.aliases.some((a) => a.length >= 2 && n.includes(a.toLowerCase()));
}
