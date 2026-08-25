/**
 * 檢查群組 ①「Ragic 收入寫入」：影響營收計算與 Ragic 匯出的館別前置設定。
 * 純函式，輸入已抓好的資料列，輸出每館的檢查結果。
 */

import { buildGapHref } from "@/lib/settingsGapLinks";
import type { CheckColumn, CheckResult, VenueCheckRow } from "./types";

export const RAGIC_COLUMNS: CheckColumn[] = [
  { key: "partnership", label: "合作期間" },
  { key: "settlementRule", label: "業主月結費率" },
  { key: "marketingFee", label: "行銷推廣費約定" },
  { key: "bookingSetting", label: "訂房設定" },
  { key: "legacyRate", label: "歷史費率殘留" },
];

export interface AccRow {
  id: string;
  name: string;
}

export interface RagicInput {
  today: string;
  accs: AccRow[];
  /** owner_settlement_pricing_rules（已依 effective_from 降冪，且 ≤ today） */
  rules: Array<{
    accommodation_id: string;
    commission_rate: number | string | null;
    commission_threshold: number | string | null;
    charges_marketing_fee: boolean | null;
  }>;
  /** consulting_fee_settings（同上排序） */
  consults: Array<{
    accommodation_id: string;
    rate: number | string | null;
    revenue_threshold: number | string | null;
  }>;
  periods: Array<{ accommodation_id: string; start_date: string; end_date: string | null }>;
  bookings: Array<{ accommodation_id: string; manual_refund_fee_amount: number | null }>;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const HQ_TARGET = "總部設定頁 →「基準金額規則（業主月結）」";
const BONUS_TARGET = "總部設定頁 →「獎金發放規則（4 步流程）」→ 第 ① 步 合作期間卡片";

export function isPeriodActive(
  periods: Array<{ start_date: string; end_date: string | null }>,
  today: string,
): boolean {
  return periods.some((p) => {
    const s = String(p.start_date ?? "").slice(0, 10);
    const e = p.end_date ? String(p.end_date).slice(0, 10) : null;
    return !!s && today >= s && (e === null || today <= e);
  });
}

export function buildRagicRows(input: RagicInput): VenueCheckRow[] {
  const { today, accs, rules, consults, periods, bookings } = input;

  return accs.map((a) => {
    const r = rules.find((x) => x.accommodation_id === a.id);
    const c = consults.find((x) => x.accommodation_id === a.id);
    const ps = periods.filter((x) => x.accommodation_id === a.id);
    const b = bookings.find((x) => x.accommodation_id === a.id);

    const hqHref = buildGapHref("settlementRule", a.id)!;
    const marketingHref = buildGapHref("marketingFee", a.id)!;
    const legacyHref = buildGapHref("legacyRate", a.id)!;
    const bonusHref = buildGapHref("partnership", a.id)!;

    const partnership: CheckResult =
      ps.length === 0
        ? {
            level: "error",
            label: "未設定合作期間",
            href: bonusHref,
            target: BONUS_TARGET,
            fields: ["合作起始日", "合作結束日（未定可留空）"],
            hint: "到「獎金發放規則（4 步流程）」第 ① 步的合作期間卡片，按「＋ 合作期間」新增起訖日，否則此館營收不會送出 Ragic。",
          }
        : isPeriodActive(ps, today)
          ? { level: "ok", label: "合作中" }
          : {
              level: "warn",
              label: "目前無生效期間",
              href: bonusHref,
              target: BONUS_TARGET,
              fields: ["合作結束日（是否需延長）", "新的合作期間起訖日"],
              hint: "合作期間已結束或尚未開始，請到「獎金發放規則（4 步流程）」第 ① 步的合作期間卡片確認起訖日是否需要延長。",
            };

    const rate = r ? num(r.commission_rate) : null;
    const settlementRule: CheckResult = !r
      ? {
          level: "error",
          label: "無生效費率規則",
          href: hqHref,
          target: HQ_TARGET,
          fields: ["生效日（需 ≤ 今天）", "管顧費率 %", "營收門檻"],
          hint: "到總部設定頁 →「業主月結設定」新增一筆生效中的費率規則（生效日需 ≤ 今天）。",
        }
      : !rate || rate <= 0
        ? {
            level: "warn",
            label: "費率為 0%",
            href: hqHref,
            target: HQ_TARGET,
            fields: ["管顧費率 %"],
            hint: "目前費率為 0%，若非刻意設定請到總部設定頁修正管顧費率。",
          }
        : { level: "ok", label: `${rate.toFixed(2)}%` };

    const marketingFee: CheckResult = !r
      ? {
          level: "error",
          label: "未設定",
          href: marketingHref,
          target: HQ_TARGET,
          fields: ["先新增一筆月結費率規則", "勾選是否收取行銷推廣費"],
          hint: "沒有月結費率規則就無法判斷是否收行銷推廣費，請先新增費率規則。",
        }
      : r.charges_marketing_fee === true
        ? { level: "ok", label: "有收取" }
        : {
            level: "warn",
            label: "未約定收取",
            href: marketingHref,
            target: HQ_TARGET,
            fields: ["收取行銷推廣費（勾選）"],
            hint: "若此館合約有收行銷推廣費，請到總部設定頁勾選「收取行銷推廣費」。",
          };

    const bookingSetting: CheckResult = !b
      ? {
          level: "warn",
          label: "無訂房設定",
          target: "該館後台 →「訂房設定」",
          fields: ["建立訂房設定基本資料", "人工退款手續費金額"],
          hint: "此館尚未建立訂房設定，請到該館後台「訂房設定」建立基本設定。",
        }
      : b.manual_refund_fee_amount === null || b.manual_refund_fee_amount === undefined
        ? {
            level: "warn",
            label: "未設人工退款手續費",
            target: "該館後台 →「訂房設定」",
            fields: ["人工退款手續費金額"],
            hint: "到該館後台「訂房設定」填寫人工退款手續費金額，退款時才能正確扣除。",
          }
        : { level: "ok", label: "已設定" };

    let legacyRate: CheckResult = { level: "ok", label: "無殘留" };
    if (c && r) {
      const diffRate = Math.abs((num(r.commission_rate) ?? 0) - (num(c.rate) ?? 0)) > 0.001;
      const diffThreshold =
        Math.abs((num(r.commission_threshold) ?? 0) - (num(c.revenue_threshold) ?? 0)) > 0.5;
      if (diffRate || diffThreshold)
        legacyRate = {
          level: "warn",
          label: "舊表數值不同",
          hint: "歷史管顧費率表殘留舊數值，僅供查詢不影響計算；可到總部設定頁確認後刪除舊版本。",
          target: HQ_TARGET,
          fields: ["確認最新費率／門檻正確", "刪除歷史管顧費率表的舊版本"],
          href: legacyHref,
        };
    }

    return {
      accId: a.id,
      accName: a.name,
      checks: { partnership, settlementRule, marketingFee, bookingSetting, legacyRate },
    };
  });
}
