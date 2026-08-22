import { describe, it, expect } from "vitest";
import { isValidNotificationEmail, normalizeNotificationEmails, validateNotificationEmails } from "@/lib/notificationEmails";
describe("notification emails", () => {
  it("validates format", () => {
    expect(isValidNotificationEmail("a@b.com")).toBe(true);
    expect(isValidNotificationEmail("abc")).toBe(false);
    expect(isValidNotificationEmail("a@b")).toBe(false);
  });
  it("normalizes, dedupes, caps at 10", () => {
    expect(normalizeNotificationEmails([" A@B.com ", "a@b.com", "bad", "", null])).toEqual(["a@b.com"]);
    expect(normalizeNotificationEmails(Array.from({length: 15}, (_, i) => `u${i}@x.com`)).length).toBe(10);
  });
  it("rejects invalid on save", () => {
    expect(validateNotificationEmails(["a@b.com", "  "])).toBeNull();
    expect(validateNotificationEmails(["abc"])).toMatch(/格式不正確/);
    expect(validateNotificationEmails(Array.from({length: 11}, (_, i) => `u${i}@x.com`))).toMatch(/最多 10/);
  });
});
