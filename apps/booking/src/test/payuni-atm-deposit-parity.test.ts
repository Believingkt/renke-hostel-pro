import { describe, it, expect } from "vitest";
import * as front from "@/lib/bookingDeposit";
import * as edge from "../../../../supabase/functions/_shared/bookingDeposit";

describe("ATM 訂金：PAYUNi（Edge _shared）與 TapPay（前端）同一算法", () => {
  it("各種比例、總額算出相同訂金／尾款", () => {
    const settingsList = [
      null, {}, { use_deposit: false }, { use_deposit: true, deposit_percentage: 0 }, { deposit_percentage: 30 },
      { deposit_percentage: 33.3 }, { deposit_percentage: 50 }, { deposit_percentage: 100 }, { deposit_percentage: 120 },
    ];
    for (const s of settingsList) {
      for (const total of [0, 1, 999, 1001, 3333, 12000, 12345.6, 99999]) {
        expect(edge.getDepositBreakdown(total, s)).toEqual(front.getDepositBreakdown(total, s));
      }
    }
  });
  it("兩份原始碼除首行註解外逐字相同", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(process.cwd().replace(/\/apps\/booking$/, ""));
    const a = fs.readFileSync(path.join(root, "apps/booking/src/lib/bookingDeposit.ts"), "utf8");
    const b = fs.readFileSync(path.join(root, "supabase/functions/_shared/bookingDeposit.ts"), "utf8");
    expect(b.split("\n").slice(1).join("\n")).toBe(a);
  });
});
