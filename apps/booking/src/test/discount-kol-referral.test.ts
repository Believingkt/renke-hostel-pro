import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { evaluateDiscountCode, discountChargeParams, notApplicableMessage } from "@lakeze/shared/utils/discountEvaluation";
import { computeDiscountedRoomCharge } from "@lakeze/shared/utils/discountPricing";

const ROOT = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const P = { code: "RE98", accommodationId: "acc", orderAmount: 30000, roomTypeId: "rt", checkInDate: "2026-11-01", pricingTemplateId: "tpl" };
const row = (status: string, extra: Record<string, unknown> = {}) => ({ data: [{ status, discount_type: null, discount_value: null, message: "", applicable_names: null, scope_empty: false, ...extra }], error: null });

describe("evaluateDiscountCode 三態", () => {
  it("applied", async () => {
    const r = await evaluateDiscountCode(async () => row("applied", { discount_type: "percentage", discount_value: 10 }), P);
    expect(r?.status).toBe("applied");
    expect(discountChargeParams(r)).toEqual({ discountKind: "percentage", discountValue: 10 });
  });
  it("not_applicable：帶出適用名稱與訊息", async () => {
    const r = await evaluateDiscountCode(async () => row("not_applicable", { applicable_names: ["全區20-32人"] }), P);
    expect(r?.status).toBe("not_applicable");
    expect(discountChargeParams(r)).toEqual({ discountKind: null, discountValue: null });
    expect(notApplicableMessage(r!)).toBe("此方案不適用折扣（折扣僅適用：全區20-32人），已記錄推薦碼");
  });
  it("沒設定任何適用專案：推薦碼訊息", async () => {
    const r = await evaluateDiscountCode(async () => row("not_applicable", { scope_empty: true }), P);
    expect(notApplicableMessage(r!)).toBe("此碼為推薦碼，不提供折扣，已記錄");
  });
  it("invalid", async () => {
    const r = await evaluateDiscountCode(async () => row("invalid", { message: "折扣碼已過期" }), P);
    expect(r?.status).toBe("invalid");
    expect(r?.message).toBe("折扣碼已過期");
  });
});

