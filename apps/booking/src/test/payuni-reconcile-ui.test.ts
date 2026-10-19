import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPayuniMethod, payuniNet } from "@/components/payuni/usePayuniFees";

const settlement = readFileSync(resolve(__dirname, "../pages/Settlement.tsx"), "utf8");
const panel = readFileSync(resolve(__dirname, "../components/headquarters/PayuniReconcilePanel.tsx"), "utf8");

describe("PAYUNi W6 手續費（Settlement）", () => {
  it("實收 = 已收 − 已退 − 手續費；未回填 → null（待對帳）", () => {
    expect(payuniNet({ collected: 6000, refunded: 1000, fee: 168 })).toBe(4832);
    expect(payuniNet({ collected: 6000, refunded: 0, fee: null })).toBeNull();
    expect(payuniNet(undefined)).toBeNull();
  });
  it("只認 PAYUNi 付款方式；TapPay 仍走 % 估算", () => {
    expect(isPayuniMethod("credit_card_payuni")).toBe(true);
    expect(isPayuniMethod(null, "atm_payuni")).toBe(true);
    expect(isPayuniMethod("credit_card", "credit_card_3ds")).toBe(false);
    expect(settlement).toContain("const fee = Math.round(amount * feeRate / 100);");
    expect(settlement).toContain("待對帳");
  });
});

describe("PAYUNi W6 HQ 對帳頁", () => {
  it("資料只經 payuni-reconcile；重新查詢走 payuni-trade-query；標記已處理必填備註", () => {
    expect(panel).toContain(`invoke("payuni-reconcile", {`);
    expect(panel).toContain(`invoke("payuni-trade-query", { body: { mer_trade_no: d.mer_trade_no } })`);
    expect(panel).toContain("note.trim().length < 2");
    expect(panel).not.toMatch(/\.from\("payuni_reconcile/);
  });
});
