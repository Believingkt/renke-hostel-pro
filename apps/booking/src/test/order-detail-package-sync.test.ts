import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import snapshot from "./__snapshots__/rpc-whitelists.json";
import { buildInlinePackageSync, resolveOrderPackage, roomsChangedSinceOpen, type PackageLite, type TemplateLite } from "@/lib/orderPackageResolution";
import { buildInlineEditPatch } from "@/lib/orderFieldPatches";

const RT_A = "rt-a";
const RT_B = "rt-b";
const PKGS: PackageLite[] = [
  { id: "pkg-a", name: "A方案", guest_count: 4, primary_room_type_id: RT_A, room_type_ids: [RT_A] },
  { id: "pkg-b", name: "B方案", guest_count: 8, primary_room_type_id: null, room_type_ids: [RT_B] },
];
const TPLS: TemplateLite[] = [
  { id: "tpl-a", template_name: "A專案", room_type_ids: [RT_A], default_package_id: "pkg-a" },
  { id: "tpl-b", template_name: "B專案", room_type_ids: [RT_B], default_package_id: "pkg-b" },
  { id: "tpl-b-free", template_name: "B未綁", room_type_ids: [RT_B], default_package_id: null },
];
const room = (rt: string, tpl: string | null, name: string | null = tpl) => ({ room_type_id: rt, template_id: tpl, template_name: name });
const sync = (opened: ReturnType<typeof room>[], current: ReturnType<typeof room>[], hasChannel = false, manualPick = "") =>
  buildInlinePackageSync({
    opened,
    current,
    firstRoomTemplateId: current[0]?.template_id ?? null,
    resolution: resolveOrderPackage({
      rooms: current.map((r) => ({ room_type_id: r.room_type_id, template_id: r.template_id || "" })),
      templates: TPLS,
      packages: PKGS,
      hasChannel,
    }),
    manualPick,
  });

const inlineForm = {
  guest_name: "王小明", guest_phone: "0912345678", guest_email: "a@b.c", guest_address: "台北市",
  guest_gender: "male", guest_nationality: "台灣", guest_count: 4, order_source: "manual",
  lock_whole_building: false, order_status: "confirmed", deposit_payment_method: "none",
  balance_payment_method: "cash", meal_plan: "A專案", room_type_id: RT_A, discount_code: "",
  discount_amount: 0, deposit_amount: 0, addon_total: 0, pet_count: 0, pet_plan_price: 0,
  meal_plan_details: [], meal_plan_total: 0, custom_addon_details: [],
};
const inlineBase = {
  order: { payment_status: "unpaid", total_price: 10000, discount_amount: 0, discount_code: null, final_price: 10000 },
  form: inlineForm, isOlivia: false, isHoldOrder: false, effPaymentStatus: "unpaid", effPaidAmount: 0,
  savedTotalPrice: 10000, editFinalPriceCalc: 10000, originalAddonTotal: 0, finalNotes: "", auditNoteLine: null,
  nowIso: "2026-10-01T00:00:00.000Z", originalOrderStatus: "confirmed",
};
const OPENED = [room(RT_A, "tpl-a")];

describe("舊訂單只開啟未改房型／專案：存檔不含 package_id、pricing_template_id", () => {
  const cases = [
    { name: "只改備註", patch: buildInlineEditPatch({ ...inlineBase, finalNotes: "客人晚到" }) },
    { name: "只改聯絡資料", patch: buildInlineEditPatch({ ...inlineBase, form: { ...inlineForm, guest_phone: "0987654321", guest_email: "new@b.c" } }) },
    { name: "只改金額", patch: buildInlineEditPatch({ ...inlineBase, savedTotalPrice: 12000, editFinalPriceCalc: 12000 }) },
  ];
  it.each(cases)("$name：主要存檔內容不含兩個欄位", ({ patch }) => {
    expect(patch).not.toHaveProperty("package_id");
    expect(patch).not.toHaveProperty("pricing_template_id");
  });
  it.each(cases)("$name：房間沒變，不會另外送方案同步", () => {
    expect(sync(OPENED, [room(RT_A, "tpl-a")])).toBeNull();
  });
  it("只改房價（房間列金額不同、房型專案相同）也不同步", () => {
    expect(roomsChangedSinceOpen(OPENED, [{ ...room(RT_A, "tpl-a"), room_price: 9999 } as any])).toBe(false);
  });
});

describe("改了房型或專案才同步", () => {
  it("改專案 → 依第一間房專案帶入方案與專案", () => {
    expect(sync([room(RT_B, "tpl-b-free")], [room(RT_B, "tpl-b")])).toEqual({ package_id: "pkg-b", pricing_template_id: "tpl-b" });
  });
  it("改房型＋專案（重現雲岫錯配的修正方向）", () => {
    expect(sync(OPENED, [room(RT_B, "tpl-b")])).toEqual({ package_id: "pkg-b", pricing_template_id: "tpl-b" });
  });
  it("增加一間房 → 同步，訂單方案取第一間", () => {
    expect(sync(OPENED, [room(RT_A, "tpl-a"), room(RT_B, "tpl-b")])).toEqual({ package_id: "pkg-a", pricing_template_id: "tpl-a" });
  });
  it("原本沒有房間明細、這次補上 → 同步", () => {
    expect(sync([], [room(RT_A, "tpl-a")])).toEqual({ package_id: "pkg-a", pricing_template_id: "tpl-a" });
  });
  it("第一間房沒有選專案 → 不同步（保留原值）", () => {
    expect(sync(OPENED, [room(RT_B, null)])).toBeNull();
  });
  it("非通路館、專案未綁方案 → package_id 留空", () => {
    expect(sync(OPENED, [room(RT_B, "tpl-b-free")], false, "pkg-b")).toEqual({ package_id: null, pricing_template_id: "tpl-b-free" });
  });
  it("通路館、專案未綁方案 → 採用人員所選且涵蓋房型的方案", () => {
    expect(sync(OPENED, [room(RT_B, "tpl-b-free")], true, "pkg-b")).toEqual({ package_id: "pkg-b", pricing_template_id: "tpl-b-free" });
  });
  it("通路館、選了不涵蓋房型的方案 → 不寫入", () => {
    expect(sync(OPENED, [room(RT_B, "tpl-b-free")], true, "pkg-a")).toEqual({ package_id: null, pricing_template_id: "tpl-b-free" });
  });
  it("同步內容的欄位都在 update_order_fields_v1 白名單內", () => {
    const fields = new Set(snapshot.functions.update_order_fields_v1.fields);
    const p = sync(OPENED, [room(RT_B, "tpl-b")])!;
    expect(Object.keys(p).filter((k) => !fields.has(k))).toEqual([]);
  });
});

describe("OrderDetail 原始碼契約", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/pages/OrderDetail.tsx"), "utf8");
  it("方案同步在房間明細存檔成功之後才送出", () => {
    const roomsOk = src.indexOf("roomsSynced = true;");
    const pkgCall = src.indexOf("p_patch: packageSync as any");
    expect(roomsOk).toBeGreaterThan(0);
    expect(pkgCall).toBeGreaterThan(roomsOk);
  });
  it("主要存檔內容沒有直接寫入 package_id／pricing_template_id", () => {
    expect(src).not.toMatch(/updateData\.(package_id|pricing_template_id)/);
  });
});
