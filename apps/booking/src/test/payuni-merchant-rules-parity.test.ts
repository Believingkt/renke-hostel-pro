import { describe, it, expect } from "vitest";
import * as front from "@/lib/payuniMerchantRules";
import * as back from "../../../../supabase/functions/_shared/payuniMerchant";

const FORM = {
  legal_name: "測試民宿有限公司", ubn: "12345678", member_email: "owner@example.com", mcid: "A123456789",
  contact_name: "王小明", contact_tel: "02-9888888#123", contact_mobile: "0912345678",
  mer_email: "cs@example.com", mer_name: "測試館A", mer_eng_name: "Test Villa A", mer_addr: "台北市信義區信義路1號",
  mer_addr_post: "110", mer_desc: "民宿住宿服務；測試", mer_mcc: "7011", goods_rate: "0,100,0,0",
  payment: ["CREDIT", "ForeignCard", "ATM"], deliver_time: "1", escrow_type: "0", mer_unit_price: "5000",
};

const CASES: Array<Record<string, unknown>> = [
  {},
  { ubn: "123456789" }, { ubn: "A123456789" }, { ubn: "a123456789" },
  { member_email: "x@" }, { mer_eng_name: "Test 民宿" }, { mer_eng_name: "A".repeat(51) }, { mer_eng_name: "Tom's B&B (No.1)" },
  { mer_name: "一".repeat(21) }, { mer_addr_post: "1100" }, { goods_rate: "0,90,0,0" }, { goods_rate: "25,25,25,25" },
  { contact_tel: "", contact_mobile: "" }, { contact_tel: "029888888" }, { contact_mobile: "0812345678" },
  { payment: [] }, { payment: "CREDIT,LinePay" }, { mer_unit_price: "0" }, { escrow_type: "2" }, { mer_mcc: "AB12" }, { mer_mcc: "000" }, { mer_mcc: "0000" }, { mer_mcc: "0" }, { mer_mcc: "0701" },
];

describe("PAYUNi 建店規則：前端副本與後端 _shared/payuniMerchant.ts 結果一致", () => {
  it.each(CASES.map((c, i) => [i, c] as const))("案例 %i：validateBindForm 相同", (_i, c) => {
    const f = { ...FORM, ...c } as any;
    expect(front.validateBindForm(f)).toEqual(back.validateBindForm(f));
  });

  it("其他函式結果相同", () => {
    expect(front.buildBindPayload(FORM as any, "TEST0001", "https://booking.lakeze.com/a"))
      .toEqual(back.buildBindPayload(FORM as any, "TEST0001", "https://booking.lakeze.com/a"));
    for (const v of [null, 1, 2, 8, 9, 91, 92, 99, 5]) expect(front.merStatusLabel(v)).toBe(back.merStatusLabel(v));
    for (const v of [null, 1, 5, 8, 9, 92, 99, 3]) expect(front.memberStatusLabel(v)).toBe(back.memberStatusLabel(v));
    expect(front.validateBindForm({ ...FORM, mer_mcc: "000" } as any).mer_mcc).toBe("MCC 尚未設定");
    expect(front.nextMerId("TEST", ["TEST0009"])).toBe(back.nextMerId("TEST", ["TEST0009"]));
    expect(front.canSwitchToPayuni(1, { ATM: 1 })).toEqual(back.canSwitchToPayuni(1, { ATM: 1 }));
    expect(front.canSwitchToPayuni(9, {})).toEqual(back.canSwitchToPayuni(9, {}));
    expect(front.buildMerUrl("")).toBe(back.buildMerUrl(""));
    expect(front.defaultMerDesc("a\nb")).toBe(back.defaultMerDesc("a\nb"));
    expect(front.PAYUNI_PAYMENT_TOOL_KEYS).toEqual(back.PAYUNI_PAYMENT_TOOL_KEYS);
  });

  it("前端已擋下驗收第 3 項三種錯誤", () => {
    expect(front.validateBindForm({ ...FORM, ubn: "123456789" } as any).ubn).toBeTruthy();
    expect(front.validateBindForm({ ...FORM, mer_eng_name: "測試" } as any).mer_eng_name).toBeTruthy();
    expect(front.validateBindForm({ ...FORM, goods_rate: "0,50,0,0" } as any).goods_rate).toBeTruthy();
  });
});
