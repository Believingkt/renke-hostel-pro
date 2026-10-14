// D：奧丁丁修改信／取消信擁有者判斷（E1–E5、E12、E13、同 OBE 多張、isInboundOwned）
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyObeOwner, handleOwnerCheckError, handlePmsOwnedEcho, isInboundOwned, type EchoMail } from "./owltingEchoGuard.ts";

type Row = Record<string, any>;
interface Write { table: string; op: "update" | "insert"; patch: Row; filters: [string, unknown][] }

function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    const exec = () => {
      if (errors[table]) return { data: null, error: { message: errors[table] } };
      if (op !== "select") {
        writes.push({ table, op, patch, filters: [...filters] });
        return { data: null, error: null };
      }
      const rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      return { data: rows, error: null };
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
      order: () => b,
      update: (p: Row) => { op = "update"; patch = p; return b; },
      insert: (p: Row) => { op = "insert"; patch = p; return b; },
      then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
    };
    return b;
  };
  return { admin: { from }, writes };
}

const ACC = "acc-yunxiu";
const B1 = "rt-b1";
const A5 = "rt-a5";
const roomTypes = [{ id: B1, name: "B1-四人房", accommodation_id: ACC }, { id: A5, name: "A5-雙人房", accommodation_id: ACC }];
const pmsOrder = (over: Row = {}) => ({
  id: "ord-z", order_number: "Z0001", accommodation_id: ACC, order_status: "confirmed",
  check_in_date: "2026-11-01", check_out_date: "2026-11-03", room_type_id: B1,
  order_source: "website", owlting_reservation_id: "OBE123", auto_created_from_email_id: null,
  owlting_sync_state: { last_action: "Commit" }, ...over,
});
const zRooms = [
  { order_id: "ord-z", room_type_id: B1, quantity: 1, room_unit_id: "u-821" },
  { order_id: "ord-z", room_type_id: B1, quantity: 1, room_unit_id: "u-851" },
];
const mail = (over: Partial<EchoMail> = {}): EchoMail => ({
  message_type: "modified", check_in_date: "2026-11-01", check_out_date: "2026-11-03",
  room_type_name: "B1-四人房", room_quantity: 2, total_amount: 12000, ...over,
});

function harness(orders: Row[], extraErrors: Record<string, string> = {}) {
  const { admin, writes } = fakeAdmin({ orders, order_rooms: zRooms, room_types: roomTypes }, extraErrors);
  const outcomes: { outcome: string; detail: Row }[] = [];
  const reports: any[] = [];
  const deps = {
    recordOutcome: async (_raw: string, outcome: any, detail: Row) => { outcomes.push({ outcome, detail }); },
    reportFailure: async (_a: any, p: any) => { reports.push(p); },
  };
  return { admin, writes, outcomes, reports, deps };
}

const forbidden = ["orders", "order_rooms", "owlting_order_push_queue"];
const assertNoOrderWrites = (writes: Write[]) =>
  assertEquals(writes.filter((w) => forbidden.includes(w.table)), [], "不得寫入 orders／order_rooms／推送佇列");
const stagingPatch = (writes: Write[]) => writes.filter((w) => w.table === "owlting_email_parsed_staging").map((w) => w.patch);

Deno.test("isInboundOwned：與 SQL 三條件一致", () => {
  const base = { order_source: "website", owlting_reservation_id: null, auto_created_from_email_id: null, owlting_sync_state: null };
  assertEquals(isInboundOwned({ ...base, order_source: "owlting" }), true);
  assertEquals(isInboundOwned({ ...base, order_source: "hotelnabe" }), true);
  assertEquals(isInboundOwned({ ...base, auto_created_from_email_id: "e1" }), true);
  assertEquals(isInboundOwned({ ...base, owlting_reservation_id: "OBE1" }), true);
  assertEquals(isInboundOwned({ ...base, owlting_reservation_id: "OBE1", owlting_sync_state: { last_action: "Commit" } }), false);
  assertEquals(isInboundOwned({ ...base, owlting_reservation_id: "OBE1", owlting_sync_state: { last_action: null } }), true);
  assertEquals(isInboundOwned(base), false);
});

