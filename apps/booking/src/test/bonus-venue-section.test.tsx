import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ rows: [] as any[], flags: [] as any[], upsert: vi.fn(), del: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const make = (table: string) => {
    const data = table === "teamcommission_venue_revenue_source_overrides" ? h.rows
      : table === "teamcommission_venue_bonus_flags" ? h.flags
      : table === "accommodation_info" ? [{ id: "t1", name: "旅行日 台北館" }, { id: "t2", name: "旅行日 台中館" }]
      : table === "teamcommission_bonus_rate_settings" ? [
        { bonus_type: "am_performance", rate: 0.02, fixed_amount: null, effective_from: "2020-01-01" },
        { bonus_type: "am_venue_bonus", rate: null, fixed_amount: 1500, effective_from: "2020-01-01" },
        { bonus_type: "venue_closing", rate: null, fixed_amount: 3000, effective_from: "2020-01-01" },
      ]
      : table.endsWith("whitelist") ? [{ included_order_sources: ["website", "booking"], effective_from: "2020-01-01", created_at: "" }] : [];
    const chain: any = {
      select: () => chain, eq: () => chain, lte: () => chain, in: () => chain, order: () => chain,
      upsert: (...a: any[]) => h.upsert(table, ...a),
      delete: () => ({ eq: (...a: any[]) => h.del(table, ...a) }),
      then: (r: any, j: any) => Promise.resolve({ data, error: null }).then(r, j),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => make(t), rpc: async () => ({ data: ["walkin"], error: null }) } };
});

import { BonusVenueSection } from "@/components/team/onboarding/BonusVenueSection";
import { taipeiToday } from "@lakeze/shared/lib/teamBonusRevenue";
import { selectableMonths } from "@/lib/venueSourceVersions";

const [thisMonth, nextMonth] = selectableMonths(taipeiToday(), 2);

