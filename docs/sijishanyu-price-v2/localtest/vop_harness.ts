// validate-order-prices 本機測試：以假的 Supabase REST 回應（資料取自本機套用後的 sjtest）執行正式 index.ts
const fx = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
const day: string = Deno.args[1];
const next = new Date(day + "T00:00:00Z");
next.setUTCDate(next.getUTCDate() + 1);
const outDay = next.toISOString().slice(0, 10);
Deno.env.set("SUPABASE_URL", "http://mock.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "local-test");

const realFetch = globalThis.fetch;
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body == null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  if (url.host !== "mock.local") return realFetch(input, init);
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? req?.headers);
  const [, , , table, fn] = url.pathname.split("/");
  if (table === "rpc") return reply(fn === "get_adjusted_room_inventory_batch" ? [{ date_value: day, available_rooms: 2, is_blocked: false }] : null);
  if (method !== "GET" && method !== "HEAD") return reply(null, 201);
  let rows: Record<string, unknown>[] = fx[table] ?? [];
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith("in.(")) {
      const set = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
      rows = rows.filter((r) => set.includes(String(r[k])));
    }
  }
  const range = { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
  if (method === "HEAD") return reply(null, 200, range);
  if ((headers.get("Accept") ?? "").includes("vnd.pgrst.object")) {
    return rows.length === 1 ? reply(rows[0], 200, range) : reply({ code: "PGRST116", message: "0 rows" }, 406, range);
  }
  return reply(rows, 200, range);
};

await import("../../../supabase/functions/validate-order-prices/index.ts");
await new Promise((r) => setTimeout(r, 500));

const pkgId = (name: string) => (fx.accommodation_packages as any[]).find((p) => p.name === name)?.id ?? null;
const call = async (body: Record<string, unknown>) =>
  (await realFetch("http://localhost:8000", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

const cases: Array<[string, string, string | null, string | null]> = [
  ["V1 單間方案 雙人房(山景) enabled=false", "6c72fc3e-9183-4788-a03d-bc043a2823e8", pkgId("雙人房(山景)"), null],
  ["V2 單間方案 四人房(樹景) enabled=false", "c4c80422-f4c2-47f0-9aef-dc1a663046a9", pkgId("四人房(樹景)"), null],
  ["V3 對照：8人包棟 enabled=true", "69e8fa0f-27b4-4259-b3dd-8525d61e014c", pkgId("8人包棟"), null],
  ["V4 專案路徑：雙人房(山景)專案、不帶 packageId", "6c72fc3e-9183-4788-a03d-bc043a2823e8", null, "a247bcaf-74df-49e6-a1e1-d12b1d681263"],
];
for (const [label, roomTypeId, packageId, pricingTemplateId] of cases) {
  const base = { accommodationId: "a4bacadc-9b7a-4110-ac04-a1cc6248c822", roomTypeId, packageId, pricingTemplateId, checkInDate: day, checkOutDate: outDay, adultsCount: 2, mealPlanTotal: 0, petPlanPrice: 0 };
  const first = await call({ ...base, totalPrice: 0, discountAmount: 0, finalPrice: 0 });
  const p = first.calculatedPrices ?? {};
  const second = await call({ ...base, totalPrice: p.totalPrice, discountAmount: p.discountAmount, finalPrice: p.finalPrice });
  console.log(`${label}｜isValid=${second.isValid}｜finalPrice=${p.finalPrice}｜errors=${JSON.stringify(second.errors)}`);
}
Deno.exit(0);