Deno.test("E1 PMS 訂單收到一致的修改信：標記回音、不告警、不改寫訂單與明細", async () => {
  const h = harness([pmsOrder()]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  assertEquals(owner.kind, "pms");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any, mail: mail() }, h.deps);
  assertEquals(r.consistent, true);
  const p = stagingPatch(h.writes)[0];
  assertEquals(p.review_status, "ignored");
  assertStringIncludes(p.review_notes, "[PMS 回音]");
  assertStringIncludes(p.review_notes, "信件金額：12000（不比對）");
  assertEquals(h.outcomes[0].outcome, "pms_echo_ignored");
  assertEquals(h.reports.length, 0);
  assertNoOrderWrites(h.writes);
});

Deno.test("E2 內容不一致（房型 A5、間數 1、金額 0）：pending_review＋告警，訂單不變", async () => {
  const h = harness([pmsOrder()]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any,
    mail: mail({ room_type_name: "A5-雙人房", room_quantity: 1, total_amount: 0 }) }, h.deps);
  assertEquals(r.consistent, false);
  assertStringIncludes(r.diffs.join(), "房型：奧丁丁＝A5-雙人房，PMS 無此房型");
  const p = stagingPatch(h.writes)[0];
  assertEquals(p.review_status, "pending_review");
  assertStringIncludes(p.review_notes, "[需人工]");
  assertEquals(h.outcomes[0].outcome, "pms_echo_mismatch");
  assertEquals(h.reports.length, 1);
  assertEquals(h.reports[0].category, "owlting_pms_echo_mismatch");
  assertEquals(h.reports[0].failed[0].order_id, "ord-z");
  assertNoOrderWrites(h.writes);
});

Deno.test("E2b 間數不一致（B1 × 1 vs PMS 2 間）也告警", async () => {
  const h = harness([pmsOrder()]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any, mail: mail({ room_quantity: 1 }) }, h.deps);
  assertEquals(r.diffs, ["間數：奧丁丁＝1，PMS＝2"]);
  assertEquals(h.reports.length, 1);
});

Deno.test("E3 取消信、PMS 訂單未取消：一定告警且不取消", async () => {
  const h = harness([pmsOrder()]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any,
    mail: mail({ message_type: "cancelled" }) }, h.deps);
  assertEquals(r.diffs, ["狀態：奧丁丁＝已取消，PMS＝confirmed"]);
  assertStringIncludes(stagingPatch(h.writes)[0].review_notes, "取消信");
  assertEquals(h.reports.length, 1);
  assertNoOrderWrites(h.writes);
});

Deno.test("E3b 取消信、PMS 訂單已取消：視為回音、不告警", async () => {
  const h = harness([pmsOrder({ order_status: "cancelled" })]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any,
    mail: mail({ message_type: "cancelled" }) }, h.deps);
  assertEquals(r.consistent, true);
  assertEquals(h.reports.length, 0);
});

Deno.test("E4 PMS 已取消的訂單收到修改信：仍判為 PMS 擁有（不會落入找不到訂單→自動建單）", async () => {
  const h = harness([pmsOrder({ order_status: "cancelled" })]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  assertEquals(owner.kind, "pms");
  const r = await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any, mail: mail() }, h.deps);
  assertEquals(r.diffs, ["狀態：奧丁丁＝有效（修改通知），PMS＝已取消"]);
  assertNoOrderWrites(h.writes);
});

