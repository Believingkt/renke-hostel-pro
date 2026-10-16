// 2b-2：OTA 修改信只改差異 — 純函式與 applyModificationToExistingOrder（假 admin）測試
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOtaRooms, classifyApplyError, formatNotApplied, formatRoomWarnings, isStaleMail, matchRoomTypeForModification,
  MAX_OTA_ROOMS, parseMailSentAt, planOtaModification, type ExistingRoom, type PlanMail, type PlanOrder,
} from "./syncOtaOrderRooms.ts";
import { applyModificationToExistingOrder, type ApplyModificationResult } from "./owltingAutoOrder.ts";

type Row = Record<string, any>;

// ---------------------------------------------------------------- 假 admin
interface Fx {
  orders: Row[]; order_rooms: Row[]; room_types: Row[]; room_units: Row[]; busy?: Row[]; pricing_templates?: Row[];
  rpc?: (args: Row) => { data: any; error: any };
}
function fakeAdmin(fx: Fx) {
  const writes: { table: string; patch: Row; filters: [string, string, unknown][] }[] = [];
  const reads: string[] = [];
  const rpcCalls: { name: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = [];
    let op: "select" | "update" = "select";
    let patch: Row = {};
    let usedIn = false;
    const exec = () => {
      if (op === "update") { writes.push({ table, patch, filters: [...filters] }); return { data: null, error: null }; }
      reads.push(table);
      if (table === "order_rooms" && usedIn) return { data: fx.busy ?? [], error: null };
      const src = (fx as any)[table] ?? [];
      const rows = src.filter((r: Row) => filters.every(([k, c, v]) =>
        c.includes(".") ? true : k === "eq" ? r[c] === v : k === "neq" ? r[c] !== v : true));
      return { data: rows, error: null };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b, lt: () => b, gt: () => b,
      eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return b; },
      neq: (c: string, v: unknown) => { filters.push(["neq", c, v]); return b; },
      in: () => { usedIn = true; return b; },
      update: (p: Row) => { op = "update"; patch = p; return b; },
      then: (ok: any, ng: any) => Promise.resolve(exec()).then(ok, ng),
    };
    return b;
  };
  const rpc = (name: string, args: Row) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(fx.rpc ? fx.rpc(args) : { data: { ok: true, order_updated: 1, synced: args.p_sync_rooms, conflicts: [] }, error: null });
  };
  return { admin: { from, rpc }, writes, reads, rpcCalls };
}

// reportBackendError → error_logs（以 fetch stub 攔截）；sendOrderRoomsAlertEmail → 會去讀 alert_recipients
const errorLogs: Row[] = [];
Deno.env.set("SUPABASE_URL", "http://fake.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("RESEND_API_KEY", "test-resend-key");
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/rest/v1/error_logs")) {
    const body = init?.body ?? (input instanceof Request ? await input.text() : null);
    errorLogs.push(JSON.parse(String(body)));
  }
  return new Response(null, { status: 201 });
}) as typeof fetch;

