import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildGuestNotes } from "@/utils/guestNotesWhitelist";

const strip = (p: string) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .replace(/buildOwltingNotes/g, "buildGuestNotes")
    .trim();

describe("guest notes whitelist parity", () => {
  it("前端副本與 Edge Function 版本規則一致", () => {
    expect(strip("src/utils/guestNotesWhitelist.ts")).toBe(
      strip("supabase/functions/_shared/owltingNotesWhitelist.ts"),
    );
  });

  it("移除內部段落、保留房間配置與旅客需求", () => {
    const notes = [
      "【包區房間配置】四人房 3 間",
      "[ATM Webhook] 已入帳",
      "[3DS Webhook] ok",
      "🔒 取消政策：全文",
      "有預訂烤大叔代烤",
    ].join("\n");
    expect(buildGuestNotes(notes, "", { includeRoomLayout: true, maskContacts: false })).toBe(
      "【包區房間配置】四人房 3 間\n有預訂烤大叔代烤",
    );
  });

  it("不遮蔽時保留客人自己的 email", () => {
    expect(buildGuestNotes("聯絡 a@b.com", "", { maskContacts: false })).toBe("聯絡 a@b.com");
    expect(buildGuestNotes("聯絡 a@b.com", "")).toBe("聯絡 [已隱藏]");
  });
});
