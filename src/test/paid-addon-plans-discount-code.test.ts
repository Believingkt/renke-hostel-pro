import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildAddonDetails,
  hasPlanChanges,
  hasPlanReduction,
  nextPlanQty,
  parseOrderAddons,
  planDiffs,
  planSubtotal,
  plansTotal,
  PAID_ADDON_NIGHTS,
  PAID_ADDON_PLAN_RPC_SUPPORTED,
  type AddonSettingRow,
} from "@/lib/paidAddonPlans";
import {
  DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED,
  standardDiscountAmount,
  validatePaidDiscountCode,
} from "@/lib/paidDiscountCodeValidation";
import { calcOrderAddonTotal } from "@/lib/orderAddonTotal";

const settings: AddonSettingRow[] = [
  {
    id: "a1",
    addon_type: "中小型寵物",
    price_per_unit: 600,
    unit_label: "隻",
    min_quantity: 0,
    max_quantity: 5,
    enabled: true,
  },
  {
    id: "a2",
    addon_type: "加床",
    price_per_unit: 800,
    unit_label: "床",
    min_quantity: 0,
    max_quantity: 2,
    enabled: true,
  },
];

const detail = (over: Record<string, unknown>) => ({
  addon_id: "a1",
  addon_type: "中小型寵物",
  count: 2,
  price_per_unit: 600,
  total: 1200,
  unit_label: "隻",
  ...over,
});

describe("加購方案 — 載入與數量", () => {
  it("載入現行方案並帶出訂單原有數量", () => {
    const p = parseOrderAddons(settings, [detail({})]);
    expect(p.rows.map((r) => r.key)).toEqual(["中小型寵物", "加床"]);
    expect(p.quantities["中小型寵物"]).toBe(2);
    expect(p.rows[0].pricePerUnit).toBe(600);
    expect(p.rows[0].unitLabel).toBe("隻");
    expect(p.rows[0].nights).toBe(PAID_ADDON_NIGHTS);
  });

  it("單價／晚數／小計沿用既有公式", () => {
    const p = parseOrderAddons(settings, [detail({})]);
    expect(planSubtotal(p.rows[0], 3)).toBe(600 * 3 * PAID_ADDON_NIGHTS);
    expect(plansTotal(p.rows, { 中小型寵物: 2, 加床: 1 })).toBe(1200 + 800);
  });

  it("增減與清零（含上限、最小量）", () => {
    const p = parseOrderAddons(settings, []);
    const row = p.rows[1]; // 加床 max 2
    expect(nextPlanQty(row, 0, 1)).toBe(1);
    expect(nextPlanQty(row, 2, 1)).toBe(2);
    expect(nextPlanQty(row, 1, -1)).toBe(0);
  });

  it("多方案同時修改 → 逐項差異", () => {
    const p = parseOrderAddons(settings, [detail({})]);
    const q = { 中小型寵物: 3, 加床: 1 };
    const diffs = planDiffs(p.rows, q);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({
      name: "中小型寵物",
      beforeQty: 2,
      afterQty: 3,
      beforeSubtotal: 1200,
      afterSubtotal: 1800,
    });
    expect(hasPlanChanges(p.rows, q)).toBe(true);
    expect(hasPlanReduction(p.rows, q)).toBe(false);
    expect(hasPlanReduction(p.rows, { 中小型寵物: 0 })).toBe(true);
  });

  it("停用但歷史存在的方案不會消失，且不可調整", () => {
    const disabled: AddonSettingRow[] = [
      { ...settings[0] },
      { id: "a3", addon_type: "烤肉", price_per_unit: 500, unit_label: "組", enabled: false },
    ];
    const p = parseOrderAddons(disabled, [
      detail({}),
      { addon_id: "a3", addon_type: "烤肉", count: 1, price_per_unit: 500, total: 500, unit_label: "組" },
    ]);
    const legacy = p.rows.find((r) => r.key === "烤肉");
    expect(legacy?.legacyOnly).toBe(true);
    expect(p.quantities["烤肉"]).toBe(1);
  });

  it("malformed legacy 明細 fail-safe：原樣保留、不進方案列", () => {
    const p = parseOrderAddons(settings, [{ foo: "bar" }, detail({ count: 0 })]);
    expect(p.preserved).toHaveLength(2);
    expect(p.quantities["中小型寵物"]).toBeUndefined();
  });

  it("重建 custom_addon_details 時單價一律取自 addon_settings（忽略前端偽造值）", () => {
    const p = parseOrderAddons(settings, [detail({ price_per_unit: 1, total: 1 })]);
    const built = buildAddonDetails(p.rows, { ...p.quantities }, p.preserved);
    const row = built.find((b) => b.addon_type === "中小型寵物")!;
    expect(row.price_per_unit).toBe(600);
    expect(row.total).toBe(1200);
  });

  it("現場加購與方案並存：合計口徑與 DB calc_order_addon_total 相同", () => {
    const p = parseOrderAddons(settings, [detail({})]);
    const built = buildAddonDetails(p.rows, { 中小型寵物: 3 }, p.preserved);
    const total = calcOrderAddonTotal({
      pet_plan_price: 0,
      custom_addon_details: built,
      notes: "【額外現場加購金額】800【額外現場加購金額END】",
    });
    expect(total).toBe(1800 + 800);
  });

  it("方案數量調整在 v5.5A.1 安裝前 fail-closed", () => {
    expect(PAID_ADDON_PLAN_RPC_SUPPORTED).toBe(false);
  });
});

