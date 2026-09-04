import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Phase 1A-1 不變式：語言只走 Context + localStorage。
 * 這裡以原始碼層級證明 locale 沒有進入 URL / CTA / query / business 依賴。
 */
const villa = readFileSync(path.resolve(__dirname, "../pages/BookingVilla.tsx"), "utf8");
const ctx = readFileSync(path.resolve(__dirname, "../contexts/BookingLocaleContext.tsx"), "utf8");
const sw = readFileSync(
  path.resolve(__dirname, "../components/booking/BookingLanguageSwitch.tsx"),
  "utf8",
);

const goToBooking = villa.slice(
  villa.indexOf("const goToBooking ="),
  villa.indexOf("const handleShare ="),
);

describe("booking villa CTA / query invariance", () => {
  it("goToBooking never sets a lang param", () => {
    expect(goToBooking).not.toMatch(/lang/);
    expect(goToBooking).toContain('navigate(`/book?${params.toString()}`)');
  });

  it("CTA param set is unchanged", () => {
    const keys = [...goToBooking.matchAll(/params\.set\("(\w+)"/g)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(
      new Set([
        "acc",
        "roomId",
        "packageId",
        "plan",
        "checkIn",
        "checkOut",
        "adults",
        "children",
        "rooms",
        "stay",
      ]),
    );
  });

  it("locale never reads or writes URL search params", () => {
    expect(ctx).not.toMatch(/useSearchParams|setSearchParams|navigate\(|location\.search|history\./);
    expect(sw).not.toMatch(/useSearchParams|setSearchParams|navigate\(|history\./);
    expect(villa).not.toMatch(/params\.set\(\s*["']lang["']/);
    expect(villa).not.toMatch(/searchParams\.get\(\s*["']lang["']/);
  });

  it("locale state is display-only (no booking state in context)", () => {
    expect(ctx).not.toMatch(/checkIn|checkOut|adults|roomId|packageId|availability|inventory|supabase/i);
  });

  it("switch performs no mutation / order / payment calls", () => {
    expect(sw).not.toMatch(/supabase|fetch\(|createOrder|payment/i);
  });
});