// ---------------------------------------------------------------- 資料
const ACC = "acc-1", RT_A = "rt-four", RT_B = "rt-double";
const unitsA = Array.from({ length: 8 }, (_, k) => ({ id: `u${k + 1}`, unit_number: `40${k + 1}`, room_type_id: RT_A, is_active: true }));
const unitsB = Array.from({ length: 3 }, (_, k) => ({ id: `w${k + 1}`, unit_number: `20${k + 1}`, room_type_id: RT_B, is_active: true }));
const baseOrder = (): Row => ({
  id: "o1", order_number: "LKZ001", accommodation_id: ACC, room_type_id: RT_A, owlting_reservation_id: "OBE1",
  check_in_date: "2026-12-10", check_out_date: "2026-12-12", guest_count: 4, total_price: 48000, final_price: 0,
  paid_amount: 48000, payment_status: "paid", order_status: "confirmed", notes: null,
});
const room = (id: string, unit: string | null, price: number, extra: Row = {}): Row => ({
  id, order_id: "o1", room_type_id: RT_A, quantity: 1, room_price: price, room_unit_id: unit,
  template_id: "tpl-a", template_name: "四人房專案", ...extra,
});
const baseRows = () => [room("r1", "u1", 12000), room("r2", "u2", 12000), room("r3", "u3", 11000), room("r4", "u4", 13000)];
const roomTypes = [{ id: RT_A, name: "四人房", accommodation_id: ACC }, { id: RT_B, name: "雙人房", accommodation_id: ACC }];
const baseInput = (over: Row = {}) => ({
  staging_id: "stg-1", obe_number: "OBE1", accommodation_id: ACC, room_type_name: "四人房", room_quantity: 4,
  check_in_date: "2026-12-10", check_out_date: "2026-12-12", guest_count: 4, total_amount: 48000,
  change_summary: null, parser_diff_status: "compared", ...over,
});
function fx(over: Partial<Fx> = {}): Fx {
  return { orders: [baseOrder()], order_rooms: baseRows(), room_types: roomTypes, room_units: [...unitsA, ...unitsB],
    pricing_templates: [{ id: "tpl-b", template_name: "雙人房專案", room_type_id: RT_B, room_type_ids: [RT_B], accommodation_id: ACC }],
    ...over };
}
async function run(f: Fx, input: Row) {
  const a = fakeAdmin(f);
  errorLogs.length = 0;
  const res = await applyModificationToExistingOrder(a.admin, input as any);
  const staging = a.writes.filter((w) => w.table === "owlting_email_parsed_staging");
  return { res, ...a, staging, logs: [...errorLogs], alertMails: a.reads.filter((t) => t === "alert_recipients").length };
}
const rpcArgs = (r: Awaited<ReturnType<typeof run>>) => {
  assertEquals(r.rpcCalls.length, 1);
  assertEquals(r.rpcCalls[0].name, "apply_ota_modification_v1");
  return r.rpcCalls[0].args;
};
const keptRow = (r: Row) => ({ id: r.id, room_type_id: r.room_type_id, quantity: 1, room_price: r.room_price,
  room_unit_id: r.room_unit_id, template_id: r.template_id, template_name: r.template_name });

// ---------------------------------------------------------------- 舊版 ingest（fc59fa2 = 現行 index.ts 第 491–575 行）分支對照
function oldIngest(modRes: ApplyModificationResult, ctx: { isSelfPush: boolean; resolvedAccId: string | null }) {
  let outcome: string; let reason: string | null = null;
  if (!modRes.ok && modRes.skipped_reason === "order_not_found" && ctx.isSelfPush) { outcome = "noop_modification"; reason = "self_push_no_local_order"; }
  else if (!modRes.ok && modRes.skipped_reason === "order_not_found" && ctx.resolvedAccId) { outcome = "order_created|apply_failed (autoCreatePendingOrder 結果)"; }
  else if (!modRes.ok) { outcome = "apply_failed"; reason = modRes.skipped_reason ?? modRes.error ?? "modification_apply_failed"; }
  else if (modRes.skipped_reason === "no_material_change") outcome = "noop_modification";
  else outcome = "order_updated";
  // 業主通知條件不看 modRes：stagingRow && resolvedAccId && !isNoopModification && !ownerBlocksAuto && modified
  const ownerNotified = !!ctx.resolvedAccId;
  return { outcome, reason, ownerNotified };
}

Deno.test("舊版 ingest 原文：分支與業主通知條件與 oldIngest 對照一致（原始碼檢查）", async () => {
  const src = await Deno.readTextFile(new URL("../owlting-email-ingest/index.ts", import.meta.url));
  for (const s of [
    `if (!modRes.ok && modRes.skipped_reason === "order_not_found" && isSelfPushMod) {`,
    `} else if (!modRes.ok && modRes.skipped_reason === "order_not_found" && resolvedAccId) {`,
    `} else if (!modRes.ok) {`,
    `reason: modRes.skipped_reason ?? modRes.error ?? "modification_apply_failed",`,
    `} else if (modRes.skipped_reason === "no_material_change") {`,
    `await recordOutcome(supabase, inserted.id, "order_updated", {`,
  ]) assertStringIncludes(src, s);
  const notify = src.slice(src.indexOf("// Auto-notify owners on cancel/modify"), src.indexOf("functions/v1/owlting-change-notify"));
  assert(notify.length > 0);
  assert(!notify.includes("modRes"), "業主通知條件不得依賴 modRes");
  assertStringIncludes(notify, "resolvedAccId &&");
});

Deno.test("ingest 對照：order_not_found", async () => {
  const r = await run(fx({ orders: [] }), baseInput());
  assertEquals(r.res, { ok: false, skipped_reason: "order_not_found" });
  assertEquals(r.rpcCalls.length, 0);
  assertEquals(oldIngest(r.res, { isSelfPush: true, resolvedAccId: ACC }).outcome, "noop_modification");
  assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: ACC }).outcome, "order_created|apply_failed (autoCreatePendingOrder 結果)");
  assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: null }), { outcome: "apply_failed", reason: "order_not_found", ownerNotified: false });
});

