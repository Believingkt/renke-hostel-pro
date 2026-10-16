// 2b-3：owlting-email-ingest 修改信分支（假 Supabase client＋假 parser，以 Deno.serve 攔截 handler 實際執行）
// 執行：deno test --no-lock --allow-env --allow-read --import-map=test_import_map_ingest.json owltingIngest_test.ts
// 沒有指定 import map 時，ingest 測試自動略過（autoCreatePendingOrder 回歸與 md5 檢查照跑）
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHash } from "node:crypto";
import { FakeDb } from "./owltingIngestTestFakes.ts";
import { autoCreatePendingOrder } from "./owltingAutoOrder.ts";

type Row = Record<string, any>;
const g = globalThis as any;
const mapped = import.meta.resolve("https://esm.sh/@supabase/supabase-js@2.76.1").startsWith("file:");

// ---------------------------------------------------------------- 環境：fetch stub（業主通知、error_logs）
const calls: { url: string; body: any }[] = [];
Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "test-resend-key");
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const raw = init?.body ?? (input instanceof Request ? await input.text() : null);
  let body: any = raw;
  try { body = JSON.parse(String(raw)); } catch { /* keep */ }
  calls.push({ url, body });
  return new Response(null, { status: 201 });
}) as typeof fetch;

let handler: ((req: Request) => Promise<Response>) | null = null;
async function getHandler() {
  if (!handler) {
    (Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve(), shutdown() {} }; };
    await import("../owlting-email-ingest/index.ts");
  }
  return handler!;
}

// ---------------------------------------------------------------- 資料
const OBE = "OBE2026TEST1", ACC = "acc-1", RT_A = "rt-four", RT_B = "rt-double";
const HEADERS = "Received: from mx.owlting.com\nDKIM-Signature: v=1; a=rsa-sha256; d=owlting.com;\n\th=From:To:Subject:Date:Message-ID; bh=abc\nDate: Fri, 16 Oct 2026 10:00:00 +0800\nSubject: x";
const SENT = "2026-10-16T02:00:00.000Z";
const room = (id: string, unit: string | null, price: number, extra: Row = {}): Row => ({
  id, order_id: "o1", room_type_id: RT_A, quantity: 1, room_price: price, room_unit_id: unit,
  template_id: "tpl-a", template_name: "四人房專案", ...extra,
});
const baseOrder = (over: Row = {}): Row => ({
  id: "o1", order_number: "LKZ001", accommodation_id: ACC, room_type_id: RT_A, owlting_reservation_id: OBE,
  check_in_date: "2026-12-10", check_out_date: "2026-12-12", guest_count: 4, total_price: 48000, final_price: 0,
  paid_amount: 48000, payment_status: "paid", order_status: "confirmed", notes: null,
  order_source: "owlting", auto_created_from_email_id: "raw-prev", owlting_sync_state: null, created_at: "2026-10-01T00:00:10Z", ...over,
});
const prevRaw = (over: Row = {}): Row => ({
  id: "raw-prev", obe_number: OBE, accommodation_id: ACC, accommodation_name: "測試館", message_type: "new_order",
  ingest_outcome: "order_created", mail_sent_at: "2026-10-01T00:00:00.000Z", received_at: "2026-10-01T00:00:05.000Z", ...over,
});
function seed(over: { orders?: Row[]; order_rooms?: Row[]; raw?: Row[] } = {}) {
  return new FakeDb({
    owlting_email_orders_raw: over.raw ?? [prevRaw()],
    orders: over.orders ?? [baseOrder()],
    order_rooms: over.order_rooms ?? [room("r1", "u1", 12000), room("r2", "u2", 12000), room("r3", "u3", 11000), room("r4", "u4", 13000)],
    room_types: [{ id: RT_A, name: "四人房", accommodation_id: ACC }, { id: RT_B, name: "雙人房", accommodation_id: ACC }],
    room_units: Array.from({ length: 6 }, (_, k) => ({ id: `u${k + 1}`, unit_number: `40${k + 1}`, room_type_id: RT_A, is_active: true })),
    pricing_templates: [],
  });
}
const parsed = (over: Row = {}): Row => ({
  message_type: "modified", obe_number: OBE, accommodation_name: "測試館", channel_source: "Booking.com",
  check_in_date: "2026-12-20", check_out_date: "2026-12-22", room_type_name: "四人房", project_name: null,
  room_quantity: 4, guest_count: 4, adult_count: null, child_count: null, nights: 2, total_amount: 48000,
  remaining_amount: null, currency: "TWD", payment_status: null, guest_name: null, special_requests: null,
  guest_phone: null, guest_email: null, pii_masked: false, addons: null, confidence: "low", warnings: [], raw_matches: {},
  modification_changes: [{ field: "check_in_date", label: "入住日期", before: "2026-12-10", after: "2026-12-20" }],
  is_noop_modification: false, modification_diff_status: "compared", ...over,
});

