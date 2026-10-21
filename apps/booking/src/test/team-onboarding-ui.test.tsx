import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({ roles: ["am_manager"] as string[], rows: [] as any[], rpc: vi.fn(), insert: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lakeze/shared/components/team/TeamContext", () => ({
  useTeam: () => ({ roles: h.roles, userId: "u1", email: "", displayName: "" }),
}));
vi.mock("@lakeze/shared/hooks/use-settings-completeness", () => ({
  useSettingsCompleteness: () => ({
    ragicRows: [{ accId: "a1", accName: "哈庫納馬塔塔", checks: { partnership: { level: "error", label: "無合作期間", hint: "缺合作期間" } } }],
    bonusVenueRows: [], bonusGlobalRows: [], blockedChecks: [], loading: false, reload: vi.fn(),
  }),
}));
vi.mock("@/components/team/KolReciprocalQuotaTab", () => ({
  KolReciprocalQuotaTab: (p: any) => <div data-testid="quota-tab-mock">{`${p.isManager}|${p.allowedAccommodationIds?.join(",")}|${p.lockedAccommodation === true}`}</div>,
}));
vi.mock("@/components/team/onboarding/OwnerSettlementSection", () => ({
  OwnerSettlementSection: (p: any) => <div data-testid="onboarding-owner-settlement-section">{`${p.accId}|${p.canEdit}`}</div>,
}));
vi.mock("@/components/team/onboarding/BonusRulesSection", () => ({
  BonusRulesSection: (p: any) => <div data-testid="onboarding-bonus-rules-section">{p.accId}</div>,
}));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain, eq: () => chain, lte: () => chain, not: () => chain, order: () => chain, in: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }), insert: (...a: any[]) => h.insert(...a),
    upsert: () => Promise.resolve({ error: null }),
    then: (r: any, j: any) => Promise.resolve({ data: [], error: null }).then(r, j),
  };
  return {
    supabase: {
      rpc: (fn: string, args: any) => h.rpc(fn, args),
      from: () => chain,
    },
  };
});

import TeamOnboarding from "@/pages/team/TeamOnboarding";
import TeamOnboardingVenue from "@/pages/team/TeamOnboardingVenue";

const row = (o: any) => ({
  is_active: true, first_activated_at: "2026-01-01", responsible_member_id: null, responsible_name: null, responsible_since: null,
  am_not_required: false, am_total: 2, am_with_access: 2, am_missing_names: null, other_hotel_admin_names: ["Joyce 陳香吟"],
  other_hotel_admin_unnamed: 1, kol_venue_id: "v1", kol_venue_active: true, kol_venue_has_settings: true, kol_quota_this_month: 3,
  payment_provider_active: "tappay", payuni_mer_id: null, payuni_mer_status: null, ...o,
});
const MEMBERS = [
  { member_id: "m1", user_id: "u-synn", display_name: "Synn", is_am_manager: false, can_be_responsible: true },
  { member_id: "m2", user_id: "u-ken", display_name: "Ken", is_am_manager: true, can_be_responsible: false },
];

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/team/onboarding" element={<TeamOnboarding />} />
        <Route path="/team/onboarding/:accId" element={<TeamOnboardingVenue />} />
      </Routes>
    </MemoryRouter>,
  );

