import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, calls: [] as Array<{ table: string; ops: any[] }>, invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const from = (table: string) => {
    const ops: any[] = [];
    h.calls.push({ table, ops });
    const q: any = new Proxy({}, {
      get: (_t, k) => k === "then"
        ? (ok: any) => Promise.resolve({ data: ops.some((o) => o[0] === "limit" && o[1] === 1) ? (h.tables[table] ?? []).slice(0, 1) : h.tables[table] ?? [], error: null }).then(ok)
        : (...a: any[]) => { ops.push([k, ...a]); return q; },
    });
    return q;
  };
  return { supabase: { from, functions: { invoke: (...a: any[]) => h.invoke(...a) } } };
});

import { PayuniGrantRecordsCard } from "@/components/admin/PayuniGrantRecordsCard";
import { PayuniGrantPanel } from "@/components/headquarters/PayuniGrantPanel";
import { dailyTotals, GRANT_NOTICE, type GrantRecord } from "@/lib/payuniGrant";

const rec = (o: Partial<GrantRecord>): GrantRecord => ({
  id: "r", accommodation_id: "acc-1", query_date: "2026-11-01", row_seq: 0, trade_date: "2026-11-01", mer_trade_no: "ORD1-full1",
  payment_date: "2026-10-25", action: "付款", type: "入帳", execute_amt: 1000, fee: 28, funds_amt: 972, match_status: "matched",
  order_id: "o-1", synced_at: "2026-11-02T02:00:00Z", ...o,
});

describe("PAYUNi 撥款（W8）", () => {
  beforeEach(() => { h.tables = {}; h.calls = []; h.invoke.mockReset(); });

  it("dailyTotals：依撥款日＋館合計，最後同步取 max(synced_at)，計算對不到", () => {
    const t = dailyTotals([
      rec({ id: "1" }), rec({ id: "2", funds_amt: -10, fee: 0, synced_at: "2026-11-02T03:00:00Z", match_status: "no_order" }),
      rec({ id: "3", match_status: "unmatched" }), rec({ id: "4", accommodation_id: "acc-2", query_date: "2026-10-31" }),
    ]);
    expect(t.map((x) => [x.date, x.accommodation_id, x.count, x.funds, x.fee, x.unmatched, x.lastSynced])).toEqual([
      ["2026-11-01", "acc-1", 3, 1934, 56, 1, "2026-11-02T03:00:00Z"],
      ["2026-10-31", "acc-2", 1, 972, 28, 0, "2026-11-02T02:00:00Z"],
    ]);
  });

  it("PMS：本館沒有任何撥款資料時不顯示", async () => {
    const { container } = render(<MemoryRouter><PayuniGrantRecordsCard accommodationId="acc-1" /></MemoryRouter>);
    await waitFor(() => expect(h.calls.length).toBeGreaterThan(0));
    expect(container.querySelector("[data-testid='payuni-grant-card']")).toBeNull();
  });

  it("PMS：顯示文案、每日入帳合計、訂單連結、出帳原文與標記；只查本館", async () => {
    h.tables = {
      payuni_grant_records: [
        rec({ id: "1" }),
        rec({ id: "2", row_seq: 1, mer_trade_no: null, order_id: null, type: "出帳", action: "退款轉匯手續費", execute_amt: 10, fee: 0, funds_amt: -10, match_status: "no_order" }),
      ],
      orders: [{ id: "o-1", order_number: "LL8Y46U8" }],
    };
    render(<MemoryRouter><PayuniGrantRecordsCard accommodationId="acc-1" /></MemoryRouter>);
    expect((await screen.findByTestId("payuni-grant-notice")).textContent).toBe(GRANT_NOTICE);
    expect((await screen.findByTestId("payuni-grant-daily-2026-11-01")).textContent).toContain("入帳合計 NT$ 962");
    const link = await screen.findByText("LL8Y46U8");
    expect(link.getAttribute("href")).toBe("/admin/orders/o-1");
    const out = screen.getByTestId("payuni-grant-row-1-2026-11-01").textContent ?? "";
    expect(out).toContain("出帳・退款轉匯手續費");
    expect(out).toContain("非訂單出帳");
    const grantCalls = h.calls.filter((c) => c.table === "payuni_grant_records");
    expect(grantCalls.every((c) => c.ops.some((o) => o[0] === "eq" && o[1] === "accommodation_id" && o[2] === "acc-1"))).toBe(true);
  });

  it("HQ：跨館合計、對不到列（無處理按鈕）、補跑某日呼叫 payuni-grant-sync", async () => {
    h.tables = {
      payuni_grant_records: [rec({ id: "1" }), rec({ id: "u1", row_seq: 1, mer_trade_no: "NOPE-full1", order_id: null, match_status: "unmatched" })],
      accommodation_info: [{ id: "acc-1", name: "A館" }],
    };
    h.invoke.mockResolvedValue({ data: { ok: true, accommodations: 1, fetched: 2, failed: 0, unmatched: 1, shrink: [] }, error: null });
    render(<PayuniGrantPanel />);
    const total = await screen.findByTestId("payuni-grant-total-2026-11-01-acc-1");
    expect(total.textContent).toContain("A館");
    expect(total.textContent).toContain("NT$ 1,944");
    const un = screen.getByTestId("payuni-grant-unmatched-u1");
    expect(un.textContent).toContain("NOPE-full1");
    expect(un.querySelector("button")).toBeNull();
    fireEvent.change(screen.getByTestId("payuni-grant-rerun-date"), { target: { value: "2026-10-30" } });
    fireEvent.click(screen.getByTestId("payuni-grant-rerun-btn"));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("payuni-grant-sync", { body: { action: "run", date: "2026-10-30" } }));
  });
});
