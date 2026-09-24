import { describe, expect, it } from "vitest";
import {
  fingerprintMatches,
  isLiveResumable,
  selectCrossDeviceDraft,
} from "../../../../supabase/functions/_shared/resumeDraftIdentity";

const NOW = new Date("2026-08-24T00:00:00Z").getTime();
const future = new Date(NOW + 9 * 60_000).toISOString();
const past = new Date(NOW - 60_000).toISOString();

const PHONE = "0912345678";
const EMAIL = "test@example.com";

/** 舊測試訂單 DB3U47P4 對應的 converted draft（已取消、已退款的舊 booking attempt） */
const oldConvertedDraft = {
  id: "old-draft",
  campaign_package_id: "pkg-10",
  check_in_date: "2026-09-09",
  check_out_date: "2026-09-10",
  room_quantity: 1,
  status: "converted",
  converted_order_id: "order-db3u47p4",
  expires_at: past,
  guest_phone: PHONE,
  guest_email: EMAIL,
  amount_to_charge: 1000,
};

/** 目前這一次預訂：12人包棟烤肉專案 2026-09-10 → 09-12 */
const currentFp = {
  campaignPackageId: "pkg-12",
  checkInDate: "2026-09-10",
  checkOutDate: "2026-09-12",
  roomQuantity: 1,
};

const livePendingDraft = {
  id: "live-draft",
  campaign_package_id: "pkg-12",
  check_in_date: "2026-09-10",
  check_out_date: "2026-09-12",
  room_quantity: 1,
  status: "pending",
  converted_order_id: null,
  expires_at: future,
  guest_phone: PHONE,
  guest_email: EMAIL,
  amount_to_charge: 38950,
};

const pick = (rows: any[], fingerprint: any = currentFp) =>
  selectCrossDeviceDraft(rows, { phoneLast4: "5678", email: EMAIL, fingerprint, now: NOW });

describe("團購信用卡 resume 身分判定", () => {
  it("CASE 1：舊訂單成功後，新訂單不同方案／日期不得被視為已付款", () => {
    expect(pick([oldConvertedDraft])).toBeNull();
  });

  it("CASE 2：同 campaign 不同方案 → 無候選，需新建 draft", () => {
    expect(pick([{ ...livePendingDraft, campaign_package_id: "pkg-8" }])).toBeNull();
  });

  it("CASE 3：同方案不同日期 → 無候選", () => {
    expect(pick([{ ...livePendingDraft, check_in_date: "2026-09-11" }])).toBeNull();
  });

  it("CASE 4：同方案同日期不同間數 → 不誤判", () => {
    expect(pick([{ ...livePendingDraft, room_quantity: 2 }])).toBeNull();
  });

  it("CASE 5：內容完全相同的歷史 converted draft 不得擋新 booking attempt", () => {
    const historical = {
      ...oldConvertedDraft,
      campaign_package_id: currentFp.campaignPackageId,
      check_in_date: currentFp.checkInDate,
      check_out_date: currentFp.checkOutDate,
    };
    expect(pick([historical])).toBeNull();
  });

  it("CASE 6：fingerprint 一致的有效 draft → 可 resume", () => {
    expect(fingerprintMatches(currentFp, livePendingDraft)).toBe(true);
    expect(isLiveResumable(livePendingDraft, NOW)).toBe(true);
  });

  it("CASE 7：converted draft fingerprint 一致時仍非 live（alreadyPaid 僅限 draftId 路徑）", () => {
    const converted = { ...livePendingDraft, status: "converted", converted_order_id: "o1" };
    expect(fingerprintMatches(currentFp, converted)).toBe(true);
    expect(isLiveResumable(converted, NOW)).toBe(false);
  });

  it("CASE 8：draftId 路徑 fingerprint 不一致 → 不視為同一次 booking attempt", () => {
    expect(fingerprintMatches(currentFp, oldConvertedDraft)).toBe(false);
  });

  it("CASE 9：跨裝置存在符合 fingerprint 的 pending draft → 取回原 draft（不延長時間）", () => {
    const got = pick([oldConvertedDraft, livePendingDraft]);
    expect(got?.id).toBe("live-draft");
    expect(got?.expires_at).toBe(future);
  });

  it("CASE 10：跨裝置只有 converted draft → 無候選", () => {
    expect(pick([oldConvertedDraft])).toBeNull();
  });

  it("CASE 11：cancelled/refunded 舊訂單的 draft → 無候選", () => {
    expect(pick([{ ...oldConvertedDraft, status: "converted" }])).toBeNull();
  });

  it("CASE 15：DB3U47P4 不得成為任何新 booking 的 alreadyPaid 證據", () => {
    expect(isLiveResumable(oldConvertedDraft, NOW)).toBe(false);
    expect(fingerprintMatches(currentFp, oldConvertedDraft)).toBe(false);
    expect(pick([oldConvertedDraft], null)).toBeNull();
  });

  it("逾時的 pending draft 不可 resume", () => {
    expect(pick([{ ...livePendingDraft, expires_at: past }])).toBeNull();
  });

  it("電話／Email 不符者不得被取用", () => {
    expect(
      selectCrossDeviceDraft([livePendingDraft], {
        phoneLast4: "0000",
        email: EMAIL,
        fingerprint: currentFp,
        now: NOW,
      }),
    ).toBeNull();
  });
});