describe("館別設定總覽頁", () => {
  beforeEach(() => {
    h.roles = ["am_manager"];
    h.rows = [
      row({ accommodation_id: "a1", accommodation_name: "哈庫納馬塔塔", responsible_member_id: "m1", responsible_name: "Synn" }),
      row({ accommodation_id: "a2", accommodation_name: "沐恩國際溫泉度假飯店", kol_venue_id: null, kol_quota_this_month: 0, am_with_access: 1, am_missing_names: ["Synn"] }),
      row({ accommodation_id: "a3", accommodation_name: "旅行日-十一鳴", is_active: false, kol_venue_id: null }),
    ];
    h.rpc.mockReset();
    h.insert.mockReset();
    h.insert.mockResolvedValue({ error: null });
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === "team_onboarding_overview") return { data: h.rows, error: null };
      if (fn === "team_onboarding_am_members") return { data: MEMBERS, error: null };
      return { data: { ok: true }, error: null };
    });
  });

  it("總覽：逐館顯示負責 AM、權限、KOL、額度與待處理數；停用館別不計待處理", async () => {
    renderAt("/team/onboarding");
    expect((await screen.findByTestId("onboarding-am-a1")).textContent).toBe("Synn");
    expect(screen.getByTestId("onboarding-am-a2").textContent).toBe("未指定負責 AM");
    // AM 總管 Tab：a1 合作期間由總部設定 → 不計；a2 負責 AM＋互惠額度 → 2
    expect(screen.getByTestId("onboarding-pending-a1").textContent).toBe("—");
    expect(screen.getByTestId("onboarding-pending-a2").textContent).toBe("2 項");
    expect(screen.getByTestId("onboarding-pending-a3").textContent).toBe("—");
  });

  it("總覽（AM 總管）：只看到自己的 Tab，欄位只有負責 AM 與互惠額度，Tab 上顯示還缺的館數", async () => {
    renderAt("/team/onboarding");
    await screen.findByTestId("onboarding-row-a1");
    expect(screen.getByTestId("onboarding-tab-am_manager")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-tab-hq")).toBeNull();
    expect(screen.queryByTestId("onboarding-tab-all")).toBeNull();
    expect(screen.getByTestId("onboarding-tab-count-am_manager").textContent).toBe("1 館");
    expect(screen.queryByTestId("onboarding-access-a2")).toBeNull();
    expect(screen.queryByTestId("onboarding-kol-a2")).toBeNull();
    expect(screen.getByTestId("onboarding-quota-a2")).toBeTruthy();
  });

  it("總覽（管理員 super_admin）：看得到所有角色 Tab、沒有「總部」Tab，預設「全部」算所有項目", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding");
    expect((await screen.findByTestId("onboarding-pending-a1")).textContent).toBe("1 項");
    expect(screen.getByTestId("onboarding-pending-a2").textContent).toBe("4 項");
    for (const k of ["am_manager", "am", "scout_manager", "all"]) expect(screen.getByTestId(`onboarding-tab-${k}`)).toBeTruthy();
    expect(screen.queryByTestId("onboarding-tab-hq")).toBeNull();
    expect(screen.getByTestId("onboarding-access-a2").textContent).toBe("缺 1 位");
    expect(screen.getByTestId("onboarding-am-a2").textContent).toBe("未指定負責 AM");
    expect(screen.getByTestId("onboarding-tab-count-all").textContent).toBe("2 館");
    expect(screen.getByTestId("onboarding-tab-count-scout_manager").textContent).toBe("1 館");
  });

  it("總覽（super_admin）：切到「AM 總管」Tab 只算 AM 總管的項目、欄位跟著換", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding");
    await screen.findByTestId("onboarding-row-a2");
    fireEvent.mouseDown(screen.getByTestId("onboarding-tab-am_manager"), { button: 0 });
    await waitFor(() => expect(screen.getByTestId("onboarding-pending-a2").textContent).toBe("2 項"));
    expect(screen.queryByTestId("onboarding-access-a2")).toBeNull();
    expect(screen.getByTestId("onboarding-venue-link-a2").getAttribute("href")).toBe("/team/onboarding/a2?tab=am_manager");
  });

  it("總覽（管理員 admin）：一樣看得到所有 Tab", async () => {
    h.roles = ["admin"];
    renderAt("/team/onboarding");
    await screen.findByTestId("onboarding-row-a1");
    expect(screen.getByTestId("onboarding-tab-am")).toBeTruthy();
    expect(screen.getByTestId("onboarding-tab-all")).toBeTruthy();
  });

  it("總覽（財務）：沒有可設定的角色，只看「全部」Tab", async () => {
    h.roles = ["finance"];
    renderAt("/team/onboarding");
    expect((await screen.findByTestId("onboarding-pending-a2")).textContent).toBe("4 項");
    expect(screen.getByTestId("onboarding-am-a2").textContent).toBe("未指定負責 AM");
    expect(screen.getByTestId("onboarding-tab-all")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-tab-hq")).toBeNull();
  });

  it("總覽（多角色 AM 總管＋星探主管）：兩個 Tab 都看得到；館別連結帶目前 Tab", async () => {
    h.roles = ["am_manager", "scout_manager"];
    renderAt("/team/onboarding");
    await screen.findByTestId("onboarding-row-a1");
    expect(screen.getByTestId("onboarding-tab-scout_manager")).toBeTruthy();
    expect(screen.getByTestId("onboarding-venue-link-a1").getAttribute("href")).toBe("/team/onboarding/a1?tab=am_manager");
  });

  it("總覽：只看待處理會隱藏沒有待處理的館別", async () => {
    renderAt("/team/onboarding");
    await screen.findByTestId("onboarding-row-a3");
    fireEvent.click(screen.getByTestId("onboarding-pending-only-switch"));
    expect(screen.queryByTestId("onboarding-row-a3")).toBeNull();
    expect(screen.getByTestId("onboarding-row-a2")).toBeTruthy();
  });

  it("沒有權限的角色看不到總覽", () => {
    h.roles = ["scout"];
    renderAt("/team/onboarding");
    expect(screen.getByTestId("onboarding-no-access")).toBeTruthy();
  });

  it("單館（AM 總管）：負責 AM 只有一個下拉（無勾選框）、目前值為負責人；列出職代與 HQ 設定的其他人", async () => {
    renderAt("/team/onboarding/a1");
    expect((await screen.findByTestId("onboarding-venue-name")).textContent).toBe("哈庫納馬塔塔");
    expect(screen.getByTestId("onboarding-responsible-select").textContent).toBe("Synn");
    expect(screen.queryByTestId("onboarding-am-not-required-checkbox")).toBeNull();
    const access = screen.getByTestId("onboarding-am-access-list").textContent ?? "";
    expect(access).toContain("Synn負責・已開");
    expect(access).toContain("KenAM 總管・已開");
    expect(screen.getByTestId("onboarding-other-hotel-admins").textContent).toContain("Joyce 陳香吟");
    const panel = screen.getByTestId("onboarding-venue-tabpanel-am_manager");
    expect(within(panel).getByTestId("onboarding-am-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-kol-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-bonus-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-bonus-rules-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-owner-settlement-section").textContent).toBe("a1|true");
    expect(screen.queryByTestId("onboarding-payuni-section")).toBeNull();
    expect(screen.queryByTestId("onboarding-gaps-section-mine")).toBeNull();
    expect(screen.queryByTestId("onboarding-venue-tab-hq")).toBeNull();
    expect(screen.getByTestId("quota-tab-mock").textContent).toBe("true|a1|true");
  });

  it("單館（super_admin）：預設「全部」Tab，獎金計算設定、金流、協作權限與合作期間缺口都看得到", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding/a1");
    const panel = await screen.findByTestId("onboarding-venue-tabpanel-all");
    expect(within(panel).getByTestId("onboarding-gaps-list-mine").textContent).toContain("合作期間");
    expect(within(panel).getByTestId("onboarding-payuni-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-am-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-bonus-section")).toBeTruthy();
    expect(screen.getByTestId("onboarding-venue-tab-count-all").textContent).toBe("1 項");
    expect(screen.queryByTestId("onboarding-venue-tab-hq")).toBeNull();
  });

  it("單館（super_admin）：?tab=am_manager 直接開 AM 總管 Tab", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding/a1?tab=am_manager");
    const panel = await screen.findByTestId("onboarding-venue-tabpanel-am_manager");
    expect(within(panel).getByTestId("onboarding-bonus-section")).toBeTruthy();
  });

  it("單館（財務）：只有「全部」Tab，看得到所有區塊但不能編輯", async () => {
    h.roles = ["finance"];
    renderAt("/team/onboarding/a1");
    const panel = await screen.findByTestId("onboarding-venue-tabpanel-all");
    expect(within(panel).getByTestId("onboarding-am-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-bonus-section")).toBeTruthy();
    expect(within(panel).getByTestId("onboarding-owner-settlement-section").textContent).toBe("a1|false");
    expect(within(panel).getByTestId("onboarding-gaps-list-others").textContent).toContain("合作期間");
    expect(screen.getByTestId("onboarding-gap-writers-partnership").textContent).toBe("由總部最高管理員設定");
    expect(screen.queryByTestId("bonus-flags-save-btn")).toBeNull();
    expect(screen.queryByTestId("bonus-sources-shared-add-btn")).toBeNull();
  });

  it("單館（AM 總管）：沒有負責人時下拉預設「尚未指定」；已標不需要的館顯示「不需要負責 AM」", async () => {
    renderAt("/team/onboarding/a2");
    expect((await screen.findByTestId("onboarding-responsible-select")).textContent).toContain("尚未指定");
    expect((screen.getByTestId("onboarding-responsible-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("單館：已標不需要負責 AM 的館，下拉顯示「不需要負責 AM（不提醒）」", async () => {
    h.rows = [row({ accommodation_id: "a4", accommodation_name: "雲岫", am_not_required: true })];
    renderAt("/team/onboarding/a4");
    expect((await screen.findByTestId("onboarding-responsible-select")).textContent).toContain("不需要負責 AM");
  });

  it("單館（一般 AM）：不能指定負責 AM、不能建 KOL 場域，但可編輯互惠額度", async () => {
    h.roles = ["am"];
    renderAt("/team/onboarding/a2");
    await screen.findByTestId("onboarding-venue-name");
    expect(screen.queryByTestId("onboarding-responsible-select")).toBeNull();
    expect(screen.queryByTestId("onboarding-create-kol-venue-btn")).toBeNull();
    expect(screen.getByTestId("quota-tab-mock").textContent).toBe("true|a2|true");
    expect(screen.getByTestId("onboarding-venue-tabpanel-am")).toBeTruthy();
    expect(screen.getByTestId("onboarding-owner-settlement-section").textContent).toBe("a2|true");
    expect(screen.queryByTestId("onboarding-bonus-rules-section")).toBeNull();
    expect(screen.queryByTestId("onboarding-am-section")).toBeNull();
  });

  it("單館（星探主管）：可建立 KOL 場域（帶 accommodation_id）", async () => {
    h.roles = ["scout_manager"];
    renderAt("/team/onboarding/a2");
    fireEvent.click(await screen.findByTestId("onboarding-create-kol-venue-btn"));
    await waitFor(() =>
      expect(h.insert).toHaveBeenCalledWith({ name: "沐恩國際溫泉度假飯店", type: "民宿", is_active: true, accommodation_id: "a2" }),
    );
    expect(screen.queryByTestId("onboarding-responsible-select")).toBeNull();
  });

  it("單館（停用館別）：不顯示指定負責 AM 的操作", async () => {
    renderAt("/team/onboarding/a3");
    expect((await screen.findByTestId("onboarding-venue-stage")).textContent).toBe("已停用");
    expect(screen.queryByTestId("onboarding-responsible-select")).toBeNull();
  });
});