async function ingest(db: FakeDb, fields: Row, headers: string | null = HEADERS) {
  g.__ingestFakeDb = db;
  g.__ingestFakeParsed = fields;
  calls.length = 0;
  const fd = new FormData();
  fd.set("from", "OwlNest <noreply@owlting.com>");
  fd.set("to", "owlting@lakeze.com");
  fd.set("subject", `【修改通知】${OBE} 來自 測試館 的訂單`);
  fd.set("text", "body");
  fd.set("envelope", JSON.stringify({ from: "noreply@owlting.com", to: ["owlting@lakeze.com"] }));
  if (headers !== null) fd.set("headers", headers);
  const h = await getHandler();
  const res = await h(new Request("http://fake.local/functions/v1/owlting-email-ingest", { method: "POST", body: fd }));
  const json = await res.json();
  const raw = db.rows("owlting_email_orders_raw").find((r) => r.id === json.id)!;
  const staging = db.rows("owlting_email_parsed_staging").find((r) => r.raw_email_id === json.id)!;
  return {
    raw, staging,
    notified: calls.filter((c) => c.url.includes("/functions/v1/owlting-change-notify")).length,
    logs: calls.filter((c) => c.url.includes("/rest/v1/error_logs")).map((c) => c.body),
    staleQueries: db.reads.filter((r) => r.table === "owlting_email_orders_raw" && r.filters.some(([o, c]) => o === "in" && c === "ingest_outcome")).length,
    applyRpc: db.rpcCalls.filter((c) => c.name === "apply_ota_modification_v1"),
    syncRpc: db.rpcCalls.filter((c) => c.name === "sync_order_rooms_v1"),
    orderInserts: db.writes.filter((w) => w.table === "orders" && w.op === "insert"),
  };
}
const t = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !mapped, fn });

// ---------------------------------------------------------------- 修改信分支
t("成功 → order_updated，業主通知；raw insert 寫入 mail_sent_at（行首 Date，DKIM h= 不誤判）", async () => {
  const r = await ingest(seed(), parsed());
  assertEquals(r.raw.mail_sent_at, SENT);
  assertEquals(r.raw.ingest_outcome, "order_updated");
  assertEquals(r.raw.ingest_outcome_detail.order_number, "LKZ001");
  assertEquals(r.applyRpc.length, 1);
  assertEquals(r.applyRpc[0].args.p_patch.check_in_date, "2026-12-20");
  assertEquals(r.staleQueries, 1);
  assertEquals(r.notified, 1);
  assertEquals(r.staging.auto_create_error, null);
});

t("headers 解析不到 → mail_sent_at 寫 null（沒有 headers／沒有行首 Date）", async () => {
  assertEquals((await ingest(seed(), parsed(), null)).raw.mail_sent_at, null);
  assertEquals((await ingest(seed(), parsed(), "DKIM-Signature: v=1; h=from:date;\n\tb=x\nSubject: s")).raw.mail_sent_at, null);
});

t("no_material_change → noop_modification（db_compare），業主通知照寄", async () => {
  const r = await ingest(seed(), parsed({ check_in_date: "2026-12-10", check_out_date: "2026-12-12" }));
  assertEquals(r.raw.ingest_outcome, "noop_modification");
  assertEquals(r.raw.ingest_outcome_detail.verified_by, "db_compare");
  assertEquals(r.applyRpc.length, 0);
  assertEquals(r.notified, 1);
});

t("舊信（mail_sent_at 較舊）→ stale_ignored，不套用、不通知業主，staging=stale_ignored，告警", async () => {
  const db = seed({ raw: [prevRaw(), prevRaw({ id: "raw-newer", message_type: "modified", ingest_outcome: "order_updated", mail_sent_at: "2026-10-16T03:00:00.000Z", received_at: "2026-10-16T03:00:02.000Z" })] });
  const r = await ingest(db, parsed());
  assertEquals(r.raw.ingest_outcome, "stale_ignored");
  assertEquals(r.raw.ingest_outcome_detail.reason_code, "stale_ignored");
  assertEquals(r.raw.ingest_outcome_detail.mail_sent_at, SENT);
  assertEquals(r.applyRpc.length, 0);
  assertEquals(r.notified, 0);
  assertEquals(r.staging.auto_create_error, "stale_ignored");
  assertEquals(r.staging.review_status, "pending_review");
  assertStringIncludes(r.staging.review_notes, "[需人工] 未套用，需人工處理｜原因代碼：stale_ignored｜OBE：OBE2026TEST1");
  assertEquals(r.logs.length, 1);
  assertEquals(r.logs[0].category, "owlting_modify_rooms");
  assertEquals(r.logs[0].step, "stale_ignored");
});

