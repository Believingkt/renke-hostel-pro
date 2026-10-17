import { describe, it, expect } from "vitest";
import { LIVE_DOMAINS } from "@lakeze/shared/utils/paymentDomain";
import { PAYUNI_LIVE_DOMAINS } from "../../../../supabase/functions/_shared/payuniTrade";

describe("PAYUNi IFrameDomain 允許清單與前端 LIVE_DOMAINS 一致", () => {
  it("兩份網域相同", () => {
    expect([...LIVE_DOMAINS].sort()).toEqual([...PAYUNI_LIVE_DOMAINS].sort());
  });
});
