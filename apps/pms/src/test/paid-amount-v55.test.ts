import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildPaidDiscountRpcArgs,
  callUpdatePaidOrderDiscountV2,
  canShowPaidDiscountEntry,
  PAID_DISCOUNT_RPC,
} from "@/lib/paidDiscountEdit";
import {
  buildPaidAddonRpcArgs,
  callUpdatePaidOrderAddonsV3,
  canEditPaidAddon,
  getPaidAddonRisk,
  isPaidAddonFlowOrder,
  PAID_ADDON_RPC,
} from "@/lib/paidAddonEdit";
import { SETTLEMENT_OPTIONS, isValidSettlement } from "@/lib/paidAmountSettlement";

const ACC = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const OID = "33333333-3333-3333-3333-333333333333";
const TS = "2026-09-07T05:00:00+00:00";

const order = (over: Record<string, unknown> = {}) => ({
  accommodation_id: ACC,
  payment_status: "paid",
  order_status: "confirmed",
  refund_status: "none",
  refunded_amount: 0,
  refunded_at: null,
  paid_amount: 10000,
  ...over,
});

const discountBase = {
  orderId: OID,
  expectedUpdatedAt: TS,
  reason: "現場加購調整",
  mode: "manual" as const,
  settlement: "collected" as const,
  confirmed: true,
  discountAmount: 500,
};

const addonBase = {
  orderId: OID,
  expectedUpdatedAt: TS,
  reason: "現場加購調整",
  settlement: "collected" as const,
  confirmed: true,
  onsiteAmount: 800,
  onsiteNote: "加購早餐2份",
};

const mockClient = () => {
  const rpc = vi.fn(async () => ({ data: { changed: true, order_id: OID, final_price: 1 }, error: null }));
  return { rpc } as any;
};

describe("v5.5 — 差額處理方式定義", () => {
  it("五個選項且值與後端一致", () => {
    expect(SETTLEMENT_OPTIONS.map((o) => o.value)).toEqual([
      "collected",
      "refunded",
      "offset",
      "pending",
      "data_only",
    ]);
    expect(isValidSettlement("collected")).toBe(true);
    expect(isValidSettlement("")).toBe(false);
    expect(isValidSettlement("whatever")).toBe(false);
  });
});

describe("v5.5 — 入口權限（唯一來源 = 同館 orders editable + 已付清）", () => {
  const check = (level: any, o: any = order(), acc: string | null = ACC) =>
    canEditPaidAddon({ ordersLevel: level, currentAccommodationId: acc, order: o });
  const show = (level: any, o: any = order(), acc: string | null = ACC) =>
    canShowPaidDiscountEntry({ ordersLevel: level, currentAccommodationId: acc, order: o });

  it("editable 同館已付款 → 兩個入口都顯示", () => {
    expect(check("editable").allowed).toBe(true);
    expect(show("editable")).toBe(true);
  });
  it("readonly / hidden / null → 都不顯示", () => {
    for (const lv of ["readonly", "hidden", null, undefined]) {
      expect(check(lv as any).allowed).toBe(false);
      expect(show(lv as any)).toBe(false);
    }
  });
  it("跨館 / 無館別 → 都不顯示", () => {
    expect(check("editable", order({ accommodation_id: OTHER })).allowed).toBe(false);
    expect(show("editable", order({ accommodation_id: OTHER }))).toBe(false);
    expect(check("editable", order(), null).allowed).toBe(false);
    expect(show("editable", order(), null)).toBe(false);
  });
  it("unpaid / deposit_paid / pending_payment / refunded / partial_refunded → 都不顯示", () => {
    for (const st of ["unpaid", "deposit_paid", "pending_payment", "refunded", "partial_refunded"]) {
      expect(isPaidAddonFlowOrder(order({ payment_status: st }))).toBe(false);
      expect(check("editable", order({ payment_status: st })).allowed).toBe(false);
      expect(show("editable", order({ payment_status: st }))).toBe(false);
    }
    expect(show("editable", order({ payment_status: "fully_paid" }))).toBe(true);
  });
  it("退款中／已取消不再永久阻擋，改為高風險提醒", () => {
    expect(check("editable", order({ refund_status: "pending_manual" })).allowed).toBe(true);
    expect(getPaidAddonRisk(order({ refund_status: "pending_manual" }))).toBe("refund");
    expect(getPaidAddonRisk(order({ order_status: "cancelled" }))).toBe("cancelled");
    expect(getPaidAddonRisk(order({ order_status: "cancelled", refunded_amount: 100 }))).toBe(
      "refund_and_cancelled",
    );
    expect(getPaidAddonRisk(order())).toBe("none");
  });
});

