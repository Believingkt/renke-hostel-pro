import { describe, expect, it } from "vitest";
import { taipeiToday } from "@lakeze/shared/lib/taipeiToday";
import { taipeiToday as denoTaipeiToday } from "../../../../../supabase/functions/_shared/taipeiToday";

describe("taipeiToday", () => {
  it("台灣凌晨時段不會因 UTC 偏移少一天", () => {
    // 2026-08-20 01:00 台北 = 2026-08-19 17:00 UTC
    const d = new Date("2026-08-19T17:00:00Z");
    expect(taipeiToday(d)).toBe("2026-08-20");
    expect(new Date(d).toISOString().slice(0, 10)).toBe("2026-08-19");
  });

  it("台灣白天時段正確", () => {
    expect(taipeiToday(new Date("2026-08-20T06:00:00Z"))).toBe("2026-08-20");
  });

  it("前端與 Edge Function helper 結果一致（parity）", () => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(Date.UTC(2026, 7, 19, h, 30, 0));
      expect(taipeiToday(d)).toBe(denoTaipeiToday(d));
    }
  });
});
