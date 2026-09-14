import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InlineChatPayment } from "@/components/InlineChatPayment";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { use_deposit: false, deposit_percentage: 30 } }) }),
      }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/hooks/use-tappay-config", () => ({
  useTapPayConfig: () => ({ config: null, loading: false, error: null, reload: vi.fn() }),
}));

const props = {
  orderId: "o1",
  orderNumber: "ABC12345",
  finalPrice: 5000,
  guestName: "測試",
  guestPhone: "0900000000",
  accommodationId: "acc-1",
};

describe("InlineChatPayment 轉帳下架驗證", () => {
  it("default: 只顯示線上刷卡，無銀行轉帳選項", async () => {
    render(<InlineChatPayment {...props} />);
    await waitFor(() => expect(screen.getByText("線上刷卡")).toBeTruthy());
    expect(screen.queryByText("銀行轉帳")).toBeNull();
    expect(screen.queryByText("銀行轉帳資訊")).toBeNull();
    expect(screen.getByText(/如需其他付款方式/)).toBeTruthy();
  });

  it("initialMethod='transfer' 降級為選擇畫面，不顯示寫死帳號", async () => {
    render(<InlineChatPayment {...props} initialMethod="transfer" />);
    await waitFor(() => expect(screen.getByText("線上刷卡")).toBeTruthy());
    expect(screen.queryByText("陽信銀行")).toBeNull();
    expect(screen.queryByText("121450000353")).toBeNull();
  });
});