Deno.test("ingest 對照：no_material_change → noop_modification，業主通知照寄", async () => {
  const r = await run(fx(), baseInput());
  assertEquals(r.res.ok, true);
  assertEquals(r.res.skipped_reason, "no_material_change");
  assertEquals(r.rpcCalls.length, 0);
  assertEquals(r.staging[0].patch.review_notes, "[auto-update] 與既有訂單 LKZ001 逐欄比對後無差異，未更新。");
  assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: ACC }), { outcome: "noop_modification", reason: null, ownerNotified: true });
});

Deno.test("ingest 對照：modify_blocked → 暫記 apply_failed（reason=modify_blocked），業主通知照寄", async () => {
  const r = await run(fx(), baseInput({ room_type_name: "套房" }));
  assertEquals(r.res.skipped_reason, "modify_blocked");
  assertEquals(r.res.blocked_code, "room_type_unmatched");
  assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: ACC }), { outcome: "apply_failed", reason: "modify_blocked", ownerNotified: true });
});

Deno.test("ingest 對照：各種 error_reason → apply_failed（reason=錯誤字串），業主通知照寄", async () => {
  const cases: [Row, string][] = [
    [{ message: "Inventory exceeded for room type" }, "inventory_exceeded"],
    [{ message: "Room not available on 2026-12-20" }, "inventory_exceeded"],
    [{ message: "備品數量不足" }, "amenity_exceeded"],
    [{ message: "duplicate key value", code: "23505" }, "double_submit"],
    [{ message: "ORDER_CHANGED: 訂單在比對後已被修改或不存在", code: "P0001" }, "order_changed"],
    [{ message: "something odd" }, "unknown"],
  ];
  for (const [err, reason] of cases) {
    const r = await run(fx({ rpc: () => ({ data: null, error: err }) }), baseInput({ check_in_date: "2026-12-20", check_out_date: "2026-12-22" }));
    assertEquals(r.res.ok, false);
    assertEquals(r.res.error_reason, reason);
    assertEquals(r.res.error, `${reason}: ${err.message}`);
    assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: ACC }), { outcome: "apply_failed", reason: `${reason}: ${err.message}`, ownerNotified: true });
  }
});

Deno.test("ingest 對照：成功 → order_updated，業主通知照寄", async () => {
  const r = await run(fx(), baseInput({ guest_count: 5 }));
  assertEquals(r.res.ok, true);
  assertEquals(r.res.skipped_reason, undefined);
  assertEquals(oldIngest(r.res, { isSelfPush: false, resolvedAccId: ACC }), { outcome: "order_updated", reason: null, ownerNotified: true });
});

// ---------------------------------------------------------------- 第 9 節情境表
Deno.test("§9 只改日期：原樣送入 sync，房號／房價／template／id 不變", async () => {
  const r = await run(fx(), baseInput({ check_in_date: "2026-12-20", check_out_date: "2026-12-22" }));
  const a = rpcArgs(r);
  assertEquals(a.p_sync_rooms, true);
  assertEquals(a.p_rooms, baseRows().map(keptRow));
  assertEquals(a.p_patch.check_in_date, "2026-12-20");
  assertEquals(a.p_patch.check_out_date, "2026-12-22");
  assert(!("total_price" in a.p_patch) && !("room_type_id" in a.p_patch));
  assertEquals(a.p_source, "owlting_email_modify");
  assertEquals(a.p_actor_label, "OwlTing 修改通知");
  assertEquals(r.res.ok, true);
  assertEquals(r.res.updated_fields, ["入住日期", "退房日期"]);
  assertEquals(r.logs.length, 0);
});

Deno.test("§9 p_expect 一律為資料庫原值（total_price 原樣 integer）", async () => {
  const o = { ...baseOrder(), total_price: 48000, room_type_id: null };
  const r = await run(fx({ orders: [o] }), baseInput({ check_in_date: "2026-12-20", check_out_date: "2026-12-22" }));
  const e = rpcArgs(r).p_expect;
  assertEquals(e, { check_in_date: "2026-12-10", check_out_date: "2026-12-12", room_type_id: null, total_price: 48000, order_status: "confirmed" });
  assert(Number.isInteger(e.total_price));
  assertEquals(JSON.stringify(e.total_price), "48000");
});

