import { describe, it, expect } from "vitest";
import { LIVE_DOMAINS } from "@lakeze/shared/utils/paymentDomain";
import { PAYUNI_LIVE_DOMAINS } from "../../../../supabase/functions/_shared/payuniTrade";

describe("PAYUNi IFrameDomain 允許清單 = 前端 LIVE_DOMAINS 去掉 *.lovable.app", () => {
  it("清單一致", () => {
    const expected = [...LIVE_DOMAINS].filter((d) => !d.endsWith(".lovable.app")).sort();
    expect([...PAYUNI_LIVE_DOMAINS].sort()).toEqual(expected);
  });
});
