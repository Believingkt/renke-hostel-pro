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
  /(^|[\s,，、；;|｜/])(?:ig|instagram|fb|facebook|yt|youtube|tiktok|tik tok|抖音|threads|脆|網站|部落格|blog)\s*[:：]/gi;

const STOP = `\\s，、；;「」<>"'`;
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
  if (p === "instagram" || p === "threads") return `${p}:${normalizeIgHandle(url).toLowerCase()}`;
  const v = url.trim().replace(/^https?:\/\//i, "").replace(/^(?:www\.|m\.)/i, "");
  const keepQuery = /\/profile\.php\?/i.test(v);
  return (keepQuery ? v.split("#")[0] : v.split(/[?#]/)[0]).replace(/\/+$/, "").toLowerCase();
}

const cleanLink = (raw: string): string | null => {
  const v = raw.replace(/[.,:：;)）」]+$/, "");
  const full = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const u = parse(full);
  if (!u || !u.hostname.includes(".")) return null;
  // 只有網域、沒有帳號的平台網址（例：https://www.instagram.com/）沒有意義
  if (kolLinkPlatform(full) !== "other" && u.pathname.replace(/\//g, "") === "") return null;
  return full;
};

/** 從一段文字中抓出所有網址（去掉「IG：」等標籤、去重） */
export function extractKolLinks(text: string): string[] {
  const t = (text ?? "").replace(LABEL_RE, "$1 ");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of t.match(URL_RE) ?? []) {
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
  if (links.length < 2 && !(links.length === 1 && hadLabel)) return { primary: raw, others: [], split: false };
  const profiles = links.filter((l) => !isContentPostUrl(l));
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