Deno.test("§9 日期改、原房號被佔用：訂單照改、告警列出佔用訂單", async () => {
  const conflicts = [{ order_room_id: "r2", room_type_id: RT_A, room_unit_id: "u2", reason: "unit_conflict", conflict_order_number: "LKZ999" }];
  const r = await run(fx({ rpc: () => ({ data: { ok: true, order_updated: 1, synced: true, conflicts }, error: null }) }),
    baseInput({ check_in_date: "2026-12-20", check_out_date: "2026-12-22" }));
  assertEquals(r.res.ok, true);
  const expected = "訂單 LKZ001 已更新，但以下 1 間未分配房號，請到訂單詳情手動安排：四人房（原指定 402，已被 LKZ999 佔用）";
  assertEquals(r.logs.length, 1);
  assertEquals(r.logs[0].category, "owlting_modify_rooms");
  assertEquals(r.logs[0].step, "post_apply_warning");
  assertEquals(r.logs[0].error_message, expected);
  assertEquals(r.alertMails, 1);
  assertStringIncludes(r.staging.at(-1)!.patch.review_notes, expected);
  assertEquals(r.staging.at(-1)!.patch.auto_create_error, null);
});

Deno.test("§9 日期改、庫存不足／備品不足：整筆回滾 → apply_failed，告警", async () => {
  for (const [msg, reason] of [["Inventory exceeded", "inventory_exceeded"], ["備品不足：浴巾", "amenity_exceeded"]]) {
    const r = await run(fx({ rpc: () => ({ data: null, error: { message: msg } }) }), baseInput({ check_in_date: "2026-12-20", check_out_date: "2026-12-22" }));
    assertEquals(r.res.error_reason, reason);
    assertEquals(r.staging.length, 1);
    assertEquals(r.staging[0].patch.auto_create_error, `${reason}: ${msg}`);
    assertEquals(r.staging[0].patch.review_status, "pending_review");
    assertStringIncludes(r.staging[0].patch.review_notes, "整筆回滾，訂單未變更");
    assertEquals(r.logs[0].category, "owlting_modify_rooms");
    assertEquals(r.logs[0].step, "apply_ota_modification_v1");
    assertEquals(r.alertMails, 1);
  }
});

Deno.test("§9 間數增加：保留舊列、新增差額（平均房價、挑空房號、沿用 template）", async () => {
  const r = await run(fx({ busy: [{ room_unit_id: "u5" }] }), baseInput({ room_quantity: 6, total_amount: 72000 }));
  const a = rpcArgs(r);
  assertEquals(a.p_sync_rooms, true);
  assertEquals(a.p_rooms.slice(0, 4), baseRows().map(keptRow));
  assertEquals(a.p_rooms.slice(4), [
    { id: null, room_type_id: RT_A, quantity: 1, room_price: 12000, room_unit_id: "u6", template_id: "tpl-a", template_name: "四人房專案" },
    { id: null, room_type_id: RT_A, quantity: 1, room_price: 12000, room_unit_id: "u7", template_id: "tpl-a", template_name: "四人房專案" },
  ]);
  assertEquals(a.p_patch.total_price, 72000);
  assertEquals(a.p_patch.final_price, 72000);
  assertEquals(a.p_patch.paid_amount, 72000);
});

Deno.test("§9 間數減少：先刪無房號，再從房號最後一間刪", async () => {
  const rows = [room("r1", "u1", 12000), room("r2", "u3", 12000), room("r3", null, 12000), room("r4", "u2", 12000)];
  const r = await run(fx({ order_rooms: rows }), baseInput({ room_quantity: 2, total_amount: 24000 }));
  assertEquals(rpcArgs(r).p_rooms.map((x: Row) => x.id), ["r1", "r4"]);
});

// resolveRoomTemplate 只參考本訂單「同房型」既有列的方案名稱；整單換房型時新房型沒有既有列 → 解析結果為 null（與現行 rebuild 相同）
Deno.test("§9 房型變更：舊列移除、依新房型建立、template 重新解析（新房型無既有列 → null）", async () => {
  const r = await run(fx({ busy: [{ room_unit_id: "w1" }] }), baseInput({ room_type_name: "雙人房", room_quantity: 2, total_amount: 9001 }));
  const a = rpcArgs(r);
  assertEquals(a.p_patch.room_type_id, RT_B);
  assert(r.reads.includes("pricing_templates"));
  assertEquals(a.p_rooms, [
    { id: null, room_type_id: RT_B, quantity: 1, room_price: 4501, room_unit_id: "w2", template_id: null, template_name: null },
    { id: null, room_type_id: RT_B, quantity: 1, room_price: 4501, room_unit_id: "w3", template_id: null, template_name: null },
  ]);
});

