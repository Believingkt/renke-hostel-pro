import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ logs: [] as any[], snapshots: [] as any[], rpc: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const make = (table: string) => {
    const data = table === "owner_pricing_rule_date_logs" ? h.logs : table === "teamcommission_bonus_snapshots" ? h.snapshots : [];
    const chain: any = {
      select: () => chain, eq: () => chain, gte: () => chain, in: () => chain, order: () => chain,
      then: (r: any, j: any) => Promise.resolve({ data, error: null }).then(r, j),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => make(t), rpc: (fn: string, a: any) => h.rpc(fn, a) } };
});

import { PricingRuleDateLog } from "@lakeze/shared/components/owner-settlement/PricingRuleDateTools";

const L = (o: any) => ({ old_effective_from: null, new_effective_from: null, reason: "r", changed_by: null, changed_at: "2026-06-01T00:00:00Z", ...o });

describe("業主月結：生效月份異動紀錄", () => {
  beforeEach(() => {
    h.logs = [
      L({ id: "l3", rule_id: "r1", action: "fix_date", old_effective_from: "2026-04-01", new_effective_from: "2026-03-01", changed_at: "2026-06-03T00:00:00Z" }),
      L({ id: "l2", rule_id: "r1", action: "fix_date", old_effective_from: "2026-05-01", new_effective_from: "2026-04-01", changed_at: "2026-06-02T00:00:00Z" }),
      L({ id: "l1", rule_id: "r1", action: "backfill", new_effective_from: "2026-05-01" }),
    ];
    h.snapshots = [{ snapshot_month: "2026-04" }];
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({ error: null });
  });

  it("只有最新一次修正可回復；補登可刪除；回復需填原因並提醒已有獎金快照的月份", async () => {
    const onChanged = vi.fn();
    render(<PricingRuleDateLog accId="a1" canFix ruleIds={["r1"]} onChanged={onChanged} reloadKey={0} />);
    const btn = await screen.findByTestId("pricing-date-log-revert-l3");
    expect(btn.textContent).toBe("回復成 2026-04");
    expect(screen.queryByTestId("pricing-date-log-revert-l2")).toBeNull();
    expect(screen.getByTestId("pricing-date-log-delete-l1")).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByTestId("pricing-snapshot-warning")).toBeTruthy();
    const ok = screen.getByTestId("pricing-date-log-dialog-confirm") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("pricing-date-log-dialog-reason"), { target: { value: "改錯了" } });
    fireEvent.click(ok);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("owner_pricing_rule_revert_date", { _log_id: "l3", _reason: "改錯了" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("刪除補登呼叫刪除 RPC", async () => {
    render(<PricingRuleDateLog accId="a1" canFix ruleIds={["r1"]} onChanged={vi.fn()} reloadKey={0} />);
    fireEvent.click(await screen.findByTestId("pricing-date-log-delete-l1"));
    fireEvent.change(await screen.findByTestId("pricing-date-log-dialog-reason"), { target: { value: "不該有" } });
    fireEvent.click(screen.getByTestId("pricing-date-log-dialog-confirm"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("owner_pricing_rule_delete_backfill", { _rule_id: "r1", _reason: "不該有" }));
  });

  it("沒有修正權限（一般 AM、財務）只看紀錄，沒有回復／刪除按鈕", async () => {
    render(<PricingRuleDateLog accId="a1" canFix={false} ruleIds={["r1"]} onChanged={vi.fn()} reloadKey={0} />);
    await screen.findByTestId("pricing-date-log-l3");
    expect(screen.queryByTestId("pricing-date-log-revert-l3")).toBeNull();
    expect(screen.queryByTestId("pricing-date-log-delete-l1")).toBeNull();
  });
});
