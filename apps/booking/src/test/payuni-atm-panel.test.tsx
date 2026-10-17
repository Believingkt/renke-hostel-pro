import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { PayuniAtmPanel } from "@/components/payment/PayuniAtmPanel";

const OK = {
  ok: true, bank_code: "822", bank_name: "中國信託商業銀行", pay_no: "96880012345678", amount: 3600,
  expire_at: "2026-11-01T02:20:00.000Z", balance_on_site: 8400,
};
beforeEach(() => invoke.mockReset());

describe("PayuniAtmPanel", () => {
  it("呼叫 payuni-atm-create，顯示銀行代碼＋名稱、虛擬帳號、金額、HH:mm 截止與尾款現場付", async () => {
    invoke.mockResolvedValueOnce({ data: OK, error: null });
    const onCreated = vi.fn();
    render(<PayuniAtmPanel orderNumber="LL8Y46U8" purpose="deposit" onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByTestId("payuni-atm-payno").textContent).toBe("96880012345678"));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("payuni-atm-create", { body: { order_number: "LL8Y46U8", purpose: "deposit" } });
    expect(screen.getByText(/中國信託商業銀行/)).toBeTruthy();
    expect(screen.getByTestId("payuni-atm-amount").textContent).toContain("3,600");
    const hhmm = new Date(OK.expire_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    expect(screen.getByTestId("payuni-atm-deadline").textContent).toContain(`請於 ${hhmm} 前完成轉帳，逾時訂單自動取消`);
    expect(screen.getByTestId("payuni-atm-balance").textContent).toContain("尾款 NT$ 8,400 入住時付給民宿");
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ pay_no: "96880012345678" }));
  });

  it("後端錯誤訊息原樣顯示（例如 ATM 代收銀行未設定）", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { json: () => Promise.resolve({ error: "ATM 代收銀行未設定" }) } } });
    render(<PayuniAtmPanel orderNumber="LL8Y46U8" purpose="deposit" />);
    await waitFor(() => expect(screen.getByTestId("payuni-atm-error").textContent).toContain("ATM 代收銀行未設定"));
  });

  it("全額（無尾款）不顯示尾款列；已付款不取號", async () => {
    invoke.mockResolvedValueOnce({ data: { ...OK, balance_on_site: 0 }, error: null });
    const { unmount } = render(<PayuniAtmPanel orderNumber="LL8Y46U8" purpose="deposit" />);
    await waitFor(() => screen.getByTestId("payuni-atm-payno"));
    expect(screen.queryByTestId("payuni-atm-balance")).toBeNull();
    unmount();
    invoke.mockReset();
    render(<PayuniAtmPanel orderNumber="LL8Y46U8" purpose="deposit" paid />);
    expect(screen.getByTestId("payuni-atm-paid")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