Deno.test("§9 只改人數：只更新 orders（p_sync_rooms=false）", async () => {
  const a = rpcArgs(await run(fx(), baseInput({ guest_count: 6 })));
  assertEquals(a.p_sync_rooms, false);
  assertEquals(a.p_rooms, []);
  assertEquals(Object.keys(a.p_patch).sort(), ["guest_count", "notes"]);
});

Deno.test("§9 只改金額：比 total_price（final_price=0 不影響），只更新 orders", async () => {
  const same = await run(fx(), baseInput({ total_amount: 48000 }));
  assertEquals(same.res.skipped_reason, "no_material_change");
  const a = rpcArgs(await run(fx(), baseInput({ total_amount: 50000 })));
  assertEquals(a.p_sync_rooms, false);
  assertEquals(a.p_patch.total_price, 50000);
  assertEquals(a.p_patch.final_price, 50000);
  assertEquals(a.p_patch.paid_amount, 50000);
  const unpaid = { ...baseOrder(), payment_status: "unpaid" };
  const b = rpcArgs(await run(fx({ orders: [unpaid] }), baseInput({ total_amount: 50000 })));
  assert(!("paid_amount" in b.p_patch));
});

Deno.test("§9 金額 0／金額空白：不改任何金額欄位", async () => {
  for (const amt of [0, null]) {
    const n = await run(fx(), baseInput({ total_amount: amt }));
    assertEquals(n.res.skipped_reason, "no_material_change");
    const a = rpcArgs(await run(fx(), baseInput({ total_amount: amt, guest_count: 5 })));
    for (const k of ["total_price", "final_price", "paid_amount"]) assert(!(k in a.p_patch), k);
  }
});

Deno.test("§9 間數或房型改、金額 0 或空白：明細照改、金額不動、告警請人工核對", async () => {
  for (const amt of [0, null]) {
    const r = await run(fx(), baseInput({ room_quantity: 5, total_amount: amt }));
    const a = rpcArgs(r);
    assertEquals(a.p_rooms.length, 5);
    assert(!("total_price" in a.p_patch));
    assertEquals(r.logs.length, 1);
    assertEquals(r.logs[0].error_message, "訂單 LKZ001 間數或房型已變更，但信件金額為 0 或空白，總金額未更新，請人工核對");
    const t = rpcArgs(await run(fx(), baseInput({ room_type_name: "雙人房", room_quantity: 2, total_amount: amt })));
    assertEquals(t.p_rooms.map((x: Row) => x.room_price), [12000, 12000]);
    assert(!("total_price" in t.p_patch));
  }
});

Deno.test("§9 舊信晚到：isStaleMail 判為舊信（ingest 接線屬 2b-3）", () => {
  assert(isStaleMail({ mail_sent_at: "2026-10-01T01:00:00Z", received_at: "2026-10-01T05:00:00Z" },
    [{ mail_sent_at: "2026-10-01T02:00:00Z", received_at: "2026-10-01T03:00:00Z" }]));
});

Deno.test("§9 同一封重複：時間相同不算舊信，內容相同 → noop", async () => {
  const t = { mail_sent_at: "2026-10-01T01:00:00Z", received_at: "2026-10-01T01:00:05Z" };
  assertEquals(isStaleMail(t, [{ ...t }]), false);
  assertEquals((await run(fx(), baseInput())).res.skipped_reason, "no_material_change");
});

