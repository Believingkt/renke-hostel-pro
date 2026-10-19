import type { PrecheckResult } from "./wizardApi";

export type WizardStepKey = "basic" | "rooms" | "packages" | "season" | "inventory" | "submit";

/** 精靈步驟；done 依開賣前檢查（wizard_precheck）的紅色項目判斷 */
export const WIZARD_STEPS: { key: WizardStepKey; title: string; checks: string[]; optional?: boolean }[] = [
  { key: "basic", title: "基本資料", checks: ["basic_info"] },
  { key: "rooms", title: "房型", checks: ["room_types"] },
  { key: "packages", title: "方案", checks: ["packages", "templates"] },
  { key: "season", title: "季節價", checks: [], optional: true },
  { key: "inventory", title: "庫存", checks: ["inventory"] },
  { key: "submit", title: "檢查與送審", checks: [] },
];

export function stepDone(key: WizardStepKey, result: PrecheckResult | null, submitted: boolean): boolean {
  if (key === "submit") return submitted;
  const def = WIZARD_STEPS.find((s) => s.key === key);
  if (!result || !def || def.checks.length === 0) return false;
  return def.checks.every((c) => result.red.find((r) => r.key === c)?.ok === true);
}
