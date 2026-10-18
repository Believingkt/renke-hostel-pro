// PAYUNi W2 handler 測試：全部以 mock PAYUNi 回應與記憶體 DB 執行，不連網、不讀環境變數、不含真實金鑰。
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encrypt, hashInfo, type PayuniCall, type PayuniConfig, type PayuniResult } from "./payuni.ts";
import { handleAgentNotify, handleBind, handleStatus, type MerchantDeps } from "./payuniMerchantHandlers.ts";
import { FakeDb } from "./payuniTestFakes.ts";
import {
  buildBindPayload, PAYUNI_DEFAULT_MCC, canSwitchToPayuni, extractPaymentTools, isValidGoodsRate, maskUbnForStorage, memberStatusLabel, nextMerId,
  shouldAutoDisablePayuni, validateBindForm,
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
  mer_addr_post: "110", mer_desc: "民宿住宿服務；測試", mer_mcc: "93", goods_rate: "0,100,0,0",
  payment: ["CREDIT", "ForeignCard", "ATM"], deliver_time: "1", escrow_type: "0", mer_unit_price: "5000",
};

const accRow = (over: Record<string, unknown> = {}) => ({
  id: ACC, name: "測試館A", short_url_alias: "testa", payuni_mer_id: null, payuni_mer_status: null,
  payuni_member_status: null, payuni_payment_tools: {}, payment_provider_active: "tappay", payuni_status_synced_at: null, ...over,
});

function deps(db: FakeDb, reply: PayuniResult, over: Partial<MerchantDeps> = {}) {
  const calls: PayuniCall[] = [];
  const alerts: Array<{ subject: string; html: string }> = [];
  const d: MerchantDeps = {
    admin: db.client(), userId: "user-1", isSuperAdmin: true, isAccommodationAdmin: () => Promise.resolve(false),
    agentId: "TEST", callPayuni: (c) => { calls.push(c); return Promise.resolve(reply); },
    sendAlert: (subject, html) => { alerts.push({ subject, html }); return Promise.resolve(true); }, ...over,
  };
  return { d, calls, alerts };
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

Deno.test("notify MerStatus 1→99 且金流為 payuni → 自動改 none，寫入 Reason、providerLog、通知總部", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 1, payment_provider_active: "payuni" })] });
  const { d, alerts } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "99", Reason: "違規停權", ExecuteTime: "t2" }), d);
  const acc = db.rows("accommodation_info")[0];
  assertEquals([acc.payuni_mer_status, acc.payment_provider_active], [99, "none"]);
  const priv = db.rows("accommodation_payuni_private")[0];
  assertEquals(priv.payuni_status_reason, "違規停權");
  const log = priv.payuni_settings.providerLog;
  assertEquals([log.length, log[0].from, log[0].to, log[0].by], [1, "payuni", "none", "system:agent-notify"]);
  assertEquals(alerts, ["[PAYUNi] 測試館A（TEST0001）商店非啟用，線上收款已暫停"]);
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

Deno.test("notify：找不到 MerID → UNKNOWN_MER；Refund 找不到交易 → UNKNOWN_TRADE（W7 起處理退款）；處理例外仍回 200", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001" })] });
  const { d } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST9999", Status: "1", ExecuteTime: "t7" }), d);
  await handleAgentNotify(await notifyReq({ NotifyType: "Refund", MerID: "TEST0001", TradeNo: "T1", ExecuteTime: "t8" }), d);
  db.failOn["accommodation_info.update"] = "boom";
  const r = await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "2", ExecuteTime: "t9" }), d);
  assertEquals(await r.text(), "OK");
  const ev = db.rows("payuni_notify_events");
  assertEquals(ev.map((e) => [e.processed, e.process_error]), [[false, "UNKNOWN_MER"], [false, "UNKNOWN_TRADE"], [false, "accommodation_info update failed: boom"]]);
  assertEquals(ev[1].trade_no, "T1");
});

Deno.test("notify：非 POST → 405", async () => {
  const { d } = notifyDeps(new FakeDb());
  assertEquals((await handleAgentNotify(new Request("https://x", { method: "GET" }), d)).status, 405);
});

// ---------------- 審查後修正（MCC、會員狀態、查詢時切回 none） ----------------

