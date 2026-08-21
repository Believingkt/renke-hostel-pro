/**
 * 正式邀約表單防呆邏輯（純函式，方便測試）
 * 回傳 blocks（阻擋，不可儲存）與 warnings（警告，confirm 後可儲存）
 * issues 為結構化版本，含期望格式 / 實際輸入 / 建議操作 / 對應欄位，供對話框顯示與審計紀錄使用。
 */

export type IssueField =
  | "name"
  | "ig_handle"
  | "cid_code"
  | "companion_cid"
  | "order_number"
  | "venue"
  | "dates"
  | "publish"
  | "follower"
  | "scout";

export type ValidationIssue = {
  level: "block" | "warning";
  /** 規則代碼，用於審計比對 */
  rule: string;
  field: IssueField;
  message: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
};

export type ValidationResult = {
  blocks: string[];
  warnings: string[];
  issues: ValidationIssue[];
};

export const FIELD_LABELS: Record<IssueField, string> = {
  name: "KOL 名稱",
  ig_handle: "網紅帳號連結",
  cid_code: "折扣碼 / CID",
  companion_cid: "同住夥伴",
  order_number: "訂單編號",
  venue: "館別",
  dates: "入住／退房日",
  publish: "發布連結",
  follower: "粉絲數",
  scout: "邀約人",
};

/** 表單欄位錨點 id（供「前往欄位」捲動定位） */
export const FIELD_ANCHORS: Record<IssueField, string> = {
  name: "kolf-name",
  ig_handle: "kolf-ig",
  cid_code: "kolf-cid",
  companion_cid: "kolf-companion",
  order_number: "kolf-order",
  venue: "kolf-venue",
  dates: "kolf-dates",
  publish: "kolf-publish",
  follower: "kolf-follower",
  scout: "kolf-scout",
};

/** PMS 正式訂單編號：8 碼英數，排除 0/O/1/I */
const PMS_ORDER_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export const isPmsOrderNumber = (v: string) => PMS_ORDER_RE.test((v ?? "").trim().toUpperCase());

/** IG 帳號正規化：去除 @、網址前綴與追蹤參數 */
export function normalizeIgHandle(raw: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  const urlMatch = v.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|threads\.net|threads\.com)\/([^/?#]+)/i,
  );
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

const CJK = "\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af";

/**
 * KOL 名稱正規化（與 DB 的 public.normalize_kol_name 規則一致）：
 * 全形英數→半形、去除中英文之間多餘空白、英文單字首字大寫其餘小寫。
 */
export function normalizeKolName(raw: string): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  // 全形英數與全形空白 → 半形
  v = v.replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, " ");
  v = v.replace(/\s+/g, " ").trim();
  v = v.replace(new RegExp(`([${CJK}])\\s+`, "g"), "$1");
  v = v.replace(new RegExp(`\\s+([${CJK}])`, "g"), "$1");
  v = v.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return v.trim();
}

/** 名稱比對鍵：正規化後轉小寫並移除空白 */
export const kolNameKey = (raw: string) => normalizeKolName(raw).toLowerCase().replace(/\s+/g, "");

const PUBLISH_DOMAINS = ["instagram.com", "threads.net", "threads.com", "youtube.com", "youtu.be", "tiktok.com"];

