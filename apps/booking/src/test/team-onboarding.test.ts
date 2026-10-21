import { describe, expect, it } from "vitest";
import {
  AM_PICK_NOT_REQUIRED,
  AM_PICK_PENDING,
  accessStatus,
  amSaveSteps,
  currentAmPick,
  amStatus,
  canAssignAm,
  canEditKolQuota,
  canManageKolVenue,
  canViewOnboarding,
  kolStatus,
  payuniStatus,
  pendingCount,
  quotaStatus,
  venueStage,
  type OnboardingRow,
} from "@/lib/teamOnboarding";
import { buildBonusVenueRows } from "@lakeze/shared/lib/settingsCompleteness/bonusChecks";
import { GAP_AUDIENCE, resolveGapHref } from "@lakeze/shared/lib/settingsGapLinks";
import { validateGapLink } from "@lakeze/shared/lib/settingsGapDetails";

const base: OnboardingRow = {
  accommodation_id: "a1",
  accommodation_name: "哈庫納馬塔塔",
  is_active: true,
  first_activated_at: "2026-01-01",
  responsible_member_id: "m1",
  responsible_name: "Synn",
  responsible_since: "2026-10-21",
  am_not_required: false,
  am_total: 4,
  am_with_access: 4,
  am_missing_names: null,
  other_hotel_admin_names: ["Joyce"],
  other_hotel_admin_unnamed: 2,
  kol_venue_id: "v1",
  kol_venue_active: true,
  kol_venue_has_settings: true,
  kol_quota_this_month: 4,
  payment_provider_active: "tappay",
  payuni_mer_id: null,
  payuni_mer_status: null,
};

describe("館別設定總覽：狀態判讀", () => {
  it("館別階段：開賣中／上架中／已停用", () => {
    expect(venueStage(base)).toBe("live");
    expect(venueStage({ is_active: false, first_activated_at: null })).toBe("setup");
    expect(venueStage({ is_active: false, first_activated_at: "2026-01-01" })).toBe("inactive");
  });

  it("負責 AM：已指定、不需要、未指定、停用館別不提醒", () => {
    expect(amStatus(base)).toEqual({ level: "ok", label: "Synn" });
    const none = { ...base, responsible_member_id: null, responsible_name: null };
    expect(amStatus(none).level).toBe("warn");
    expect(amStatus({ ...none, am_not_required: true })).toEqual({ level: "ok", label: "不需要負責 AM" });
    expect(amStatus({ ...none, is_active: false }).level).toBe("muted");
  });

  it("AM 協作權限：全開 ok、缺人 warn、停用館別不同步", () => {
    expect(accessStatus(base).level).toBe("ok");
    expect(accessStatus({ ...base, am_with_access: 2 })).toEqual({ level: "warn", label: "缺 2 位" });
    expect(accessStatus({ ...base, is_active: false }).level).toBe("muted");
  });

  it("KOL 場域與互惠額度", () => {
    expect(kolStatus(base).level).toBe("ok");
    expect(kolStatus({ ...base, kol_venue_id: null }).label).toBe("未建立 KOL 場域");
    expect(kolStatus({ ...base, kol_venue_has_settings: false }).label).toBe("未設定邀約規則");
    expect(quotaStatus({ ...base, kol_quota_this_month: 0 }).level).toBe("warn");
  });

  it("金流：TapPay 正常、PAYUNi 審核失敗要提醒、未啟用金流要提醒", () => {
    expect(payuniStatus(base).level).toBe("ok");
    expect(payuniStatus({ ...base, payuni_mer_id: "X", payuni_mer_status: 92 }).level).toBe("warn");
    expect(payuniStatus({ ...base, payment_provider_active: "payuni", payuni_mer_status: 1 }).label).toContain("PAYUNi");
    expect(payuniStatus({ ...base, payment_provider_active: "none" }).level).toBe("warn");
  });

  it("待處理數：停用館別為 0；其他缺口會加總；只算你能設定的項目", () => {
    expect(pendingCount(base, 0, ["super_admin"])).toBe(0);
    expect(pendingCount({ ...base, kol_quota_this_month: 0 }, 2, ["super_admin"])).toBe(3);
    expect(pendingCount({ ...base, is_active: false, kol_venue_id: null }, 5, ["super_admin"])).toBe(0);
    // 未建 KOL 場域只由星探主管／總部處理；AM 只算互惠額度
    expect(pendingCount({ ...base, kol_venue_id: null, kol_quota_this_month: 0 }, 0, ["am"])).toBe(1);
    expect(pendingCount({ ...base, kol_venue_id: null, kol_quota_this_month: 0 }, 0, ["scout_manager"])).toBe(2);
    expect(pendingCount({ ...base, kol_venue_id: null }, 0, ["finance"])).toBe(0);
  });
});

