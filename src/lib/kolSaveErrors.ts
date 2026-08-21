/**
 * 將資料庫（觸發器／約束）回傳的錯誤訊息，轉成「具體衝突原因 ＋ 建議處理方式」的結構化說明，
 * 讓儲存失敗時不需要自己去查規則。
 */
import type { ValidationIssue } from "./kolInviteValidation";

type Rule = {
  test: RegExp;
  build: (raw: string) => Omit<ValidationIssue, "level">;
};

const RULES: Rule[] = [
  {
    test: /不可將自己設為主檔/,
    build: () => ({
      rule: "db.self_primary",
      field: "companion_cid",
      message: "不可把這筆邀約自己設為主檔。",
      suggestion: "請清空「歸屬主檔」，或改選另一筆邀約作為主檔。",
    }),
  },
  {
    test: /鏈狀關係/,
    build: (raw) => ({
      rule: "db.primary_chain",
      field: "companion_cid",
      message: raw,
      expected: "主檔本身必須是獨立的一筆（沒有再掛在別人底下）",
      suggestion: "請改選最上層的那一筆主檔；附屬不能再掛附屬。",
    }),
  },
  {
    test: /館別與本筆不同/,
    build: (raw) => ({
      rule: "db.primary_accommodation",
      field: "venue",
      message: raw,
      expected: "同一份合約＝同一支折扣碼（CID）",
      suggestion:
        "兩種處理方式擇一：① 若確為同一份合作案，請把兩筆的折扣碼（CID）改成一致後再設主檔；② 若是不同合作案，請維持各自獨立的主檔，不要設為附屬。",
    }),
  },
  {
    test: /相差 .* 天/,
    build: (raw) => ({
      rule: "db.primary_checkin_gap",
      field: "dates",
      message: raw,
      expected: "同一支折扣碼（同一份合約）入住日需在 30 天內；折扣碼不同則需相鄰 3 天內",
      suggestion:
        "請確認入住日是否填錯；若兩筆確實是不同檔期的合作案，請改為各自獨立的主檔（不要設為附屬）。",
    }),
  },
  {
    test: /指定的主檔不存在/,
    build: () => ({
      rule: "db.primary_missing",
      field: "companion_cid",
      message: "指定的主檔已不存在（可能已被刪除或標記為錯誤資料）。",
      suggestion: "請重新選擇主檔，或清空歸屬後改為獨立主檔。",
    }),
  },
  {
    test: /館別欄位不一致/,
    build: (raw) => ({
      rule: "db.venue_parent_mismatch",
      field: "venue",
      message: raw,
      expected: "所選場域必須屬於同一個母館",
      suggestion: "請在館別欄位重新選擇一次，讓場域與母館一致。",
    }),
  },
  {
    test: /退房日/,
    build: (raw) => ({
      rule: "db.dates",
      field: "dates",
      message: raw,
      suggestion: "請把退房日改成入住日之後（至少一晚）。",
    }),
  },
  {
    test: /名稱不可為空白|IG 帳號不可為空白|粉絲數不可為負數/,
    build: (raw) => ({
      rule: "db.required_field",
      field: /IG/.test(raw) ? "ig_handle" : /粉絲/.test(raw) ? "follower" : "name",
      message: raw,
      suggestion: "請補上必填欄位後再儲存。",
    }),
  },
  {
    test: /duplicate key|unique constraint/i,
    build: (raw) => ({
      rule: "db.unique_violation",
      field: "cid_code",
      message: "資料重複，已有相同的紀錄存在。",
      actual: raw,
      suggestion: "請先在列表搜尋同一組折扣碼／館別的既有邀約，改用「合併重複」或設為附屬紀錄。",
    }),
  },
];

/** 把儲存失敗的原始錯誤訊息轉成可顯示的阻擋說明 */
export function describeKolSaveError(rawMessage: string): ValidationIssue {
  const raw = (rawMessage ?? "").trim();
  const hit = RULES.find((r) => r.test.test(raw));
  if (hit) return { level: "block", ...hit.build(raw) };
  return {
    level: "block",
    rule: "db.unknown",
    field: "name",
    message: "儲存失敗。",
    actual: raw || "未知錯誤",
    suggestion: "請截圖此訊息並回報系統管理者。",
  };
}