Deno.test("bind：MCC 為 0／000／1000／abc → 400「MCC 格式不正確」，不呼叫 PAYUNi", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, calls } = deps(db, SUCCESS);
  for (const mcc of ["0", "000", "1000", "abc", ""]) {
    const r = await handleBind(d, { accommodation_id: ACC, form: { ...FORM, mer_mcc: mcc } });
    assertEquals(r.status, 400);
    assertEquals(r.body.error, "MCC 格式不正確");
    assertEquals((r.body.errors as Record<string, string>).mer_mcc, "MCC 格式不正確");
  }
  assertEquals(calls.length, 0);
});

Deno.test("規則：MCC 93／94 通過、預設 93；payload MerMCC 為整數", async () => {
  for (const mcc of ["93", "94", "7", "999"]) assertEquals(validateBindForm({ ...FORM, mer_mcc: mcc }).mer_mcc, undefined);
  assertEquals(PAYUNI_DEFAULT_MCC, "93");
  const p = buildBindPayload(FORM, "TEST0001", "https://booking.lakeze.com/testa");
  assertEquals(p.MerMCC, 93);
  assertEquals(typeof p.MerMCC, "number");
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, calls } = deps(db, SUCCESS);
  assertEquals((await handleBind(d, { accommodation_id: ACC, form: FORM })).status, 200);
  assertEquals(calls[0].payload.MerMCC, 93);
});

Deno.test("規則：會員狀態中文對照", () => {
  assertEquals([1, 5, 8, 9, 92, 99].map(memberStatusLabel), ["啟用", "待補資料", "拒絕", "待審核", "審核失敗", "關閉／停權"]);
  assertEquals(memberStatusLabel(null), "—");
});

Deno.test("status query：MerStatus 非 1 且金流為 payuni → 切回 none、providerLog 記 system:status-sync、provider_changed:true", async () => {
  const db = new FakeDb({
    accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 1, payment_provider_active: "payuni" })],
    accommodation_payuni_private: [{ accommodation_id: ACC, payuni_settings: { providerLog: [{ from: "tappay", to: "payuni", by: "u0", at: "t0" }] } }],
  });
  const reply = { ...STATUS_REPLY, data: { ...STATUS_REPLY.data!, MerStatus: "99", Reason: "停權" } };
  const { d } = deps(db, reply);
  const r = await handleStatus(d, { accommodation_id: ACC });
  assertEquals([r.body.provider_changed, r.body.payment_provider_active, r.body.payuni_mer_status], [true, "none", 99]);
  assertEquals(db.rows("accommodation_info")[0].payment_provider_active, "none");
  const priv = db.rows("accommodation_payuni_private")[0];
  assertEquals(priv.payuni_status_reason, "停權");
  const log = priv.payuni_settings.providerLog;
  assertEquals(log.length, 2);
  assertEquals([log[1].from, log[1].to, log[1].by], ["payuni", "none", "system:status-sync"]);
  assert(log[1].at);
});

Deno.test("status query：金流不是 payuni、或狀態仍為 1 → 不切換、provider_changed:false", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payment_provider_active: "tappay" })] });
  const { d } = deps(db, { ...STATUS_REPLY, data: { ...STATUS_REPLY.data!, MerStatus: "2" } });
  const r1 = await handleStatus(d, { accommodation_id: ACC });
  assertEquals([r1.body.provider_changed, db.rows("accommodation_info")[0].payment_provider_active], [false, "tappay"]);
  db.rows("accommodation_info")[0].payment_provider_active = "payuni";
  const { d: d2 } = deps(db, STATUS_REPLY);
  const r2 = await handleStatus(d2, { accommodation_id: ACC });
  assertEquals([r2.body.provider_changed, db.rows("accommodation_info")[0].payment_provider_active], [false, "payuni"]);
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_settings, undefined);
});

// ---------------- 審查後修正第 2 輪（切回 none 規則統一、UBN 遮罩） ----------------

Deno.test("規則：shouldAutoDisablePayuni 只看新狀態 ≠ 1 且金流為 payuni", () => {
  assert(shouldAutoDisablePayuni(99, "payuni"));
  assert(shouldAutoDisablePayuni(null, "payuni"));
  assertFalse(shouldAutoDisablePayuni(1, "payuni"));
  assertFalse(shouldAutoDisablePayuni(99, "tappay"));
  assertFalse(shouldAutoDisablePayuni(99, "none"));
});

