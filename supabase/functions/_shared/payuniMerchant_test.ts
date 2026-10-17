// PAYUNi W2 handler 測試：全部以 mock PAYUNi 回應與記憶體 DB 執行，不連網、不讀環境變數、不含真實金鑰。
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encrypt, hashInfo, type PayuniCall, type PayuniConfig, type PayuniResult } from "./payuni.ts";
import { handleAgentNotify, handleBind, handleStatus, type MerchantDeps } from "./payuniMerchantHandlers.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import {
  buildBindPayload, canSwitchToPayuni, extractPaymentTools, isValidGoodsRate, nextMerId, validateBindForm,
} from "./payuniMerchant.ts";

const ACC = "11111111-1111-4111-8111-111111111111";
const ACC2 = "22222222-2222-4222-8222-222222222222";
const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const cfg: PayuniConfig = { env: "sandbox", baseUrl: "https://sandbox-api.payuni.com.tw", agentId: "TEST", hashKey: KEY, hashIv: IV, agentMerId: null };

export const FORM = {
  legal_name: "測試民宿有限公司", ubn: "12345678", member_email: "owner@example.com", mcid: "A123456789",
  contact_name: "王小明", contact_tel: "02-9888888#123", contact_mobile: "0912345678",
  mer_email: "cs@example.com", mer_name: "測試館A", mer_eng_name: "Test Villa A", mer_addr: "台北市信義區信義路1號",
  mer_addr_post: "110", mer_desc: "民宿住宿服務；測試", mer_mcc: "7011", goods_rate: "0,100,0,0",
  payment: ["CREDIT", "ForeignCard", "ATM"], deliver_time: "1", escrow_type: "0", mer_unit_price: "5000",
};

const accRow = (over: Record<string, unknown> = {}) => ({
  id: ACC, name: "測試館A", short_url_alias: "testa", payuni_mer_id: null, payuni_mer_status: null,
  payuni_member_status: null, payuni_payment_tools: {}, payment_provider_active: "tappay", payuni_status_synced_at: null, ...over,
});

function deps(db: FakeDb, reply: PayuniResult, over: Partial<MerchantDeps> = {}) {
  const calls: PayuniCall[] = [];
  const d: MerchantDeps = {
    admin: db.client(), userId: "user-1", isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(false),
    agentId: "TEST", callPayuni: (c) => { calls.push(c); return Promise.resolve(reply); }, ...over,
  };
  return { d, calls };
}
const SUCCESS: PayuniResult = { ok: true, status: "SUCCESS", message: "成功", raw: {} };

// ---------------- 規則 ----------------

Deno.test("規則：合法表單通過；統編 9 碼、英文名含中文、GoodsRate≠100、電話皆缺 皆被擋", () => {
  assertEquals(validateBindForm(FORM), {});
  assert(validateBindForm({ ...FORM, ubn: "123456789" }).ubn);
  assertEquals(validateBindForm({ ...FORM, ubn: "A123456789" }).ubn, undefined);
  assert(validateBindForm({ ...FORM, mer_eng_name: "Test 民宿" }).mer_eng_name);
  assert(validateBindForm({ ...FORM, goods_rate: "0,90,0,0" }).goods_rate);
  assert(validateBindForm({ ...FORM, contact_tel: "", contact_mobile: "" }).contact_tel);
  assert(validateBindForm({ ...FORM, mer_name: "一二三四五六七八九十一二三四五六七八九十一" }).mer_name);
  assert(validateBindForm({ ...FORM, mer_addr_post: "1100" }).mer_addr_post);
  assert(validateBindForm({ ...FORM, member_email: "x@" }).member_email);
  assertFalse(isValidGoodsRate("50,50,0"));
});

Deno.test("規則：MerID 流水從 0001 起、取同前綴最大值 +1", () => {
  assertEquals(nextMerId("TEST", []), "TEST0001");
  assertEquals(nextMerId("TEST", ["TEST0007", "TEST0012", "OTHR9999", null]), "TEST0013");
});

Deno.test("規則：payload 欄位、固定值、MerURL；空的選填不帶", () => {
  const p = buildBindPayload({ ...FORM, mer_tel: "" }, "TEST0001", "https://booking.lakeze.com/testa");
  assertEquals(p.MerType, 1);
  assertEquals(p.SellType, 1);
  assertEquals(p.CloseApplySwitch, "SPB2C,SPB2CFrz,SPC2C,SPC2CFrz,HOME");
  assertEquals(p.Payment, "CREDIT,ForeignCard,ATM");
  assertEquals(p.MCID, "A123456789");
  assertFalse("MerTel" in p);
  assertFalse("Fee" in p);
  assertFalse("MBCName" in p);
});