Deno.test("§9 第 4 節各種擋下：modify_blocked，不呼叫 RPC，寫 staging 與告警", async () => {
  const cases: [string, Partial<Fx>, Row][] = [
    ["multiple_active_orders", { orders: [baseOrder(), { ...baseOrder(), id: "o2" }] }, {}],
    ["order_checked_in", { orders: [{ ...baseOrder(), order_status: "checked_in" }] }, {}],
    ["order_checked_out", { orders: [{ ...baseOrder(), order_status: "checked_out" }] }, {}],
    ["no_existing_rooms", { order_rooms: [] }, {}],
    ["multi_room_type_rows", { order_rooms: [room("r1", "u1", 1), room("r2", "w1", 1, { room_type_id: RT_B })] }, {}],
    ["non_unit_quantity_rows", { order_rooms: [room("r1", "u1", 1, { quantity: 2 })] }, {}],
    ["order_room_type_mismatch", { orders: [{ ...baseOrder(), room_type_id: RT_B }] }, {}],
    ["room_type_unmatched", {}, { room_type_name: "套房" }],
    ["room_type_ambiguous", { room_types: [...roomTypes, { id: "rt-x", name: "四人房（含早）", accommodation_id: ACC }] }, { room_type_name: "四人" }],
    ["unreliable_diff", {}, { parser_diff_status: "partial", check_in_date: "2026-12-20" }],
    ["quantity_out_of_range", {}, { room_quantity: 21 }],
  ];
  for (const [code, f, inp] of cases) {
    const r = await run(fx(f), baseInput(inp));
    assertEquals(r.res.skipped_reason, "modify_blocked", code);
    assertEquals(r.res.blocked_code, code);
    assertEquals(r.rpcCalls.length, 0, code);
    assertEquals(r.staging.length, 1);
    assertEquals(r.staging[0].patch.auto_create_error, `modify_blocked:${code}`);
    assertEquals(r.staging[0].patch.review_status, "pending_review");
    assertEquals(r.staging[0].patch.review_notes, `[需人工] 未套用，需人工處理｜原因代碼：${code}｜OBE：OBE1｜訂單：LKZ001｜信件修改內容：（無法取得）`);
    assertEquals(r.logs.length, 1);
    assertEquals(r.logs[0].category, "owlting_modify_rooms");
    assertEquals(r.logs[0].step, "modify_blocked");
    assertEquals(r.alertMails, 1);
  }
});

Deno.test("§9 unreliable_diff 只在要改日期／房型／間數時擋；只改人數照套", async () => {
  for (const s of [null, "partial", "no_sections", "unparsable"]) {
    const r = await run(fx(), baseInput({ parser_diff_status: s, guest_count: 5 }));
    assertEquals(r.res.ok, true, String(s));
  }
});

Deno.test("§9 比對後訂單被別人改過 → apply_failed:order_changed", async () => {
  const r = await run(fx({ rpc: () => ({ data: null, error: { message: "ORDER_CHANGED: 訂單在比對後已被修改或不存在", code: "P0001" } }) }), baseInput({ guest_count: 5 }));
  assertEquals(r.res.error_reason, "order_changed");
});

Deno.test("§9 重複送出保護 → apply_failed:double_submit", async () => {
  const r = await run(fx({ rpc: () => ({ data: null, error: { message: "duplicate key", code: "23505" } }) }), baseInput({ room_quantity: 5 }));
  assertEquals(r.res.error_reason, "double_submit");
});

// ---------------------------------------------------------------- 第 8 節 2b-2 純函式
const pkgTypes = [
  { id: "p12", name: "12 人 (含以下) 包區" }, { id: "p14", name: "14 人包區" },
  { id: "p16", name: "16 人包區" }, { id: "p18", name: "18 人包區" },
];
Deno.test("matchRoomTypeForModification：包區房型", () => {
  assertEquals(matchRoomTypeForModification(pkgTypes, "12"), { ok: true, id: "p12" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "14"), { ok: true, id: "p14" });
  assertEquals(matchRoomTypeForModification([...pkgTypes, { id: "r12", name: "12 人房" }], "12"), { ok: false, code: "room_type_ambiguous" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "1"), { ok: false, code: "room_type_ambiguous" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "20"), { ok: false, code: "room_type_unmatched" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "12人(含以下)包區"), { ok: true, id: "p12" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "人包區"), { ok: false, code: "room_type_unmatched" });
  assertEquals(matchRoomTypeForModification(pkgTypes, "  "), { ok: false, code: "room_type_unmatched" });
});

const pOrder: PlanOrder = { id: "o1", room_type_id: RT_A, check_in_date: "2026-12-10", check_out_date: "2026-12-12",
  guest_count: 4, total_price: 48000, payment_status: "paid", order_status: "confirmed" };
const pMail = (over: Partial<PlanMail> = {}): PlanMail => ({ check_in_date: "2026-12-10", check_out_date: "2026-12-12",
  room_type_name: "四人房", room_quantity: 1, guest_count: 4, total_amount: 48000, parser_diff_status: "compared", ...over });
const pRows = (n: number): ExistingRoom[] => Array.from({ length: n }, (_, k) => room(`r${k + 1}`, null, 1000) as ExistingRoom);

