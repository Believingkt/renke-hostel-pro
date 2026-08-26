/**
 * 檢查群組 ②「獎金發放（館別維度）」與 ③「全站獎金設定」。
 *
 * 資料來源皆為總部集中管理的 append-only 版本表；此模組只做判讀，不寫入。
 */

import { getBonusFormula } from "@/lib/bonusFormulas";
import { BONUS_SETTING_IMPACTS, getSettingImpact, type BonusSettingKey } from "@/lib/bonusSettingImpact";
import { buildGapHref } from "@/lib/settingsGapLinks";
import type { CheckColumn, CheckResult, GlobalCheckRow, VenueCheckRow } from "./types";
import type { AccRow } from "./ragicChecks";

export const BONUS_VENUE_COLUMNS: CheckColumn[] = [
  { key: "teamBonusFlag", label: "採計團隊獎金" },
  { key: "closerFlag", label: "採計成交組" },
  { key: "payoutBasis", label: "業主自帶口徑" },
  { key: "closerRate", label: "成交費率" },
  { key: "videoRate", label: "影音費率" },
  { key: "amScope", label: "AM 負責人" },
  { key: "venueClosing", label: "場域簽約人" },
  { key: "tierRule", label: "館別級距規則" },
  { key: "kolQuota", label: "KOL 互惠額度" },
];

const STEP1 = "總部設定頁 →「獎金發放規則（4 步流程）」→ 第 ① 步 合作期間卡片";
const STEP3 = "總部設定頁 →「獎金發放規則（4 步流程）」→ 第 ③ 步 分給誰";
const STEP4 = "總部設定頁 →「獎金發放規則（4 步流程）」→ 第 ④ 步 分多少、何時發";
const STEP2 = "總部設定頁 →「獎金發放規則（4 步流程）」→ 第 ② 步 基準金額";

export interface PeriodRow {
  accommodation_id: string;
  start_date: string;
  end_date: string | null;
  counts_team_bonus: boolean | null;
  counts_closer_commission: boolean | null;
  payout_basis: string | null;
}