describe("evaluate_discount_code 尚未套用時退回現行 validate_discount_code", () => {
  const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function public.evaluate_discount_code" } };
  it("舊函式有效 → applied（現行行為）", async () => {
    const rpc = vi.fn(async (fn: string) => fn === "evaluate_discount_code" ? missing : { data: [{ is_valid: true, discount_type: "amount", discount_value: 500, message: "折扣碼有效" }], error: null });
    const r = await evaluateDiscountCode(rpc, P);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(r?.status).toBe("applied");
  });
  it("舊函式無效 → invalid（現行行為：拒絕，不會變成記錄 0 折扣）", async () => {
    const r = await evaluateDiscountCode(async (fn) => fn === "evaluate_discount_code" ? missing : { data: [{ is_valid: false, message: "此折扣碼不適用於所選房價方案" }], error: null }, P);
    expect(r?.status).toBe("invalid");
  });
  it("PostgreSQL 42883 也視為函式不存在", async () => {
    const r = await evaluateDiscountCode(async (fn) => fn === "evaluate_discount_code" ? { data: null, error: { code: "42883", message: "function does not exist" } } : { data: [{ is_valid: true, discount_type: "percentage", discount_value: 10 }], error: null }, P);
    expect(r?.status).toBe("applied");
  });
  it("其他錯誤 → null（呼叫端照現行錯誤處理），不退回", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "57014", message: "timeout" } }));
    expect(await evaluateDiscountCode(rpc, P)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("計價：not_applicable 房費用售價、折扣 0、不改用原價", () => {
  const sale = 26000, original = 32000;
  it("applied：以原價打折取較低者", () => {
    const c = computeDiscountedRoomCharge({ saleTotal: sale, originalTotal: original, ...discountChargeParams({ status: "applied", discountType: "percentage", discountValue: 25 }) });
    expect(c).toEqual({ billedRoomTotal: 32000, discountAmount: 8000, chargedRoomTotal: 24000 });
  });
  it("not_applicable：帳列＝實付＝售價、折扣 0", () => {
    const c = computeDiscountedRoomCharge({ saleTotal: sale, originalTotal: original, ...discountChargeParams({ status: "not_applicable", discountType: null, discountValue: null }) });
    expect(c).toEqual({ billedRoomTotal: 26000, discountAmount: 0, chargedRoomTotal: 26000 });
  });
});

describe("validate-order-prices 原始碼契約（例外檔）", () => {
  const src = read("supabase/functions/validate-order-prices/index.ts");
  it("改呼叫三態判斷（含退回舊函式）", () => expect(src).toMatch(/evaluateDiscountCode\(\(fn, args\) => supabase\.rpc\(fn, args\)/));
  it("原價基準只在折扣實際套用時使用", () => expect(src).toMatch(/const chargedRoomTotal = discountApplied && hasOriginalBase \? discountBaseTotal : calculatedRoomTotal;/));
  it("invalid 才報錯；not_applicable 不報錯、不打折", () => {
    expect(src).toMatch(/discountEval\.status === "invalid"\) \{\s*errors\.push\(`Discount code invalid/);
    expect(src).toMatch(/if \(discountApplied\) \{/);
    expect(src).not.toMatch(/rpc\("validate_discount_code"/);
  });
});

// 各付款路徑：碼與折扣金額原樣交給 validate-order-prices 驗證，再原樣寫入 → 三種情境都由驗價決定
const passThrough: Array<[string, string, RegExp[]]> = [
  ["TapPay 一次付清", "supabase/functions/create-paid-order/index.ts", [/discountCode: body\.discountCode,/, /discount_code: body\.discountCode \|\| null,/, /discount_amount: body\.discountAmount \|\| 0,/]],
  ["3D 驗證", "supabase/functions/complete-3ds-booking/index.ts", [/discountCode: body\.discountCode \|\| null,/, /discount_code: body\.discountCode \|\| null,/, /discount_amount: body\.discountAmount \|\| 0,/]],
  ["綁卡", "supabase/functions/create-card-bound-order/index.ts", [/discountCode: body\.discountCode,/, /discount_code: body\.discountCode \|\| null,/, /discount_amount: body\.discountAmount \|\| 0,/]],
  ["PAYUNi 信用卡／ATM", "supabase/functions/payuni-create-pending-order/index.ts", [/discountCode: body\.discountCode,/, /discount_code: body\.discountCode \|\| null,/, /discount_amount: body\.discountAmount \|\| 0,/]],
];
describe.each(passThrough)("付款路徑契約：%s", (_name, file, patterns) => {
  const src = read(file);
  it("碼與折扣金額原樣送驗價並寫入（適用打折／不適用記錄 0／無效由驗價拒絕）", () => patterns.forEach((re) => expect(src).toMatch(re)));
});

describe("前台 BookingFlow 契約（TapPay ATM、ATM 直接寫入、LINE Pay 皆由此送出）", () => {
  const src = read("apps/booking/src/pages/BookingFlow.tsx");
  it("not_applicable 記錄碼、折扣 0", () => expect(src).toMatch(/notApplicable: true, note: notApplicableMessage\(result\)/));
  it("房費與折扣看「碼是否套用」", () => {
    expect(src).toMatch(/if \(!appliedDiscount \|\| appliedDiscount\.notApplicable\) return sale;/);
    expect(src).toMatch(/if \(!appliedDiscount \|\| appliedDiscount\.notApplicable\) return 0;/);
  });
  it("invalid 不套用、顯示無效", () => expect(src).toMatch(/title: "折扣代碼無效",\s*description: result\.message/));
  it("先呼叫 validate-order-prices 再分流付款", () => expect(src.indexOf("'validate-order-prices'")).toBeLessThan(src.indexOf("discount_code: appliedDiscount ? appliedDiscount.code : null")));
  it("ATM 直接寫入：碼＋前台折扣（不適用時為 0）", () => expect(src).toMatch(/discount_code: appliedDiscount \? appliedDiscount\.code : null,\s*discount_amount: discountAmount,/));
  it("換房型／方案重新判斷，不再清掉碼", () => {
    expect(src).toMatch(/handleApplyDiscount\(appliedDiscount\.code, \{ reevaluate: true \}\)/);
    expect(src).not.toMatch(/已變更房型／房價方案，此折扣碼僅適用於指定方案，請重新輸入套用/);
  });
  it("LINE Pay 確認頁沿用前台碼與折扣", () => {
    const lp = read("apps/booking/src/pages/LinePayConfirm.tsx");
    expect(lp).toMatch(/discount_amount: orderData\.discountAmount,/);
    expect(lp).toMatch(/discount_code: orderData\.appliedDiscount\?\.code \|\| null,/);
  });
});

describe("後台契約", () => {
  it("新增訂單：not_applicable 記錄碼、折扣 0；invalid 拒絕", () => {
    const src = read("apps/booking/src/components/orders/CreateOrderDialog.tsx");
    expect(src).toMatch(/else if \(notApplicable && !lastInvalid\)/);
    expect(src).toMatch(/type: "amount", value: 0, notApplicable: true/);
    expect(src).toMatch(/title: "折扣代碼無效"/);
  });
  it("訂單詳情編輯：not_applicable 可存檔、折扣 0；invalid 擋存檔", () => {
    const src = read("apps/booking/src/pages/OrderDetail.tsx");
    expect(src).toMatch(/result\.status === "not_applicable"\) \{\s*\/\/[^\n]*\n\s*setDiscountCodeNote\(notApplicableMessage\(result\)\);\s*setEditForm\(f => \(\{ \.\.\.f, discount_amount: 0 \}\)\);/);
    expect(src).toMatch(/if \(discountCodeError && editForm\.discount_code\.trim\(\)/);
  });
});

// ── 10 條付款／建單路徑 × 3 情境（適用打折／不適用記錄碼折扣 0／無效拒絕） ──
// 模型＝validate-order-prices 折扣段（同一組 shared helper）＋前台／後台「是否送出碼」規則；
// 各路徑再以原始碼契約確認：碼與折扣原樣送進驗價（或建單觸發器）並原樣寫入 orders。
type Scenario = "applied" | "not_applicable" | "invalid";
const SALE = 26000, ORIG = 32000;
const rpcFor = (s: Scenario) => async () =>
  s === "applied" ? row("applied", { discount_type: "percentage", discount_value: 25, message: "折扣碼有效" })
  : s === "not_applicable" ? row("not_applicable", { applicable_names: ["全區20-32人"] })
  : row("invalid", { message: "折扣碼無效" });
/** 前台／後台：invalid 不保留碼；其餘保留碼，not_applicable 折扣 0 */
async function clientSide(s: Scenario) {
  const ev = await evaluateDiscountCode(rpcFor(s), P);
  if (!ev || ev.status === "invalid") return { code: null as string | null, discountAmount: 0 };
  const c = computeDiscountedRoomCharge({ saleTotal: SALE, originalTotal: ORIG, ...discountChargeParams(ev) });
  return { code: P.code, discountAmount: c.discountAmount };
}
/** validate-order-prices 折扣段（與 index.ts 同邏輯） */
async function serverSide(code: string | null, clientDiscount: number) {
  if (!code) return { ok: true, discount: 0, roomCharged: SALE };
  const ev = await evaluateDiscountCode(rpcFor(code === "BAD" ? "invalid" : currentScenario), { ...P, code });
  if (!ev || ev.status === "invalid") return { ok: false, discount: 0, roomCharged: SALE };
  const applied = ev.status === "applied";
  const charged = applied ? ORIG : SALE;
  const c = computeDiscountedRoomCharge({ saleTotal: SALE, originalTotal: ORIG, ...discountChargeParams(ev) });
  const discount = applied ? Math.max(0, Math.min(charged, charged - c.chargedRoomTotal)) : 0;
  return { ok: Math.abs(clientDiscount - discount) < 1, discount, roomCharged: charged - discount };
}
let currentScenario: Scenario = "applied";

const vop = read("supabase/functions/validate-order-prices/index.ts");
const bf = read("apps/booking/src/pages/BookingFlow.tsx");
const fn = (n: string) => read(`supabase/functions/${n}/index.ts`);
const writesCodeAndAmount = (src: string) => /discount_code: body\.discountCode \|\| null,/.test(src) && /discount_amount: body\.discountAmount \|\| 0,/.test(src);
const paths: Array<[string, () => boolean]> = [
  ["TapPay 一次付清（免 3D）", () => bf.includes("'create-paid-order'") && /validateOrderPrices\([\s\S]*?discountCode: body\.discountCode,\s*discountAmount: body\.discountAmount,/.test(fn("create-paid-order")) && writesCodeAndAmount(fn("create-paid-order"))],
  ["TapPay 3D 驗證", () => bf.includes("'process-tappay-payment'") && /discountCode: body\.discountCode \|\| null,\s*discountAmount: body\.discountAmount \|\| 0,/.test(fn("complete-3ds-booking")) && fn("complete-3ds-booking").includes("/functions/v1/validate-order-prices") && writesCodeAndAmount(fn("complete-3ds-booking"))],
  ["綁卡（入住日扣款）", () => bf.includes("'create-card-bound-order'") && /validateOrderPrices\([\s\S]*?discountCode: body\.discountCode,\s*discountAmount: body\.discountAmount,/.test(fn("create-card-bound-order")) && writesCodeAndAmount(fn("create-card-bound-order"))],
  ["PAYUNi 信用卡", () => /payuni-create-pending-order', \{\s*body: \{ \.\.\.orderPayload, paymentType: isPayuniAtm \? 'atm' : 'credit_card' \}/.test(bf) && /validateOrderPrices\([\s\S]*?discountCode: body\.discountCode,\s*discountAmount: body\.discountAmount,/.test(fn("payuni-create-pending-order")) && writesCodeAndAmount(fn("payuni-create-pending-order"))],
  ["PAYUNi ATM（建單同上；取號 payuni-atm-create 不碰折扣）", () => bf.includes("isPayuniAtm ? 'atm'") && writesCodeAndAmount(fn("payuni-create-pending-order")) && !/discount/i.test(fn("payuni-atm-create"))],
  ["TapPay ATM（前台寫入後 tappay-atm-create 取號，不碰折扣）", () => !/discount/i.test(fn("tappay-atm-create")) && /discount_code: appliedDiscount \? appliedDiscount\.code : null,\s*discount_amount: discountAmount,/.test(bf)],
  ["LINE Pay（確認頁寫入前台已驗價的碼與折扣）", () => !/discount/i.test(fn("process-linepay-payment")) && /discount_amount: orderData\.discountAmount,\s*discount_code: orderData\.appliedDiscount\?\.code \|\| null,/.test(read("apps/booking/src/pages/LinePayConfirm.tsx"))],
  ["ATM 前台直接寫入（建單觸發器再算一次折扣）", () => /discount_code: appliedDiscount \? appliedDiscount\.code : null,\s*discount_amount: discountAmount,/.test(bf)],
];
describe("前台共同關卡：所有前台路徑分流前先呼叫 validate-order-prices，帶同一組碼與折扣", () => {
  it("驗價在每個付款分流之前", () => {
    const gate = bf.indexOf("'validate-order-prices'");
    ["'payuni-create-pending-order'", "'process-tappay-payment'", "'create-card-bound-order'", "'process-linepay-payment'", "discount_code: appliedDiscount ? appliedDiscount.code : null"].forEach((k) => expect(bf.indexOf(k)).toBeGreaterThan(gate));
    expect(bf).toMatch(/discountCode: appliedDiscount\?\.code \|\| null,\s*discountAmount,/);
  });
  it("驗價：invalid 進 errors；只有 applied 才計折扣與原價基準", () => {
    expect(vop).toMatch(/discountEval\.status === "invalid"\) \{\s*errors\.push/);
    expect(vop).toMatch(/const discountApplied = discountEval\?\.status === "applied";/);
    expect(vop).toMatch(/isValid: errors\.length === 0,/);
  });
});
describe.each(paths)("路徑契約：%s", (_name, contract) => {
  it("原始碼契約：碼與折扣原樣送驗價並原樣寫入", () => expect(contract()).toBe(true));
  it.each<[Scenario, { code: string | null; discountAmount: number; ok: boolean; roomCharged: number }]>([
    ["applied", { code: "RE98", discountAmount: 8000, ok: true, roomCharged: 24000 }],
    ["not_applicable", { code: "RE98", discountAmount: 0, ok: true, roomCharged: 26000 }],
    ["invalid", { code: null, discountAmount: 0, ok: true, roomCharged: 26000 }],
  ])("情境 %s", async (s, exp) => {
    currentScenario = s;
    const c = await clientSide(s);
    const v = await serverSide(c.code, c.discountAmount);
    expect({ code: c.code, discountAmount: c.discountAmount, ok: v.ok, roomCharged: v.roomCharged }).toEqual(exp);
  });
  it("無效碼若被強行送出（竄改）→ 驗價拒絕", async () => {
    expect((await serverSide("BAD", 0)).ok).toBe(false);
  });
});

describe("後台路徑 × 3 情境", () => {
  const cod = read("apps/booking/src/components/orders/CreateOrderDialog.tsx");
  const od = read("apps/booking/src/pages/OrderDetail.tsx");
  // CreateOrderDialog.calculateDiscount 同式：percentage → round(base*v/100)，amount → min(v, base)
  const codDiscount = (a: { type: string; value: number } | null, base: number) => !a ? 0 : a.type === "percentage" ? Math.round(base * a.value / 100) : Math.min(a.value, base);
  const codApplied = async (s: Scenario) => {
    const ev = await evaluateDiscountCode(rpcFor(s), P);
    if (ev?.status === "applied") return { code: P.code, type: ev.discountType!, value: ev.discountValue! };
    if (ev?.status === "not_applicable") return { code: P.code, type: "amount", value: 0, note: notApplicableMessage(ev) };
    return null;
  };
  it("新增訂單：原始碼寫入 appliedDiscount.code 與 totals.discount", () => {
    expect(cod).toMatch(/discount_amount: totals\.discount,\s*final_price: totals\.final,\s*discount_code: appliedDiscount\?\.code \|\| null,/);
    expect(cod).toMatch(/note: notApplicableMessage\(notApplicable\)/);
  });
  it.each<[Scenario, string | null, number]>([["applied", "RE98", 6500], ["not_applicable", "RE98", 0], ["invalid", null, 0]])("新增訂單 情境 %s", async (s, code, disc) => {
    const a = await codApplied(s);
    expect([a?.code ?? null, codDiscount(a, SALE)]).toEqual([code, disc]);
  });
  it("新增訂單：not_applicable 提示與前台同一套文字", async () => {
    expect((await codApplied("not_applicable"))?.note).toBe("此方案不適用折扣（折扣僅適用：全區20-32人），已記錄推薦碼");
  });
  // OrderDetail：applied 計折扣、not_applicable 折扣 0 且可存檔（只顯示 note）、invalid 設 error 擋存檔
  const odResult = async (s: Scenario) => {
    const ev = await evaluateDiscountCode(rpcFor(s), P);
    if (ev!.status === "not_applicable") return { canSave: true, discount: 0, note: notApplicableMessage(ev!) };
    if (ev!.status === "invalid") return { canSave: false, discount: 0, note: "" };
    return { canSave: true, discount: Math.round(SALE * ev!.discountValue! / 100), note: "" };
  };
  it("訂單詳情：原始碼三態分支與擋存檔條件", () => {
    expect(od).toMatch(/result\.status === "not_applicable"\) \{[\s\S]*?setDiscountCodeNote\(notApplicableMessage\(result\)\);/);
    expect(od).toMatch(/result\.status === "invalid"\) \{\s*setDiscountCodeError\(/);
    expect(od).toMatch(/if \(discountCodeError && editForm\.discount_code\.trim\(\)/);
  });
  it.each<[Scenario, boolean, number]>([["applied", true, 6500], ["not_applicable", true, 0], ["invalid", false, 0]])("訂單詳情 情境 %s", async (s, canSave, disc) => {
    const r = await odResult(s);
    expect([r.canSave, r.discount]).toEqual([canSave, disc]);
  });
});
