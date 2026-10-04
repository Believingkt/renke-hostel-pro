import { describe, it, expect, vi } from "vitest";
function setLoc(host: string, path: string) {
  vi.stubGlobal("window", { location: { hostname: host, pathname: path, search: "", protocol: "https:", origin: `https://${host}` }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, setItem: () => {} } } as any);
}
describe("單一網站 appMode（booking.lakeze.com 以路徑區分前台／後台）", async () => {
  const m = await import("./appMode");
  it("booking host modes", () => {
    setLoc("booking.lakeze.com", "/sensaninn");
    expect(m.resolveAppMode()).toBe("frontend");
    for (const p of ["/pms", "/login", "/admin", "/hakunamatata/admin/orders", "/team", "/reset-password"]) {
      setLoc("booking.lakeze.com", p); expect(m.resolveAppMode(), p).toBe("pms");
    }
    setLoc("booking.lakeze.com", "/hq"); expect(m.resolveAppMode()).toBe("frontend");
  });
  it("hrefs same-origin", () => {
    setLoc("booking.lakeze.com", "/");
    expect(m.pmsHref("/x/admin")).toBe("/x/admin");
    expect(m.bookingHref("booking")).toBe("/booking");
    setLoc("pms.lakeze.com", "/");
    expect(m.pmsHref("/login")).toBe("https://booking.lakeze.com/login");
    expect(m.PMS_RESET_PASSWORD_URL).toBe("https://booking.lakeze.com/reset-password");
  });
  it("preview", () => {
    setLoc("x.preview.emergentagent.com", "/hakunamatata/admin"); expect(m.resolveAppMode()).toBe("pms");
    setLoc("x.preview.emergentagent.com", "/booking"); expect(m.resolveAppMode()).toBe("neutral");
  });
  it("alias extraction", () => {
    expect(m.extractAliasFromPath("/pms")).toBe(null);
    expect(m.normalizePmsPath("/pms")).toBe("/pms");
  });
});
