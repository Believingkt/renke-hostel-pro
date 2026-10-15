// PAYUNi 共用層測試：官方向量、外層請求格式、回應驗章、Notify 解析。
// 只用官方文件公開的測試 key/iv，不含任何真實金鑰；不讀環境變數、不連網。
import { assert, assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildQuery, callPayuni, decrypt, encrypt, hashInfo, parseNotify, PAYUNI_TIMEOUT_MS,
  type PayuniConfig, type PayuniTransport,
} from "./payuni.ts";

const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const OFFICIAL =
  "47396636346f66735853533167396942344f587a3775696b34752b596e70452b3a3a3a4373354a5a5143306b7153467531354c6e6f554a69773d3d";

const cfg: PayuniConfig = {
  env: "sandbox", baseUrl: "https://sandbox-api.payuni.com.tw", agentId: "TEST",
  hashKey: KEY, hashIv: IV, agentMerId: null,
};

// 換成另一個 hex 數字（避免大小寫差異被視為相同）
const tamper = (s: string, i = 10) => s.slice(0, i) + (s[i] === "0" ? "1" : "0") + s.slice(i + 1);

Deno.test("官方向量：encrypt 逐字相符", async () => {
  assertEquals(await encrypt({ MerID: "AAA", MerTradeNo: "BBB" }, KEY, IV), OFFICIAL);
});

Deno.test("官方向量：decrypt 還原參數", async () => {
  assertEquals(await decrypt(OFFICIAL, KEY, IV), { MerID: "AAA", MerTradeNo: "BBB" });
});

Deno.test("hashInfo：64 碼大寫 hex、可重現；竄改 EncryptInfo 任一字元即不符", async () => {
  const h = await hashInfo(OFFICIAL, KEY, IV);
  assertMatch(h, /^[0-9A-F]{64}$/);
  assertEquals(await hashInfo(OFFICIAL, KEY, IV), h);
  for (const i of [0, 37, OFFICIAL.length - 1]) assertNotEquals(await hashInfo(tamper(OFFICIAL, i), KEY, IV), h);
});

Deno.test("decrypt：密文被竄改 → GCM 驗證失敗丟錯", async () => {
  let threw = false;
  try { await decrypt(tamper(OFFICIAL, 4), KEY, IV); } catch { threw = true; }
  assert(threw);
});

Deno.test("encrypt／decrypt 往返：中文、空白、符號", async () => {
  const p = { MerID: "S01", ProdDesc: "雲岫 海景 房 & 早餐=2", TradeAmt: 1234 };
  assertEquals(await decrypt(await encrypt(p, KEY, IV), KEY, IV), { MerID: "S01", ProdDesc: "雲岫 海景 房 & 早餐=2", TradeAmt: "1234" });
});

Deno.test("buildQuery 與 PHP http_build_query 一致：* → %2A（空白 → +、~ → %7E、中文 UTF-8）", () => {
  // PHP: http_build_query(["ProdDesc"=>"A*B C~", "Name"=>"雲*岫"]) === "ProdDesc=A%2AB+C%7E&Name=%E9%9B%B2%2A%E5%B2%AB"
  assertEquals(buildQuery({ ProdDesc: "A*B C~", Name: "雲*岫" }), "ProdDesc=A%2AB+C%7E&Name=%E9%9B%B2%2A%E5%B2%AB");
  assertEquals(buildQuery({ MerID: "AAA", MerTradeNo: "BBB" }), "MerID=AAA&MerTradeNo=BBB");
});

Deno.test("含 * 的參數：密文以 %2A 編碼的明文加密，decrypt 仍還原為 *", async () => {
  const p = { MerTradeNo: "T*1", ProdDesc: "**" };
  const enc = await encrypt(p, KEY, IV);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new TextEncoder().encode(IV), tagLength: 128 },
    await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "AES-GCM" }, false, ["encrypt"]),
    new TextEncoder().encode("MerTradeNo=T%2A1&ProdDesc=%2A%2A"),
  );
  const b = new Uint8Array(sealed);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const expected = Array.from(new TextEncoder().encode(`${b64(b.slice(0, -16))}:::${b64(b.slice(-16))}`), (x) => x.toString(16).padStart(2, "0")).join("");
  assertEquals(enc, expected);
  assertEquals(await decrypt(enc, KEY, IV), { MerTradeNo: "T*1", ProdDesc: "**" });
});

