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

  it("admin 可編輯成交費率（已搬到館別頁 AM 總管 Tab）", () => {
    const r = validateGapLink("closerRate", ["admin"], "acc-1");
    expect(r.editable).toBe(true);
    expect(r.href).toBe("/team/onboarding/acc-1?tab=am_manager");
  });

  it("finance 對成交費率為唯讀，會標示原因", () => {
    const r = validateGapLink("closerRate", ["finance"], "acc-1");
    expect(r.editable).toBe(false);
    expect(r.href).toBe("/team/onboarding/acc-1?tab=am_manager");
    expect(r.reason).toBeTruthy();
  });

  it("AM 總管看得到搬家後的獎金規則（唯讀）", () => {
    for (const k of ["tierRule", "venueClosing", "teamBonusFlag", "closerFlag", "partnership"] as const) {
      const r = validateGapLink(k, ["am_manager"], "acc-1");
      expect(r.href).toBe("/team/onboarding/acc-1?tab=am_manager");
      expect(r.editable).toBe(false);
    }
  });

  it("業主月結缺口連到館別頁（依角色預設 Tab）；AM 可編輯", () => {
    const r = validateGapLink("settlementRule", ["am"], "acc-1");
    expect(r.href).toBe("/team/onboarding/acc-1");
    expect(r.editable).toBe(true);
  });

  it("其他獎金缺口仍連到 HQ 設定頁", () => {
    expect(validateGapLink("payoutBasis", ["admin"], "acc-1").href).toContain("/hq/bonus-settings");
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
    const r = validateGapLink("closerRate", ["scout"], "acc-1");
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

describe("角色對照表（只算實際能寫入的角色）", () => {
  it("小鈴鐺只通知能寫入的角色", async () => {
    const { shouldNotify, GAP_WRITE_ROLES } = await import("@lakeze/shared/lib/settingsGapLinks");
    expect(shouldNotify("partnership", ["super_admin"])).toBe(true);
    expect(shouldNotify("partnership", ["admin"])).toBe(false);
    expect(shouldNotify("teamBonusFlag", ["am_manager"])).toBe(false);
    expect(shouldNotify("settlementRule", ["am"])).toBe(true);
    expect(shouldNotify("settlementRule", ["finance"])).toBe(false);
    expect(shouldNotify("kolQuota", ["scout"])).toBe(false);
    expect(shouldNotify("kolQuota", ["am"])).toBe(true);
    expect(GAP_AUDIENCE.amScope.roles).toEqual(GAP_WRITE_ROLES.amScope);
  });

  it("「誰能編輯」說明由對照表產生，與通知名單一致", () => {
    expect(GAP_DETAILS.partnership.writeRoles).toBe("總部最高管理員");
    expect(GAP_DETAILS.kolQuota.writeRoles).toBe("總部最高管理員、星探主管、AM、AM 總管");
  });

  it("唯讀角色的連結會說明由誰設定", () => {
    const r = validateGapLink("closerRate", ["finance"], "acc-1");
    expect(r.editable).toBe(false);
    expect(r.reason).toContain("總部最高管理員、總部管理員");
  });
});
