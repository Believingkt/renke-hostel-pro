// 團購信用卡「續付」身分判定的純函式（可單元測試，無 IO）。
//
// 核心規則：
//   「目前這一次付款已完成」只能由【目前這一次的 draftId】對應 converted_order_id 佐證。
//   campaign／email／電話／方案／日期／金額相同，都不足以推論「這次已付款」。
// deno-lint-ignore-file no-explicit-any

export const RESUMABLE_STATUSES = ["pending", "payment_processing", "failed"];
export const BLOCKING_STATUSES = ["paid", "converted", "manual_review"];

export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export interface BookingFingerprint {
  campaignPackageId?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  roomQuantity?: number | null;
}

/** fingerprint 只回答：「這個 draft 是不是目前畫面正在進行的這一次預訂？」 */
export function fingerprintMatches(
  fp: BookingFingerprint | null | undefined,
  draft: any,
  requireMatch = true,
): boolean {
  if (!fp || !requireMatch) return true;
  return String(fp.campaignPackageId ?? "") === String(draft?.campaign_package_id ?? "") &&
    String(fp.checkInDate ?? "") === String(draft?.check_in_date ?? "") &&
    String(fp.checkOutDate ?? "") === String(draft?.check_out_date ?? "") &&
    (fp.roomQuantity == null || Number(fp.roomQuantity) === Number(draft?.room_quantity));
}

/** 仍可繼續付款的 draft：未轉單、狀態可恢復、且尚未逾時 */
export function isLiveResumable(draft: any, now = Date.now()): boolean {
  if (!draft) return false;
  if (draft.converted_order_id) return false;
  if (!RESUMABLE_STATUSES.includes(String(draft.status))) return false;
  return new Date(draft.expires_at).getTime() > now;
}

/**
 * 跨裝置（沒有 draftId）候選挑選。
 * 只找「目前仍可繼續付款、且與目前預訂 fingerprint 一致」者；
 * 歷史 converted／cancelled／refunded draft 一律不列入，也永不作為 alreadyPaid 證據。
 */
export function selectCrossDeviceDraft(
  rows: any[],
  opts: {
    phoneLast4: string;
    email: string;
    fingerprint?: BookingFingerprint | null;
    requireMatch?: boolean;
    now?: number;
  },
): any | null {
  const now = opts.now ?? Date.now();
  const email = String(opts.email ?? "").trim().toLowerCase();
  return (rows ?? []).find((r) =>
    digits(r.guest_phone).slice(-4) === opts.phoneLast4 &&
    String(r.guest_email ?? "").trim().toLowerCase() === email &&
    isLiveResumable(r, now) &&
    fingerprintMatches(opts.fingerprint, r, opts.requireMatch !== false)
  ) ?? null;
}
