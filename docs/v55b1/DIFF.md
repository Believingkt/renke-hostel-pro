# V5.5B.1 — 實際程式碼 diff（設計稿，尚未施工）

決定：房間配置行送出；旅客需求限長 500 字；不做 HQ 開關（寫死）。

## 1) 新檔 `supabase/functions/_shared/owltingNotesWhitelist.ts`

```ts
// V5.5B.1 — OwlTing SpecialRequests whitelist filter (pure, no I/O)

export interface WhitelistOpts {
  includeRoomLayout?: boolean; // default true
  maxGuestChars?: number;      // default 500
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
  /^\s*\[人客多收款狀態\]/,
  /^\s*\[ATM(\s+Webhook)?\]/,
  /rec_trade_id/i,
  /虛擬帳號/,
  /^\s*.*(虛擬帳號|繳款帳號).*8\d{2}-\d{6,}/, // 收緊：同行需有帳號字樣才觸發，避免誤刪 0800/09xx 電話
  /^\s*\[\d{4}-\d{2}-\d{2}\s*奧丁丁修改通知\]/,
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

function sanitize(text: string, maxChars: number): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[已隱藏]")
    .replace(/https?:\/\/\S+/g, "[連結已移除]")
    .replace(/\n{2,}/g, "\n")
    .trim();
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

  let text = String(rawNotes ?? "");
  for (const re of BLOCK_RES) text = text.replace(re, "");

  let lines = text.split(/\r?\n/);

  const layout = lines.filter((l) => ROOM_LAYOUT_RE.test(l)).map((l) => l.trim());
  lines = lines.filter((l) => !ROOM_LAYOUT_RE.test(l));

  const { kept: gbKept, rest } = extractGroupBuy(lines);
  lines = rest;

  const survivors = lines.filter((l) => l.trim() && !LINE_RES.some((r) => r.test(l)));
  const guest = sanitize([...gbKept, ...survivors].join("\n"), maxChars);

  return [
    includeLayout && layout.length ? layout.join("\n") : null,
    guest || null,
    payLine.trim() || null,
  ].filter(Boolean).join("\n");
}
```

## 2) `supabase/functions/owlting-order-push/index.ts`

```diff
@@ import 區
+import { buildOwltingNotes } from "../_shared/owltingNotesWhitelist.ts";

@@ 約 L447-448（payLine 之後）
   const payLine = `[人客多收款狀態] 付款狀態：${statusLabel}｜訂金 ${depositAmt}(${depositLabel})｜尾款 ${remainingAmt}(${balanceLabel})｜已收 ${paidAmt}｜未收 ${balanceAmt}`;
-  const combinedNotes = [order.notes?.trim() || null, payLine].filter(Boolean).join("\n");
+  const combinedNotes = buildOwltingNotes(order.notes, payLine);
```

`baseLog` 另存查核用兩份文字（不外送）：

```diff
   const baseLog = {
     ...,
+    notes_before: order.notes ?? null,
+    notes_after: combinedNotes,
   };
```

其餘（xml.ts、DB notes、PMS 後台顯示）完全不動。
