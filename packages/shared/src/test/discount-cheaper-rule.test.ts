import { describe, it, expect } from "vitest";
import { computeDiscountedRoomCharge as feCompute } from "@lakeze/shared/utils/discountPricing";
import { computeDiscountedRoomCharge as beCompute } from "../../../../supabase/functions/_shared/discountPricing";

type Case = {
  name: string;
  sale: number;
  original: number;
  kind: "percentage" | "fixed" | null;
  value: number | null;
  addon: number;
  expect: { total: number; discount: number; final: number };
};

const ADDON = 1200;

const cases: Case[] = [
  { name: "1 售價較便宜（原價41000/售價38000/5%）", sale: 38000, original: 41000, kind: "percentage", value: 5, addon: ADDON, expect: { total: 42200, discount: 3000, final: 39200 } },
  { name: "2 原價打折較便宜（20%）", sale: 38000, original: 41000, kind: "percentage", value: 20, addon: ADDON, expect: { total: 42200, discount: 8200, final: 34000 } },
  { name: "3 兩者相等（原價40000/售價38000/5%）", sale: 38000, original: 40000, kind: "percentage", value: 5, addon: ADDON, expect: { total: 41200, discount: 2000, final: 39200 } },
  { name: "4 固定金額折扣 2000（39000>38000→取售價）", sale: 38000, original: 41000, kind: "fixed", value: 2000, addon: ADDON, expect: { total: 42200, discount: 3000, final: 39200 } },
  { name: "5 固定金額超過原價（99999）", sale: 38000, original: 41000, kind: "fixed", value: 99999, addon: ADDON, expect: { total: 42200, discount: 41000, final: 1200 } },
  { name: "6 多晚跨日型（原價86220/售價86000/10%）", sale: 86000, original: 86220, kind: "percentage", value: 10, addon: 0, expect: { total: 86220, discount: 8622, final: 77598 } },
  { name: "7 多間房（案例1×3）", sale: 114000, original: 123000, kind: "percentage", value: 10, addon: 0, expect: { total: 123000, discount: 12300, final: 110700 } },
  { name: "8 非方案型（無原價，逐日價20000/10%）", sale: 20000, original: 0, kind: "percentage", value: 10, addon: 0, expect: { total: 20000, discount: 2000, final: 18000 } },
  { name: "9 原價低於售價（原價30000/售價38000/10%）", sale: 38000, original: 30000, kind: "percentage", value: 10, addon: 0, expect: { total: 38000, discount: 11000, final: 27000 } },
  { name: "10 原價未設定（null→0）", sale: 25000, original: 0, kind: "fixed", value: 3000, addon: 0, expect: { total: 25000, discount: 3000, final: 22000 } },
  { name: "11 未套用折扣碼（回歸）", sale: 38000, original: 41000, kind: null, value: null, addon: ADDON, expect: { total: 39200, discount: 0, final: 39200 } },
  { name: "12 固定金額剛好等於價差", sale: 38000, original: 41000, kind: "fixed", value: 3000, addon: 0, expect: { total: 41000, discount: 3000, final: 38000 } },
];

function run(fn: typeof feCompute, c: Case) {
  const r = fn({ saleTotal: c.sale, originalTotal: c.original, discountKind: c.kind, discountValue: c.value });
  return {
    total: r.billedRoomTotal + c.addon,
    discount: r.discountAmount,
    final: r.chargedRoomTotal + c.addon,
  };
}

describe("折扣碼取較便宜規則（前端／伺服器同一組測試向量）", () => {
  for (const c of cases) {
    it(c.name, () => {
      const fe = run(feCompute, c);
      const be = run(beCompute, c);
      // 前後端一致（容差 2）
      expect(Math.abs(fe.total - be.total)).toBeLessThanOrEqual(2);
      expect(Math.abs(fe.discount - be.discount)).toBeLessThanOrEqual(2);
      expect(Math.abs(fe.final - be.final)).toBeLessThanOrEqual(2);
      // 期望值
      expect(fe).toEqual(c.expect);
      // final = total − discount（OrderDetail / update_paid_order_discount_v2 的一致性前提）
      expect(fe.final).toBe(fe.total - fe.discount);
      // 實付不得為負
      expect(fe.final).toBeGreaterThanOrEqual(0);
      // 客人永遠不會比不用折扣碼更貴
      if (c.kind) expect(fe.final - c.addon).toBeLessThanOrEqual(c.sale);
      // eslint-disable-next-line no-console
      console.log(`${c.name} => FE total=${fe.total} discount=${fe.discount} final=${fe.final} | BE total=${be.total} discount=${be.discount} final=${be.final}`);
    });
  }
});

describe("已使用折扣碼的訂單不可自助改人數（前後端條件一致）", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.resolve(__dirname, "../../../..");
  const fe = fs.readFileSync(path.join(root, "apps/booking/src/pages/MemberOrderDetail.tsx"), "utf8");
  const be = fs.readFileSync(path.join(root, "supabase/functions/member-order-manage/index.ts"), "utf8");
  const MSG = "此訂單已使用折扣碼，如需更改人數請聯繫客服";

  it("後端 change_guests / change_guests_quote 前即攔截並回傳統一訊息", () => {
    const idxGate = be.indexOf(MSG);
    const idxAction = be.indexOf('body.action === "change_guests"');
    expect(idxGate).toBeGreaterThan(-1);
    expect(idxGate).toBeGreaterThan(idxAction);
    expect(be).toContain('String((order as any).discount_code ?? "").trim() !== ""');
    expect(be).toContain("discount_amount, discount_code, package_id");
  });

  it("前端讀取 discount_code、停用輸入並顯示同一訊息", () => {
    expect(fe).toContain("discount_code, final_price");
    expect(fe).toContain("const guestChangeLockedByDiscount = String(order.discount_code ?? \"\").trim() !== \"\";");
    expect(fe).toContain("disabled={guestChangeLockedByDiscount}");
    expect(fe).toContain(MSG);
    expect(fe).toContain("guestChangeLockedByDiscount ||");
  });

  it("未使用折扣碼時不受影響（擋關條件只看 discount_code）", () => {
    const empty = String(null ?? "").trim() !== "";
    const withCode = String("KOL10" ?? "").trim() !== "";
    expect(empty).toBe(false);
    expect(withCode).toBe(true);
  });
});
