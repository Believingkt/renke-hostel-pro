// V5.5B.1 — OwlTing SpecialRequests whitelist filter (pure, no I/O)
// V5.5B.2 — 加入 maskContacts 選項與泛用 [系統標籤] 行規則
// 注意：本檔與 src/utils/guestNotesWhitelist.ts 必須保持同一套規則（有 parity 測試把關）

export interface WhitelistOpts {
  includeRoomLayout?: boolean; // default true
  maxGuestChars?: number;      // default 500
  maskContacts?: boolean;      // default true
}

const ROOM_LAYOUT_RE = /^【(包棟|包區)房間配置】/;

// 區塊型內部段落（整塊剝除，跨行）
const BLOCK_RES: RegExp[] = [
  /【額外現場加購備註[^】]*】[\s\S]*?【額外現場加購備註END】/g,
  /【額外現場加購金額[^】]*】[\s\S]*?【額外現場加購金額END】/g,
  /【測試資料｜App Review[\s\S]*?(?=\n{2,}|$)/g,
];

// 行型內部段落
const LINE_RES: RegExp[] = [
  /^\s*🔒/,
  /^\s*【付款狀態變更】/,
  /^\s*\[[^\]]+\]/,
  /rec_trade_id/i,
  /虛擬帳號/,
  /^\s*.*(虛擬帳號|繳款帳號).*8\d{2}-\d{6,}/,
  /^\s*（信件差異[:：]/,
  /奧丁丁訂單由業主補單/,
  /^\s*折扣碼設定[:：]/,
  /^\s*社群帳號連結[:：]/,
  /^\s*邀約人[:：]/,
  /^\s*【取消】/,
  /^\s*退款處理[:：]/,
  /^\s*取消政策[:：]/,
  /^\s*原因[:：]/,
  /^\s*保留(到|至)\s*\S+/,
  /^\s*(合作對象|方案|入住人數|住宿費|訂金)\s*[:：]/,
  /訂金\s*\d+\s*元（\d+%）/,
];

function extractGroupBuy(lines: string[]): { kept: string[]; rest: string[] } {
  const idx = lines.findIndex((l) => /^\s*【團購】/.test(l));
  if (idx === -1) return { kept: [], rest: lines };
  const rest = lines.filter((_, i) => i !== idx);
  const gIdx = rest.findIndex((l) => /^\s*旅客備註[:：]/.test(l));
  if (gIdx === -1) return { kept: [], rest };
  const kept: string[] = [rest[gIdx].replace(/^\s*旅客備註[:：]\s*/, "")];
  for (let i = gIdx + 1; i < rest.length; i++) {
    const l = rest[i];
    if (LINE_RES.some((r) => r.test(l))) break;
    kept.push(l);
  }
  const consumed = new Set<number>([gIdx, ...kept.slice(1).map((_, k) => gIdx + 1 + k)]);
  return { kept, rest: rest.filter((_, i) => !consumed.has(i)) };
}

function sanitize(text: string, maxChars: number, mask: boolean): string {
  let out = text;
  if (mask) {
    out = out
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[已隱藏]")
      .replace(/https?:\/\/\S+/g, "[連結已移除]");
  }
  out = out.replace(/\n{2,}/g, "\n").trim();
  if (out.length > maxChars) out = out.slice(0, maxChars) + "…";
  return out;
}

export function buildOwltingNotes(
  rawNotes: string | null | undefined,
  payLine: string,
  opts: WhitelistOpts = {},
): string {
  const includeLayout = opts.includeRoomLayout !== false;
  const maxChars = opts.maxGuestChars ?? 500;
  const mask = opts.maskContacts !== false;

  let text = String(rawNotes ?? "");
  for (const re of BLOCK_RES) text = text.replace(re, "");

  let lines = text.split(/\r?\n/);

  const layout = lines.filter((l) => ROOM_LAYOUT_RE.test(l)).map((l) => l.trim());
  lines = lines.filter((l) => !ROOM_LAYOUT_RE.test(l));

  const { kept: gbKept, rest } = extractGroupBuy(lines);
  lines = rest;

  const survivors = lines.filter((l) => l.trim() && !LINE_RES.some((r) => r.test(l)));
  const guest = sanitize([...gbKept, ...survivors].join("\n"), maxChars, mask);

  return [
    includeLayout && layout.length ? layout.join("\n") : null,
    guest || null,
    payLine.trim() || null,
  ].filter(Boolean).join("\n");
}
