import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { VenueClosingLockedView } from "@lakeze/shared/components/team/VenueClosingLockedView";

const period = { id: "p1", start_date: "2026-09-11", end_date: null, bonus_policy: "full", counts_closer_commission: true, counts_team_bonus: false, note: null };
const assign = { id: "c1", member_id: "m1", effective_from: "2026-09-12" };
const base = {
  accId: "a1", partnershipStartDate: "2026-09-11", periods: [period], curPeriod: period, upcoming: undefined,
  history: [assign], cur: assign, today: "2026-10-01", memberName: () => "Ken 郭天銳",
};

describe("單館頁：場域簽約人與合作期間（上下兩區，不用表格）", () => {
  it("可編輯：顯示狀態、期間、兩個採計開關與操作按鈕，沒有表格", () => {
    const onFlag = vi.fn(); const onEditCloser = vi.fn(); const onAddPeriod = vi.fn(); const onEndPeriod = vi.fn();
    const { container } = render(<VenueClosingLockedView {...base} onFlag={onFlag} onEditCloser={onEditCloser} onAddPeriod={onAddPeriod} onEndPeriod={onEndPeriod} />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByTestId("venue-closing-period-range").textContent).toBe("2026-09-11 ~ 迄今");
    expect(screen.getByTestId("venue-closing-flag-closer-state").textContent).toBe("採計");
    expect(screen.getByTestId("venue-closing-flag-team-state").textContent).toBe("不採計");
    expect(screen.getByTestId("venue-closing-current-closer").textContent).toBe("Ken 郭天銳");
    fireEvent.click(screen.getByTestId("venue-closing-flag-team"));
    expect(onFlag).toHaveBeenCalledWith(period, "counts_team_bonus", true);
    fireEvent.click(screen.getByTestId("venue-closing-edit-closer-btn"));
    expect(onEditCloser).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("venue-closing-add-period-btn"));
    expect(onAddPeriod).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("venue-closing-end-period-btn"));
    expect(onEndPeriod).toHaveBeenCalledWith(period);
    expect(screen.queryByTestId("venue-closing-history")).toBeNull();
    fireEvent.click(screen.getByTestId("venue-closing-history-toggle"));
    expect(screen.getByTestId("venue-closing-history").textContent).toContain("目前生效");
  });

  it("唯讀：沒有操作按鈕，開關停用", () => {
    render(<VenueClosingLockedView {...base} readOnly onFlag={vi.fn()} onEditCloser={vi.fn()} onAddPeriod={vi.fn()} onEndPeriod={vi.fn()} />);
    expect(screen.queryByTestId("venue-closing-edit-closer-btn")).toBeNull();
    expect(screen.queryByTestId("venue-closing-add-period-btn")).toBeNull();
    expect((screen.getByTestId("venue-closing-flag-team") as HTMLButtonElement).disabled).toBe(true);
  });

  it("沒有合作期間：顯示未設定，不顯示採計開關", () => {
    render(<VenueClosingLockedView {...base} periods={[]} curPeriod={null} onFlag={vi.fn()} onEditCloser={vi.fn()} onAddPeriod={vi.fn()} onEndPeriod={vi.fn()} />);
    expect(screen.getByText("未設定合作期間")).toBeTruthy();
    expect(screen.queryByTestId("venue-closing-flag-team")).toBeNull();
  });
});