t("舊信（本封沒有 mail_sent_at）→ 改比 received_at，對方較新 → stale_ignored", async () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const db = seed({ raw: [prevRaw(), prevRaw({ id: "raw-newer", message_type: "modified", ingest_outcome: "noop_modification", mail_sent_at: SENT, received_at: future })] });
  const r = await ingest(db, parsed(), null);
  assertEquals(r.raw.ingest_outcome, "stale_ignored");
  assertEquals(r.notified, 0);
});

t("寄送時間相同、或較新的信不是已套用結果 → 不算舊信，照常套用", async () => {
  const same = seed({ raw: [prevRaw(), prevRaw({ id: "raw-same", message_type: "modified", ingest_outcome: "order_updated", mail_sent_at: SENT })] });
  assertEquals((await ingest(same, parsed())).raw.ingest_outcome, "order_updated");
  const failed = seed({ raw: [prevRaw(), prevRaw({ id: "raw-f", message_type: "modified", ingest_outcome: "apply_failed", mail_sent_at: "2026-10-17T00:00:00.000Z" })] });
  assertEquals((await ingest(failed, parsed())).raw.ingest_outcome, "order_updated");
});

t("stale_check_failed → modify_blocked，staging=modify_blocked:stale_check_failed，業主通知照寄", async () => {
  const db = seed();
  db.selectError = (q) => q.table === "owlting_email_orders_raw" && q.filters.some(([o, c]) => o === "in" && c === "ingest_outcome") ? "boom" : null;
  const r = await ingest(db, parsed());
  assertEquals(r.raw.ingest_outcome, "modify_blocked");
  assertEquals(r.raw.ingest_outcome_detail.reason_code, "stale_check_failed");
  assertEquals(r.raw.ingest_outcome_detail.error, "boom");
  assertEquals(r.staging.auto_create_error, "modify_blocked:stale_check_failed");
  assertEquals(r.applyRpc.length, 0);
  assertEquals(r.notified, 1);
  assertEquals(r.logs[0].step, "stale_check_failed");
});

t("modify_blocked（各種原因代碼）→ modify_blocked＋reason_code，staging 保留 modify_blocked:<代碼>，業主通知照寄", async () => {
  const cases: [string, () => FakeDb, Row][] = [
    ["room_type_unmatched", () => seed(), { room_type_name: "套房" }],
    ["multiple_active_orders", () => seed({ orders: [baseOrder(), baseOrder({ id: "o2", order_number: "LKZ002" })] }), {}],
    ["order_checked_in", () => seed({ orders: [baseOrder({ order_status: "checked_in" })] }), {}],
    ["no_existing_rooms", () => seed({ order_rooms: [] }), {}],
    ["quantity_out_of_range", () => seed(), { room_quantity: 21 }],
    ["unreliable_diff", () => seed(), { modification_diff_status: "partial", is_noop_modification: null }],
  ];
  for (const [code, mk, over] of cases) {
    const r = await ingest(mk(), parsed(over));
    assertEquals(r.raw.ingest_outcome, "modify_blocked", code);
    assertEquals(r.raw.ingest_outcome_detail.reason_code, code);
    assertEquals(r.staging.auto_create_error, `modify_blocked:${code}`);
    assertEquals(r.applyRpc.length, 0, code);
    assertEquals(r.notified, 1, code);
  }
});

t("各種 error_reason → apply_failed，detail 帶 error_reason，業主通知照寄", async () => {
  const cases: [Row, string][] = [
    [{ message: "Inventory exceeded" }, "inventory_exceeded"],
    [{ message: "備品不足" }, "amenity_exceeded"],
    [{ message: "duplicate key", code: "23505" }, "double_submit"],
    [{ message: "ORDER_CHANGED: x", code: "P0001" }, "order_changed"],
    [{ message: "boom" }, "unknown"],
  ];
  for (const [err, reason] of cases) {
    const db = seed();
    db.rpcImpl = (n) => n === "apply_ota_modification_v1" ? { data: null, error: err } : { data: {}, error: null };
    const r = await ingest(db, parsed());
    assertEquals(r.raw.ingest_outcome, "apply_failed", reason);
    assertEquals(r.raw.ingest_outcome_detail.error_reason, reason);
    assertEquals(r.raw.ingest_outcome_detail.reason, `${reason}: ${err.message}`);
    assertEquals(r.staging.auto_create_error, `${reason}: ${err.message}`);
    assertEquals(r.notified, 1);
  }
});