Deno.test("間數 21 → quantity_out_of_range；20 → 通過", () => {
  assertEquals(MAX_OTA_ROOMS, 20);
  assertEquals(planOtaModification({ activeOrderCount: 1, order: pOrder, rows: pRows(1), roomTypes, mail: pMail({ room_quantity: 21 }) }),
    { kind: "blocked", code: "quantity_out_of_range" });
  const ok = planOtaModification({ activeOrderCount: 1, order: pOrder, rows: pRows(1), roomTypes, mail: pMail({ room_quantity: 20 }) });
  assertEquals(ok.kind, "apply");
  if (ok.kind === "apply") { assertEquals(ok.target.qty, 20); assertEquals(ok.roomsChange, "resize"); }
});

Deno.test("parseMailSentAt：正常／DKIM h= 不誤判／\\r\\n／沒有 Date／格式錯誤", () => {
  assertEquals(parseMailSentAt("From: a@b.c\nDate: Fri, 16 Oct 2026 09:30:00 +0800\nSubject: x"), "2026-10-16T01:30:00.000Z");
  const dkim = "DKIM-Signature: v=1; a=rsa-sha256; d=owlting.com;\r\n\th=From:To:Subject:Date:Message-ID; bh=abc\r\nDate: Sat, 17 Oct 2026 10:00:00 +0000\r\nTo: x";
  assertEquals(parseMailSentAt(dkim), "2026-10-17T10:00:00.000Z");
  assertEquals(parseMailSentAt("DKIM-Signature: v=1; h=from:date:subject;\r\n\tb=xyz\r\nSubject: s"), null);
  assertEquals(parseMailSentAt("Subject: s\r\nDate: Sun, 18 Oct 2026 08:00:00 +0900\r\n"), "2026-10-17T23:00:00.000Z");
  assertEquals(parseMailSentAt("Subject: s\nFrom: a"), null);
  assertEquals(parseMailSentAt("Date: not a date"), null);
  assertEquals(parseMailSentAt(null), null);
  assertEquals(parseMailSentAt({ Date: "x" }), null);
});

Deno.test("isStaleMail：兩邊有寄送時間／一邊 null 改比 received_at／時間相同不算", () => {
  const self = { mail_sent_at: "2026-10-01T02:00:00Z", received_at: "2026-10-01T09:00:00Z" };
  assertEquals(isStaleMail(self, [{ mail_sent_at: "2026-10-01T03:00:00Z", received_at: "2026-10-01T04:00:00Z" }]), true);
  assertEquals(isStaleMail(self, [{ mail_sent_at: "2026-10-01T01:00:00Z", received_at: "2026-10-01T10:00:00Z" }]), false);
  assertEquals(isStaleMail(self, [{ mail_sent_at: null, received_at: "2026-10-01T10:00:00Z" }]), true);
  assertEquals(isStaleMail(self, [{ mail_sent_at: null, received_at: "2026-10-01T08:00:00Z" }]), false);
  assertEquals(isStaleMail({ mail_sent_at: null, received_at: "2026-10-01T09:00:00Z" }, [{ mail_sent_at: "2026-10-01T03:00:00Z", received_at: "2026-10-01T09:00:01Z" }]), true);
  assertEquals(isStaleMail(self, [{ ...self }]), false);
  assertEquals(isStaleMail(self, []), false);
});

Deno.test("classifyApplyError：四種原因＋unknown", () => {
  assertEquals(classifyApplyError("Inventory exceeded for 2026-12-20"), "inventory_exceeded");
  assertEquals(classifyApplyError("room not available"), "inventory_exceeded");
  assertEquals(classifyApplyError("備品庫存不足"), "amenity_exceeded");
  assertEquals(classifyApplyError("dup", "23505"), "double_submit");
  assertEquals(classifyApplyError("重複寫入保護：10 秒內"), "double_submit");
  assertEquals(classifyApplyError("ORDER_CHANGED: x", "P0001"), "order_changed");
  assertEquals(classifyApplyError("boom"), "unknown");
});

const applyPlan = (over: Row) => ({ kind: "apply" as const, patch: {}, diff: [], mailTotal: null, amountNeedsReview: false,
  target: { roomTypeId: RT_A, qty: 2, checkIn: "2026-12-10", checkOut: "2026-12-12" }, roomsChange: "resize" as const, ...over });
