// 課程分潤 % 版本新增前的防呆檢查（純函式，可單元測試）。
// 不限制小數位；只擋非數字、負數、>100。

export interface RateVersionLike {
  percent: number | string;
  effective_from: string;
}

export interface RateValidationResult {
  ok: boolean;
  /** 錯誤標題（ok=false 時必有） */
  title?: string;
  description?: string;
}

/** 解析並驗證分潤 %：非數字、負數、>100 一律擋。 */
export function parsePercentInput(raw: string | number | null | undefined): RateValidationResult & { value?: number } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, title: "請先輸入分潤 %" };
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return { ok: false, title: "分潤 % 必須是數字", description: "請輸入 0 到 100 之間的數值。" };
  }
  if (n < 0) {
    return { ok: false, title: "分潤 % 不可為負數" };
  }
  if (n > 100) {
    return { ok: false, title: "分潤 % 不可超過 100" };
  }
  return { ok: true, value: n };
}

/** 該生效日當下（不含同日新版本）應套用的 %；沒有任何版本則回 null。 */
export function effectivePercentAt(versions: RateVersionLike[], effectiveFrom: string): number | null {
  const applicable = versions
    .filter((v) => v.effective_from <= effectiveFrom)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  if (applicable.length === 0) return null;
  return Number(applicable[0].percent);
}

/** 生效日基本檢查：不可空白、需為 YYYY-MM-DD。 */
export function validateEffectiveFrom(effectiveFrom: string): RateValidationResult {
  if (!effectiveFrom) return { ok: false, title: "請選擇生效日" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { ok: false, title: "生效日格式不正確" };
  const d = new Date(`${effectiveFrom}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, title: "生效日不是有效日期" };
  return { ok: true };
}

export interface RateChangeCheckInput {
  percentRaw: string | number | null | undefined;
  effectiveFrom: string;
  versions: RateVersionLike[];
  /** 該生效日所屬發放期別是否已標記發放 */
  periodLocked?: boolean;
}

export interface RateChangeCheck extends RateValidationResult {
  percent?: number;
  /** 變更前的 %（null＝首次設定） */
  previousPercent?: number | null;
}

/** 新增版本前的完整檢查：數值合法性 → 生效日 → 已發放鎖定 → 重複生效日 → 無變動阻擋。 */
export function checkRateChange(input: RateChangeCheckInput): RateChangeCheck {
  const parsed = parsePercentInput(input.percentRaw);
  if (!parsed.ok) return parsed;

  const dateCheck = validateEffectiveFrom(input.effectiveFrom);
  if (!dateCheck.ok) return dateCheck;

  if (input.periodLocked) {
    return {
      ok: false,
      title: "該期別已標記發放，無法調整分潤 %",
      description: "請改用尚未發放的期別生效日，或先撤銷發放標記。",
    };
  }

  if (input.versions.some((v) => v.effective_from === input.effectiveFrom)) {
    return {
      ok: false,
      title: "該生效日已有版本",
      description: "請改用其他生效日，或先刪除尚未生效的同日版本。",
    };
  }

  const prev = effectivePercentAt(input.versions, input.effectiveFrom);
  if (prev !== null && prev === parsed.value) {
    return {
      ok: false,
      title: "分潤 % 沒有變動",
      description: `該生效日目前已套用 ${prev}%，不需要新增重複版本。`,
    };
  }

  return { ok: true, percent: parsed.value, previousPercent: prev };
}