describe("館別頁獎金計算設定卡", () => {
  beforeEach(() => {
    h.rows = [];
    h.flags = [
      { accommodation_id: "t1", exclude_from_commission: true, fixed_merge_group: "旅行日系列" },
      { accommodation_id: "t2", exclude_from_commission: true, fixed_merge_group: "旅行日系列" },
    ];
    h.upsert.mockReset().mockResolvedValue({ error: null });
    h.del.mockReset().mockResolvedValue({ error: null });
  });

  it("沒有版本時顯示沿用全站與全站來源；不能改回全站", async () => {
    render(<BonusVenueSection accId="a1" canEdit />);
    expect((await screen.findByTestId("bonus-sources-shared-mode")).textContent).toBe("沿用全站");
    await waitFor(() => expect(screen.getByTestId("bonus-sources-shared-current").textContent).toContain("官網"));
    expect(screen.queryByTestId("bonus-sources-shared-revert-btn")).toBeNull();
  });

  it("新增本館自訂版本：兩步驟確認、預設本月 1 日、寫入 1 日生效日", async () => {
    render(<BonusVenueSection accId="a1" canEdit />);
    fireEvent.click(await screen.findByTestId("bonus-sources-shared-add-btn"));
    expect(screen.getByTestId("source-version-explain").textContent).toContain(`${Number(thisMonth.slice(5, 7))} 月的訂單起算`);
    fireEvent.click(screen.getByTestId("source-version-opt-walkin"));
    fireEvent.click(screen.getByTestId("source-version-next"));
    expect(screen.getByTestId("source-version-confirm").textContent).toContain(thisMonth);
    expect(h.upsert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("source-version-submit"));
    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    const [, payload, opt] = h.upsert.mock.calls[0];
    expect(payload).toMatchObject({ accommodation_id: "a1", track: "shared", effective_from: thisMonth });
    expect(payload.included_order_sources).toContain("walkin");
    expect(opt).toEqual({ onConflict: "accommodation_id,track,effective_from" });
  });

  it("全部取消勾選時確認頁警告營收為 0", async () => {
    render(<BonusVenueSection accId="a1" canEdit />);
    fireEvent.click(await screen.findByTestId("bonus-sources-kol-add-btn"));
    await waitFor(() => expect(screen.getByTestId("source-version-opt-website")).toBeTruthy());
    for (const s of ["website", "booking"]) {
      const el = screen.getByTestId(`source-version-opt-${s}`);
      if (el.getAttribute("data-state") === "checked") fireEvent.click(el);
    }
    fireEvent.click(screen.getByTestId("source-version-next"));
    expect(screen.getByTestId("source-version-warn-empty")).toBeTruthy();
  });

  it("本館自訂中：顯示改回全站；已排定版本可取消（需確認）", async () => {
    h.rows = [
      { id: "r1", track: "shared", included_order_sources: ["walkin"], effective_from: thisMonth, created_at: "x" },
      { id: "r2", track: "shared", included_order_sources: null, effective_from: nextMonth, created_at: "x" },
    ];
    render(<BonusVenueSection accId="a1" canEdit />);
    expect((await screen.findByTestId("bonus-sources-shared-mode")).textContent).toBe("本館自訂");
    expect(screen.getByTestId("bonus-sources-shared-revert-btn")).toBeTruthy();
    expect(screen.getByTestId(`bonus-sources-shared-upcoming-${nextMonth}`).textContent).toContain("改回沿用全站");
    fireEvent.click(screen.getByTestId(`bonus-sources-shared-cancel-${nextMonth}`));
    expect(h.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("bonus-cancel-future-yes"));
    await waitFor(() => expect(h.del).toHaveBeenCalledWith("teamcommission_venue_revenue_source_overrides", "id", "r2"));
  });

  it("唯讀：沒有任何編輯按鈕，可看問號說明", async () => {
    render(<BonusVenueSection accId="a1" canEdit={false} />);
    await screen.findByTestId("bonus-sources-shared-mode");
    expect(screen.queryByTestId("bonus-sources-shared-add-btn")).toBeNull();
    expect(screen.queryByTestId("bonus-flags-save-btn")).toBeNull();
    fireEvent.click(screen.getByTestId("bonus-sources-help-btn"));
    expect(screen.getByTestId("bonus-sources-help-dialog").textContent).toContain("1 日");
  });

  it("特殊館別：例子帶入目前費率；加入現有群組顯示成員並預覽合併結果，確認後寫入", async () => {
    render(<BonusVenueSection accId="a1" accName="哈庫納馬塔塔" canEdit />);
    await waitFor(() => expect(screen.getByTestId("bonus-exclude-example").textContent).toContain("2%"));
    expect(screen.getByTestId("bonus-exclude-example").textContent).toContain("2,000 元");
    expect(screen.getByTestId("bonus-exclude-state").textContent).toBe("列入（一般）");
    expect(screen.getByTestId("bonus-group-preview").textContent).toContain("自己算 1 館");
    expect((screen.getByTestId("bonus-flags-save-btn") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("bonus-group-mode-existing"));
    expect(screen.getByTestId("bonus-flags-incomplete")).toBeTruthy();
    const card = screen.getByTestId("bonus-group-existing-旅行日系列");
    expect(card.textContent).toContain("旅行日 台北館、旅行日 台中館");
    fireEvent.click(card);
    const preview = screen.getByTestId("bonus-group-preview").textContent ?? "";
    expect(preview).toContain("和 旅行日 台北館、旅行日 台中館合計算 1 館");
    expect(preview).toContain("不合併的話是 3 份 4,500 元");
    fireEvent.click(screen.getByTestId("bonus-flags-save-btn"));
    expect(screen.getByTestId("bonus-flags-confirm-dialog").textContent).toContain("不合併 → 旅行日系列");
    fireEvent.click(screen.getByTestId("bonus-flags-confirm-ok"));
    await waitFor(() => expect(h.upsert).toHaveBeenCalled());
    expect(h.upsert.mock.calls[0][1]).toMatchObject({ accommodation_id: "a1", exclude_from_commission: false, fixed_merge_group: "旅行日系列" });
  });

  it("特殊館別：已在群組的館別預設選中該群組；建立新群組時名稱重複會提示", async () => {
    render(<BonusVenueSection accId="t1" accName="旅行日 台北館" canEdit />);
    await waitFor(() => expect(screen.getByTestId("bonus-exclude-state").textContent).toBe("不列入"));
    expect(screen.getByTestId("bonus-group-preview").textContent).toContain("和 旅行日 台中館合計算 1 館");
    fireEvent.click(screen.getByTestId("bonus-group-mode-new"));
    fireEvent.change(screen.getByTestId("bonus-group-new-input"), { target: { value: "旅行日系列" } });
    expect(screen.getByTestId("bonus-group-new-dup")).toBeTruthy();
    expect((screen.getByTestId("bonus-flags-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});
