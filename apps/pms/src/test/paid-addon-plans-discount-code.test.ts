import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildAddonPlansPayload,
  buildEstimatedAddonDetails,
  currentMultiplier,
  hasPlanChanges,
  hasPlanMerge,
  hasPlanReduction,
  needsPriceChangeAck,
  nextPlanQty,
  parseOrderAddons,
  planDiffs,
  planSubtotal,
  plansTotal,
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
    pricing_mode: "per_stay",
    min_quantity: 0,
    max_quantity: 5,
    enabled: true,
  },
  {
    id: "a2",
    addon_type: "加床",
    price_per_unit: 800,
    unit_label: "床",
    pricing_mode: "per_night",
    min_quantity: 0,
    max_quantity: 2,
    enabled: true,
  },
];

const detail = (over: Record<string, unknown> = {}) => ({
  addon_id: "a1",
  addon_type: "中小型寵物",
  count: 2,
  price_per_unit: 600,
  total: 1200,
  unit_label: "隻",
  ...over,
});

describe("加購方案 — 載入與數量", () => {
  it("載入現行方案並帶出訂單原有數量、目前單價與計價倍數", () => {
    const p = parseOrderAddons(settings, [detail()], 3);
    expect(p.rows.map((r) => r.key)).toEqual(["中小型寵物", "加床"]);
    expect(p.quantities["中小型寵物"]).toBe(2);
    expect(p.rows[0].pricePerUnit).toBe(600);
    expect(p.rows[0].multiplier).toBe(1); // per_stay
    expect(p.rows[1].multiplier).toBe(3); // per_night × 3 晚
    expect(currentMultiplier("unknown", 3)).toBe(null);
  });

  it("小計＝目前單價 × 數量 × 目前倍數", () => {
    const p = parseOrderAddons(settings, [detail()], 3);
    expect(planSubtotal(p.rows[0], 3)).toBe(600 * 3 * 1);
    expect(planSubtotal(p.rows[1], 1)).toBe(800 * 1 * 3);
    expect(plansTotal(p.rows, { 中小型寵物: 2, 加床: 1 })).toBe(1200 + 2400);
  });

  it("增減與清零（含上限、最小量）", () => {
    const p = parseOrderAddons(settings, [], 1);
    const row = p.rows[1];
    expect(nextPlanQty(row, 0, 1)).toBe(1);
    expect(nextPlanQty(row, 2, 1)).toBe(2);
    expect(nextPlanQty(row, 1, -1)).toBe(0);
  });

  it("多方案同時修改 → 逐項差異含單價／倍數 before→after", () => {
    const p = parseOrderAddons(settings, [detail()], 1);
    const q = { 中小型寵物: 3, 加床: 1 };
    const diffs = planDiffs(p.rows, q);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({
      name: "中小型寵物",
      beforeQty: 2,
      afterQty: 3,
      beforePricePerUnit: 600,
      afterPricePerUnit: 600,
      beforeMultiplier: 1,
      afterMultiplier: 1,
      beforeSubtotal: 1200,
      afterSubtotal: 1800,
    });
    expect(hasPlanChanges(p.rows, q)).toBe(true);
    expect(hasPlanReduction(p.rows, q)).toBe(false);
    expect(hasPlanReduction(p.rows, { 中小型寵物: 0 })).toBe(true);
  });

  it("送出 payload 只含 addon_id + quantity，且只含真的有變更的方案", () => {
    const p = parseOrderAddons(settings, [detail()], 1);
    const payload = buildAddonPlansPayload(p.rows, { ...p.quantities, 加床: 1 });
    expect(payload).toEqual([{ addon_id: "a2", quantity: 1 }]);
    for (const item of payload) {
      expect(Object.keys(item).sort()).toEqual(["addon_id", "quantity"]);
    }
  });

  it("數量完全未變 → payload 為空（真正 no-op）", () => {
    const p = parseOrderAddons(settings, [detail()], 1);
    expect(buildAddonPlansPayload(p.rows, p.quantities)).toEqual([]);
    expect(hasPlanChanges(p.rows, p.quantities)).toBe(false);
    expect(needsPriceChangeAck(p.rows, p.quantities)).toBe(false);
  });

  it("現行單價／倍數與歷史不同 → 需明確確認", () => {
    const p = parseOrderAddons(settings, [detail({ price_per_unit: 500, total: 1000 })], 1);
    expect(needsPriceChangeAck(p.rows, { ...p.quantities, 中小型寵物: 3 })).toBe(true);
    expect(needsPriceChangeAck(p.rows, { ...p.quantities, 中小型寵物: 0 })).toBe(false);
  });

  it("同方案多筆舊明細 → 合併提示", () => {
    const p = parseOrderAddons(settings, [detail(), detail({ count: 1, total: 600 })], 1);
    expect(p.rows[0].lines).toBe(2);
    expect(hasPlanMerge(p.rows, { 中小型寵物: 5 })).toBe(true);
    expect(hasPlanMerge(p.rows, { 中小型寵物: 3 })).toBe(false); // 數量未變 → no-op
  });

  it("停用但歷史存在的方案不會消失，且不可調整、不進 payload", () => {
    const disabled: AddonSettingRow[] = [
      { ...settings[0] },
      { id: "a3", addon_type: "烤肉", price_per_unit: 500, unit_label: "組", pricing_mode: "per_stay", enabled: false },
    ];
    const p = parseOrderAddons(disabled, [
      detail(),
      { addon_id: "a3", addon_type: "烤肉", count: 1, price_per_unit: 500, total: 500, unit_label: "組" },
    ], 1);
    const legacy = p.rows.find((r) => r.key === "烤肉");
    expect(legacy?.legacyOnly).toBe(true);
    expect(p.quantities["烤肉"]).toBe(1);
    expect(buildAddonPlansPayload(p.rows, { ...p.quantities, 烤肉: 5 })).toEqual([]);
  });

  it("malformed legacy 明細 fail-safe：原樣保留、不進方案列", () => {
    const p = parseOrderAddons(settings, [{ foo: "bar" }, detail({ count: 0 })], 1);
    expect(p.preserved).toHaveLength(2);
    expect(p.quantities["中小型寵物"]).toBeUndefined();
  });

  it("預估明細只用於顯示，單價取自 addon_settings", () => {
    const p = parseOrderAddons(settings, [detail({ price_per_unit: 1, total: 1 })], 1);
    const built = buildEstimatedAddonDetails(p.rows, { ...p.quantities }, p.preserved);
    const row = built.find((b) => b.addon_type === "中小型寵物")!;
    expect(row.price_per_unit).toBe(600);
    expect(row.total).toBe(1200);
  });

  it("現場加購與方案並存：合計口徑與 DB calc_order_addon_total 相同", () => {
    const p = parseOrderAddons(settings, [detail()], 1);
    const built = buildEstimatedAddonDetails(p.rows, { 中小型寵物: 3 }, p.preserved);
    const total = calcOrderAddonTotal({
      pet_plan_price: 0,
      custom_addon_details: built,
      notes: "【額外現場加購金額】800【額外現場加購金額END】",
    });
    expect(total).toBe(1800 + 800);
  });

  it("v5.5A.3 後端已支援方案數量調整", () => {
    expect(PAID_ADDON_PLAN_RPC_SUPPORTED).toBe(true);
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
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
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

  it("v5.5A.3 後端已支援折扣碼 + 人工調整金額", () => {
    expect(DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED).toBe(true);
  });
});

describe("原始碼契約", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const dialog = read("apps/pms/src/components/orders/PaidAmountEditDialog.tsx");
  const plans = read("apps/pms/src/lib/paidAddonPlans.ts");
  const codeLib = read("apps/pms/src/lib/paidDiscountCodeValidation.ts");

  it("對話框不得直接寫 orders / order_rooms / audit_logs", () => {
    expect(dialog).not.toMatch(/from\("orders"\)[\s\S]{0,80}\.update\(/);
    expect(dialog).not.toContain('from("order_rooms")');
    expect(dialog).not.toContain('from("audit_logs")');
    expect(plans).not.toContain('from("');
  });

  it("加購方案與現場加購同畫面，且有 −／＋、小計、合計", () => {
    expect(dialog).toContain("加購方案");
    expect(dialog).toContain("全部加購方案合計（預估）");
    expect(dialog).toContain("額外現場加購金額");
    expect(dialog).toContain("小計");
  });

  it("核對頁顯示單價／倍數／小計 before→after 與合併、單價校正提示", () => {
    expect(dialog).toContain("計價倍數");
    expect(dialog).toContain("此方案的多筆舊明細會合併為一筆");
    expect(dialog).toContain("會改用目前單價與目前計價方式重算");
    expect(dialog).toContain("我確認改用目前方案單價與計價方式");
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
    expect(codeLib).not.toMatch(/\.(insert|update|delete)\(/);
    expect(codeLib).not.toMatch(/rpc\(\s*"(?!validate_discount_code)/);
  });

  it("不再引用任何舊 blocker 常數", () => {
    expect(dialog).not.toContain("PAID_ADDON_PLAN_BLOCKER");
    expect(dialog).not.toContain("DISCOUNT_CODE_OVERRIDE_BLOCKER");
  });
});