export function isKnownPublishDomain(url: string): boolean {
  try {
    const u = new URL((url ?? "").trim());
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
  /** 本筆的 id（新增時為 null） */
  self_id?: string | null;
  /** 本筆掛在哪一筆主檔底下（同住合拍時必填） */
  primary_profile_id?: string | null;
  /** 既有紀錄中「僅全半形／大小寫／空白不同」的同名寫法（若有） */
  name_variant_existing?: string | null;
  name_variant_confirmed?: boolean;
};


export function validateInvite(
  f: InviteFormSnapshot,
  opts: {
    companion: CompanionProfile;
    conflicts: CodeConflict[];
    isManager: boolean;
  },
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (i: ValidationIssue) => issues.push(i);
  const today = new Date().toISOString().slice(0, 10);

  // 1. 日期
  if (f.check_in_date && f.check_out_date && daysBetween(f.check_out_date, f.check_in_date) <= 0) {
    add({
      level: "block",
      rule: "dates.checkout_after_checkin",
      field: "dates",
      message: "退房日必須晚於入住日。",
      expected: "退房日 > 入住日（至少 1 晚）",
      actual: `入住 ${f.check_in_date}、退房 ${f.check_out_date}`,
      suggestion: `若為一晚，退房日應填 ${new Date(new Date(f.check_in_date).getTime() + 86400000)
        .toISOString()
        .slice(0, 10)}。`,
    });
  }
  if (f.check_in_date && daysBetween(f.invited_at || today, f.check_in_date) > 90) {
    add({
      level: "warning",
      rule: "dates.checkin_too_early",
      field: "dates",
      message: "入住日比填寫日早超過 90 天，請確認年份是否打錯。",
      expected: "入住日通常晚於或接近填寫日",
      actual: `填寫日 ${f.invited_at || today}、入住日 ${f.check_in_date}`,
      suggestion: "常見錯誤是年份少打一年（例如 2025 應為 2026）。",
    });
  }

  // 2. 訂單編號（匯入單不寫死格式）
  const orderNo = (f.order_number ?? "").trim();
  if (orderNo) {
    if (!isPmsOrderNumber(orderNo)) {
      add({
        level: "warning",
        rule: "order.not_pms_format",
        field: "order_number",
        message: `「${orderNo}」非 PMS 正式訂單編號格式；若為匯入（OTA／奧丁丁）訂單可忽略此提醒。`,
        expected: "8 碼英數大寫，不含 0 / O / 1 / I，例如：K7M4XQ9B",
        actual: orderNo,
        suggestion: "若這是 PMS 訂單，請到訂單頁複製正確編號；匯入單可直接繼續儲存。",
      });
    }
    if (f.order_exists === false) {
      add({
        level: "warning",
        rule: "order.not_found",
        field: "order_number",
        message: `查無訂單編號「${orderNo}」。`,
        expected: "系統中已存在的訂單編號",
        actual: orderNo,
        suggestion: "確認是否打錯，或訂單尚未匯入（匯入後再回來補填）。",
      });
    }
    if (f.order_bound_to_other_profile) {
      add({
        level: "block",
        rule: "order.already_bound",
        field: "order_number",
        message: `訂單「${orderNo}」已被邀約紀錄「${f.order_bound_to_other_profile}」綁定。`,
        expected: "一張訂單只能綁定一筆邀約",
        actual: `${orderNo} → ${f.order_bound_to_other_profile}`,
        suggestion: "請改填本筆實際使用的訂單編號，或先解除另一筆邀約的綁定。",
      });
    }
    // 3. CID 與訂單一致性
    const cid = normalizeCode(f.cid_code);
    const orderCode = normalizeCode(f.order_discount_code ?? "");
    if (cid && f.order_exists && orderCode && orderCode !== cid) {
      add({
        level: "warning",
        rule: "order.cid_mismatch",
        field: "cid_code",
        message: `訂單折扣碼與本筆 CID 不符。`,
        expected: `與訂單一致：${orderCode}`,
        actual: cid,
        suggestion: `若這筆訂單確實使用「${orderCode}」，請將 CID 改為 ${orderCode}。`,
      });
    }
  }

  // 4. 館別一致性
  if (
    f.venue_id &&
    f.venue_parent_accommodation_id &&
    f.accommodation_id &&
    f.venue_parent_accommodation_id !== f.accommodation_id
  ) {
    add({
      level: "block",
      rule: "venue.parent_mismatch",
      field: "venue",
      message: "館別欄位不一致，儲存後列表顯示與獎金統計會對不起來。",
      expected: "所選場域的母館 = 所選館別",
      actual: `顯示為 ${f.venue_label || "所選場域"}、實際綁定 ${f.accommodation_label || "其他館別"}`,
      suggestion: "請重新在館別下拉選單挑一次（重選會同時清掉舊的綁定）。",
    });
  }

  // 5. 折扣碼衝突
  for (const c of opts.conflicts) {
    const where = c.accommodation_name ? `（${c.accommodation_name}）` : "";
    if (c.source === "scout_discount_codes") {
      add({
        level: "block",
        rule: "cid.scout_namespace",
        field: "cid_code",
        message: `此折扣碼已是星探專屬碼${where}${c.owner_name ? `，擁有者：${c.owner_name}` : ""}。`,
        expected: "未被星探專屬碼使用的代碼",
        actual: normalizeCode(f.cid_code),
        suggestion: `請換一組，例如在原碼後加上識別字尾（${normalizeCode(f.cid_code)}KOL）。`,
      });
    } else if (c.source === "kol_profiles") {
      const sameName = (c.owner_name ?? "").trim() === (f.name ?? "").trim();
      if (sameName && c.accommodation_id && c.accommodation_id === f.accommodation_id) {
        add({
          level: "block",
          rule: "cid.duplicate_same_person",
          field: "cid_code",
          message: `同館別已有同名 KOL「${c.owner_name}」使用此 CID，疑似重複建檔。`,
          expected: "同一人同館別只建一筆邀約",
          actual: `${normalizeCode(f.cid_code)} / ${c.owner_name}`,
          suggestion: "請改為編輯既有那筆邀約，而不是新增一筆。",
        });
      } else if (!sameName) {
        // 同住合拍必須有「實際的主檔關聯」才算數：
        // 本筆掛在對方底下，或對方掛在本筆底下（或以 companion_cid 互指）。
        const otherId = c.detail?.profile_id ?? null;
        const linkedAsPrimary = !!otherId && f.primary_profile_id === otherId;
        const linkedAsChild = !!f.self_id && (c.detail?.primary_profile_id ?? null) === f.self_id;
        const isCompanionPair =
          (!!normalizeCode(f.companion_cid) && normalizeCode(f.companion_cid) === normalizeCode(c.code ?? "")) ||
          (!!normalizeCode(c.detail?.companion_cid ?? "") &&
            normalizeCode(c.detail?.companion_cid ?? "") === normalizeCode(f.cid_code));
        if (linkedAsPrimary || linkedAsChild || isCompanionPair) {
          add({
            level: "warning",
            rule: "cid.collab_confirmed",
            field: "cid_code",
            message: `此 CID 也由「${c.owner_name}」${where}使用，已建立同住合拍關係。`,
            suggestion: "分潤與 KPI 只算主檔，同行者不重複計分。",
          });
        } else {
          add({
            level: "block",
            rule: "cid.used_by_other",
            field: "cid_code",
            message: `此 CID 已被「${c.owner_name}」${where}使用（入住日 ${c.detail?.check_in_date ?? "-"}）。`,
            expected: "同一組 CID 只能有一位主檔；同住夥伴需掛在主檔底下",
            actual: normalizeCode(f.cid_code),
            suggestion: `若確為同住合拍，請在「折扣碼 / CID」下方點「設為主檔：${c.owner_name}」建立同住關係；若不是同住夥伴，請改用本人的專屬碼。`,
          });
        }
      }

    } else if (c.source === "discount_codes") {
      if (c.accommodation_id && f.accommodation_id && c.accommodation_id !== f.accommodation_id) {
        add({
          level: "warning",
          rule: "cid.other_accommodation",
          field: "cid_code",
          message: `PMS 已有此折扣碼但綁定在${where}。`,
          expected: "本館也要有一組同名折扣碼才能成立訂單",
          actual: normalizeCode(f.cid_code),
          suggestion: "請到本館折扣碼設定新增同名代碼。",
        });
      }
    }
  }

  // 6. 同住夥伴
  const companion = opts.companion;
  if (f.companion_cid) {
    if (normalizeCode(f.companion_cid) === normalizeCode(f.cid_code) && f.cid_code) {
      add({
        level: "block",
        rule: "companion.self_reference",
        field: "companion_cid",
        message: "同住夥伴不可選自己。",
        expected: "指向另一位 KOL 的 CID",
        actual: normalizeCode(f.companion_cid),
        suggestion: "若本筆就是主檔，請把同住夥伴欄位清空。",
      });
    }
    if (companion) {
      if (companion.companion_cid) {
        add({
          level: "block",
          rule: "companion.chain",
          field: "companion_cid",
          message: `所選同住夥伴「${companion.name ?? "-"}」本身已設有同住夥伴。`,
          expected: "同住夥伴必須是主檔（本身沒有同住夥伴）",
          actual: `${companion.name ?? "-"} → ${companion.companion_cid}`,
          suggestion: `請改填主檔的 CID：${companion.companion_cid}。`,
        });
      }
      const compAcc = companion.accommodation_id;
      if (compAcc && f.accommodation_id && compAcc !== f.accommodation_id) {
        add({
          level: "block",
          rule: "companion.different_accommodation",
          field: "companion_cid",
          message: `同住夥伴「${companion.name ?? "-"}」的館別與本筆不同。`,
          expected: "同住必然同館同日",
          actual: "兩筆邀約分屬不同館別",
          suggestion: "請確認館別，或改填同館的夥伴。",
        });
      }
      if (companion.check_in_date && f.check_in_date && companion.check_in_date !== f.check_in_date) {
        add({
          level: "block",
          rule: "companion.different_checkin",
          field: "companion_cid",
          message: `同住夥伴「${companion.name ?? "-"}」的入住日與本筆不同。`,
          expected: `與夥伴相同：${companion.check_in_date}`,
          actual: f.check_in_date,
          suggestion: `請把入住日改為 ${companion.check_in_date}，或改填正確的夥伴。`,
        });
      }
    }
  }

  // 7. 發布連結
  if ((f.publish_url ?? "").trim() && !isKnownPublishDomain(f.publish_url)) {
    add({
      level: "warning",
      rule: "publish.unknown_domain",
      field: "publish",
      message: "發布連結不是 Instagram / Threads / YouTube / TikTok 網域。",
      expected: "https://www.instagram.com/p/xxxx/",
      actual: f.publish_url.trim(),
      suggestion: "請貼上貼文本身的連結，而不是個人首頁或短網址。",
    });
  }
  if (f.publish_date && !(f.publish_url ?? "").trim()) {
    add({
      level: "warning",
      rule: "publish.date_without_url",
      field: "publish",
      message: "已填發布日期但沒有發布連結。",
      suggestion: "補上貼文連結，否則無法驗收。",
    });
  }

  // 8. 粉絲數
  if (
    f.follower_count_original != null &&
    f.follower_count_original > 0 &&
    (f.follower_count_next == null || f.follower_count_next === 0)
  ) {
    add({
      level: "warning",
      rule: "follower.cleared",
      field: "follower",
      message: "粉絲數被清空或設為 0。",
      expected: `原值 ${f.follower_count_original.toLocaleString()}`,
      actual: String(f.follower_count_next ?? ""),
      suggestion: "若非刻意清除，請填回實際粉絲數（可用 57.7萬 / 57.7k 格式）。",
    });
  }

  // 9. 邀約人必填
  if (!f.scout_id && !opts.isManager) {
    add({
      level: "block",
      rule: "scout.required",
      field: "scout",
      message: "請指定邀約人，否則此筆獎金將無歸屬。",
      expected: "選擇一位星探",
      actual: "（未選）",
      suggestion: "在「邀約人」下拉選單選擇實際邀約的星探。",
    });
  } else if (!f.scout_id) {
    add({
      level: "warning",
      rule: "scout.missing_manager",
      field: "scout",
      message: "尚未指定邀約人，此筆獎金將無歸屬。",
      suggestion: "主管可先存，但建議事後補上歸屬。",
    });
  }

  // 9.5 名稱僅全半形／大小寫不同（疑似同一人不同寫法）
  const nameNorm = normalizeKolName(f.name);
  if (f.name_variant_existing && !f.name_variant_confirmed) {
    add({
      level: "block",
      rule: "name.variant_existing",
      field: "name",
      message: `已有名稱僅在全半形／大小寫／空白上不同的紀錄「${f.name_variant_existing}」。`,
      expected: `沿用既有寫法：${f.name_variant_existing}`,
      actual: f.name.trim(),
      suggestion: `建議直接改填「${f.name_variant_existing}」；若確定是不同人，請勾選「確認為不同人（不套用既有寫法）」。`,
    });
  } else if (nameNorm && nameNorm !== f.name.trim()) {
    add({
      level: "warning",
      rule: "name.normalized",
      field: "name",
      message: `名稱將自動正規化為「${nameNorm}」後儲存。`,
      expected: nameNorm,
      actual: f.name.trim(),
      suggestion: "全形英數會轉半形、英文首字大寫、中英文之間多餘空白會移除；原始輸入仍會保留。",
    });
  }

  // 10. IG 重複
  if (f.ig_duplicate_name && !f.ig_duplicate_confirmed) {
    add({
      level: "block",
      rule: "ig.duplicate",
      field: "ig_handle",
      message: `IG 帳號與既有紀錄「${f.ig_duplicate_name}」重複。`,
      expected: "每個 IG 帳號對應一位 KOL",
      actual: normalizeIgHandle(f.ig_handle),
      suggestion: "若確為不同人或二次合作，請勾選「確認為不同人／二次合作」後再儲存。",
    });
  }

  return {
    blocks: issues.filter((i) => i.level === "block").map((i) => i.message),
    warnings: issues.filter((i) => i.level === "warning").map((i) => i.message),
    issues,
  };
}
