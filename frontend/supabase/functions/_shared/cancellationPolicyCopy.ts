// 取消政策「顯示層」唯一來源（Email / 通知信共用）。
//
// 重要：本檔不得自行硬寫任何百分比或天數，全部由 cancellationPolicy.ts 的級距表推導，
// 確保 Email 顯示的規則與系統實際計算的退款金額永遠一致。

import {
  type CancellationPolicyType,
  DEPOSIT_REFUND_TIERS,
  FULL_PREPAYMENT_REFUND_TIERS,
  GUARANTEE_FEE_TIERS,
  resolveCancellationPolicy,
  type PolicyOrderShape,
} from "./cancellationPolicy.ts";

export interface CancellationPolicyCopy {
  policy: CancellationPolicyType;
  title: string;
  /** 制度說明（可能為空字串） */
  intro: string;
  /** 條列規則（unknown 時為空陣列 —— 禁止顯示任何百分比） */
  lines: string[];
  /** unknown 時顯示的替代說明 */
  fallbackNote: string | null;
}

export const FULL_PREPAYMENT_INTRO = "本訂單採預收約定房價總金額方式，信用卡已一次支付訂單全額。";
export const DEPOSIT_INTRO = "本訂單採收取訂金方式，以下比例以「實際收取之訂金」為基準。";
export const GUARANTEE_INTRO = "本訂單為信用卡綁卡擔保，尚未扣款；取消時依下列比例收取違約金。";
export const UNKNOWN_NOTE =
  "此訂單之取消退款方式需由住宿方依原付款條件確認，若需取消請聯絡客服。";

/** 依政策類型取得顯示文案（唯一來源） */
export function cancellationPolicyCopy(policy: CancellationPolicyType): CancellationPolicyCopy {
  if (policy === "full_prepayment") {
    return {
      policy,
      title: "取消政策（預收房價總金額）",
      intro: FULL_PREPAYMENT_INTRO,
      lines: FULL_PREPAYMENT_REFUND_TIERS.map((t) => t.label),
      fallbackNote: null,
    };
  }
  if (policy === "deposit") {
    return {
      policy,
      title: "取消政策（收取訂金）",
      intro: DEPOSIT_INTRO,
      lines: DEPOSIT_REFUND_TIERS.map((t) => t.label),
      fallbackNote: null,
    };
  }
  if (policy === "guarantee") {
    return {
      policy,
      title: "取消政策（綁卡擔保）",
      intro: GUARANTEE_INTRO,
      lines: GUARANTEE_FEE_TIERS.map((t) => t.label),
      fallbackNote: null,
    };
  }
  return {
    policy: "unknown",
    title: "取消政策",
    intro: "",
    lines: [],
    fallbackNote: UNKNOWN_NOTE,
  };
}

/**
 * 「免費取消截止日」對應的天數（退還 100% 的最低天數門檻）。
 * 由級距表推導，避免 Email 出現與實際政策衝突的 14 日字樣。
 * unknown → null（不得顯示任何免費取消承諾）。
 */
export function freeCancelDaysFor(policy: CancellationPolicyType): number | null {
  if (policy === "full_prepayment") {
    return FULL_PREPAYMENT_REFUND_TIERS.find((t) => t.refundPercent === 100)?.minDaysBefore ?? null;
  }
  if (policy === "deposit") {
    return DEPOSIT_REFUND_TIERS.find((t) => t.refundPercent === 100)?.minDaysBefore ?? null;
  }
  if (policy === "guarantee") {
    return GUARANTEE_FEE_TIERS.find((t) => t.feePercent === 0)?.minDaysBefore ?? null;
  }
  return null;
}


/** 依訂單直接取得顯示文案 */
export function cancellationPolicyCopyForOrder(order: PolicyOrderShape): CancellationPolicyCopy {
  return cancellationPolicyCopy(resolveCancellationPolicy(order).policy);
}

const escHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Email 用 HTML 區塊。
 * @param extraNotes 館別自訂的「其他住宿取消注意事項」，僅作補充，不得覆蓋系統規則。
 */
export function renderCancellationPolicyHtml(
  copy: CancellationPolicyCopy,
  extraNotes: string[] = [],
  opts: { labelColor?: string } = {},
): string {
  const color = opts.labelColor ?? "#222";
  const body = copy.lines.length
    ? copy.lines
      .map((l) => `<p style="margin:0 0 4px 0;font-size:12px;color:#777;line-height:1.7;">・${escHtml(l)}</p>`)
      .join("")
    : `<p style="margin:0 0 4px 0;font-size:12px;color:#777;line-height:1.7;">${escHtml(copy.fallbackNote ?? UNKNOWN_NOTE)}</p>`;

  const intro = copy.intro
    ? `<p style="margin:0 0 6px 0;font-size:12px;color:#555;line-height:1.7;">${escHtml(copy.intro)}</p>`
    : "";

  const extra = extraNotes.length
    ? `<p style="margin:10px 0 4px 0;font-size:13px;font-weight:600;color:${color};">其他住宿取消注意事項</p>` +
      extraNotes
        .map((l) => `<p style="margin:0 0 4px 0;font-size:12px;color:#999;line-height:1.7;">${escHtml(l)}</p>`)
        .join("") +
      `<p style="margin:6px 0 0 0;font-size:11px;color:#aaa;line-height:1.6;">上述為住宿方補充說明；退款金額一律以本信件上方之取消政策計算。</p>`
    : "";

  return (
    `<p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:${color};">${escHtml(copy.title)}</p>` +
    intro +
    body +
    extra
  );
}