Deno.test("規則：支付工具轉整數、canSwitchToPayuni", () => {
  assertEquals(extractPaymentTools({ CREDIT: "1", ATM: "9", Foo: "1", Inst3: "2" }), { CREDIT: 1, Inst3: 2, ATM: 9 });
  assert(canSwitchToPayuni(1, { ATM: 1 }).ok);
  assertFalse(canSwitchToPayuni(9, { CREDIT: 1 }).ok);
  assertFalse(canSwitchToPayuni(1, { CREDIT: 9, ATM: 9 }).ok);
});

// ---------------- bind ----------------

Deno.test("bind：成功 → 寫 MerID、狀態 9、私密表；application snapshot 不含 MCID", async () => {
  const db = new FakeDb({ accommodation_info: [accRow(), { ...accRow({ id: ACC2, payuni_mer_id: "TEST0004" }) }] });
  const { d, calls } = deps(db, SUCCESS);
  const r = await handleBind(d, { accommodation_id: ACC, form: FORM });
  assertEquals(r, { status: 200, body: { ok: true, mer_id: "TEST0005" } });
  assertEquals(calls[0].path, "/api/agent/bind_merchant");
  assertEquals(calls[0].payload.MerURL, "https://booking.lakeze.com/testa");
  assertEquals(calls[0].payload.MCID, "A123456789");
  const acc = db.rows("accommodation_info").find((a) => a.id === ACC)!;
  assertEquals([acc.payuni_mer_id, acc.payuni_mer_status, acc.payuni_member_status, acc.payuni_mer_eng_name], ["TEST0005", 9, 9, "Test Villa A"]);
  assert(acc.payuni_applied_at);
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_ubn, "12345678");
  const app = db.rows("payuni_merchant_applications")[0];
  assertFalse("MCID" in app.request_snapshot);
  assertFalse(JSON.stringify(db.tables).includes("A123456789"));
  assertEquals(app.response_status, "SUCCESS");
});

Deno.test("bind：PAYUNi 失敗 → 200 ok:false 原樣回 Status/Message，仍寫 application，不改館別", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d } = deps(db, { ok: false, status: "BIND01001", message: "統一編號重複", raw: {} });
  const r = await handleBind(d, { accommodation_id: ACC, form: FORM });
  assertEquals(r, { status: 200, body: { ok: false, status: "BIND01001", message: "統一編號重複" } });
  assertEquals(db.rows("payuni_merchant_applications").length, 1);
  assertEquals(db.rows("accommodation_info")[0].payuni_mer_id, null);
});

Deno.test("bind：已建店 → 409；審核失敗(92) 重送沿用原 MerID", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0002", payuni_mer_status: 9 })] });
  const { d, calls } = deps(db, SUCCESS);
  assertEquals((await handleBind(d, { accommodation_id: ACC, form: FORM })).status, 409);
  assertEquals(calls.length, 0);
  db.rows("accommodation_info")[0].payuni_mer_status = 92;
  const r = await handleBind(d, { accommodation_id: ACC, form: FORM });
  assertEquals(r.body, { ok: true, mer_id: "TEST0002" });
});

Deno.test("bind：後端驗證擋下錯誤表單、非 super_admin → 403，皆不呼叫 PAYUNi", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, calls } = deps(db, SUCCESS);
  const bad = await handleBind(d, { accommodation_id: ACC, form: { ...FORM, ubn: "123456789", goods_rate: "1,1,1,1" } });
  assertEquals(bad.status, 400);
  assert((bad.body.errors as Record<string, string>).ubn && (bad.body.errors as Record<string, string>).goods_rate);
  const { d: d2 } = deps(db, SUCCESS, { isSuperAdmin: false });
  assertEquals((await handleBind(d2, { accommodation_id: ACC, form: FORM })).status, 403);
  assertEquals(calls.length, 0);
});

// ---------------- status ----------------