Deno.test("E5 擁有者判斷失敗：pending_review＋告警（order_id 為 null）", async () => {
  const h = harness([pmsOrder()], { orders: "permission denied" });
  const owner = await classifyObeOwner(h.admin, "OBE123");
  assertEquals(owner, { kind: "error", error: "permission denied" });
  await handleOwnerCheckError(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", error: "permission denied", messageType: "cancelled" }, h.deps);
  const p = stagingPatch(h.writes)[0];
  assertEquals(p.review_status, "pending_review");
  assertStringIncludes(p.review_notes, "未自動取消");
  assertEquals(h.outcomes[0].outcome, "apply_failed");
  assertEquals(h.reports[0].failed[0].order_id, null);
});

Deno.test("同一 OBE 同時有 PMS 與 OTA 擁有的訂單：走 PMS 分支，註明 N 張", async () => {
  const ota = pmsOrder({ id: "ord-w", order_number: "W0001", order_source: "owlting", auto_created_from_email_id: "e1" });
  const h = harness([pmsOrder(), ota]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  assertEquals(owner.kind, "pms");
  await handlePmsOwnedEcho(h.admin, { rawId: "raw1", stagingId: "st1", obe: "OBE123", owner: owner as any, mail: mail() }, h.deps);
  assertStringIncludes(stagingPatch(h.writes)[0].review_notes, "同一 OBE 有 2 張訂單（Z0001、W0001），一律不套用");
});

Deno.test("只有 OTA 擁有的訂單：ota_only（維持現行套用流程）", async () => {
  const h = harness([pmsOrder({ order_source: "owlting" })]);
  assertEquals((await classifyObeOwner(h.admin, "OBE123")).kind, "ota_only");
  assertEquals((await classifyObeOwner(h.admin, "OBE999")).kind, "none");
});

Deno.test("E12 亂序回音（S1 晚於 S2 到達）：兩封都不改寫訂單，PMS 維持最後狀態", async () => {
  // PMS 最後狀態 S2：2026-11-05~07；回音①內容 S1：2026-11-01~03（晚到），回音②內容 S2
  const h = harness([pmsOrder({ check_in_date: "2026-11-05", check_out_date: "2026-11-07" })]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  const late = await handlePmsOwnedEcho(h.admin, { rawId: "r2", stagingId: "s2", obe: "OBE123", owner: owner as any, mail: mail() }, h.deps);
  const latest = await handlePmsOwnedEcho(h.admin, { rawId: "r1", stagingId: "s1", obe: "OBE123", owner: owner as any,
    mail: mail({ check_in_date: "2026-11-05", check_out_date: "2026-11-07" }) }, h.deps);
  assertEquals(late.consistent, false);
  assertEquals(latest.consistent, true);
  assertNoOrderWrites(h.writes);
});

Deno.test("E13 全流程不寫 orders／order_rooms／推送佇列（推送 trigger 無從觸發，回音循環切斷）", async () => {
  const h = harness([pmsOrder()]);
  const owner = await classifyObeOwner(h.admin, "OBE123");
  for (const m of [mail(), mail({ room_type_name: "A5-雙人房" }), mail({ message_type: "cancelled" })]) {
    await handlePmsOwnedEcho(h.admin, { rawId: "r", stagingId: "s", obe: "OBE123", owner: owner as any, mail: m }, h.deps);
  }
  assertNoOrderWrites(h.writes);
  assert(h.writes.every((w) => w.table === "owlting_email_parsed_staging"));
});

Deno.test("ingest 接線：PMS／判斷失敗時略過自動套用、業主通知與自動取消", async () => {
  const src = await Deno.readTextFile(new URL("../owlting-email-ingest/index.ts", import.meta.url));
  const applyIdx = src.indexOf("await applyModificationToExistingOrder(");
  const applyCond = src.slice(src.lastIndexOf("if (", applyIdx), applyIdx);
  assertStringIncludes(applyCond, "!ownerBlocksAuto");
  const notifyIdx = src.indexOf("owlting-change-notify");
  assertStringIncludes(src.slice(src.lastIndexOf("if (", notifyIdx), notifyIdx), "!ownerBlocksAuto");
  const cancelIdx = src.indexOf("await cancelAutoPendingOrders(");
  assertStringIncludes(src.slice(src.lastIndexOf("if (stagingRow?.id && fields.message_type === \"cancelled\"", cancelIdx), cancelIdx), "!ownerBlocksAuto");
  assertStringIncludes(src, 'owner.kind === "pms" && !isNoopModification');
});