Deno.test("buildOtaRooms：減少時刪除順序（無房號優先，再刪房號排序最後）", () => {
  const rows = [room("a", "u4", 1), room("b", null, 1), room("c", "u1", 1), room("d", "u7", 1), room("e", "u2", 1)] as ExistingRoom[];
  const out = buildOtaRooms({ plan: applyPlan({ target: { roomTypeId: RT_A, qty: 3, checkIn: "", checkOut: "" } }), rows, units: unitsA, busy: new Set(), newTemplate: { template_id: null, template_name: null } });
  assertEquals(out.map((x) => x.id), ["a", "c", "e"]);
  const out2 = buildOtaRooms({ plan: applyPlan({ target: { roomTypeId: RT_A, qty: 1, checkIn: "", checkOut: "" } }), rows, units: unitsA, busy: new Set(), newTemplate: { template_id: null, template_name: null } });
  assertEquals(out2.map((x) => x.id), ["c"]);
});

Deno.test("buildOtaRooms：增加時不重複挑已保留的房號、也不挑 busy", () => {
  const rows = [room("a", "u1", 1000), room("b", "u3", 2001)] as ExistingRoom[];
  const out = buildOtaRooms({ plan: applyPlan({ target: { roomTypeId: RT_A, qty: 5, checkIn: "", checkOut: "" } }), rows, units: unitsA, busy: new Set(["u2"]), newTemplate: { template_id: "zz", template_name: "zz" } });
  assertEquals(out.map((x) => x.room_unit_id), ["u1", "u3", "u4", "u5", "u6"]);
  assertEquals(out.slice(2).map((x) => [x.room_price, x.template_id]), [[1501, "tpl-a"], [1501, "tpl-a"], [1501, "tpl-a"]]);
  const none = buildOtaRooms({ plan: applyPlan({ target: { roomTypeId: RT_A, qty: 3, checkIn: "", checkOut: "" } }), rows, units: [unitsA[0], unitsA[2]], busy: new Set(), newTemplate: { template_id: null, template_name: null } });
  assertEquals(none[2].room_unit_id, null);
});

Deno.test("buildOtaRooms：房型變更兩種房價規則（信件金額 ÷ 間數／沿用舊列平均）", () => {
  const rows = [room("a", "u1", 1000), room("b", "u2", 2001)] as ExistingRoom[];
  const tpl = { template_id: "tpl-b", template_name: "雙人房專案" };
  const p = (mailTotal: number | null) => applyPlan({ roomsChange: "replace", mailTotal, target: { roomTypeId: RT_B, qty: 3, checkIn: "", checkOut: "" } });
  const a = buildOtaRooms({ plan: p(10000), rows, units: unitsB, busy: new Set(), newTemplate: tpl });
  assertEquals(a.map((x) => [x.id, x.room_type_id, x.room_price, x.room_unit_id, x.template_id]),
    [[null, RT_B, 3333, "w1", "tpl-b"], [null, RT_B, 3333, "w2", "tpl-b"], [null, RT_B, 3333, "w3", "tpl-b"]]);
  const b = buildOtaRooms({ plan: p(null), rows, units: unitsB, busy: new Set(["w2"]), newTemplate: tpl });
  assertEquals(b.map((x) => [x.room_price, x.room_unit_id]), [[1501, "w1"], [1501, "w3"], [1501, null]]);
});

Deno.test("buildOtaRooms keep：只改日期原樣送回", () => {
  const rows = baseRows() as ExistingRoom[];
  assertEquals(buildOtaRooms({ plan: applyPlan({ roomsChange: "keep" }), rows, units: unitsA, busy: new Set(["u1"]), newTemplate: { template_id: null, template_name: null } }), rows.map(keptRow));
});

Deno.test("formatNotApplied／formatRoomWarnings 文字格式", () => {
  assertEquals(formatNotApplied({ code: "x", obe: null, orderNumber: null, mailChanges: null, diff: [{ field: "f", label: "入住日期", before: "a", after: "b" }] }),
    "未套用，需人工處理｜原因代碼：x｜OBE：—｜訂單：—｜信件修改內容：入住日期：a → b");
  assertEquals(formatRoomWarnings({ orderNumber: "N", conflicts: [], newRowsWithoutUnit: [], typeName: () => "", unitNo: () => "", amountNeedsReview: false }), null);
  assertEquals(formatRoomWarnings({ orderNumber: "N", conflicts: [], newRowsWithoutUnit: [{ room_type_id: RT_A }], typeName: () => "四人房", unitNo: () => "", amountNeedsReview: false }),
    "訂單 N 已更新，但以下 1 間未分配房號，請到訂單詳情手動安排：四人房（無空房號）");
});