const STATUS_REPLY: PayuniResult = {
  ok: true, status: "SUCCESS", raw: {},
  data: { MerID: "TEST0001", MerStatus: "1", MemberStatus: "1", Reason: "", CREDIT: "1", ATM: "9", ForeignCard: "2", ApplePay: "0" },
};

Deno.test("status query：寫入狀態與支付工具；hotel_admin 可查、其他人 403", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 9 })] });
  const { d, calls } = deps(db, STATUS_REPLY, { isSuperAdmin: false, isAccommodationAdmin: (id) => Promise.resolve(id === ACC) });
  const r = await handleStatus(d, { accommodation_id: ACC });
  assertEquals(r.status, 200);
  assertEquals(r.body.payuni_payment_tools, { CREDIT: 1, ForeignCard: 2, ApplePay: 0, ATM: 9 });
  assertEquals(calls[0].payload, { MerID: "TEST0001" });
  const acc = db.rows("accommodation_info")[0];
  assertEquals([acc.payuni_mer_status, acc.payuni_member_status], [1, 1]);
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_status_reason, null);
  const { d: d2 } = deps(db, STATUS_REPLY, { isSuperAdmin: false });
  assertEquals((await handleStatus(d2, { accommodation_id: ACC })).status, 403);
});

Deno.test("status：hotel_admin 不可 set_provider / update_contact / list_reasons", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001" })] });
  const { d } = deps(db, SUCCESS, { isSuperAdmin: false, isAccommodationAdmin: () => Promise.resolve(true) });
  for (const action of ["set_provider", "update_contact", "list_reasons"]) {
    assertEquals((await handleStatus(d, { accommodation_id: ACC, action, provider: "payuni" })).status, 403);
  }
});

Deno.test("set_provider：未啟用拒絕；啟用且 CREDIT=1 可切並追加 providerLog", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 9, payuni_payment_tools: { CREDIT: 1 } })] });
  const { d } = deps(db, SUCCESS);
  const denied = await handleStatus(d, { accommodation_id: ACC, action: "set_provider", provider: "payuni" });
  assertEquals(denied.status, 409);
  assertEquals(db.rows("accommodation_info")[0].payment_provider_active, "tappay");
  db.rows("accommodation_info")[0].payuni_mer_status = 1;
  const ok = await handleStatus(d, { accommodation_id: ACC, action: "set_provider", provider: "payuni" });
  assertEquals(ok.body, { ok: true, payment_provider_active: "payuni" });
  const log = db.rows("accommodation_payuni_private")[0].payuni_settings.providerLog;
  assertEquals([log.length, log[0].from, log[0].to, log[0].by], [1, "tappay", "payuni", "user-1"]);
});

Deno.test("update_contact：只送有填的欄位到 update_merchant；不支援 Payment", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001" })] });
  const { d, calls } = deps(db, SUCCESS);
  const r = await handleStatus(d, { accommodation_id: ACC, action: "update_contact", contact: { ContactName: "李四", MerTel: "", Payment: "CREDIT" } });
  assertEquals(r.body.ok, true);
  assertEquals(calls[0].path, "/api/agent/update_merchant");
  assertEquals(calls[0].payload, { MerID: "TEST0001", ContactName: "李四" });
});

// ---------------- agent notify ----------------

async function notifyReq(data: Record<string, string>, tamper = false) {
  const enc = await encrypt(data, KEY, IV);
  let hash = await hashInfo(enc, KEY, IV);
  if (tamper) hash = (hash[0] === "A" ? "B" : "A") + hash.slice(1);
  const body = new URLSearchParams({ AgentID: "TEST", Version: "1.0", EncryptInfo: enc, HashInfo: hash });
  return new Request("https://x/payuni-agent-notify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
}

function notifyDeps(db: FakeDb) {
  const alerts: string[] = [];
  return { alerts, d: { admin: db.client(), config: cfg, sendAlert: (s: string) => { alerts.push(s); return Promise.resolve(true); } } };
}

Deno.test("notify MerStatus 9→1：啟用、通知總部（館名＋MerID）；同一筆重送不重複入庫、不重處理", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 9 })] });
  const { d, alerts } = notifyDeps(db);
  const msg = { NotifyType: "MerStatus", MerID: "TEST0001", Status: "1", Reason: "", ExecuteTime: "2026-10-20 10:00:00" };
  const r = await handleAgentNotify(await notifyReq(msg), d);
  assertEquals([r.status, await r.text()], [200, "OK"]);
  assertEquals(db.rows("accommodation_info")[0].payuni_mer_status, 1);
  const ev = db.rows("payuni_notify_events");
  assertEquals([ev.length, ev[0].source, ev[0].hash_valid, ev[0].processed, ev[0].notify_type, ev[0].mer_id], [1, "agent", true, true, "MerStatus", "TEST0001"]);
  assertEquals(alerts, ["[PAYUNi] 測試館A（TEST0001）商店已啟用"]);
  db.rows("accommodation_info")[0].payuni_mer_status = 9;
  const again = await handleAgentNotify(await notifyReq(msg), d);
  assertEquals(await again.text(), "OK");
  assertEquals(db.rows("payuni_notify_events").length, 1);
  assertEquals(db.rows("accommodation_info")[0].payuni_mer_status, 9);
  assertEquals(alerts.length, 1);
});

