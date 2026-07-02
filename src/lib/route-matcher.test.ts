import { describe, it, expect } from "vitest";
import {
  BOOKING_ALLOWED_PREFIXES,
  isBookingAllowedPath,
  isBookingDomain,
  isAlwaysAllowedPath,
  isReservedFirstSegment,
} from "./route-matcher";

describe("route-matcher — booking.lakeze.com 允許 /docs 與 /api-docs", () => {
  it("BOOKING_ALLOWED_PREFIXES 必須包含 /docs 與 /api-docs", () => {
    expect(BOOKING_ALLOWED_PREFIXES).toContain("/docs");
    expect(BOOKING_ALLOWED_PREFIXES).toContain("/api-docs");
  });

  describe("isBookingAllowedPath — /docs/*", () => {
    it.each([
      "/docs",
      "/docs/accommodation-api",
      "/docs/accommodation-api.openapi.json",
      "/docs/accommodation-api-swagger.html",
      "/docs/owlting-cm",
    ])("允許 %s", (p) => {
      expect(isBookingAllowedPath(p)).toBe(true);
    });
  });

  describe("isBookingAllowedPath — /api-docs/*", () => {
    it.each([
      "/api-docs",
      "/api-docs/accommodation",
      "/api-docs/kol",
      "/api-docs/points",
      "/api-docs/owlting-cm",
      "/api-docs/accommodation-ai",
    ])("允許 %s", (p) => {
      expect(isBookingAllowedPath(p)).toBe(true);
    });
  });

  it("嚴格邊界：/docs-something 不應被視為 /docs 前綴", () => {
    expect(isBookingAllowedPath("/docs-fake")).toBe(false);
    expect(isBookingAllowedPath("/api-docs-fake")).toBe(false);
  });

  it("既有允許的訂房路徑不受影響", () => {
    expect(isBookingAllowedPath("/booking")).toBe(true);
    expect(isBookingAllowedPath("/book")).toBe(true);
    expect(isBookingAllowedPath("/member/orders")).toBe(true);
    expect(isBookingAllowedPath("/privacy")).toBe(true);
  });

  it("未列入的路徑仍會被守衛擋下", () => {
    expect(isBookingAllowedPath("/random")).toBe(false);
    expect(isBookingAllowedPath("/admin")).toBe(false);
  });

  it("isBookingDomain 正確識別 booking.lakeze.com（含 www 與大小寫）", () => {
    expect(isBookingDomain("booking.lakeze.com")).toBe(true);
    expect(isBookingDomain("www.booking.lakeze.com")).toBe(true);
    expect(isBookingDomain("BOOKING.LAKEZE.COM")).toBe(true);
    expect(isBookingDomain("hq.lakeze.com")).toBe(false);
  });

  it("docs / api-docs 是保留字段，不會被 AliasResolver 當成 alias", () => {
    expect(isReservedFirstSegment("/docs/accommodation-api")).toBe(true);
    expect(isReservedFirstSegment("/api-docs/accommodation")).toBe(true);
  });

  it("HQ / auth 系統保留路徑不受這次變更影響", () => {
    expect(isAlwaysAllowedPath("/hq")).toBe(true);
    expect(isAlwaysAllowedPath("/auth")).toBe(true);
    expect(isAlwaysAllowedPath("/admin")).toBe(true);
  });
});