type Captured = { url: string; init: Parameters<PayuniTransport>[1] };
function mockTransport(respond: () => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const transport: PayuniTransport = async (url, init) => { calls.push({ url, init }); return await respond(); };
  return { calls, transport };
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

Deno.test("callPayuni agent：外層 AgentID/Version/EncryptInfo/HashInfo、form-urlencoded、user-agent、走 relay、30 秒逾時", async () => {
  const m = mockTransport(() => json({ Status: "SUCCESS", Message: "ok" }));
  const r = await callPayuni({ path: "/api/agent/bind_merchant", version: "1.0", payload: { MerID: "AAA", MerTradeNo: "BBB" }, kind: "agent" }, { config: cfg, transport: m.transport });
  assertEquals(r.ok, true);
  assertEquals(r.status, "SUCCESS");
  assertEquals(r.data, undefined);
  const c = m.calls[0];
  assertEquals(c.url, "https://sandbox-api.payuni.com.tw/api/agent/bind_merchant");
  assertEquals(c.init.method, "POST");
  assertEquals(c.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assertEquals(c.init.headers["user-agent"], "payuni");
  assertEquals(c.init.requireProxy, true);
  assert(c.init.signal instanceof AbortSignal);
  assertEquals(PAYUNI_TIMEOUT_MS, 30_000);
  const body = new URLSearchParams(c.init.body);
  assertEquals([...body.keys()], ["AgentID", "Version", "EncryptInfo", "HashInfo"]);
  assertEquals(body.get("AgentID"), "TEST");
  assertEquals(body.get("Version"), "1.0");
  assertEquals(body.get("EncryptInfo"), OFFICIAL);
  assertEquals(body.get("HashInfo"), await hashInfo(OFFICIAL, KEY, IV));
});

Deno.test("callPayuni merchant：外層 MerID + IsPlatForm=1、不帶 AgentID；回應 EncryptInfo 驗章後解密到 data", async () => {
  const enc = await encrypt({ Status: "SUCCESS", TradeNo: "U123" }, KEY, IV);
  const m = mockTransport(async () => json({ Status: "SUCCESS", Message: "交易成功", EncryptInfo: enc, HashInfo: await hashInfo(enc, KEY, IV) }));
  const r = await callPayuni({ path: "/api/credit", merId: "S01", version: "1.3", payload: { MerTradeNo: "T1", TradeAmt: 100 }, kind: "merchant" }, { config: cfg, transport: m.transport });
  const body = new URLSearchParams(m.calls[0].init.body);
  assertEquals([...body.keys()], ["MerID", "Version", "EncryptInfo", "HashInfo", "IsPlatForm"]);
  assertEquals(body.get("MerID"), "S01");
  assertEquals(body.get("IsPlatForm"), "1");
  assertEquals(body.get("AgentID"), null);
  assertEquals(await decrypt(body.get("EncryptInfo")!, KEY, IV), { MerTradeNo: "T1", TradeAmt: "100" });
  assertEquals([r.ok, r.status, r.message], [true, "SUCCESS", "交易成功"]);
  assertEquals(r.data, { Status: "SUCCESS", TradeNo: "U123" });
});

Deno.test("callPayuni：回應 HashInfo 不符 → ok=false、HASH_MISMATCH、不解密", async () => {
  const enc = await encrypt({ Status: "SUCCESS" }, KEY, IV);
  const m = mockTransport(async () => json({ Status: "SUCCESS", EncryptInfo: enc, HashInfo: tamper(await hashInfo(enc, KEY, IV), 3) }));
  const r = await callPayuni({ path: "/api/x", merId: "S01", version: "1.0", payload: { A: 1 }, kind: "merchant" }, { config: cfg, transport: m.transport });
  assertEquals(r.ok, false);
  assertEquals(r.status, "HASH_MISMATCH");
  assertEquals(r.data, undefined);
});

Deno.test("callPayuni：HTTP 非 2xx → HTTP_<code>；Status 非 SUCCESS → ok=false；merchant 缺 merId 丟錯", async () => {
  const r1 = await callPayuni({ path: "/api/x", version: "1.0", payload: {}, kind: "agent" }, { config: cfg, transport: mockTransport(() => new Response("bad", { status: 502 })).transport });
  assertEquals([r1.ok, r1.status], [false, "HTTP_502"]);
  const r2 = await callPayuni({ path: "/api/x", version: "1.0", payload: {}, kind: "agent" }, { config: cfg, transport: mockTransport(() => json({ Status: "ERROR", Message: "參數錯誤" })).transport });
  assertEquals([r2.ok, r2.status, r2.message], [false, "ERROR", "參數錯誤"]);
  let threw = false;
  try { await callPayuni({ path: "/api/x", version: "1.0", payload: {}, kind: "merchant" }, { config: cfg, transport: mockTransport(() => json({})).transport }); } catch { threw = true; }
  assert(threw);
});

Deno.test("callPayuni：log 不含 EncryptInfo、HashKey、HashIV", async () => {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const enc = await encrypt({ Status: "SUCCESS" }, KEY, IV);
    await callPayuni({ path: "/api/x", merId: "S01", version: "1.0", payload: { MerTradeNo: "BBB" }, kind: "merchant" }, {
      config: cfg, transport: mockTransport(async () => json({ Status: "SUCCESS", EncryptInfo: enc, HashInfo: await hashInfo(enc, KEY, IV) })).transport,
    });
    const all = logs.join("\n");
    assert(all.includes("/api/x") && all.includes("S01") && all.includes("SUCCESS"));
    for (const secret of [KEY, IV, enc, OFFICIAL]) assert(!all.includes(secret));
  } finally {
    console.log = orig;
  }
});

const notifyReq = (fields: Record<string, string>, ct = "application/x-www-form-urlencoded") =>
  new Request("https://example.test/notify", { method: "POST", headers: { "content-type": ct }, body: new URLSearchParams(fields).toString() });

Deno.test("parseNotify：正確 → ok 並解密", async () => {
  const enc = await encrypt({ Status: "SUCCESS", MerTradeNo: "T1", TradeNo: "U1" }, KEY, IV);
  const r = await parseNotify(notifyReq({ MerID: "S01", Version: "1.0", EncryptInfo: enc, HashInfo: await hashInfo(enc, KEY, IV) }), { config: cfg });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.data, { Status: "SUCCESS", MerTradeNo: "T1", TradeNo: "U1" });
    assertEquals(r.outer.MerID, "S01");
  }
});

