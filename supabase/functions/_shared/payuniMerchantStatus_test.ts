// search_merchant_status 解析：走真的 callPayuni（mock transport），回應依文件 #/9/138 格式加密；不連網、不含真實金鑰。
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callPayuni, encrypt, hashInfo, type PayuniConfig } from "./payuni.ts";
import { handleStatus, type MerchantDeps } from "./payuniMerchantHandlers.ts";
import { FakeDb } from "./payuniTestFakes.ts";

const ACC = "11111111-1111-4111-8111-111111111111";
const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const cfg: PayuniConfig = { env: "sandbox", baseUrl: "https://sandbox-api.payuni.com.tw", agentId: "TEST", hashKey: KEY, hashIv: IV, agentMerId: null };

const accRow = (over: Record<string, unknown> = {}) => ({
  id: ACC, name: "奧丁丁測試", short_url_alias: "t", payuni_mer_id: "TEST0001", payuni_mer_status: 9,
  payuni_member_status: 9, payuni_payment_tools: {}, payment_provider_active: "payuni", payuni_status_synced_at: null, ...over,
});

async function docReply(inner: Record<string, string>) {
  const EncryptInfo = await encrypt(inner, KEY, IV);
  return { AgentID: "TEST", MerID: "TEST0001", Version: "1.0", EncryptInfo, HashInfo: await hashInfo(EncryptInfo, KEY, IV) };
}

function deps(db: FakeDb, outer: unknown) {
  const alerts: string[] = [];
  const d: MerchantDeps = {
    admin: db.client(), userId: "u1", isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(false), agentId: "TEST",
    callPayuni: (c) => callPayuni(c, { config: cfg, transport: () => Promise.resolve(new Response(JSON.stringify(outer), { status: 200 })) }),
    sendAlert: (s) => { alerts.push(s); return Promise.resolve(true); },
  };
  return { d, alerts };
}

async function silenced<T>(fn: () => Promise<T>): Promise<{ out: T; logs: string[] }> {
  const logs: string[] = [];
  const [e, l] = [console.error, console.log];
  console.error = (...a: unknown[]) => logs.push(a.join(" "));
  console.log = () => {};
  try { return { out: await fn(), logs }; } finally { [console.error, console.log] = [e, l]; }
}

Deno.test("文件格式（Status 在 EncryptInfo 內）→ 寫回會員、商店、支付工具、Reason、同步時間；provider 不變", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const outer = await docReply({
    Status: "SUCCESS", Message: "查詢成功", MerID: "TEST0001", MerStatus: "1", Reason: "", MemberStatus: "1",
    CREDIT: "1", ForeignCard: "1", ATM: "1", CVS: "3",
  });
  const { d, alerts } = deps(db, outer);
  const { out: r } = await silenced(() => handleStatus(d, { action: "query", accommodation_id: ACC }));
  assertEquals(r.body.ok, true);
  const acc = db.rows("accommodation_info")[0];
  assertEquals([acc.payuni_mer_status, acc.payuni_member_status], [1, 1]);
  assertEquals(acc.payuni_payment_tools, { CREDIT: 1, ForeignCard: 1, CVS: 3, ATM: 1 });
  assertEquals(typeof acc.payuni_status_synced_at, "string");
  assertEquals(acc.payment_provider_active, "payuni");
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_status_reason, null);
  assertEquals(alerts.length, 0);
});

Deno.test("文件格式帶 Reason、MerStatus=92 → Reason 寫入私密表", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payment_provider_active: "tappay" })] });
  const outer = await docReply({ Status: "SUCCESS", MerID: "TEST0001", MerStatus: "92", Reason: "證件不清楚", MemberStatus: "1" });
  const { d } = deps(db, outer);
  const { out: r } = await silenced(() => handleStatus(d, { action: "query", accommodation_id: ACC }));
  assertEquals(r.body.ok, true);
  assertEquals(db.rows("accommodation_info")[0].payuni_mer_status, 92);
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_status_reason, "證件不清楚");
});

Deno.test("外層沒有 Status、也沒有 EncryptInfo → ok:false 帶可讀訊息；不寫 DB、provider 不變；log 只有 key 名稱", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, alerts } = deps(db, { AgentID: "TEST", MerID: "TEST0001", Version: "1.0" });
  const { out: r, logs } = await silenced(() => handleStatus(d, { action: "query", accommodation_id: ACC }));
  assertEquals(r.body, { ok: false, status: "UNPARSEABLE", message: "PAYUNi 回傳格式無法解析" });
  const acc = db.rows("accommodation_info")[0];
  assertEquals([acc.payuni_mer_status, acc.payuni_member_status, acc.payuni_status_synced_at, acc.payment_provider_active], [9, 9, null, "payuni"]);
  assertEquals(db.rows("accommodation_payuni_private").length, 0);
  assertEquals(alerts.length, 0);
  const line = logs.find((l) => l.includes("query failed")) ?? "";
  assertStringIncludes(line, "outerKeys=AgentID,MerID,Version");
});

Deno.test("解密後 SUCCESS 但缺 MerStatus → ok:false，不觸發自動停用；log 不含 EncryptInfo／HashInfo 內容", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const outer = await docReply({ Status: "SUCCESS", Message: "查詢成功", MerID: "TEST0001" });
  const { d, alerts } = deps(db, outer);
  const { out: r, logs } = await silenced(() => handleStatus(d, { action: "query", accommodation_id: ACC }));
  assertEquals(r.body, { ok: false, status: "SUCCESS", message: "PAYUNi 回傳缺少商店狀態" });
  assertEquals(db.rows("accommodation_info")[0].payment_provider_active, "payuni");
  assertEquals(alerts.length, 0);
  const all = logs.join("\n");
  assertEquals(all.includes(outer.EncryptInfo), false);
  assertEquals(all.includes(outer.HashInfo), false);
  assertEquals(all.includes(KEY) || all.includes(IV), false);
});

Deno.test("解密後 Status 為錯誤代碼 → ok:false 原樣回 Status／Message，不寫 DB", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const outer = await docReply({ Status: "TEST_ERR", Message: "查無商店" });
  const { d } = deps(db, outer);
  const { out: r } = await silenced(() => handleStatus(d, { action: "query", accommodation_id: ACC }));
  assertEquals(r.body, { ok: false, status: "TEST_ERR", message: "查無商店" });
  assertEquals(db.rows("accommodation_info")[0].payuni_status_synced_at, null);
});
