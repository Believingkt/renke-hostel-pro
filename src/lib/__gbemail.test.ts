import { describe, it, expect } from "vitest";
import { parseEmailList, isValidEmail, normalizeEmailList } from "@/lib/notificationEmails";
describe("notification emails", () => {
  it("validates", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("abc")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
  it("normalizes + dedupes", () => {
    expect(normalizeEmailList([" A@B.com ", "a@b.com", "bad", ""])).toEqual(["a@b.com"]);
  });
  it("parses list", () => {
    expect(parseEmailList("a@b.com, c@d.com\ne@f.com")).toEqual(["a@b.com","c@d.com","e@f.com"]);
  });
});