describe("v5.5A.3 — RPC 參數組裝（缺任何必填 = 0 mutation）", () => {
  it("折扣：原因空白 / 未選差額 / 未二次確認 → throw，不呼叫 RPC", async () => {
    const client = mockClient();
    for (const bad of [
      { ...discountBase, reason: "" },
      { ...discountBase, settlement: "" as any },
      { ...discountBase, confirmed: false },
      { ...discountBase, expectedUpdatedAt: "" },
      { ...discountBase, mode: "code_override" as const, discountCode: "ABC", appliedDiscountAmount: undefined },
    ]) {
      await expect(callUpdatePaidOrderDiscountV2(client, bad as any)).rejects.toThrow();
    }
    expect(client.rpc).toHaveBeenCalledTimes(0);
  });

  it("加購：原因空白 / 未選差額 / 未二次確認 / 方案重複 → throw，不呼叫 RPC", async () => {
    const client = mockClient();
    for (const bad of [
      { ...addonBase, reason: " " },
      { ...addonBase, settlement: "" as any },
      { ...addonBase, confirmed: false },
      { ...addonBase, expectedUpdatedAt: "" },
      { ...addonBase, addonPlans: [{ addon_id: "a1", quantity: 1 }, { addon_id: "a1", quantity: 2 }] },
      { ...addonBase, addonPlans: [{ addon_id: "a1", quantity: -1 }] },
    ]) {
      await expect(callUpdatePaidOrderAddonsV3(client, bad as any)).rejects.toThrow();
    }
    expect(client.rpc).toHaveBeenCalledTimes(0);
  });

  it("折扣 payload 完全符合 v2 signature，含 code_override", () => {
    expect(buildPaidDiscountRpcArgs(discountBase)).toEqual({
      p_order_id: OID,
      p_expected_updated_at: TS,
      p_reason: "現場加購調整",
      p_mode: "manual",
      p_discount_amount: 500,
      p_discount_code: null,
      p_confirmed: true,
      p_settlement_handling: "collected",
      p_applied_discount_amount: null,
      p_risk_acknowledged: false,
    });
    const codeArgs = buildPaidDiscountRpcArgs({
      ...discountBase,
      mode: "code",
      discountCode: " abc ",
    });
    expect(codeArgs.p_discount_code).toBe("ABC");
    expect(codeArgs.p_discount_amount).toBe(null);
    expect(codeArgs.p_applied_discount_amount).toBe(null);

    const overrideArgs = buildPaidDiscountRpcArgs({
      ...discountBase,
      mode: "code_override",
      discountCode: "abc",
      appliedDiscountAmount: 1234,
    });
    expect(overrideArgs.p_mode).toBe("code_override");
    expect(overrideArgs.p_discount_code).toBe("ABC");
    expect(overrideArgs.p_applied_discount_amount).toBe(1234);
  });

  it("加購 payload 完全符合 v3 signature，且不含任何金額欄位", () => {
    const args = buildPaidAddonRpcArgs({
      ...addonBase,
      addonPlans: [{ addon_id: "a1", quantity: 2 }],
    });
    expect(Object.keys(args).sort()).toEqual(
      [
        "p_addon_plans",
        "p_confirmed",
        "p_expected_updated_at",
        "p_onsite_amount",
        "p_onsite_note",
        "p_order_id",
        "p_paid_amount",
        "p_price_change_acknowledged",
        "p_reason",
        "p_reduce_acknowledged",
        "p_risk_acknowledged",
        "p_settlement_handling",
      ].sort(),
    );
    expect(args.p_addon_plans).toEqual([{ addon_id: "a1", quantity: 2 }]);
    expect(args.p_onsite_amount).toBe(800);
    expect(args.p_onsite_note).toBe("加購早餐2份");
    expect(args.p_paid_amount).toBe(null);
    const json = JSON.stringify(args);
    expect(json).not.toContain("notes");
    for (const forbidden of ["price_per_unit", "total", "subtotal", "multiplier", "pricing_mode", "final_price"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("成功路徑：各自只呼叫一次專用 RPC（v3 / v2）", async () => {
    const c1 = mockClient();
    await callUpdatePaidOrderDiscountV2(c1, discountBase);
    expect(c1.rpc).toHaveBeenCalledTimes(1);
    expect(c1.rpc.mock.calls[0][0]).toBe(PAID_DISCOUNT_RPC);
    expect(PAID_DISCOUNT_RPC).toBe("update_paid_order_discount_v2");

    const c2 = mockClient();
    await callUpdatePaidOrderAddonsV3(c2, addonBase);
    expect(c2.rpc).toHaveBeenCalledTimes(1);
    expect(c2.rpc.mock.calls[0][0]).toBe(PAID_ADDON_RPC);
    expect(PAID_ADDON_RPC).toBe("update_paid_order_addons_v3");
  });

  it("後端錯誤：原樣拋出、不 fallback、不假成功", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "此訂單的金額格式無法判定（訂單 DP6X96E6），為保護資料未做任何修改" },
      })),
    } as any;
    await expect(callUpdatePaidOrderAddonsV3(client, addonBase)).rejects.toThrow(
      "金額格式無法判定",
    );
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("legacy / canonical 回傳皆原樣帶回", async () => {
    for (const fmt of ["legacy", "canonical"]) {
      const client = {
        rpc: vi.fn(async () => ({
          data: { changed: true, order_id: OID, format: fmt, final_price: 12000, paid_amount: 12000 },
          error: null,
        })),
      } as any;
      const res = await callUpdatePaidOrderAddonsV3(client, addonBase);
      expect(res.format).toBe(fmt);
      expect(res.final_price).toBe(12000);
    }
  });
});