Deno.test("notify MerStatus 9→92（前一狀態非 1）且金流為 payuni → 也切回 none、通知總部", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 9, payment_provider_active: "payuni" })] });
  const { d, alerts } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "92", ExecuteTime: "u1" }), d);
  assertEquals(db.rows("accommodation_info")[0].payment_provider_active, "none");
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_settings.providerLog[0].by, "system:agent-notify");
  assertEquals(alerts.length, 1);
});

Deno.test("notify MerStatus 非 1 但金流為 tappay → 不切換、不寫 providerLog、不通知", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 1, payment_provider_active: "tappay" })] });
  const { d, alerts } = notifyDeps(db);
  await handleAgentNotify(await notifyReq({ NotifyType: "MerStatus", MerID: "TEST0001", Status: "99", ExecuteTime: "u2" }), d);
  assertEquals(db.rows("accommodation_info")[0].payment_provider_active, "tappay");
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_settings, undefined);
  assertEquals(alerts.length, 0);
});

Deno.test("status query 切回 none → 通知總部；內容只有館名、MerID、狀態中文、時間、Reason", async () => {
  const db = new FakeDb({
    accommodation_info: [accRow({ payuni_mer_id: "TEST0001", payuni_mer_status: 1, payment_provider_active: "payuni" })],
    accommodation_payuni_private: [{ accommodation_id: ACC, payuni_ubn: "12345678", payuni_member_email: "owner@example.com" }],
  });
  const { d, alerts } = deps(db, { ...STATUS_REPLY, data: { ...STATUS_REPLY.data!, MerStatus: "99", Reason: "停權" } });
  const r = await handleStatus(d, { accommodation_id: ACC });
  assertEquals(r.body.provider_changed, true);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].subject, "[PAYUNi] 測試館A（TEST0001）商店非啟用，線上收款已暫停");
  for (const s of ["館名：測試館A", "MerID：TEST0001", "商店狀態：停用", "時間：", "原因：停權"]) assert(alerts[0].html.includes(s), s);
  for (const s of ["12345678", "owner@example.com"]) assertFalse(alerts[0].html.includes(s), s);
  const { d: d2, alerts: a2 } = deps(db, STATUS_REPLY);
  await handleStatus(d2, { accommodation_id: ACC });
  assertEquals(a2.length, 0);
});

Deno.test("規則：maskUbnForStorage 身分證遮罩、統編原樣；遮罩值送出被擋", () => {
  assertEquals(maskUbnForStorage("A123456789"), "A12*****89");
  assertEquals(maskUbnForStorage("12345678"), "12345678");
  assertEquals(validateBindForm({ ...FORM, ubn: "A12*****89" }).ubn, "請重新輸入完整身分證字號");
});

Deno.test("bind：身分證 UBN → 私密表與 snapshot 都存遮罩，PAYUNi payload 是原文", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, calls } = deps(db, SUCCESS);
  const r = await handleBind(d, { accommodation_id: ACC, form: { ...FORM, ubn: "A123456789", mcid: "" } });
  assertEquals(r.body.ok, true);
  assertEquals(calls[0].payload.UBN, "A123456789");
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_ubn, "A12*****89");
  assertEquals(db.rows("payuni_merchant_applications")[0].request_snapshot.UBN, "A12*****89");
  assertFalse(JSON.stringify(db.tables).includes("A123456789"));
});

Deno.test("bind：8 碼統編 → 兩個落庫位置都是原文", async () => {
  const db = new FakeDb({ accommodation_info: [accRow()] });
  const { d, calls } = deps(db, SUCCESS);
  await handleBind(d, { accommodation_id: ACC, form: FORM });
  assertEquals(calls[0].payload.UBN, "12345678");
  assertEquals(db.rows("accommodation_payuni_private")[0].payuni_ubn, "12345678");
  assertEquals(db.rows("payuni_merchant_applications")[0].request_snapshot.UBN, "12345678");
});

Deno.test("bind：92 重建店送遮罩 UBN → 400「請重新輸入完整身分證字號」，不呼叫 PAYUNi", async () => {
  const db = new FakeDb({ accommodation_info: [accRow({ payuni_mer_id: "TEST0002", payuni_mer_status: 92 })] });
  const { d, calls } = deps(db, SUCCESS);
  const r = await handleBind(d, { accommodation_id: ACC, form: { ...FORM, ubn: "A12*****89" } });
  assertEquals(r.status, 400);
  assertEquals((r.body.errors as Record<string, string>).ubn, "請重新輸入完整身分證字號");
  assertEquals(calls.length, 0);
});
