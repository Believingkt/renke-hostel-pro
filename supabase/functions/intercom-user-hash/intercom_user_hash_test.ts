import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleUserHash, hmacSha256Hex } from "./handler.ts";

const cors = { "Access-Control-Allow-Origin": "https://booking.lakeze.com" };
const USER = "11111111-2222-4333-8444-555555555555";
const getUser = async (jwt: string) => (jwt === "good-jwt" ? { id: USER } : null);
const call = (init: RequestInit, opts: { secret?: string } = { secret: "test-secret" }) =>
  handleUserHash(new Request("https://x.test/intercom-user-hash", init), { cors, secret: opts.secret, getUser });

Deno.test("HMAC-SHA256 hex 與 RFC 4231 測試向量一致", async () => {
  // RFC 4231 test case 2
  assertEquals(await hmacSha256Hex("Jefe", "what do ya want for nothing?"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

Deno.test("有效 JWT → 200，user_hash 為 64 字 hex 且為 HMAC(user.id)", async () => {
  const r = await call({ method: "POST", headers: { Authorization: "Bearer good-jwt" } });
  assertEquals(r.status, 200);
  const b = await r.json();
  assertEquals(b.user_id, USER);
  assert(/^[0-9a-f]{64}$/.test(b.user_hash));
  assertEquals(b.user_hash, await hmacSha256Hex("test-secret", USER));
  assertEquals(r.headers.get("Access-Control-Allow-Origin"), cors["Access-Control-Allow-Origin"]);
});

Deno.test("無 Bearer／無效 JWT → 401；缺 secret → 500；非 POST → 405；OPTIONS 帶 CORS", async () => {
  assertEquals((await call({ method: "POST" })).status, 401);
  assertEquals((await call({ method: "POST", headers: { Authorization: "Basic abc" } })).status, 401);
  assertEquals((await call({ method: "POST", headers: { Authorization: "Bearer bad" } })).status, 401);
  const miss = await call({ method: "POST", headers: { Authorization: "Bearer good-jwt" } }, {});
  assertEquals(miss.status, 500);
  assert(typeof (await miss.json()).error === "string");
  assertEquals((await call({ method: "GET" })).status, 405);
  const opt = await call({ method: "OPTIONS" });
  assertEquals([opt.status, opt.headers.get("Access-Control-Allow-Origin")], [200, cors["Access-Control-Allow-Origin"]]);
});
