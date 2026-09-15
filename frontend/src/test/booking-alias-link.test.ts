import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

import { registerBookingAlias } from "@/lib/bookingAliasRegistry";
import { bookingPath } from "@/lib/frontendUrl";
import { buildAccommodationCanonical } from "@/lib/canonicalUrl";

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("平台入口與短網址統一", () => {
  beforeEach(() => registerBookingAlias(ID, "sensaninn", null));

  it("有 alias 時輸出短網址且不帶 accId", () => {
    expect(bookingPath(ID)).toBe("/sensaninn");
  });

  it("保留其他查詢參數與錨點", () => {
    expect(bookingPath({ accommodationId: ID, params: { checkIn: "2026-09-10" }, hash: "rooms" }))
      .toBe("/sensaninn?checkIn=2026-09-10#rooms");
  });

  it("查不到 alias 時退回 uuid 路徑（向下相容）", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(bookingPath(other)).toBe(`/booking/villa/${other}?accId=${other}`);
  });

  it("canonical 與連結一致", () => {
    expect(buildAccommodationCanonical({ id: ID, short_url_alias: "sensaninn", custom_domain: null }))
      .toBe("https://booking.lakeze.com/sensaninn");
  });
});
