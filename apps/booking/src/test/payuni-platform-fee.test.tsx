import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const q: any = new Proxy({}, {
      get: (_t, k) => k === "then"
        ? (ok: any) => Promise.resolve({ data: (h.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }).then(ok)
        : (...a: any[]) => { if (k === "eq") filters.push([a[0], a[1]]); return q; },
    });
    return q;
  };
  return { supabase: { from, functions: { invoke: (...a: any[]) => h.invoke(...a) } } };
});

import { PayuniPlatformFeePanel } from "@/components/headquarters/PayuniPlatformFeePanel";
import { PayuniPlatformFeeCard } from "@/components/admin/PayuniPlatformFeeCard";
import { feeCsv, type FeeItem } from "@/lib/payuniPlatformFee";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const item = (o: Partial<FeeItem>): FeeItem => ({
  id: "i1", batch_id: "b1", accommodation_id: "acc-a", mer_id: "M_A", amount: 2250, bal_type: 1, fee_type: 2, trade_no: "LKZ2026110001",
  status: "pending", api_status: null, api_message: null, fund_date: null, payuni_fee: null,
  detail: {
    accommodation_name: "A館", ragic: { amount: 3300, diff: -1050, has_setting: true }, non_payuni_orders: 1, month_fee_all_orders: 2850,
    orders: [{ order_id: "o1", order_number: "A1", check_in_date: "2026-11-10", check_out_date: "2026-11-12", revenue: 10000, base: 9000, commission: 1350, premium_share: 0, fee: 1350, exempt: false, payuni_paid: 10000, mixed_payment: true }],
    refunds: [{ order_number: "A1", amount: 2000, at: "2026-11-20" }], prior_unpaid: [], adjustments: [],
  },
  ...o,
});

describe("PAYUNi 平台費（W9）", () => {
  beforeEach(() => { h.tables = {}; h.invoke.mockReset(); });

  it("已接上：HQ 平台費子分頁、PaymentAudit 卡片、config.toml verify_jwt=false、migration 20261024090000、function 只 import supabase/ 內檔案", () => {
    const sm = read("apps/booking/src/components/headquarters/SystemManagement.tsx");
    expect(sm).toMatch(/<TabsTrigger value="fee" data-testid="payuni-subtab-fee">平台費<\/TabsTrigger>/);
    expect(sm).toMatch(/<TabsContent value="fee"[^>]*>\s*<PayuniPlatformFeePanel \/>/);
    expect(read("apps/booking/src/pages/PaymentAudit.tsx")).toMatch(/<PayuniPlatformFeeCard accommodationId=\{currentAccommodationId\} \/>/);
    expect(read("supabase/config.toml")).toMatch(/\[functions\.payuni-platform-fee-run\]\s*verify_jwt = false/);
    expect(readdirSync(resolve(ROOT, "supabase/migrations")).filter((f) => /platform_fee/.test(f))).toEqual(["20261024090000_payuni_platform_fee.sql"]);
    for (const f of ["supabase/functions/payuni-platform-fee-run/index.ts", "supabase/functions/_shared/payuniPlatformFee.ts", "supabase/functions/_shared/payuniPlatformFeeCalc.ts"]) {
      expect(read(f)).not.toMatch(/from "(\.\.\/){3,}|packages\/shared/);
    }
  });

  it("CSV：每館每月金額、Ragic 參考與差額、混合付款數", () => {
    const csv = feeCsv("2026-11", [item({}), item({ id: "i2", bal_type: 2, fee_type: 3, amount: 300, trade_no: "LKZ2026110001N", status: "sent" })]);
    const lines = csv.replace("\uFEFF", "").split("\n");
    expect(lines[0]).toBe("期間,館別,商店代號,類型,訂單數,混合付款,平台費,Ragic 算法,差額,狀態,撥款日,PAYUNi 服務費,TradeNo");
    expect(lines[1]).toBe("2026-11,A館,M_A,扣款,1,1,2250,3300,-1050,待送出,,,LKZ2026110001");
    expect(lines[2]).toBe("2026-11,A館,M_A,負向修正,1,1,-300,,,已送出,,,LKZ2026110001N");
  });

  it("HQ：草稿差額不為 0 標黃、展開看退款；確認後送出需二次確認（寫明館數與總額）", async () => {
    h.tables = {
      payuni_platform_fee_batches: [{ id: "b1", period: "2026-11", status: "confirmed", created_at: "x", confirmed_at: "x", submitted_at: null }],
      payuni_platform_fee_items: [item({}), item({ id: "i3", accommodation_id: "acc-b", trade_no: "LKZ2026110002", amount: 1400, detail: { ...item({}).detail, accommodation_name: "B館", ragic: { amount: 1400, diff: 0, has_setting: true } } })],
    };
    h.invoke.mockResolvedValue({ data: { ok: true, status: "submitted", sent: 2, failed: 0, unknown: 0, total: 3650 }, error: null });
    render(<PayuniPlatformFeePanel />);
    const row = await screen.findByTestId("payuni-fee-item-LKZ2026110001");
    expect(row.className).toContain("bg-yellow-50");
    expect(screen.getByTestId("payuni-fee-item-LKZ2026110002").className).not.toContain("bg-yellow-50");
    expect(within(row).getByText("混合付款 1")).toBeTruthy();
    expect(screen.queryByTestId("payuni-fee-adjust-LKZ2026110001")).toBeNull();
    fireEvent.click(screen.getByTestId("payuni-fee-expand-LKZ2026110001"));
    expect(screen.getByTestId("payuni-fee-refunds-LKZ2026110001").textContent).toContain("A1 NT$ 2,000");
    fireEvent.click(screen.getByTestId("payuni-fee-submit-btn"));
    expect((await screen.findByTestId("payuni-fee-submit-summary")).textContent).toContain("2 館扣款，總額 NT$ 3,650");
    fireEvent.click(screen.getByTestId("payuni-fee-submit-confirm"));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("payuni-platform-fee-run", { body: { action: "submit", batch_id: "b1" } }));
  });

  it("PMS：只呼叫 my_items（本館），沒有紀錄時不顯示；有紀錄顯示金額、狀態與訂單連結", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, items: [] }, error: null });
    const { container, unmount } = render(<MemoryRouter><PayuniPlatformFeeCard accommodationId="acc-a" /></MemoryRouter>);
    await waitFor(() => expect(h.invoke).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='payuni-fee-card']")).toBeNull();
    unmount();
    h.invoke.mockResolvedValue({ data: { ok: true, items: [{ id: "i1", period: "2026-11", amount: 2250, bal_type: 1, status: "funded", fund_date: "2026-12-06", orders: [{ order_id: "o1", order_number: "A1", check_in_date: "2026-11-10", check_out_date: "2026-11-12", revenue: 10000, fee: 1350 }] }] }, error: null });
    render(<MemoryRouter><PayuniPlatformFeeCard accommodationId="acc-a" /></MemoryRouter>);
    const row = await screen.findByTestId("payuni-fee-my-2026-11-1");
    expect(row.textContent).toContain("NT$ 2,250");
    expect(row.textContent).toContain("已撥款");
    fireEvent.click(screen.getByTestId("payuni-fee-my-expand-2026-11-1"));
    expect(screen.getByText("A1").getAttribute("href")).toBe("/admin/orders/o1");
    expect(h.invoke).toHaveBeenLastCalledWith("payuni-platform-fee-run", { body: { action: "my_items", accommodation_id: "acc-a" } });
  });
});