Deno.test("notify MerStatus 1→99 且金流為 payuni → 自動改 none，寫入 Reason", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 1, payment_provider_active: "payuni" })] });
  const { d, alerts } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "99", Reason: "違規停權", ExecuteTime: "t2" }), d);
  const acc = db.rows("accommodation_info")[0];
  assertEquals([acc.payuni_mer_status, acc.payment_provider_active], [99, "none"]);
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_status_reason, "違規停權");
  assertEquals(alerts.length, 0);
});

Deno.test("notify MerPayment：只覆蓋有帶的鍵", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_payment_tools: { CREDIT: 9, ForeignCard: 9 } })] });
  const { d } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerPayment", MerID: "TEST0001", CREDIT: "1", ATM: "1", ExecuteTime: "t3" }), d);
  assertEquals(db.rows("accommodation_info")[0].payuni_payment_tools, { CREDIT: 1, ForeignCard: 9, ATM: 1 });
});

Deno.test("notify MerSetting / BackSetting：寫入私密表 settings；BackSetIframe=2 通知總部", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001" })] });
  const { d, alerts } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerSetting", MerID: "TEST0001", ThreeDCREDIT: "1", MerClose: "0", Extra: "x", ExecuteTime: "t4" }), d);
  await handleAgentNotify(await notifyReq({ NotifyType: "BackSetting", MerID: "TEST0001", BackSetIframe: "2", BackSetATM: "1", ExecuteTime: "t5" }), d);
  const s = db.rows("accommodation_payuni_private")[0].payuni_settings;
  assertEquals(s.setting, { ThreeDCREDIT: "1", MerClose: "0" });
  assertEquals(s.backSetting, { BackSetATM: "1", BackSetIframe: "2" });
  assertEquals(alerts, ["[PAYUNi] 測試館A（TEST0001）後台設定通知"]);
});

Deno.test("notify 竄改 HashInfo → 200 OK、hash_valid=false、HASH_MISMATCH、資料不變", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 9 })] });
  const { d } = notifyDeps(db);
  const r = await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "1", ExecuteTime: "t6" }, true), d);
  assertEquals([r.status, await r.text()], [200, "OK"]);
  const ev = db.rows("payuni_notify_events")[0];
  assertEquals([ev.hash_valid, ev.processed, ev.process_error, ev.decrypted], [false, false, "HASH_MISMATCH", null]);
  assertEquals(db.rows("accommodation_info")[0].payuni_mer_status, 9);
});

Deno.test("notify：找不到 MerID → UNKNOWN_MER；Refund 只入庫；處理例外仍回 200", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001" })] });
  const { d } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST9999", Status: "1", ExecuteTime: "t7" }), d);
  await handleAgentNotify(await notifyReq({ NotifyType: "Refund", MerID: "TEST0001", TradeNo: "T1", ExecuteTime: "t8" }), d);
  db.failOn["accommodation_info.update"] = "boom";
  const r = await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "2", ExecuteTime: "t9" }), d);
  assertEquals(await r.text(), "OK");
  const ev = db.rows("payuni_notify_events");
  assertEquals(ev.map((e) => [e.processed, e.process_error]), [[false, "UNKNOWN_MER"], [true, null], [false, "accommodation_info update failed: boom"]]);
  assertEquals(ev[1].trade_no, "T1");
});

Deno.test("notify：非 POST → 405", async () => {
  const { d } = notifyDeps(new FakeDb());
  assertEquals((await handleAgentNotify(new Request("https://x", { method: "GET" }), d)).status, 405);
});
