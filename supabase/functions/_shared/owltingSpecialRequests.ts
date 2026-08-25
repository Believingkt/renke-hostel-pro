// Special requests are parsed into extracted_fields (jsonb), not a table column.
// This helper reads them safely and strips OwlNest email boilerplate.
const NOISE_MARKERS = [
  "若對訂單有任何相關問題",
  "本系統服務由",
  "旅館資訊",
  "更多資訊",
];

export function extractSpecialRequests(staging: any): string {
  const raw = String(
    staging?.special_requests ?? staging?.extracted_fields?.special_requests ?? "",
  ).trim();
  if (!raw) return "";
  let out = raw;
  for (const marker of NOISE_MARKERS) {
    const i = out.indexOf(marker);
    if (i > 0) out = out.slice(0, i);
  }
  return out.replace(/\s+/g, " ").trim();
}