describe("館別設定總覽：角色權限", () => {
  it("可檢視：AM、AM 總管、星探主管、成交組主管、財務、總部；一般星探與特許加盟不行", () => {
    for (const r of ["am", "am_manager", "scout_manager", "closer_manager", "finance", "admin", "super_admin"]) {
      expect(canViewOnboarding([r])).toBe(true);
    }
    expect(canViewOnboarding(["scout"])).toBe(false);
    expect(canViewOnboarding(["franchise_manager"])).toBe(false);
  });

  it("指定負責 AM：只有 AM 總管與總部", () => {
    expect(canAssignAm(["am_manager"])).toBe(true);
    expect(canAssignAm(["super_admin"])).toBe(true);
    expect(canAssignAm(["am"])).toBe(false);
    expect(canAssignAm(["scout_manager"])).toBe(false);
  });

  it("KOL：場域由星探主管管理；互惠額度星探主管與 AM 皆可", () => {
    expect(canManageKolVenue(["scout_manager"])).toBe(true);
    expect(canManageKolVenue(["am"])).toBe(false);
    expect(canEditKolQuota(["am"])).toBe(true);
    expect(canEditKolQuota(["closer_manager"])).toBe(false);
  });
});

describe("缺口連結", () => {
  it("小鈴鐺互惠額度連結指向正確分頁 reciprocal_quota", () => {
    expect(GAP_AUDIENCE.kolQuota.teamHref).toBe("/team/kol?tab=reciprocal_quota");
    expect(resolveGapHref("kolQuota", ["scout_manager"])).toBe("/team/kol?tab=reciprocal_quota");
  });

  it("AM 負責人缺口導到館別設定總覽，AM 總管可編輯", () => {
    expect(validateGapLink("amScope", ["am_manager"])).toEqual({ href: "/team/onboarding", editable: true, reason: null });
    expect(validateGapLink("amScope", ["am"]).editable).toBe(false);
  });

  it("標記「不需要負責 AM」的館別不再列為缺口", () => {
    const rows = buildBonusVenueRows({
      today: "2026-10-21",
      accs: [{ id: "a1", name: "甲" }, { id: "a2", name: "乙" }] as any,
      periods: [],
      commissionSettings: [],
      amManagedIds: [],
      amNotRequiredIds: ["a2"],
      venueClosingAccIds: [],
      tierRuleAccIds: [],
      kolQuotaAccIds: [],
    });
    expect(rows[0].checks.amScope.level).toBe("warn");
    expect(rows[0].checks.amScope.href).toBe("/team/onboarding/a1");
    expect(rows[1].checks.amScope).toEqual({ level: "ok", label: "不需要負責 AM" });
  });
});

describe("負責 AM 下拉（三種狀態）儲存步驟", () => {
  const base = { accommodation_id: "a1", responsible_member_id: null as string | null, am_not_required: false };
  it("目前值：有負責人→member_id；標不需要→不需要；其餘→尚未指定", () => {
    expect(currentAmPick({ ...base, responsible_member_id: "m1" })).toBe("m1");
    expect(currentAmPick({ ...base, am_not_required: true })).toBe(AM_PICK_NOT_REQUIRED);
    expect(currentAmPick(base)).toBe(AM_PICK_PENDING);
  });
  it("指定 AM：只呼叫 team_set_responsible_am（後端會自動清掉不需要）", () => {
    expect(amSaveSteps({ ...base, am_not_required: true }, "m1")).toEqual([
      ["team_set_responsible_am", { _accommodation_id: "a1", _member_id: "m1" }],
    ]);
  });
  it("有負責人改成不需要：先取消負責人，再標記不需要", () => {
    expect(amSaveSteps({ ...base, responsible_member_id: "m1" }, AM_PICK_NOT_REQUIRED)).toEqual([
      ["team_set_responsible_am", { _accommodation_id: "a1", _member_id: null }],
      ["team_set_am_not_required", { _accommodation_id: "a1", _value: true }],
    ]);
  });
  it("不需要改回尚未指定：只取消不需要；有負責人改成尚未指定：只取消負責人", () => {
    expect(amSaveSteps({ ...base, am_not_required: true }, AM_PICK_PENDING)).toEqual([
      ["team_set_am_not_required", { _accommodation_id: "a1", _value: false }],
    ]);
    expect(amSaveSteps({ ...base, responsible_member_id: "m1" }, AM_PICK_PENDING)).toEqual([
      ["team_set_responsible_am", { _accommodation_id: "a1", _member_id: null }],
    ]);
  });
});