export interface BonusVenueInput {
  today: string;
  accs: AccRow[];
  periods: PeriodRow[];
  /** accommodation_commission_settings（≤ today，effective_from 降冪） */
  commissionSettings: Array<{
    accommodation_id: string;
    closer_rate: number | string | null;
    video_rate: number | string | null;
  }>;
  /** 在職成員的 AM 所轄館別 */
  amManagedIds: string[];
  venueClosingAccIds: string[];
  tierRuleAccIds: string[];
  /** 本月已設定互惠額度（quota > 0）的館別 */
  kolQuotaAccIds: string[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function activePeriod(periods: PeriodRow[], today: string): PeriodRow | undefined {
  return periods.find((p) => {
    const s = String(p.start_date ?? "").slice(0, 10);
    const e = p.end_date ? String(p.end_date).slice(0, 10) : null;
    return !!s && today >= s && (e === null || today <= e);
  });
}

export function buildBonusVenueRows(input: BonusVenueInput): VenueCheckRow[] {
  const {
    today,
    accs,
    periods,
    commissionSettings,
    amManagedIds,
    venueClosingAccIds,
    tierRuleAccIds,
    kolQuotaAccIds,
  } = input;
  const amSet = new Set(amManagedIds);
  const closingSet = new Set(venueClosingAccIds);
  const tierSet = new Set(tierRuleAccIds);
  const quotaSet = new Set(kolQuotaAccIds);

  return accs.map((a) => {
    const ps = periods.filter((x) => x.accommodation_id === a.id);
    const active = activePeriod(ps, today);
    const cs = commissionSettings.find((x) => x.accommodation_id === a.id);
    const href = buildGapHref("teamBonusFlag", a.id)!;

    const noPeriod: CheckResult = {
      level: "error",
      label: "無生效合作期間",
      href,
      target: STEP1,
      fields: ["合作起始日", "採計團隊獎金 / 採計成交組開關"],
      hint: "此館目前沒有生效中的合作期間，所有團隊與成交組獎金都不會採計。請先補上合作期間。",
    };

    const teamBonusFlag: CheckResult = !active
      ? noPeriod
      : active.counts_team_bonus === false
        ? {
            level: "warn",
            label: "不採計",
            href,
            target: STEP1,
            fields: ["採計團隊獎金（開關）"],
            hint: "此館合作期間關閉了「採計團隊獎金」，AM 績效／AM 總管／成交組績效／KOL 專利獎金都不會計入此館營收。若非刻意請打開。",
          }
        : { level: "ok", label: "採計" };

    const closerFlag: CheckResult = !active
      ? noPeriod
      : active.counts_closer_commission === false
        ? {
            level: "warn",
            label: "不採計",
            href,
            target: STEP1,
            fields: ["採計成交組（開關）"],
            hint: "此館合作期間關閉了「採計成交組」，成交大師與影音獎金不會採計此館訂單。若非刻意請打開。",
          }
        : { level: "ok", label: "採計" };

    const payoutBasis: CheckResult = !active
      ? noPeriod
      : !active.payout_basis
        ? {
            level: "warn",
            label: "未指定",
            href,
            target: STEP1,
            fields: ["業主自帶口徑（payout_basis）"],
            hint: "未指定業主自帶（owner_direct）訂單要含或排除，系統會採預設值；建議明確指定避免結算爭議。",
          }
        : { level: "ok", label: active.payout_basis === "exclude_owner_direct" ? "排除自帶" : "含自帶" };

    const closerRate = cs ? num(cs.closer_rate) : null;
    const closerRateRes: CheckResult = !cs
      ? {
          level: "error",
          label: "無成交費率",
          href: buildGapHref("closerRate", a.id)!,
          target: STEP4,
          fields: ["生效日", "成交大師費率", "影音費率"],
          hint: "此館沒有生效中的成交／影音費率版本，成交大師獎金會算不出金額。請新增一筆生效版本。",
        }
      : !closerRate || closerRate <= 0
        ? {
            level: "warn",
            label: "費率為 0%",
            href: buildGapHref("closerRate", a.id)!,
            target: STEP4,
            fields: ["成交大師費率"],
            hint: "成交費率為 0%，若非刻意設定請修正。",
          }
        : { level: "ok", label: `${(closerRate * 100).toFixed(2).replace(/\.00$/, "")}%` };

    const videoRate = cs ? num(cs.video_rate) : null;
    const videoRateRes: CheckResult = !cs
      ? {
          level: "error",
          label: "無影音費率",
          href: buildGapHref("videoRate", a.id)!,
          target: STEP4,
          fields: ["生效日", "影音費率"],
          hint: "此館沒有生效中的費率版本，影音獎金會算不出金額。請新增一筆生效版本。",
        }
      : videoRate === null
        ? {
            level: "warn",
            label: "未填",
            href: buildGapHref("videoRate", a.id)!,
            target: STEP4,
            fields: ["影音費率"],
            hint: "此館的影音費率未填寫，影音獎金會以 0 計算。",
          }
        : videoRate <= 0
          ? { level: "ok", label: "0%（影音已停用）" }
          : { level: "ok", label: `${(videoRate * 100).toFixed(2).replace(/\.00$/, "")}%` };

    const amScope: CheckResult = amSet.has(a.id)
      ? { level: "ok", label: "已指派" }
      : {
          level: "warn",
          label: "無 AM 負責",
          target: "團隊成員管理 →「AM 所轄館別」",
          fields: ["把此館加入某位在職 AM 的所轄館別"],
          hint: "沒有任何在職 AM 負責此館，AM 績效與 AM 場域獎金不會採計此館營收。",
        };

    const venueClosing: CheckResult = closingSet.has(a.id)
      ? { level: "ok", label: "已指派" }
      : {
          level: "warn",
          label: "未指派",
          href: buildGapHref("venueClosing", a.id)!,
          target: STEP3,
          fields: ["場域簽約人（成員）", "生效日"],
          hint: "未指派場域簽約人，此館簽約成立時的場域成交獎金會無人可發。",
        };

    const tierRule: CheckResult = tierSet.has(a.id)
      ? { level: "ok", label: "使用級距" }
      : { level: "ok", label: "使用全站費率" };

    const kolQuota: CheckResult = quotaSet.has(a.id)
      ? { level: "ok", label: "本月已設定" }
      : {
          level: "warn",
          label: "本月未設定",
          href: null as unknown as undefined,
          target: "KOL 星探管理 →「互惠額度」",
          fields: ["本月互惠額度（每館每月）"],
          hint: "此館本月沒有互惠額度設定，星探無法安排互惠邀約，KOL 相關獎金也不會產生。",
        };

    return {
      accId: a.id,
      accName: a.name,
      checks: {
        teamBonusFlag,
        closerFlag,
        payoutBasis,
        closerRate: closerRateRes,
        videoRate: videoRateRes,
        amScope,
        venueClosing,
        tierRule,
        kolQuota,
      },
    };
  });
}

/** 全站維度需要有生效版本的 bonus_type */
export const REQUIRED_BONUS_TYPES = [
  "am_performance",
  "am_venue_bonus",
  "closer_performance",
  "am_manager",
  "closer_manager",
  "kol_commission",
  "kol_monthly",
  "venue_closing",
];

export interface BonusGlobalInput {
  today: string;
  /** teamcommission_bonus_rate_settings（≤ today）出現過的 bonus_type */
  rateBonusTypes: string[];
  sharedSources: string[] | null;
  kolSources: string[] | null;
  /** teamcommission_role_bindings 已綁定的 role_type */
  boundRoleTypes: string[];
  hasCloserTeamBonus: boolean;
  /** scout_tier_settings 是否有生效版本 */
  hasScoutTiers: boolean;
  /** scout_salary_settings 是否有生效版本 */
  hasScoutSalary: boolean;
  /** 目前發放月套用中的加倍活動描述（可空） */
  activeMultipliers: Array<{ bonus_type: string; multiplier: number }>;
}

function impactRow(
  settingKey: BonusSettingKey,
  result: CheckResult,
  labelOverride?: string,
): GlobalCheckRow {
  const { impact, affected } = getSettingImpact(settingKey);
  return {
    key: settingKey,
    label: labelOverride ?? impact.label,
    role: impact.role,
    affects: affected.map((f) => f.name),
    result,
  };
}

export function buildBonusGlobalRows(input: BonusGlobalInput): GlobalCheckRow[] {
  const href = buildGapHref("globalBonus")!;
  const rows: GlobalCheckRow[] = [];

  const missingTypes = REQUIRED_BONUS_TYPES.filter((t) => !input.rateBonusTypes.includes(t));
  rows.push(
    impactRow(
      "rate_version",
      missingTypes.length === 0
        ? { level: "ok", label: `${REQUIRED_BONUS_TYPES.length} 項皆有生效版本` }
        : {
            level: "error",
            label: `缺 ${missingTypes.length} 項`,
            href,
            target: STEP4,
            fields: missingTypes.map((t) => getBonusFormula(t)?.name ?? t),
            hint: `以下獎金沒有生效中的費率版本，計算時會得到 0：${missingTypes
              .map((t) => getBonusFormula(t)?.name ?? t)
              .join("、")}。`,
          },
    ),
  );

  rows.push(
    impactRow(
      "shared_sources",
      input.sharedSources && input.sharedSources.length > 0
        ? { level: "ok", label: `${input.sharedSources.length} 個來源` }
        : {
            level: "error",
            label: "未設定白名單",
            href,
            target: STEP2,
            fields: ["共用訂單來源白名單（至少一個來源）"],
            hint: "共用獎金的營收基準來自這份白名單，未設定會導致 AM／成交組績效與管理獎金全部為 0。",
          },
    ),
  );

  rows.push(
    impactRow(
      "kol_sources",
      input.kolSources && input.kolSources.length > 0
        ? { level: "ok", label: `${input.kolSources.length} 個來源` }
        : {
            level: "warn",
            label: "未設定白名單",
            href,
            target: STEP2,
            fields: ["獨立訂單來源白名單（專利獎金）"],
            hint: "網紅營銷專利獎金的營收基準來自這份白名單，未設定則該獎金為 0。",
          },
    ),
  );

  const missingRoles = (["am_manager", "closer_manager"] as const).filter(
    (r) => !input.boundRoleTypes.includes(r),
  );
  rows.push(
    impactRow(
      "role_binding",
      missingRoles.length === 0
        ? { level: "ok", label: "AM 總管／成交組主管皆已綁定" }
        : {
            level: "error",
            label: `缺 ${missingRoles.length} 位`,
            href,
            target: STEP3,
            fields: missingRoles.map((r) => (r === "am_manager" ? "AM 總管" : "成交組主管")),
            hint: "管理獎金沒有綁定對象就無法發放，請在第 ③ 步指定人選與生效日。",
          },
    ),
  );

  rows.push({
    key: "closer_team_bonus",
    label: "成交組團隊獎金設定",
    role: "決定成交組團隊獎金的分潤比率；未設定則此獎金不發。",
    affects: [getBonusFormula("closer_team_bonus")?.name ?? "成交組團隊獎金"],
    result: input.hasCloserTeamBonus
      ? { level: "ok", label: "已設定" }
      : {
          level: "warn",
          label: "未設定",
          href,
          target: STEP4,
          fields: ["成交組團隊獎金比率", "生效日"],
          hint: "尚未設定成交組團隊獎金比率，該獎金不會發放。",
        },
  });

  rows.push({
    key: "scout_tier",
    label: "星探級距費率設定",
    role: "決定星探依成案數落在哪個級距、抽成幾 %；未設定則星探抽成為 0。",
    affects: ["星探獎金"],
    result: input.hasScoutTiers
      ? { level: "ok", label: "已設定" }
      : {
          level: "error",
          label: "未設定",
          target: "KOL 星探管理 →「星探設定」",
          fields: ["級距名稱／成案數區間／抽成率", "生效日"],
          hint: "沒有生效中的星探級距費率，星探抽成一律以 0 計算。",
        },
  });

  rows.push({
    key: "scout_salary",
    label: "星探底薪／團隊獎金設定",
    role: "決定星探底薪與團隊獎金門檻；未設定則不發。",
    affects: ["星探底薪", "星探團隊獎金"],
    result: input.hasScoutSalary
      ? { level: "ok", label: "已設定" }
      : {
          level: "warn",
          label: "未設定",
          target: "KOL 星探管理 →「星探設定」",
          fields: ["底薪", "團隊獎金", "團隊門檻 %", "生效日"],
          hint: "尚未設定星探底薪與團隊獎金，相關項目不會發放。",
        },
  });

  rows.push(
    impactRow(
      "bonus_multiplier",
      input.activeMultipliers.length > 0
        ? {
            level: "warn",
            label: `${input.activeMultipliers.length} 項加倍中`,
            href,
            target: STEP4,
            fields: input.activeMultipliers.map(
              (m) => `${getBonusFormula(m.bonus_type)?.name ?? m.bonus_type} ×${m.multiplier}`,
            ),
            hint: "目前有生效中的獎金加倍活動，請確認是否仍符合預期（已發放的快照不受影響）。",
          }
        : { level: "ok", label: "無加倍活動" },
      BONUS_SETTING_IMPACTS.bonus_multiplier.label,
    ),
  );

  return rows;
}
