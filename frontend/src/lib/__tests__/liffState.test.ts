import { describe, it, expect } from "vitest";
import { resolveLiffLanding } from "@/lib/liffState";

describe("resolveLiffLanding", () => {
  it("root + liff.state query wrapper", () => {
    expect(resolveLiffLanding("/", "?liff.state=%3Fpage%3Dcheckout%26u%3DU123")).toEqual({ pathname: "/liff/checkout", search: "?u=U123" });
  });
  it("liff.state with path", () => {
    expect(resolveLiffLanding("/", "?liff.state=%2Fliff%2Fcheckout%3Fu%3DU9")).toEqual({ pathname: "/liff/checkout", search: "?u=U9" });
  });
  it("endpoint already on checkout with page param", () => {
    expect(resolveLiffLanding("/liff/checkout", "?page=checkout&u=U1")).toEqual({ pathname: "/liff/checkout", search: "?u=U1" });
  });
  it("favorites", () => {
    expect(resolveLiffLanding("/", "?liff.state=%3Fpage%3Dfavorites%26u%3DU1")?.pathname).toBe("/liff/favorites");
  });
  it("normal booking url untouched", () => {
    expect(resolveLiffLanding("/booking/villa/abc", "?checkIn=2026-08-20")).toBeNull();
  });
  it("root untouched", () => {
    expect(resolveLiffLanding("/", "")).toBeNull();
  });
});
