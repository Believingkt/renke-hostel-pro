// 3-④：方案型費率不寫房型基底列、房型對不到只略過該筆（handler 層級，stub supabase）
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRateAmountNotifRQ } from "./index.ts";
import { summarizeIgnoredRates } from "./rate_ignore.ts";

const ACC = "acc-1";
const HOTEL = "H1";

function makeStub() {
  const fixtures: Record<string, any[]> = {
    room_types: [
      { id: "rA1", name: "A1", numeric_code: 2001, accommodation_id: ACC },
      { id: "rS1", name: "單間1", numeric_code: 1096, accommodation_id: ACC },
    ],
    pricing_templates: [{ id: "tpl-3001", template_name: "一泊一食", room_type_id: "rA1", numeric_code: 3001, accommodation_id: ACC }],
    accommodation_packages: [
      { id: "pkg-1001", name: "包棟A", numeric_code: 1001, room_type_ids: ["rA1"], enabled: true, accommodation_id: ACC },
      { id: "pkg-1003", name: "包棟B", numeric_code: 1003, room_type_ids: ["rA1"], enabled: true, accommodation_id: ACC },
      { id: "pkg-1007", name: "停用單間", numeric_code: 1007, room_type_ids: ["rS1"], enabled: false, accommodation_id: ACC },
    ],
    owlting_room_type_groups: [],
    owlting_room_type_sync: [],
  };
  const logs: any[] = [];
  const rpcCalls: any[] = [];
  const sb = {
    from(table: string) {
      let rows = [...(fixtures[table] ?? [])];
      const chain: any = {
        select() { return chain; },
        eq(c: string, v: any) { rows = rows.filter((r) => r[c] === v); return chain; },
        in(c: string, vs: any[]) { const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return chain; },
        insert(row: any) { if (table === "owlting_cm_logs") logs.push(row); return Promise.resolve({ error: null }); },
        then(res: any) { res({ data: rows, error: null }); },
      };
      return chain;
    },
    rpc(fn: string, args: any) { rpcCalls.push({ fn, args }); return Promise.resolve({ error: null }); },
  };
  return { sb, logs, rpcCalls };
}

const msg = (inv: string, rp: string, start: string, end: string, amt: number) => `
  <RateAmountMessage>
    <StatusApplicationControl InvTypeCode="${inv}" RatePlanCode="${rp}"/>
    <Rates><Rate Start="${start}" End="${end}"><BaseByGuestAmts><BaseByGuestAmt AmountAfterTax="${amt}"/></BaseByGuestAmts></Rate></Rates>
  </RateAmountMessage>`;

const xmlOf = (...m: string[]) => `<OTA_HotelRateAmountNotifRQ EchoToken="E1"><RateAmountMessages HotelCode="${HOTEL}">${m.join("")}</RateAmountMessages></OTA_HotelRateAmountNotifRQ>`;

Deno.test("方案型略過＋合併成一筆 ignored；專案型、找不到方案代碼照寫；房型對不到只略過該筆；回應成功", async () => {
  const { sb, logs, rpcCalls } = makeStub();
  const xml = xmlOf(
    msg("2001", "1001", "2026-12-01", "2026-12-02", 12000),
    msg("2001", "1003", "2026-12-01", "2026-12-02", 45700),
    msg("2001", "1001", "2026-12-05", "2026-12-05", 13000),
    msg("1096", "1007", "2026-12-01", "2026-12-01", 3200),
    msg("2001", "3001", "2026-12-01", "2026-12-01", 5000),
    msg("1084", "1008", "2026-12-03", "2026-12-04", 8800),
  );
  const resp = await handleRateAmountNotifRQ(sb, xml, "E1", { accommodationId: ACC, hotelCode: HOTEL });
  const body = await resp.text();

  assertEquals(resp.status, 200);
  assert(body.includes("<OTA_HotelRateAmountNotifRS"));
  assert(body.includes("<Success/>"));
  assert(!body.includes("<Errors>"));

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].args.p_source, "owlting_rate");
  assertEquals(rpcCalls[0].args.p_rows, [
    { room_type_id: "rS1", date: "2026-12-01", pricing_template_id: null, price: 3200 },
    { room_type_id: "rA1", date: "2026-12-01", pricing_template_id: "tpl-3001", price: 5000 },
  ]);

  assertEquals(logs.map((l) => l.status), ["success", "ignored"]);
  const ign = logs[1];
  assertEquals(ign.api_method, "OTA_HotelRateAmountNotifRQ");
  assertEquals(ign.echo_token, "E1");
  assert(ign.error_message.startsWith("略過費率 4 筆（方案型 3、房型對不到 1）："));
  const rows = JSON.parse(ign.error_message.slice(ign.error_message.indexOf("：") + 1));
  assertEquals(rows.length, 3);
  const p1001 = rows.find((r: any) => r.rate_plan_code === "1001");
  assertEquals(p1001, { reason: "方案型費率不寫入房型基底列", inv_type_code: "2001", room_type_id: "rA1", rate_plan_code: "1001", date_from: "2026-12-01", date_to: "2026-12-05", prices: [12000, 13000], blocks: 2 });
  const nf = rows.find((r: any) => r.inv_type_code === "1084");
  assertEquals(nf.reason, "房型對不到");
  assertEquals(nf.room_type_id, null);
  assertEquals(nf.date_from, "2026-12-03");
  assertEquals(nf.prices, [8800]);
});

Deno.test("沒有略過時不寫 ignored；全部略過時不呼叫寫入 RPC，回應仍成功", async () => {
  const a = makeStub();
  await handleRateAmountNotifRQ(a.sb, xmlOf(msg("1096", "1007", "2026-12-01", "2026-12-01", 3200)), "E2", { accommodationId: ACC, hotelCode: HOTEL });
  assertEquals(a.logs.map((l) => l.status), ["success"]);
  assertEquals(a.rpcCalls.length, 1);

  const b = makeStub();
  const resp = await handleRateAmountNotifRQ(b.sb, xmlOf(msg("2001", "1001", "2026-12-01", "2026-12-01", 1), msg("9999", "1", "2026-12-01", "2026-12-01", 1)), "E3", { accommodationId: ACC, hotelCode: HOTEL });
  assert((await resp.text()).includes("<Success/>"));
  assertEquals(b.rpcCalls.length, 0);
  assertEquals(b.logs.map((l) => l.status), ["success", "ignored"]);
});

Deno.test("合併紀錄長度上限", () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ reason: "package_plan" as const, invCode: String(i), roomTypeId: "r", ratePlanCode: "1001", start: "2026-12-01", end: "2026-12-01", price: i }));
  assert(summarizeIgnoredRates(many).length <= 20000);
});