describe("v5.5A.3 — 原始碼契約", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const dialog = read("src/components/orders/PaidAmountEditDialog.tsx");
  const detail = read("src/pages/OrderDetail.tsx");
  const addonLib = read("src/lib/paidAddonEdit.ts");
  const discountLib = read("src/lib/paidDiscountEdit.ts");

  it("專用對話框不得直接寫 orders / order_rooms / audit_logs", () => {
    expect(dialog).not.toMatch(/from\("orders"\)[\s\S]{0,80}\.update\(/);
    expect(dialog).not.toContain('from("order_rooms")');
    expect(dialog).not.toContain('from("audit_logs")');
    expect(addonLib).not.toContain('from("orders")');
    expect(discountLib).not.toContain('from("orders")');
  });

  it("只呼叫 v5.5A.3 專用 RPC，不再呼叫舊 RPC", () => {
    for (const src of [dialog, addonLib, discountLib]) {
      expect(src).not.toMatch(/"update_paid_order_addons_v2"/);
      expect(src).not.toMatch(/"update_paid_order_discount"/);
    }
    expect(addonLib).toContain('"update_paid_order_addons_v3"');
    expect(discountLib).toContain('"update_paid_order_discount_v2"');
  });

  it("兩個入口皆存在且共用同一顯示條件", () => {
    expect(detail).toContain("修改已結清折扣");
    expect(detail).toContain("修改額外加購");
    expect(detail).toContain("canUsePaidAmountDialogs");
    expect(detail).toContain('getModuleLevel("orders") === "editable"');
  });

  it("不得依賴舊的折扣特殊權限", () => {
    for (const src of [dialog, detail, addonLib, discountLib]) {
      expect(src).not.toContain("paid_order_discount_unlock_permissions");
      expect(src).not.toContain("can_unlock_paid_order_discount");
    }
  });

  it("已付款訂單的加購欄位不得由一般 Save 送出", () => {
    expect(detail).toContain('blocked.push("額外現場加購金額")');
    expect(detail).toContain('blocked.push("額外現場加購備註")');
    expect(detail).toContain('blocked.push("加購金額")');
    expect(detail).toContain("isPaidAddonFlowOrder(order as any)");
  });

  it("對話框採兩段式確認，確認前不得 mutation", () => {
    expect(dialog).toContain("確認已核對，儲存修改");
    expect(dialog).toContain("返回檢查");
    expect(dialog).toContain('if (!snap || step !== "confirm" || !canConfirm) return;');
  });

  it("高風險與差額處理方式必選", () => {
    expect(dialog).toContain("差額處理方式（必選）");
    expect(dialog).toContain("修改原因（必填）");
    expect(dialog).toContain("此操作會降低訂單應收金額");
    expect(dialog).toContain("我已了解風險，仍要修改");
  });

  it("RPC 回傳不完整時不得顯示成功", () => {
    expect(dialog).toContain("後端未回傳結果");
  });

  it("變更紀錄支援 paid_addon_edit 且不顯示 raw JSON／備註全文", () => {
    const card = read("src/components/orders/OrderAuditLogCard.tsx");
    expect(card).toContain("paid_addon_edit");
    expect(card).toContain("paid_discount_edit");
    expect(card).toContain("settlementLabel");
    expect(card).toContain('["custom_addon_details", "notes", "__notes_visible"]');
  });
});
