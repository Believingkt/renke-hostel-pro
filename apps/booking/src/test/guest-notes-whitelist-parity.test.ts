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
    expect(strip("apps/booking/src/utils/guestNotesWhitelist.ts")).toBe(
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

describe("V5.5B.3 夥伴標籤前綴豁免", () => {
  const opts = {
    includeRoomLayout: true,
    maxGuestChars: 500,
    maskContacts: true,
    partnerTagPrefixes: ["StarChain 星鏈"],
  };

  it("保留夥伴需求、移除 🔒 與付款狀態行", () => {
    const notes = [
      "[StarChain 星鏈] 需要嬰兒床一張，晚到約21:00",
      "🔒 2026-09-01 10:22 Nicole 將金額由 8,800 改為 9,300（加人）",
      "【付款狀態變更】未付款 → 已付訂金",
    ].join("\n");
    expect(buildGuestNotes(notes, "", opts)).toBe("需要嬰兒床一張，晚到約21:00");
  });

  it("只有夥伴需求時完整保留", () => {
    expect(buildGuestNotes("[StarChain 星鏈] 點數訂房 - 用戶ID: SC-99213", "", opts)).toBe(
      "點數訂房 - 用戶ID: SC-99213",
    );
  });

  it("房配＋夥伴需求＋內部異動混合", () => {
    const notes = [
      "【包棟房間配置】A棟 2 間、B棟 1 間",
      "[StarChain 星鏈] 素食兩位，需要停車位",
      "[ATM] 虛擬帳號 812-1234567890 繳款期限 2026-09-05",
      "rec_trade_id: 2026090112345",
      "🔒 2026-09-02 09:00 小倩 加購早餐 +600",
    ].join("\n");
    expect(buildGuestNotes(notes, "", opts)).toBe(
      "【包棟房間配置】A棟 2 間、B棟 1 間\n素食兩位，需要停車位",
    );
  });

  it("沒有 notes 時回空字串", () => {
    expect(buildGuestNotes(null, "", opts)).toBe("");
  });

  it("夥伴需求內的 email / 連結仍遮蔽", () => {
    expect(
      buildGuestNotes("[StarChain 星鏈] 請寄收據到 abc@star.com 或 https://star.com/x", "", opts),
    ).toBe("請寄收據到 [已隱藏] 或 [連結已移除]");
  });

  it("未指定 partnerTagPrefixes 時行為不變（OwlTing 零回歸）", () => {
    expect(buildGuestNotes("[StarChain 星鏈] 需要嬰兒床", "")).toBe("");
  });
});