t("order_not_found（自己推出去的回信）→ 維持現行：noop_modification（self_push_no_local_order），不建單", async () => {
  const r = await ingest(seed({ orders: [] }), parsed({ channel_source: "人客多" }));
  assertEquals(r.raw.ingest_outcome, "noop_modification");
  assertEquals(r.raw.ingest_outcome_detail.reason, "self_push_no_local_order");
  assertEquals(r.orderInserts.length, 0);
});

t("order_not_found（有館別）→ 維持現行：自動建單 order_created（modification_fallback_create）", async () => {
  const r = await ingest(seed({ orders: [] }), parsed({ room_quantity: 2 }));
  assertEquals(r.raw.ingest_outcome, "order_created");
  assertEquals(r.raw.ingest_outcome_detail.via, "modification_fallback_create");
  assertEquals(r.orderInserts.length, 1);
  assertEquals(r.syncRpc.length, 1);
  assertEquals(r.syncRpc[0].args.p_rooms.map((x: Row) => x.id), [null, null]);
  assertEquals(r.notified, 1);
});

t("PMS 回音信（ownerBlocksAuto）→ 維持現行：pms_echo_*，不做舊信判斷、不套用、不通知業主", async () => {
  const pmsOrder = baseOrder({ order_source: "direct", auto_created_from_email_id: null, owlting_sync_state: { last_action: "push" } });
  const r = await ingest(seed({ orders: [pmsOrder] }), parsed({ check_in_date: "2026-12-10", check_out_date: "2026-12-12" }));
  assert(["pms_echo_ignored", "pms_echo_mismatch"].includes(r.raw.ingest_outcome), r.raw.ingest_outcome);
  assertEquals(r.staleQueries, 0);
  assertEquals(r.applyRpc.length, 0);
  assertEquals(r.notified, 0);
});

// ---------------------------------------------------------------- 第 8 節 2b-3：autoCreatePendingOrder 回歸
Deno.test("autoCreatePendingOrder 回歸①：送進 sync_order_rooms_v1 的是 id:null 的 N 列", async () => {
  const db = new FakeDb({
    orders: [], room_types: [{ id: RT_A, name: "四人房", accommodation_id: ACC }],
    room_units: Array.from({ length: 4 }, (_, k) => ({ id: `u${k + 1}`, unit_number: `40${k + 1}`, room_type_id: RT_A, is_active: true })),
    order_rooms: [], pricing_templates: [],
  });
  const res = await autoCreatePendingOrder(db.client(), {
    raw_email_id: "raw-1", staging_id: "stg-1", accommodation_id: ACC, obe_number: "OBE-NEW", channel_source: "Agoda",
    room_type_name: "四人房", room_quantity: 3, check_in_date: "2026-12-01", check_out_date: "2026-12-03", guest_count: 6, total_amount: 30000,
  });
  assertEquals(res.ok, true);
  assertEquals(db.rpcCalls.length, 1);
  assertEquals(db.rpcCalls[0].name, "sync_order_rooms_v1");
  assertEquals(db.rpcCalls[0].args.p_expected_updated_at, null);
  assertEquals(db.rpcCalls[0].args.p_rooms.map((r: Row) => [r.id, r.room_price, r.room_unit_id]), [[null, 10000, "u1"], [null, 10000, "u2"], [null, 10000, "u3"]]);
});

Deno.test("autoCreatePendingOrder 回歸②：第 3 節五個函式全文 md5 與 fc59fa2 相同（resolveRoomTemplate 去掉 export 後相同）", async () => {
  const src = (await Deno.readTextFile(new URL("./owltingAutoOrder.ts", import.meta.url))).split("\n");
  const fn = (name: string) => {
    const i = src.findIndex((l) => new RegExp(`^(export )?async function ${name}\\(`).test(l));
    const j = src.findIndex((l, k) => k > i && l === "}");
    return src.slice(i, j + 1).join("\n") + "\n";
  };
  const md5 = (s: string) => createHash("md5").update(s).digest("hex");
  const expected: Record<string, string> = {
    rebuildOrderRooms: "210da40cd923734dd6d3714718460ed4",
    autoCreatePendingOrder: "e6b1e9811155b646add453d3aac2d1f6",
    markRebuildFailure: "20e95450129adc8ed3c24b3e5e261572",
    matchRoomTypeByName: "e0da3f13c2437b75e0a8bc5f2acea83b",
    resolveRoomTemplate: "3938ca77ebf1400c49b96c5c38db1171",
  };
  for (const [name, want] of Object.entries(expected)) {
    let body = fn(name);
    if (name === "resolveRoomTemplate") {
      assert(body.startsWith("export async function resolveRoomTemplate("));
      body = body.replace(/^export /, "");
    }
    assertEquals(md5(body), want, name);
  }
});
