import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let perm = { isStrictAdmin: false, isLoading: false };
let wizard: Record<string, unknown> = {};
vi.mock("@lakeze/shared/contexts/AccommodationContext", () => ({ useAccommodation: () => ({ currentAccommodationId: "t" }) }));
vi.mock("@lakeze/shared/hooks/use-staff-permissions", () => ({ useStaffPermissions: () => perm }));
vi.mock("@lakeze/shared/hooks/use-alias-prefix", () => ({ useAliasPrefix: () => ({ withPrefix: (p: string) => p }) }));
vi.mock("@lakeze/shared/components/AdminPageHeader", () => ({ AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/hooks/use-wizard-data", () => ({ useWizardData: () => wizard }));

import OnboardingWizard from "@/pages/admin/OnboardingWizard";

const base = { loading: false, isActive: false, roomTypes: [], packages: [], templates: [], finalCheck: null, locked: false, reload: vi.fn() };
const renderPage = () => render(<MemoryRouter><OnboardingWizard /></MemoryRouter>);

describe("上架精靈頁面門禁", () => {
  beforeEach(() => { wizard = { ...base }; });
  it("staff：只看到唯讀說明", () => {
    perm = { isStrictAdmin: false, isLoading: false };
    renderPage();
    expect(screen.getByTestId("wizard-readonly-notice").textContent).toContain("只開放本館管理員");
    expect(screen.queryByTestId("onboarding-wizard-page")).toBeNull();
  });
  it("已開賣的館：顯示改用一般 PMS 頁面", () => {
    perm = { isStrictAdmin: true, isLoading: false };
    wizard = { ...base, isActive: true };
    renderPage();
    expect(screen.getByTestId("wizard-readonly-notice").textContent).toContain("已開賣");
  });
  it("本館管理員、未開賣：可選單棟包棟或多房型", () => {
    perm = { isStrictAdmin: true, isLoading: false };
    renderPage();
    expect(screen.getByTestId("wizard-flow-single")).toBeTruthy();
    expect(screen.getByTestId("wizard-flow-multi")).toBeTruthy();
  });
  it("已送審：顯示唯讀狀態", () => {
    perm = { isStrictAdmin: true, isLoading: false };
    wizard = { ...base, locked: true, finalCheck: { status: "submitted", submitted_at: null, returned_at: null, return_reason: null }, roomTypes: [{ id: "r", name: "包棟", capacity: 8, base_price: 1, room_count: 1 }] };
    renderPage();
    expect(screen.getByTestId("wizard-status-submitted")).toBeTruthy();
    expect(screen.queryByTestId("room-type-save-r")).toBeNull();
  });
});
