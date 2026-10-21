import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@lakeze/shared/components/team/BonusSettingsTab", () => ({
  VenueClosingCard: (p: any) => <div data-testid="closing-mock">{`${p.accId}|${p.readOnly}`}</div>,
}));
vi.mock("@/components/team/CommissionRatesTab", () => ({
  default: (p: any) => <div data-testid="rate-mock">{`${p.lockedAccId}|${p.readOnly}`}</div>,
}));
vi.mock("@/components/team/VenueBonusTierRulesTab", () => ({
  default: (p: any) => <div data-testid="tier-mock">{`${p.lockedAccId}|${p.readOnly}`}</div>,
}));

import { BonusRulesSection } from "@/components/team/onboarding/BonusRulesSection";
import { itemInTab } from "@/lib/onboardingTabs";

describe("館別頁：獎金發放規則（搬家）", () => {
  it("super_admin：三塊都可編輯、只顯示本館", () => {
    render(<BonusRulesSection accId="a1" roles={["super_admin"]} />);
    expect(screen.getByTestId("closing-mock").textContent).toBe("a1|false");
    expect(screen.getByTestId("rate-mock").textContent).toBe("a1|false");
    expect(screen.getByTestId("tier-mock").textContent).toBe("a1|false");
    expect(screen.queryByTestId("onboarding-bonus-rules-readonly")).toBeNull();
  });

  it("admin：級距規則唯讀（資料庫只開 super_admin），其餘可編輯", () => {
    render(<BonusRulesSection accId="a1" roles={["admin"]} />);
    expect(screen.getByTestId("closing-mock").textContent).toBe("a1|false");
    expect(screen.getByTestId("rate-mock").textContent).toBe("a1|false");
    expect(screen.getByTestId("tier-mock").textContent).toBe("a1|true");
  });

  it("AM 總管：全部唯讀並提示由管理員層級修改", () => {
    render(<BonusRulesSection accId="a1" roles={["am_manager"]} />);
    expect(screen.getByTestId("closing-mock").textContent).toBe("a1|true");
    expect(screen.getByTestId("rate-mock").textContent).toBe("a1|true");
    expect(screen.getByTestId("tier-mock").textContent).toBe("a1|true");
    expect(screen.getByTestId("onboarding-bonus-rules-readonly")).toBeTruthy();
  });

  it("放在 AM 總管與全部 Tab，不在 AM／星探主管 Tab", () => {
    expect(itemInTab("am_manager", "bonusRules")).toBe(true);
    expect(itemInTab("all", "bonusRules")).toBe(true);
    expect(itemInTab("am", "bonusRules")).toBe(false);
    expect(itemInTab("scout_manager", "bonusRules")).toBe(false);
  });
});
