// fetchViaProxy 抽出後行為測試（需 --allow-env；以 stub fetch 驗證，不連網）
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchViaProxy } from "./staticIpProxy.ts";
import { fetchViaProxy as reExported } from "./externalRoomsSearch.ts";

type Seen = { url: string; init: RequestInit };
async function withEnv(env: Record<string, string | undefined>, fn: (seen: Seen[]) => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v);
  }
  const origFetch = globalThis.fetch;
  const origWarn = console.warn, origLog = console.log;
  const seen: Seen[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => { seen.push({ url: String(url), init }); return Promise.resolve(new Response("{}")); }) as typeof fetch;
  console.warn = () => {}; console.log = () => {};
  try { await fn(seen); } finally {
    globalThis.fetch = origFetch; console.warn = origWarn; console.log = origLog;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
}

Deno.test("externalRoomsSearch 仍匯出同一個 fetchViaProxy", () => {
  assertEquals(reExported, fetchViaProxy);
});

Deno.test("未設定 proxy：既有呼叫端維持直連", async () => {
  await withEnv({ STATIC_IP_PROXY_URL: undefined, STATIC_IP_PROXY_TOKEN: undefined }, async (seen) => {
    await fetchViaProxy("https://booking.taiwantravelmap.com/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assertEquals(seen.length, 1);
    assertEquals(seen[0].url, "https://booking.taiwantravelmap.com/api/x");
  });
});

Deno.test("requireProxy：未設定 URL 或 TOKEN 時丟錯、不直連", async () => {
  for (const env of [{ STATIC_IP_PROXY_URL: undefined, STATIC_IP_PROXY_TOKEN: "t" }, { STATIC_IP_PROXY_URL: "https://relay.test", STATIC_IP_PROXY_TOKEN: undefined }]) {
    await withEnv(env, async (seen) => {
      await assertRejects(() => fetchViaProxy("https://sandbox-api.payuni.com.tw/api/x", { method: "POST", headers: {}, body: "", requireProxy: true }), Error, "static IP relay is required");
      assertEquals(seen.length, 0);
    });
  }
});

Deno.test("有 proxy：送到 /relay，帶 X-Relay-Token、X-Target-Url，原 header 以 X-Forward-Header- 前綴轉送", async () => {
  await withEnv({ STATIC_IP_PROXY_URL: "https://relay.test", STATIC_IP_PROXY_TOKEN: "tok" }, async (seen) => {
    await fetchViaProxy("https://sandbox-api.payuni.com.tw/api/x", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "user-agent": "payuni" }, body: "a=1", requireProxy: true,
    });
    const h = seen[0].init.headers as Record<string, string>;
    assertEquals(seen[0].url, "https://relay.test/relay");
    assertEquals(h["X-Relay-Token"], "tok");
    assertEquals(h["X-Target-Url"], "https://sandbox-api.payuni.com.tw/api/x");
    assertEquals(h["X-Forward-Header-Content-Type"], "application/x-www-form-urlencoded");
    assertEquals(h["X-Forward-Header-user-agent"], "payuni");
    assertEquals(seen[0].init.body, "a=1");
  });
});
