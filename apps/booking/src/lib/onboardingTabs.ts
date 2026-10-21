import { GAP_WRITE_ROLES, type GapKey } from "@lakeze/shared/lib/settingsGapLinks";
import {
  ONB_ITEM_WRITERS, accessStatus, amStatus, kolStatus, payuniStatus, quotaStatus, venueStage,
  type OnbItem, type OnbStatus, type OnboardingRow,
} from "@/lib/teamOnboarding";

export type OnbTabKey = "am_manager" | "am" | "scout_manager" | "all";

export const ONB_TABS: Record<OnbTabKey, { label: string; hint: string }> = {
  am_manager: { label: "AM 總管", hint: "負責 AM、互惠額度、館別獎金設定與業主月結等由 AM 總管設定的項目。" },
  am: { label: "AM", hint: "互惠額度與業主月結等由 AM 設定的項目。" },
  scout_manager: { label: "星探主管", hint: "KOL 場域、邀約規則與互惠額度。" },
  all: { label: "全部", hint: "所有角色要設定的項目一次列出；管理員層級預設看這裡。" },
};

const TAB_ORDER: OnbTabKey[] = ["all", "am_manager", "am", "scout_manager"];
const TEAM_TAB_ROLES = ["am_manager", "am", "scout_manager"];
const isAdmin = (roles: string[]) => roles.includes("super_admin") || roles.includes("admin");

/** 管理員（super_admin、admin）看全部 Tab、預設「全部」；其他人只看自己角色的 Tab，沒有可設定角色時只看「全部」 */
export function visibleTabs(roles: string[]): OnbTabKey[] {
  if (isAdmin(roles)) return TAB_ORDER;
  const own = TAB_ORDER.filter((k) => TEAM_TAB_ROLES.includes(k) && roles.includes(k));
  return own.length ? own : ["all"];
}

export function defaultTab(roles: string[]): OnbTabKey {
  return visibleTabs(roles)[0];
}

function tabOwns(tab: OnbTabKey, writers: readonly string[]): boolean {
  return tab === "all" || writers.includes(tab);
}

/** 寫入權限在總部、但畫面放在角色 Tab 方便查看的項目 */
const EXTRA_TABS: Partial<Record<OnbItem, OnbTabKey[]>> = { bonusRules: ["am_manager"] };

export const itemInTab = (tab: OnbTabKey, item: OnbItem) =>
  tabOwns(tab, ONB_ITEM_WRITERS[item]) || !!EXTRA_TABS[item]?.includes(tab);
export const gapInTab = (tab: OnbTabKey, key: GapKey) => tabOwns(tab, GAP_WRITE_ROLES[key] ?? []);

export const OVERVIEW_COLUMNS: Array<{ item: OnbItem; label: string; status: (r: OnboardingRow) => OnbStatus; testId: string }> = [
  { item: "am", label: "負責 AM", status: amStatus, testId: "am" },
  { item: "access", label: "AM 協作權限", status: accessStatus, testId: "access" },
  { item: "kolVenue", label: "KOL 場域", status: kolStatus, testId: "kol" },
  { item: "quota", label: "互惠額度", status: quotaStatus, testId: "quota" },
  { item: "payuni", label: "金流", status: payuniStatus, testId: "payuni" },
];

/** 某館在某 Tab 還缺幾項（停用館別不計） */
export function tabPending(r: OnboardingRow, gapKeys: string[], tab: OnbTabKey): number {
  if (venueStage(r) === "inactive") return 0;
  const items = OVERVIEW_COLUMNS.filter((c) => itemInTab(tab, c.item) && c.status(r).level === "warn").length;
  return items + gapKeys.filter((k) => gapInTab(tab, k as GapKey)).length;
}
