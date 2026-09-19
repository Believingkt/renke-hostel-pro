// 過渡期轉發：合作方尚未把回呼 URL 改到新專案時，舊專案（Lovable Cloud）端的入口函式把 request 原封轉到新專案。
// 只在 secret MIGRATION_FORWARD_URL 有設定時生效（例如 https://<NEW_REF>.supabase.co）；沒設定＝原行為，零影響。
// 回退時把同一個 secret 設在新專案、指向舊專案，方向就反過來。
// 用法：在 Deno.serve handler 第一行加 `const fw = await maybeForward(req); if (fw) return fw;`

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"]);

export async function maybeForward(req: Request): Promise<Response | null> {
  const base = Deno.env.get("MIGRATION_FORWARD_URL");
  if (!base) return null;
  if (req.method === "OPTIONS") return null; // CORS preflight 本地回

  const incoming = new URL(req.url);
  // /functions/v1/<name>/... → 同路徑接到新專案
  const target = new URL(incoming.pathname + incoming.search, base.replace(/\/$/, "") + "/");
  if (!/\/functions\/v1\//.test(target.pathname)) target.pathname = "/functions/v1" + incoming.pathname;

  const headers = new Headers();
  for (const [k, v] of req.headers) if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  headers.set("x-migration-forwarded-from", incoming.host);
  // 新專案的 gateway 需要 apikey；沿用呼叫端帶的，沒有就用新專案的 anon key（可選 secret）
  const newAnon = Deno.env.get("MIGRATION_FORWARD_APIKEY");
  if (newAnon) { headers.set("apikey", newAnon); if (!req.headers.get("authorization")) headers.set("authorization", `Bearer ${newAnon}`); }

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  try {
    const res = await fetch(target.toString(), { method: req.method, headers, body, redirect: "manual" });
    const out = new Headers(res.headers);
    out.set("x-migration-forwarded-to", target.host);
    console.log(`[migration-forward] ${req.method} ${incoming.pathname} → ${target.host} ${res.status}`);
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    console.error(`[migration-forward] failed ${incoming.pathname}: ${(e as Error).message}`);
    return new Response(JSON.stringify({ error: "forward_failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
