// Intercom identity verification：以 INTERCOM_IDENTITY_SECRET 對 user.id 做 HMAC-SHA256（hex）。
// getUser／secret 由 index.ts 注入，方便單元測試。
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleUserHash(
  req: Request,
  deps: {
    cors: Record<string, string>;
    secret: string | undefined;
    getUser: (jwt: string) => Promise<{ id: string } | null>;
  },
): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...deps.cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: deps.cors });
  if (req.method !== "POST") return json({ error: "只支援 POST" }, 405);

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!jwt) return json({ error: "未登入" }, 401);

  if (!deps.secret) return json({ error: "伺服器設定錯誤：尚未設定 INTERCOM_IDENTITY_SECRET" }, 500);

  let user: { id: string } | null = null;
  try {
    user = await deps.getUser(jwt);
  } catch {
    user = null;
  }
  if (!user?.id) return json({ error: "未登入" }, 401);

  return json({ user_id: user.id, user_hash: await hmacSha256Hex(deps.secret, user.id) });
}
