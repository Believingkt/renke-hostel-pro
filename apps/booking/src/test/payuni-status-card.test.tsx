import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ row: null as any, strict: true, invoke: vi.fn() }));

const warn = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: warn } }));
vi.mock("@lakeze/shared/hooks/use-staff-permissions", () => ({ useStaffPermissions: () => ({ isStrictAdmin: h.strict }) }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }) }),
    functions: { invoke: (...a: any[]) => h.invoke(...a) },
  },
}));

import { PayuniStatusCard } from "@/components/admin/PayuniStatusCard";

describe("PMS「線上收款（PAYUNi）」狀態卡", () => {
  beforeEach(() => {
    h.strict = true;
    h.invoke.mockReset();
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("未建店：顯示「尚未開通，請聯繫人客多總部」", async () => {
    h.row = { payuni_mer_id: null, payuni_mer_status: null, payuni_payment_tools: {} };
    render(<PayuniStatusCard accommodationId="acc-1" />);
    expect((await screen.findByTestId("payuni-status-card-empty")).textContent).toBe("尚未開通，請聯繫人客多總部");
  });

  it("已建店：代號、狀態、已開通工具、PAYUNi 登入連結；hotel_admin 可重新查詢", async () => {
    h.row = { payuni_mer_id: "TEST0001", payuni_mer_status: 1, payuni_member_status: 5, payuni_payment_tools: { CREDIT: 1, ATM: 9, ForeignCard: 1 } };
    h.invoke.mockResolvedValue({ data: { ok: true, provider_changed: true }, error: null });
    render(<PayuniStatusCard accommodationId="acc-1" />);
    expect((await screen.findByTestId("payuni-status-card-merid")).textContent).toBe("TEST0001");
    expect(screen.getByTestId("payuni-status-card-status").textContent).toBe("啟用");
    expect(screen.getByTestId("payuni-status-card-member").textContent).toBe("待補資料");
    expect(screen.getByTestId("payuni-status-card-tools").textContent).toBe("已開通工具：信用卡、國外卡");
    expect(screen.getByTestId("payuni-status-card-login").getAttribute("href")).toBe("https://www.payuni.com.tw/login");
    fireEvent.click(screen.getByTestId("payuni-status-card-refresh"));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("payuni-merchant-status", { body: { action: "query", accommodation_id: "acc-1" } }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it("館員（非 hotel_admin／super_admin）看得到卡片但沒有重新查詢按鈕", async () => {
    h.strict = false;
    h.row = { payuni_mer_id: "TEST0001", payuni_mer_status: 9, payuni_payment_tools: {} };
    render(<PayuniStatusCard accommodationId="acc-1" />);
    expect((await screen.findByTestId("payuni-status-card-status")).textContent).toBe("審核中");
    expect(screen.queryByTestId("payuni-status-card-refresh")).toBeNull();
  });
});
