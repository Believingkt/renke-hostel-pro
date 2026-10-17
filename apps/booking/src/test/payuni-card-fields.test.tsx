import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { PayuniCardFields } from "@/components/payment/PayuniCardFields";
import { classifySdkError } from "@/lib/payuniCard";
import { resolvePayuniView } from "@/components/payment/PayuniPaymentResult";

let updateCb: ((u: { status?: Record<string, boolean> }) => void) | null = null;
const getTradeResult = vi.fn().mockResolvedValue({});
const createSession = vi.fn(() => ({
  onUpdate: (cb: typeof updateCb) => { updateCb = cb; },
  start: () => Promise.resolve({}),
  getTradeResult,
}));
const TOKEN = { data: { sdk_token: "SDK", env: "S", mer_trade_no: "LL8Y46U8-P1", amount: 12000, expires_at: "x" }, error: null };

beforeEach(() => {
  invoke.mockReset();
  createSession.mockClear();
  getTradeResult.mockClear();
  (window as any).UniPayment = { createSession };
});

const valid = () => act(() => updateCb!({ status: { CardNo: true, CardExp: true, CardCvc: true } }));

describe("PayuniCardFields", () => {
  it("取 Token 建 session（不分期、三欄 id），三欄皆有效才可付款；金額顯示後端值", async () => {
    invoke.mockResolvedValueOnce(TOKEN);
    render(<PayuniCardFields orderNumber="LL8Y46U8" purpose="booking" onPaid={vi.fn()} onPending={vi.fn()} />);
    await waitFor(() => expect(createSession).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith("payuni-embed-token", { body: { order_number: "LL8Y46U8", purpose: "booking" } });
    expect(createSession).toHaveBeenCalledWith("SDK", expect.objectContaining({ env: "S", useInst: false, elements: { CardNo: "payuni-card-no", CardExp: "payuni-card-exp", CardCvc: "payuni-card-cvc" } }));
    expect(screen.getByTestId("payuni-amount").textContent).toContain("12,000");
    await waitFor(() => expect(screen.getByTestId("payuni-pay-button")).toBeDisabled());
    await act(() => updateCb!({ status: { CardNo: true, CardExp: false, CardCvc: true } }));
    expect(screen.getByTestId("payuni-pay-button")).toBeDisabled();
    await valid();
    expect(screen.getByTestId("payuni-pay-button")).not.toBeDisabled();
  });

  it("付款：getTradeResult → card-charge；paid 呼叫 onPaid；送出中鎖定按鈕防重送", async () => {
    const onPaid = vi.fn();
    let resolveCharge: (v: unknown) => void = () => {};
    invoke.mockResolvedValueOnce(TOKEN).mockImplementationOnce(() => new Promise((r) => { resolveCharge = r; }));
    render(<PayuniCardFields orderNumber="LL8Y46U8" purpose="booking" onPaid={onPaid} onPending={vi.fn()} />);
    await waitFor(() => expect(createSession).toHaveBeenCalled());
    await valid();
    fireEvent.click(screen.getByTestId("payuni-pay-button"));
    await waitFor(() => expect(screen.getByTestId("payuni-pay-button")).toBeDisabled());
    fireEvent.click(screen.getByTestId("payuni-pay-button"));
    resolveCharge({ data: { ok: true, paid: true }, error: null });
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith("LL8Y46U8-P1"));
    expect(getTradeResult).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("payuni-card-charge", { body: { mer_trade_no: "LL8Y46U8-P1" } });
  });

  it("TOKEN_EXPIRED → 自動重取 Token 並重建 session", async () => {
    invoke.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce({ data: { ok: false, code: "TOKEN_EXPIRED" }, error: null })
      .mockResolvedValueOnce({ ...TOKEN, data: { ...TOKEN.data, mer_trade_no: "LL8Y46U8-P2", sdk_token: "SDK2" } });
    render(<PayuniCardFields orderNumber="LL8Y46U8" purpose="booking" onPaid={vi.fn()} onPending={vi.fn()} />);
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    await valid();
    fireEvent.click(screen.getByTestId("payuni-pay-button"));
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    expect(createSession).toHaveBeenLastCalledWith("SDK2", expect.anything());
  });

  it("SDK 錯誤碼分類：1006／OBJ01003 過期，1007／1008 載入失敗", () => {
    expect(classifySdkError({ Code: "1006" })).toBe("token_expired");
    expect(classifySdkError({ code: "OBJ01003" })).toBe("token_expired");
    expect(classifySdkError({ Code: "1007" })).toBe("load_failed");
    expect(classifySdkError(new Error("1008 iframe timeout"))).toBe("load_failed");
    expect(classifySdkError({ Code: "9999" })).toBe("other");
  });
});

describe("PAYUNi 付款結果判斷", () => {
  it("paid／failed／unknown／逾時", () => {
    expect(resolvePayuniView({ tx_status: "paid" }, false)).toBe("paid");
    expect(resolvePayuniView({ tx_status: "pending", payment_status: "paid" }, false)).toBe("paid");
    expect(resolvePayuniView({ tx_status: "failed" }, false)).toBe("failed");
    expect(resolvePayuniView({ tx_status: "unknown" }, false)).toBe("pending");
    expect(resolvePayuniView({ tx_status: "pending" }, true)).toBe("pending");
    expect(resolvePayuniView({ tx_status: "pending" }, false)).toBe("checking");
  });
});