Deno.test("parseNotify：AgentID 型也接受", async () => {
  const enc = await encrypt({ MerID: "S01", MerStatus: "1" }, KEY, IV);
  const r = await parseNotify(notifyReq({ AgentID: "TEST", Version: "1.0", EncryptInfo: enc, HashInfo: await hashInfo(enc, KEY, IV) }), { config: cfg });
  assertEquals(r.ok, true);
});

Deno.test("parseNotify：EncryptInfo 改一個字元 → HASH_MISMATCH；HashInfo 改一個字元 → HASH_MISMATCH", async () => {
  const enc = await encrypt({ Status: "SUCCESS" }, KEY, IV);
  const h = await hashInfo(enc, KEY, IV);
  const r1 = await parseNotify(notifyReq({ MerID: "S01", Version: "1.0", EncryptInfo: tamper(enc, 5), HashInfo: h }), { config: cfg });
  assertEquals(r1.ok ? "ok" : r1.reason, "HASH_MISMATCH");
  const r2 = await parseNotify(notifyReq({ MerID: "S01", Version: "1.0", EncryptInfo: enc, HashInfo: tamper(h, 0) }), { config: cfg });
  assertEquals(r2.ok ? "ok" : r2.reason, "HASH_MISMATCH");
});

Deno.test("parseNotify：缺欄位 → MISSING_FIELDS；非 form → BAD_CONTENT_TYPE；驗章通過但密文無效 → DECRYPT_FAILED", async () => {
  const enc = await encrypt({ Status: "SUCCESS" }, KEY, IV);
  const h = await hashInfo(enc, KEY, IV);
  for (const drop of ["MerID", "Version", "EncryptInfo", "HashInfo"]) {
    const f: Record<string, string> = { MerID: "S01", Version: "1.0", EncryptInfo: enc, HashInfo: h };
    delete f[drop];
    const r = await parseNotify(notifyReq(f), { config: cfg });
    assertEquals(r.ok ? "ok" : r.reason, "MISSING_FIELDS", drop);
  }
  const bad = await parseNotify(new Request("https://example.test/n", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), { config: cfg });
  assertEquals(bad.ok ? "ok" : bad.reason, "BAD_CONTENT_TYPE");
  const junk = "6e6f742d636970686572"; // "not-cipher"
  const r3 = await parseNotify(notifyReq({ MerID: "S01", Version: "1.0", EncryptInfo: junk, HashInfo: await hashInfo(junk, KEY, IV) }), { config: cfg });
  assertEquals(r3.ok ? "ok" : r3.reason, "DECRYPT_FAILED");
});
