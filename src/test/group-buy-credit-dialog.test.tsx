import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import GroupBuyCreditCardDialog from "@/components/groupbuy/GroupBuyCreditCardDialog";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
vi.mock("@/hooks/use-tappay-config", () => ({
  useTapPayConfig: () => ({ config: null, loading: false, error: null }),
}));

const req = {
  slug: "ma",
  campaignPackageId: "pkg-1",
  checkInDate: "2026-09-01",
  checkOutDate: "2026-09-02",
  adultCount: 2,
  childCount: 0,
  toddlerCount: 0,
  infantCount: 0,
  guestName: "測試",
  guestPhone: "0912345678",
  guestEmail: "t@example.com",
  guestNote: "",
};

/** resume 回傳「找不到可續付的保留」時的預設行為 */
const NO_RESUME = { data: { found: false }, error: null };

/** 依 function 名稱分派 mock：resume 先跑，找不到才會 createDraft */
function mockInvoke(resume: unknown = NO_RESUME, create?: unknown) {
  invoke.mockImplementation((name: string) => {
    if (name === "group-buy-resume-payment-draft") return Promise.resolve(resume);
    return Promise.resolve(create ?? DEFAULT_CREATE);
  });
}

const DEFAULT_CREATE = {
  data: {
    success: true,
    draftId: "draft-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    amountToCharge: 4321,
    total: 14000,
    balance: 9679,
    depositPercentage: 31,
  },
  error: null,
};

describe("團購信用卡 Dialog（不實刷、不落 DB）", () => {
  beforeEach(() => {
    invoke.mockReset();
    sessionStorage.clear();
    mockInvoke();
    invoke.mockResolvedValue({
      data: {
        success: true,
        draftId: "draft-1",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        amountToCharge: 4321,
        total: 14000,
        balance: 9679,
        depositPercentage: 31,
      },
      error: null,
    });
  });

  it("CASE 4/5: 開啟時只建立 payment draft（不建立正式訂單），金額來自 server", async () => {
    render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    // 先嘗試續付既有保留，找不到才建立新的 draft
    expect(invoke.mock.calls[0][0]).toBe("group-buy-resume-payment-draft");
    expect(invoke.mock.calls[1][0]).toBe("group-buy-create-payment-draft");
    // 前台不得呼叫任何建立正式訂單的函式
    expect(invoke.mock.calls.some((c) => String(c[0]).includes("create-order"))).toBe(false);
    // 顯示金額為 server draft.amount_to_charge，而非前端 amount prop
    await screen.findByText("NT$ 4,321");
    // 全額付款：不再顯示訂金比例與尾款
    expect(screen.queryByText("NT$ 9,679")).toBeNull();
    expect(screen.getByText(/本次信用卡付款金額（全額）/)).toBeTruthy();
  });

  it("CASE 8/9: 重新 render 不會重複建立 Draft，且顯示 10 分鐘保留倒數", async () => {
    const { rerender } = render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    rerender(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    await waitFor(() => expect(screen.getByText(/已為您保留房況/)).toBeTruthy());
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("CASE 7: draft 已逾時 → 付款按鈕停用並提供重新確認房況", async () => {
    mockInvoke(NO_RESUME, {
      data: {
        success: true,
        draftId: "draft-expired",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        amountToCharge: 4321,
      },
      error: null,
    });
    render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    const btn = await screen.findByRole("button", { name: "保留已逾時" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("重新確認房況")).toBeTruthy();
  });

  it("續付 CASE A: 有未過期 Draft 時直接接續，不得建立第二張 Draft", async () => {
    mockInvoke({
      data: {
        found: true,
        draftId: "draft-resumed",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        remainingSeconds: 300,
        amountToCharge: 4321,
        total: 14000,
      },
      error: null,
    });
    render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    await screen.findByText(/已為您接續原本的付款保留/);
    // 只呼叫 resume，不得再建立新的 draft
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("group-buy-resume-payment-draft");
  });

  it("續付 CASE B: 續付不得延長保留時間（沿用後端回傳的剩餘秒數）", async () => {
    mockInvoke({
      data: {
        found: true,
        draftId: "draft-resumed",
        expiresAt: new Date(Date.now() + 62_000).toISOString(),
        remainingSeconds: 62,
        amountToCharge: 4321,
        total: 14000,
      },
      error: null,
    });
    render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={vi.fn()}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    // 顯示 1:02，而非重新從 10:00 起算
    await screen.findByText(/1:02/);
  });
});
