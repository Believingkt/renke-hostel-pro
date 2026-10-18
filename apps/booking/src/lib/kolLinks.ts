import { isContentPostUrl, normalizeIgHandle } from "./kolInviteValidation";

export type KolLinkPlatform = "instagram" | "tiktok" | "youtube" | "facebook" | "threads" | "other";

export const KOL_LINK_PLATFORM_LABEL: Record<KolLinkPlatform, string> = {
  instagram: "IG",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "FB",
  threads: "Threads",
  other: "網站",
};

// 主欄位挑選順序：IG 優先，沒有 IG 才用其他平台個人主頁
const PRIMARY_ORDER: KolLinkPlatform[] = ["instagram", "tiktok", "youtube", "facebook", "threads"];

const LABEL_RE =
  /(^|[\s,，、；;|｜/。.])(?:ig|instagram|fb|facebook|yt|youtube|tiktok|tik tok|抖音|threads|脆|網站|部落格|blog)\s*[:：]/gi;

const CJK = "\u3000-\u303f\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\uff01-\uff0f\uff1a-\uff20";
const STOP = `\\s，、；;「」<>"'。！？,|｜()（）${CJK}`;
// 「IG：帳號」這種沒貼網址、只寫帳號的寫法
const IG_LABEL_HANDLE_RE = /(?:^|[^a-z])(?:ig|instagram)\s*[:：]\s*@?([a-z0-9._]+)(?![a-z0-9._/:])/gi;
const URL_RE = new RegExp(
  `(?:https?:\\/\\/)?(?:www\\.|m\\.)?(?:[a-z0-9-]+\\.)*(?:instagram\\.com|tiktok\\.com|youtube\\.com|youtu\\.be|facebook\\.com|fb\\.com|threads\\.net|threads\\.com)\\/[^${STOP}]*|https?:\\/\\/[^${STOP}]+`,
  "gi",
);

const parse = (url: string) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

export function kolLinkPlatform(url: string): KolLinkPlatform {
  const host = (parse(/^https?:\/\//i.test(url) ? url : `https://${url}`)?.hostname ?? "").toLowerCase();
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (is("instagram.com")) return "instagram";
  if (is("tiktok.com")) return "tiktok";
  if (is("youtube.com") || is("youtu.be")) return "youtube";
  if (is("facebook.com") || is("fb.com")) return "facebook";
  if (is("threads.net") || is("threads.com")) return "threads";
  return "other";
}

/** 比對用的鍵：同一個帳號不同寫法（大小寫、www、結尾斜線、追蹤參數）視為同一個 */
export function kolLinkKey(url: string): string {
  const p = kolLinkPlatform(url);
  // 純帳號（amile77、@amile77）視為 IG
  if (p === "instagram" || p === "threads" || !/[./]/.test(url.trim())) {
    return `${p === "threads" ? p : "instagram"}:${normalizeIgHandle(url).toLowerCase()}`;
  }
  const v = url.trim().replace(/^https?:\/\//i, "").replace(/^(?:www\.|m\.)/i, "");
  const fbId = v.match(/\/profile\.php\?(?:.*&)?id=(\d+)/i);
  if (fbId) return `facebook.com/profile.php?id=${fbId[1]}`;
  const base = v.split(/[?#]/)[0].replace(/\/+$/, "");
  // YouTube 頻道 ID 有分大小寫
  return /\/channel\//i.test(base) ? base : base.toLowerCase();
}

/** 是否為個人主頁（主欄位只放個人主頁，不放貼文／影片） */
function isProfileLink(url: string): boolean {
  if (isContentPostUrl(url)) return false;
  const u = parse(url);
  if (!u) return false;
  const segs = u.pathname.split("/").filter(Boolean);
  const p = kolLinkPlatform(url);
  if (p === "tiktok") return segs.length === 1 && segs[0].startsWith("@");
  if (p === "youtube") return !/youtu\.be$/i.test(u.hostname) && (segs[0]?.startsWith("@") || ["channel", "c", "user"].includes(segs[0] ?? ""));
  return true;
}

const cleanLink = (raw: string): string | null => {
  const v = raw.replace(/[.,:：;)）」。！？|]+$/, "");
  const full = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const u = parse(full);
  if (!u || !u.hostname.includes(".")) return null;
  // 只有網域、沒有帳號的平台網址（例：https://www.instagram.com/）沒有意義
  if (kolLinkPlatform(full) !== "other" && u.pathname.replace(/\//g, "") === "") return null;
  return full;
};

/** 從一段文字中抓出所有網址（去掉「IG：」等標籤、去重） */
const rawLinkFragments = (text: string): string[] => {
  const t = (text ?? "").replace(LABEL_RE, "$1 ");
  const igHandles = Array.from((text ?? "").matchAll(IG_LABEL_HANDLE_RE), (m) => `https://www.instagram.com/${m[1]}`);
  return [...igHandles, ...(t.match(URL_RE) ?? [])];
};

export function extractKolLinks(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of rawLinkFragments(text)) {
    const link = cleanLink(m);
    if (!link) continue;
    const k = kolLinkKey(link);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(link);
  }
  return out;
}

/** 合併連結並去重；exclude 為主欄位的連結，不重複放進其他平台連結 */
export function mergeKolLinks(existing: string[], add: string[], exclude?: string): string[] {
  const seen = new Set<string>(exclude ? [kolLinkKey(exclude)] : []);
  const out: string[] = [];
  for (const l of [...existing, ...add]) {
    const k = kolLinkKey(l);
    if (!l.trim() || seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

/**
 * 主欄位一次貼了多個連結（或帶「IG：」標籤）時，拆成 1 個主連結 + 其他平台連結。
 * 不需要拆時 split=false，primary 為原輸入。
 */
export function splitKolLinks(text: string): { primary: string; others: string[]; split: boolean } {
  const raw = text ?? "";
  const links = extractKolLinks(raw);
  const hadLabel = new RegExp(LABEL_RE.source, "i").test(raw.trim());
  const fragments = rawLinkFragments(raw).length;
  if (links.length === 0 || (fragments < 2 && !hadLabel)) return { primary: raw, others: [], split: false };
  const profiles = links.filter(isProfileLink);
  let primary = profiles[0] ?? links[0];
  for (const p of PRIMARY_ORDER) {
    const hit = profiles.find((l) => kolLinkPlatform(l) === p);
    if (hit) {
      primary = hit;
      break;
    }
  }
  return { primary, others: links.filter((l) => l !== primary), split: true };
}

/** 搜尋框的連結條件：其他平台連結（去掉 https://、www.、結尾斜線再比對），IG 網址另外用帳號比對主欄位 */
export function kolLinkSearchFilters(esc: string): string[] {
  const v = esc.trim();
  const core = v.replace(/^https?:\/\//i, "").replace(/^(?:www\.|m\.)/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = [`other_links_text.ilike.%${core || v}%`];
  if (/(?:instagram\.com|threads\.(?:net|com))\//i.test(v)) {
    const h = normalizeIgHandle(v);
    if (h && !h.includes("/")) parts.push(`ig_handle.ilike.%${h}%`);
  }
  return parts;
}
