import { describe, it, expect } from "vitest";
import { GUEST_GENERIC_ERROR, isGuestSafeMessage, toGuestMessage } from "@/lib/guestFacingError";

describe("guestFacingError", () => {
  it("業務訊息原樣顯示", () => {
    for (const msg of [
      "此日期已無空房",
      "此方案最多入住 10 人，請調整入住人數或選擇其他方案。",
      "此方案於假日不適用（2026-09-05），請調整住宿日期",
      "您已回報過匯款，我們正在核對中",
      "此訂單已取消，請聯繫客服",
      "查詢過於頻繁，請稍後再試",
    ]) {
      expect(isGuestSafeMessage(msg), msg).toBe(true);
      expect(toGuestMessage(msg)).toBe(msg);
    }
  });

  it("技術訊息一律換成客人版文案", () => {
    for (const msg of [
      'duplicate key value violates unique constraint "orders_pkey"',
      "Edge Function returned a non-2xx status code",
      '{"error":"xxx","metadata":{"a":1}}',
      "TypeError: Cannot read properties of undefined",
      "new row for relation \"orders\" violates check constraint",
      "訂單 7690a606-6bac-4cd5-a3e7-2fa754b318e8 建立失敗",
      "campaign_id 不存在",
      "https://example.supabase.co/functions/v1/group-buy-create-order 失敗",
      "at handler (index.ts:88:11)",
      "internal_error",
    ]) {
      expect(isGuestSafeMessage(msg), msg).toBe(false);
      expect(toGuestMessage(msg)).toBe(GUEST_GENERIC_ERROR);
    }
  });

  it("非字串／空值走 fallback", () => {
    expect(toGuestMessage(undefined, "自訂文案")).toBe("自訂文案");
    expect(toGuestMessage({ error: "x" })).toBe(GUEST_GENERIC_ERROR);
    expect(toGuestMessage("")).toBe(GUEST_GENERIC_ERROR);
  });
});
