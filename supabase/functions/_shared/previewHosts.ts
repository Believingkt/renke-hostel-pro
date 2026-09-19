// 後端版本的「額外允許的預覽 / 前台網域」：由 secret ALLOWED_PREVIEW_HOSTS 指定（逗號分隔尾綴，如
// ".emergent.host,.preview.emergentagent.com"）。未設定時為空，既有 Lovable 網域仍寫在各函式的預設清單中。
export function extraAllowedHostSuffixes(): string[] {
  return (Deno.env.get("ALLOWED_PREVIEW_HOSTS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}
export function matchesExtraHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return extraAllowedHostSuffixes().some((s) => h === s || h.endsWith("." + s));
}
