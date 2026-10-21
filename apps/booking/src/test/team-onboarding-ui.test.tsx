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
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [], error: null }), insert: (...a: any[]) => h.insert(...a) };
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
    expect(screen.getByTestId("onboarding-access-a2").textContent).toBe("缺 1 位");
    expect(screen.getByTestId("onboarding-kol-a2").textContent).toBe("未建立 KOL 場域");
    // AM 總管只算自己能設定的：a1 合作期間由總部設定 → 不計；a2 負責 AM＋互惠額度 → 2（協作權限、KOL 場域、合作期間由其他人設定）
    expect(screen.getByTestId("onboarding-pending-a1").textContent).toBe("—");
    expect(screen.getByTestId("onboarding-pending-a2").textContent).toBe("2 項");
    expect(screen.getByTestId("onboarding-pending-a3").textContent).toBe("—");
  });

  it("總覽（super_admin）：所有項目都由他設定，待處理全計", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding");
    expect((await screen.findByTestId("onboarding-pending-a1")).textContent).toBe("1 項");
    expect(screen.getByTestId("onboarding-pending-a2").textContent).toBe("4 項");
  });

  it("總覽（財務）：可以看，但沒有需要他設定的項目", async () => {
    h.roles = ["finance"];
    renderAt("/team/onboarding");
    expect((await screen.findByTestId("onboarding-pending-a2")).textContent).toBe("—");
    expect(screen.getByTestId("onboarding-am-a2").textContent).toBe("未指定負責 AM");
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
    const mine = screen.getByTestId("onboarding-block-mine");
    const others = screen.getByTestId("onboarding-block-others");
    expect(within(mine).getByTestId("onboarding-am-section")).toBeTruthy();
    expect(within(mine).getByTestId("onboarding-kol-section")).toBeTruthy();
    expect(within(others).getByTestId("onboarding-payuni-section")).toBeTruthy();
    expect(within(others).getByTestId("onboarding-gaps-list-others").textContent).toContain("合作期間");
    expect(screen.getByTestId("onboarding-gap-writers-partnership").textContent).toBe("由總部最高管理員設定");
    expect(screen.queryByTestId("onboarding-gaps-section-mine")).toBeNull();
    expect(screen.getByTestId("quota-tab-mock").textContent).toBe("true|a1|true");
  });

  it("單館（super_admin）：合作期間缺口在「你要設定的」", async () => {
    h.roles = ["super_admin"];
    renderAt("/team/onboarding/a1");
    const mine = await screen.findByTestId("onboarding-block-mine");
    expect(within(mine).getByTestId("onboarding-gaps-list-mine").textContent).toContain("合作期間");
    expect(within(mine).getByTestId("onboarding-payuni-section")).toBeTruthy();
    expect(screen.getByTestId("onboarding-gaps-empty-others")).toBeTruthy();
  });

  it("單館（財務）：沒有要設定的項目，全部在「由其他人設定」", async () => {
    h.roles = ["finance"];
    renderAt("/team/onboarding/a1");
    expect(await screen.findByTestId("onboarding-mine-empty")).toBeTruthy();
    expect(within(screen.getByTestId("onboarding-block-others")).getByTestId("onboarding-am-section")).toBeTruthy();
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
