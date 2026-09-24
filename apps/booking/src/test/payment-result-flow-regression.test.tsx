/**
 * PaymentResult 商業邏輯迴歸測試（語言切換前後行為必須完全一致）
 *
 * 驗證重點：
 * 1. 查詢付款狀態（tappay-query）只呼叫一次 —— 多包一層語言 Provider 不會造成重複打 API
 * 2. 建單流程（create-paid-order，post-charge 模式）只呼叫一次且參數不變
 * 3. session 清理（pending_paid_order_3ds）行為不變
 * 4. 切換語言後：不重打 tappay-query、不重新建單、不清空已完成訂單結果
 * 5. 沒有 rec_trade_id 時不會呼叫任何付款 API（錯誤路徑不變）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

const invokeMock = vi.fn();
const fromMock = vi.fn();
const navigateMock = vi.fn();
let searchString = "";

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(searchString)],
}));

vi.mock("@lakeze/shared/lib/native/haptics", () => ({
  hapticSuccess: vi.fn(),
  hapticError: vi.fn(),
}));

vi.mock("@/lib/nativePayment", () => ({
  isNativeApp: () => false,
  loadNativePaymentDraft: () => null,
  clearNativePaymentDraft: vi.fn(),
  handoffPaymentResultToApp: vi.fn(),
}));

vi.mock("@/components/booking/AddToCalendarButton", () => ({
  default: () => null,
}));

import PaymentResult from "@/pages/PaymentResult";

const PAID_DRAFT = {
  accommodationId: "acc-1",
  selectedRoom: { id: "room-1", name: "湖景四人房" },
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-02",
  nights: 1,
  finalPrice: 5000,
};

const setupSuccessMocks = () => {
  invokeMock.mockImplementation((fn: string) => {
    if (fn === "tappay-query") {
      return Promise.resolve({
        data: {
          success: true,
          paymentSuccess: true,
          recTradeId: "REC123",
          bankTransactionId: "BANK1",
          amount: 5000,
          authCode: "AUTH1",
        },
        error: null,
      });
    }
    if (fn === "create-paid-order") {
      return Promise.resolve({
        data: {
          success: true,
          emailSent: true,
          order: {
            order_number: "AB12CD34",
            check_in_date: "2026-10-01",
            check_out_date: "2026-10-02",
            final_price: 5000,
          },
        },
        error: null,
      });
    }
    if (fn === "translate-content") {
      return Promise.resolve({
        data: { translations: { "room_types.name.room-1": "Lake View Quad Room" } },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
};

const callsTo = (name: string) => invokeMock.mock.calls.filter((c) => c[0] === name);

describe("PaymentResult 商業邏輯迴歸（語言切換不影響）", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    navigateMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    searchString = "rec_trade_id=REC123";
  });

  it("中文模式：查詢付款一次、建單一次、清掉 session 草稿", async () => {
    setupSuccessMocks();
    sessionStorage.setItem("pending_paid_order_3ds", JSON.stringify(PAID_DRAFT));

    render(<PaymentResult />);

    await waitFor(() => expect(screen.getByText("AB12CD34")).toBeTruthy());
    expect(callsTo("tappay-query").length).toBe(1);
    expect(callsTo("create-paid-order").length).toBe(1);
    expect(callsTo("create-paid-order")[0][1]).toEqual({
      body: { ...PAID_DRAFT, alreadyChargedRecTradeId: "REC123" },
    });
    expect(sessionStorage.getItem("pending_paid_order_3ds")).toBeNull();
    // 中文模式完全不呼叫翻譯
    expect(callsTo("translate-content").length).toBe(0);
  });

  it("英文模式：查詢付款與建單的次數、參數與中文模式完全一致", async () => {
    setupSuccessMocks();
    window.localStorage.setItem("booking_lang", "en");
    sessionStorage.setItem("pending_paid_order_3ds", JSON.stringify(PAID_DRAFT));

    render(<PaymentResult />);

    await waitFor(() => expect(screen.getByText("AB12CD34")).toBeTruthy());
    expect(callsTo("tappay-query").length).toBe(1);
    expect(callsTo("create-paid-order").length).toBe(1);
    expect(callsTo("create-paid-order")[0][1]).toEqual({
      body: { ...PAID_DRAFT, alreadyChargedRecTradeId: "REC123" },
    });
    expect(sessionStorage.getItem("pending_paid_order_3ds")).toBeNull();
  });

  it("完成後切換語言：不重打付款查詢、不重新建單、訂單結果保留", async () => {
    setupSuccessMocks();
    sessionStorage.setItem("pending_paid_order_3ds", JSON.stringify(PAID_DRAFT));

    render(<PaymentResult />);
    await waitFor(() => expect(screen.getByText("AB12CD34")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Switch to English"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("切換為繁體中文"));
    });

    expect(callsTo("tappay-query").length).toBe(1);
    expect(callsTo("create-paid-order").length).toBe(1);
    expect(screen.getByText("AB12CD34")).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("缺少 rec_trade_id：不呼叫任何付款／建單 API", async () => {
    setupSuccessMocks();
    searchString = "";
    render(<PaymentResult />);

    await waitFor(() => expect(callsTo("tappay-query").length).toBe(0));
    expect(callsTo("create-paid-order").length).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
