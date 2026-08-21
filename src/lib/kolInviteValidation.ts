/**
 * 正式邀約表單防呆邏輯（純函式，方便測試）
 * 回傳 blocks（阻擋，紅色顯示且不可儲存）與 warnings（警告，confirm 後可儲存）
 */

export type ValidationResult = { blocks: string[]; warnings: string[] };

/** PMS 正式訂單編號：8 碼英數，排除 0/O/1/I */
const PMS_ORDER_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export const isPmsOrderNumber = (v: string) => PMS_ORDER_RE.test(v.trim().toUpperCase());

/** IG 帳號正規化：去除 @、網址前綴與追蹤參數 */
export function normalizeIgHandle(raw: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  // 完整網址 → 取路徑第一段
  const urlMatch = v.match(/^https?:\/\/(?:www\.)?(?:instagram\.com|threads\.net|threads\.com)\/([^/?#]+)/i);
  if (urlMatch) {
    v = urlMatch[1];
  } else {
    v = v.replace(/^https?:\/\/(?:www\.)?/i, "");
  }
  v = v.split("?")[0].split("#")[0];
  v = v.replace(/^@+/, "").replace(/\/+$/, "").trim();
  return v;
}

/** 折扣碼正規化：大寫去空白 */
export const normalizeCode = (raw: string) => (raw ?? "").trim().toUpperCase();

const PUBLISH_DOMAINS = ["instagram.com", "threads.net", "threads.com", "youtube.com", "youtu.be", "tiktok.com"];

export function isKnownPublishDomain(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return PUBLISH_DOMAINS.some((d) => u.hostname.toLowerCase().endsWith(d));
  } catch {
    return false;
  }
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

export type CompanionProfile = {
  id: string;
  name: string | null;
  cid_code: string | null;
  companion_cid: string | null;
  accommodation_id: string | null;
  venue_id: string | null;
  check_in_date: string | null;
} | null;

export type CodeConflict = {
  source: string;
  severity: string;
  code: string | null;
  accommodation_id: string | null;
  accommodation_name: string | null;
  owner_name: string | null;
  detail: any;
};

export type InviteFormSnapshot = {
  name: string;
  ig_handle: string;
  scout_id: string;
  accommodation_id: string;
  venue_id: string;
  /** venue_id 所屬的母館（由 kol_venues 解析） */
  venue_parent_accommodation_id: string | null;
  venue_label: string;
  accommodation_label: string;
  invited_at: string;
  check_in_date: string;
  check_out_date: string;
  order_number: string;
  order_exists: boolean | null;
  order_discount_code: string | null;
  order_bound_to_other_profile: string | null;
  cid_code: string;
  companion_cid: string;
  publish_url: string;
  publish_date: string;
  follower_count_original: number | null;
  follower_count_next: number | null;
  ig_duplicate_confirmed: boolean;
  ig_duplicate_name: string | null;
  collab_confirmed: boolean;
};

export function validateInvite(
  f: InviteFormSnapshot,
  opts: {
    companion: CompanionProfile;
    conflicts: CodeConflict[];
    isManager: boolean;
  },
): ValidationResult {
  const blocks: string[] = [];
  const warnings: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 1. 日期
  if (f.check_in_date && f.check_out_date && daysBetween(f.check_out_date, f.check_in_date) <= 0) {
    blocks.push("退房日必須晚於入住日。");
  }
  if (f.check_in_date && daysBetween(f.invited_at || today, f.check_in_date) > 90) {
    warnings.push("入住日比填寫日早超過 90 天，請確認年份是否打錯。");
  }

  // 2. 訂單編號（匯入單不寫死格式）
  const orderNo = f.order_number.trim();
  if (orderNo) {
    if (!isPmsOrderNumber(orderNo)) {
      warnings.push(`「${orderNo}」非 PMS 正式訂單編號格式（8 碼英數，不含 0/O/1/I）；若為匯入（OTA／奧丁丁）訂單可忽略此提醒。`);
    }
    if (f.order_exists === false) {
      warnings.push(`查無訂單編號「${orderNo}」，請確認是否打錯或訂單尚未匯入。`);
    }
    if (f.order_bound_to_other_profile) {
      blocks.push(`訂單「${orderNo}」已被邀約紀錄「${f.order_bound_to_other_profile}」綁定，不可重複綁定。`);
    }
    // 3. CID 與訂單一致性
    const cid = normalizeCode(f.cid_code);
    const orderCode = normalizeCode(f.order_discount_code ?? "");
    if (cid && f.order_exists && orderCode && orderCode !== cid) {
      warnings.push(`訂單「${orderNo}」使用的折扣碼為「${orderCode}」，與本筆 CID「${cid}」不符。`);
    }
  }

  // 4. 館別一致性
  if (
    f.venue_id &&
    f.venue_parent_accommodation_id &&
    f.accommodation_id &&
    f.venue_parent_accommodation_id !== f.accommodation_id
  ) {
    blocks.push(
      `館別欄位不一致（顯示為 ${f.venue_label || "所選場域"}、實際綁定 ${f.accommodation_label || "其他館別"}），請重新選擇館別。`,
    );
  }

  // 5. 折扣碼衝突
  for (const c of opts.conflicts) {
    const where = c.accommodation_name ? `（${c.accommodation_name}）` : "";
    if (c.source === "scout_discount_codes") {
      blocks.push(`此折扣碼已是星探專屬碼${where}${c.owner_name ? `，擁有者：${c.owner_name}` : ""}，命名空間衝突，請換一組。`);
    } else if (c.source === "kol_profiles") {
      const sameName = (c.owner_name ?? "").trim() === f.name.trim();
      if (sameName && c.accommodation_id && c.accommodation_id === f.accommodation_id) {
        blocks.push(`同館別已有同名 KOL「${c.owner_name}」使用此 CID，疑似重複建檔。`);
      } else if (!sameName) {
        const isCompanionPair =
          normalizeCode(f.companion_cid) === normalizeCode(c.code ?? "") ||
          normalizeCode(c.detail?.companion_cid ?? "") === normalizeCode(f.cid_code);
        if (isCompanionPair || f.collab_confirmed) {
          warnings.push(`此 CID 也由「${c.owner_name}」${where}使用，已標記為合拍同住。`);
        } else {
          blocks.push(
            `此 CID 已被「${c.owner_name}」${where}使用（入住日 ${c.detail?.check_in_date ?? "-"}）。若為合拍同住，請勾選「確認為合拍同住」後再儲存。`,
          );
        }
      }
    } else if (c.source === "discount_codes") {
      if (c.accommodation_id && f.accommodation_id && c.accommodation_id !== f.accommodation_id) {
        warnings.push(`PMS 已有此折扣碼但綁定在${where}，本館需另行建立同名折扣碼。`);
      }
    }
  }

  // 6. 同住夥伴
  const companion = opts.companion;
  if (f.companion_cid) {
    if (normalizeCode(f.companion_cid) === normalizeCode(f.cid_code) && f.cid_code) {
      blocks.push("同住夥伴不可選自己。");
    }
    if (companion) {
      if (companion.companion_cid) {
        blocks.push(`所選同住夥伴「${companion.name ?? "-"}」本身已設有同住夥伴，不可形成鏈狀關係，請改指向主檔。`);
      }
      const compAcc = companion.accommodation_id;
      if (compAcc && f.accommodation_id && compAcc !== f.accommodation_id) {
        blocks.push(`同住夥伴「${companion.name ?? "-"}」的館別與本筆不同，同住必然同館同日。`);
      }
      if (companion.check_in_date && f.check_in_date && companion.check_in_date !== f.check_in_date) {
        blocks.push(
          `同住夥伴「${companion.name ?? "-"}」的入住日為 ${companion.check_in_date}，與本筆 ${f.check_in_date} 不同。`,
        );
      }
    }
  }

  // 7. 發布連結
  if (f.publish_url.trim() && !isKnownPublishDomain(f.publish_url)) {
    warnings.push("發布連結不是 Instagram / Threads / YouTube / TikTok 網域，請確認。");
  }
  if (f.publish_date && !f.publish_url.trim()) {
    warnings.push("已填發布日期但沒有發布連結。");
  }

  // 8. 粉絲數
  if (
    f.follower_count_original != null &&
    f.follower_count_original > 0 &&
    (f.follower_count_next == null || f.follower_count_next === 0)
  ) {
    warnings.push(`粉絲數原為 ${f.follower_count_original.toLocaleString()}，現在被清空或設為 0，請確認。`);
  }

  // 9. 邀約人必填
  if (!f.scout_id && !opts.isManager) {
    blocks.push("請指定邀約人，否則此筆獎金將無歸屬。");
  } else if (!f.scout_id) {
    warnings.push("尚未指定邀約人，此筆獎金將無歸屬。");
  }

  // 10. IG 重複
  if (f.ig_duplicate_name && !f.ig_duplicate_confirmed) {
    blocks.push(`IG 帳號與既有紀錄「${f.ig_duplicate_name}」重複，請勾選「確認為不同人／二次合作」後再儲存。`);
  }

  return { blocks, warnings };
}
