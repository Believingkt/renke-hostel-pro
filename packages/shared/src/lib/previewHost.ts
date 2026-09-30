/**
 * 預覽 / 開發環境網域判斷（單一來源）。
 * 遷移前：Lovable 預覽網域（*.lovableproject.com、*.lovable.app）。
 * 遷移後：由 VITE_PREVIEW_HOSTS 指定（逗號分隔的網域尾綴，例如 ".emergent.host,.preview.emergentagent.com"），
 *        未設定時仍保留 Lovable 尾綴，確保切換期間兩邊都能正常判斷。
 */
const DEFAULT_PREVIEW_SUFFIXES = ["lovableproject.com", "lovable.app", "lovableproject-dev.com", "beta.lovable.dev", "preview.emergentagent.com"];

function envSuffixes(): string[] {
  const raw = (import.meta.env.VITE_PREVIEW_HOSTS as string | undefined) ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

export const PREVIEW_HOST_SUFFIXES: string[] = [...new Set([...DEFAULT_PREVIEW_SUFFIXES, ...envSuffixes()])];

/** 是否為預覽網域（不含 localhost） */
export function isPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  return PREVIEW_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s) || h.includes(s));
}

/** 是否為本機或預覽網域 */
export function isDevOrPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || isPreviewHost(h);
}
