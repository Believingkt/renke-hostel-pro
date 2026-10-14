// 2a-1：補單房型明細以 sync_order_rooms_v1 一次寫入；1a／1b 失敗都保留訂單、不刪除
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickFillupRows, writeFillupRooms, type FillupRow } from "./fillupRooms.ts";

type Row = Record<string, any>;

function fakeAdmin(rpcResult: { data: any; error: any }) {
  const writes: { table: string; op: string; patch: Row; filters: [string, unknown][] }[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let op = "select";
    let patch: Row = {};
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
      update: (p: Row) => { op = "update"; patch = p; return b; },
      insert: (p: Row) => { op = "insert"; patch = p; return b; },
      delete: () => { op = "delete"; return b; },
      then: (res: any, rej: any) => {
        if (op !== "select") writes.push({ table, op, patch, filters: [...filters] });
        return Promise.resolve({ data: null, error: null }).then(res, rej);
      },
    };
    return b;
  };
  const rpc = async (fn: string, args: Row) => { rpcCalls.push({ fn, args }); return rpcResult; };
  return { admin: { from, rpc }, writes, rpcCalls };
}

const B1 = "rt-b1";
const units = [{ id: "u-801", unit_number: "801" }, { id: "u-821", unit_number: "821" }, { id: "u-851", unit_number: "851" }];
const unitNumberById = new Map(units.map((u) => [u.id, u.unit_number]));

function deps() {
  const errors: any[] = [];
  const alerts: any[] = [];
  return {
    errors, alerts,
    d: {
      reportError: async (i: any) => { errors.push(i); },
      sendAlert: async (_a: any, i: any) => { alerts.push(i); return true; },
    },
  };
}

const ctx = (over: Row = {}) => ({
  orderId: "ord-1", orderNumber: "Y0001", updatedExisting: true,
  rows: [] as FillupRow[], stagingId: "st-1", obeNumber: "OBE9", accommodationId: "acc", unitNumberById, ...over,
});

Deno.test("pickFillupRows：手動房號保留、其餘依順序挑空房、沒有空房留 NULL", () => {
  const rows = pickFillupRows(
    [{ room_type_id: B1, room_unit_id: "u-851" }, { room_type_id: B1, room_unit_id: null }, { room_type_id: B1, room_unit_id: null }, { room_type_id: B1, room_unit_id: null }],
    new Map([[B1, units]]),
    new Map([[B1, new Set(["u-801"])]]),
    new Map([[B1, new Set(["u-851"])]]),
    6000,
  );
  assertEquals(rows.map((r) => r.room_unit_id), ["u-851", "u-821", null, null]);
  assert(rows.every((r) => r.id === null && r.quantity === 1 && r.room_price === 6000 && r.template_id === null));
});

Deno.test("成功：只呼叫一次 sync_order_rooms_v1、帶全部列；回傳未分配房號清單", async () => {
  const rows = pickFillupRows([{ room_type_id: B1, room_unit_id: "u-821" }, { room_type_id: B1, room_unit_id: null }],
    new Map([[B1, [units[1]]]]), new Map(), new Map([[B1, new Set(["u-821"])]]), 6000);
  const h = fakeAdmin({ data: { ok: true, conflicts: [{ room_type_id: B1, room_unit_id: "u-821", reason: "unit_occupied", conflict_order_number: "X9" }] }, error: null });
  const dp = deps();
  const r = await writeFillupRooms(h.admin, ctx({ rows }), dp.d);
  assertEquals(h.rpcCalls.length, 1);
  assertEquals(h.rpcCalls[0].fn, "sync_order_rooms_v1");
  assertEquals(h.rpcCalls[0].args, { p_order_id: "ord-1", p_expected_updated_at: null, p_rooms: rows });
  assertEquals(r, { ok: true, unassigned: [
    { room_type_id: B1, requested_unit: "821", reason: "occupied" },
    { room_type_id: B1, requested_unit: null, reason: "no_free_unit" },
  ] });
  assertEquals(h.writes, []);
  assertEquals(dp.errors.length + dp.alerts.length, 0);
});

for (const c of [
  { name: "1a" as const, updatedExisting: true, msg: "房型明細寫入失敗，訂單 Y0001 已保留，請重新送出", label: "1a 既有自動鎖房訂單" },
  { name: "1b" as const, updatedExisting: false, msg: "訂單 Y0001 已建立，但房型明細寫入失敗，請客服手動安排房間", label: "1b 補單新建訂單" },
]) {
  Deno.test(`${c.name} 明細寫入失敗：保留訂單不刪除、error_logs、告警、staging pending_review、回 500`, async () => {
    const h = fakeAdmin({ data: null, error: { message: "Inventory exceeded on 2026-11-01" } });
    const dp = deps();
    const r = await writeFillupRooms(h.admin, ctx({ updatedExisting: c.updatedExisting }), dp.d);
    assertEquals(r, { ok: false, status: 500, body: { ok: false, code: "ROOMS_WRITE_FAILED", case: c.name, error: c.msg, order_number: "Y0001" } });
    // 不得刪除或改寫訂單、不得寫明細
    assertEquals(h.writes.filter((w) => w.table === "orders" || w.table === "order_rooms"), []);
    assertEquals(h.writes.filter((w) => w.op === "delete"), []);
    const st = h.writes.find((w) => w.table === "owlting_email_parsed_staging")!;
    assertEquals(st.patch.review_status, "pending_review");
    assertStringIncludes(st.patch.review_notes, c.label);
    assertStringIncludes(st.patch.review_notes, "已保留、未刪除");
    assertEquals(dp.errors[0].category, "owlting_fillup_rooms");
    assertStringIncludes(dp.errors[0].errorMessage, `[${c.label}]`);
    assertEquals(dp.errors[0].context.case, c.name);
    assertStringIncludes(dp.alerts[0].error, `[${c.label}]`);
    assertEquals(dp.alerts[0].orderNumber, "Y0001");
  });
}

Deno.test("index.ts 接線：不再直接刪除或逐列寫入明細；失敗時在標記 promoted／token used 之前回傳", async () => {
  const src = await Deno.readTextFile(new URL("../owlting-fillup-submit/index.ts", import.meta.url));
  assertEquals(/from\("order_rooms"\)\s*\.(delete|insert)\(/.test(src), false);
  assertEquals(/from\("orders"\)\s*\.delete\(/.test(src), false);
  const failIdx = src.indexOf("if (!roomsRes.ok)");
  assert(failIdx > 0);
  assert(failIdx < src.indexOf("// Mark staging promoted + token used"));
  assert(failIdx < src.indexOf("used_at: nowIso"));
  assertStringIncludes(src, "unassigned_rooms: roomsRes.unassigned");
});
