import { describe, it, expect } from "vitest";
import { validateGapLink, GAP_DETAILS } from "@lakeze/shared/lib/settingsGapDetails";
import { GAP_AUDIENCE } from "@lakeze/shared/lib/settingsGapLinks";
import { passesPrefs } from "@/hooks/use-notification-prefs";
import { pruneResolved } from "@/hooks/use-notification-read-state";

describe("validateGapLink", () => {
  it("每個缺口都有明細", () => {
    for (const key of Object.keys(GAP_AUDIENCE)) {
      expect(GAP_DETAILS[key as keyof typeof GAP_DETAILS]).toBeTruthy();
    }
  });

  it("admin 可編輯 HQ 缺口", () => {
    const r = validateGapLink("closerRate", ["admin"], "acc-1");
    expect(r.editable).toBe(true);
    expect(r.href).toContain("/hq/bonus-settings");
  });

  it("finance 在 HQ 為唯讀，會標示原因", () => {
    const r = validateGapLink("closerRate", ["finance"], "acc-1");
    expect(r.editable).toBe(false);
    expect(r.href).toContain("/hq/bonus-settings");
    expect(r.reason).toBeTruthy();
  });

  it("am 可編輯業主月結，但不可編輯獎金分頁", () => {
    expect(validateGapLink("settlementRule", ["am"], "acc-1").editable).toBe(true);
    expect(validateGapLink("payoutBasis", ["am"], "acc-1").editable).toBe(false);
  });

  it("scout_manager 導到團隊頁且可編輯", () => {
    const r = validateGapLink("scoutTier", ["scout_manager"]);
    expect(r.editable).toBe(true);
    expect(r.href).toContain("/team/kol");
  });

  it("無權限角色不給連結", () => {
    const r = validateGapLink("closerRate", ["closer_manager"], "acc-1");
    expect(r.href).toBeNull();
    expect(r.editable).toBe(false);
  });
});

describe("通知偏好", () => {
  const base = { minSeverity: "warn" as const, mutedKinds: [], actionableOnly: false };
  it("只看嚴重時濾掉建議", () => {
    const p = { ...base, minSeverity: "error" as const };
    expect(passesPrefs(p, { severity: "error", kind: "settings-gap", actionable: true })).toBe(true);
    expect(passesPrefs(p, { severity: "warn", kind: "settings-gap", actionable: true })).toBe(false);
  });
  it("靜音事件類型", () => {
    const p = { ...base, mutedKinds: ["settings-gap"] };
    expect(passesPrefs(p, { severity: "error", kind: "settings-gap", actionable: true })).toBe(false);
  });
  it("只看可處理項目", () => {
    const p = { ...base, actionableOnly: true };
    expect(passesPrefs(p, { severity: "error", kind: "settings-gap", actionable: false })).toBe(false);
  });
});

describe("已讀狀態", () => {
  it("已解決的通知會從已讀清單移除", () => {
    expect(pruneResolved(["a", "b"], ["b"])).toEqual(["b"]);
  });
});
