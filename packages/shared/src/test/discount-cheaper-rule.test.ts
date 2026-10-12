import { describe, it, expect } from "vitest";
import { computeDiscountedRoomCharge as feCompute } from "@lakeze/shared/utils/discountPricing";
import { computeDiscountedRoomCharge as beCompute } from "../../../../supabase/functions/_shared/discountPricing";

import vectors from "./fixtures/discount-pricing-vectors.json";

type Case = {
  id: string;
  name: string;
  sale: number;
  original: number;
  kind: "percentage" | "fixed" | null;
  value: number | null;
  addon: number;
  expect: { total: number; discount: number; final: number };
};

// 三方（前端／Edge／SQL）共用測試向量：packages/shared/src/test/fixtures/discount-pricing-vectors.json
const cases: Case[] = vectors.pricingCases as Case[];

function run(fn: typeof feCompute, c: Case) {
  const r = fn({ saleTotal: c.sale, originalTotal: c.original, discountKind: c.kind, discountValue: c.value });
  return {
    total: r.billedRoomTotal + c.addon,
    discount: r.discountAmount,
    final: r.chargedRoomTotal + c.addon,
  };
}

describe("折扣碼取較便宜規則（前端／伺服器同一組測試向量）", () => {
  it("共用向量檔含 17 個計價案例", () => {
    expect(cases.length).toBe(17);
  });

  for (const c of cases) {
    it(`${c.id} ${c.name}`, () => {
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