describe("折扣碼 — 唯讀驗證", () => {
  const base = {
    code: "SAVE10",
    accommodationId: "acc",
    roomFee: 10000,
    roomTypeId: null,
    checkInDate: "2026-10-01",
    pricingTemplateId: null,
  };

  it("標準折扣金額公式與後端相同", () => {
    expect(standardDiscountAmount("percentage", 10, 10000)).toBe(1000);
    expect(standardDiscountAmount("fixed", 750, 10000)).toBe(750);
  });

  it("驗證成功 → 回傳標準金額，且只呼叫唯讀 validate_discount_code", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ is_valid: true, discount_type: "percentage", discount_value: 10, message: "ok" }],
      error: null,
    }));
    const res = await validatePaidDiscountCode({ rpc } as any, base);
    expect(res.status).toBe("valid");
    expect((res as any).standardAmount).toBe(1000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("validate_discount_code");
  });

  it("驗證失敗 → invalid，不丟例外、不寫入", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ is_valid: false, message: "已過期" }],
      error: null,
    }));
    const res = await validatePaidDiscountCode({ rpc } as any, base);
    expect(res).toMatchObject({ status: "invalid", message: "已過期" });
  });

  it("空折扣碼不呼叫任何 RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const res = await validatePaidDiscountCode({ rpc } as any, { ...base, code: "  " });
    expect(res.status).toBe("invalid");
    expect(rpc).toHaveBeenCalledTimes(0);
  });

  it("折扣碼 + 人工調整金額在 v5.5A.1 安裝前 fail-closed", () => {
    expect(DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED).toBe(false);
  });
});

describe("原始碼契約", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const dialog = read("src/components/orders/PaidAmountEditDialog.tsx");
  const plans = read("src/lib/paidAddonPlans.ts");
  const codeLib = read("src/lib/paidDiscountCodeValidation.ts");

  it("對話框不得直接寫 orders / order_rooms / audit_logs", () => {
    expect(dialog).not.toMatch(/from\("orders"\)[\s\S]{0,80}\.update\(/);
    expect(dialog).not.toContain('from("order_rooms")');
    expect(dialog).not.toContain('from("audit_logs")');
    expect(plans).not.toContain('from("');
  });

  it("加購方案與現場加購同畫面，且有 −／＋、小計、合計", () => {
    expect(dialog).toContain("加購方案");
    expect(dialog).toContain("全部加購方案合計");
    expect(dialog).toContain("額外現場加購金額");
    expect(dialog).toContain("小計");
  });

  it("折扣碼有驗證按鈕與標準／實際金額欄位，且輸入改變會失效", () => {
    expect(dialog).toContain("驗證折扣碼");
    expect(dialog).toContain("系統計算標準折扣金額");
    expect(dialog).toContain("實際套用折扣金額");
    expect(dialog).toContain("已人工調整折扣金額");
    expect(dialog).toContain("}, [discountCode, discountMode]);");
  });

  it("驗證只走唯讀 validate_discount_code", () => {
    expect(codeLib).toContain('"validate_discount_code"');
    expect(codeLib).not.toContain("used_count");
    expect(codeLib).not.toContain("coupon_usages");
  });

  it("兩個 blocker 皆以 fail-closed 常數擋住送出", () => {
    expect(dialog).toContain("planBlocked");
    expect(dialog).toContain("discountBlocked");
    expect(dialog).toContain("PAID_ADDON_PLAN_RPC_SUPPORTED");
    expect(dialog).toContain("DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED");
  });
});
