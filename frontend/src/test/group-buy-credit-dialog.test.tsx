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

  it("續付 CASE C: 已扣款未轉單（paid_not_converted）時封鎖再次付款，不得建立新 Draft", async () => {
    mockInvoke({
      data: { found: false, alreadyPaid: true, reason: "paid_not_converted", orderNumber: null },
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
    await screen.findByText(/這筆付款已完成扣款/);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("group-buy-resume-payment-draft");
  });

  it("續付 CASE D: 已轉單（converted）時顯示訂單編號並封鎖付款按鈕", async () => {
    mockInvoke({
      data: { found: false, alreadyPaid: true, reason: "converted", orderNumber: "DB3U47P4" },
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
    await screen.findByText(/DB3U47P4/);
    const payBtn = screen.getByRole("button", { name: /確認付款/ });
    expect(payBtn).toBeDisabled();
  });

  // ── 主動放棄／修改訂房內容的生命週期（Phase F2-D 補強）──

  const RESUMED = {
    data: {
      found: true,
      draftId: "draft-resumed",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      remainingSeconds: 300,
      amountToCharge: 4321,
      total: 14000,
    },
    error: null,
  };

  function renderDialog(onOpenChange = vi.fn()) {
    render(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={onOpenChange}
        amount={14000}
        packageName="測試方案"
        buildRequest={() => req}
      />,
    );
    return onOpenChange;
  }

  it("CASE 3: 返回修改選「繼續付款」→ 不 release、不建立第二張 Draft", async () => {
    mockInvoke(RESUMED);
    const onOpenChange = renderDialog();
    await screen.findByText(/已為您接續原本的付款保留/);
    screen.getByRole("button", { name: "返回修改" }).click();
    await screen.findByText(/返回修改後，目前為您保留的房況將立即釋放/);
    screen.getByRole("button", { name: "繼續付款" }).click();
    await waitFor(() => expect(screen.queryByText(/將立即釋放/)).toBeNull());
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-release-payment-draft")).toBe(false);
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-create-payment-draft")).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("CASE 4: 選「釋放房況並返回修改」→ 呼叫 release、清除 session、關閉且不自動建立新 Draft", async () => {
    invoke.mockImplementation((name: string) => {
      if (name === "group-buy-resume-payment-draft") return Promise.resolve(RESUMED);
      if (name === "group-buy-release-payment-draft") {
        return Promise.resolve({ data: { released: true, status: "cancelled" }, error: null });
      }
      return Promise.resolve(DEFAULT_CREATE);
    });
    const onOpenChange = renderDialog();
    await screen.findByText(/已為您接續原本的付款保留/);
    screen.getByRole("button", { name: "返回修改" }).click();
    (await screen.findByRole("button", { name: "釋放房況並返回修改" })).click();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const rel = invoke.mock.calls.find((c) => c[0] === "group-buy-release-payment-draft");
    expect(rel?.[1]?.body?.draftId).toBe("draft-resumed");
    expect(rel?.[1]?.body?.reason).toBe("customer_modify_booking");
    expect(sessionStorage.getItem("gb_payment_draft_ma")).toBeNull();
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-create-payment-draft")).toBe(false);
  });

  it("CASE 6: 找到有效 Draft 但 fingerprint 不同 → 顯示二選一，不得直接建立新 Draft", async () => {
    mockInvoke({
      data: {
        found: false,
        reason: "fingerprint_mismatch",
        conflict: {
          draftId: "draft-old",
          status: "pending",
          remainingSeconds: 392,
          checkInDate: "2026-09-09",
          checkOutDate: "2026-09-10",
          roomQuantity: 1,
          packageName: "方案 A",
          releasable: true,
        },
      },
      error: null,
    });
    renderDialog();
    await screen.findByText(/您目前仍有一筆付款保留中的房況/);
    expect(screen.getByText(/6:32/)).toBeTruthy();
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-create-payment-draft")).toBe(false);
    expect(screen.getByRole("button", { name: /確認付款/ })).toBeDisabled();
  });

  it("CASE 7: 選「改用目前選擇」→ 先 release 舊 Draft 成功，才 create 新 Draft", async () => {
    const order: string[] = [];
    invoke.mockImplementation((name: string) => {
      order.push(name);
      if (name === "group-buy-resume-payment-draft") {
        return Promise.resolve({
          data: {
            found: false,
            reason: "fingerprint_mismatch",
            conflict: { draftId: "draft-old", status: "pending", remainingSeconds: 300, releasable: true },
          },
          error: null,
        });
      }
      if (name === "group-buy-release-payment-draft") {
        return Promise.resolve({ data: { released: true, status: "cancelled" }, error: null });
      }
      return Promise.resolve(DEFAULT_CREATE);
    });
    renderDialog();
    (await screen.findByRole("button", { name: "改用目前選擇" })).click();
    await waitFor(() => expect(order).toContain("group-buy-create-payment-draft"));
    expect(order.indexOf("group-buy-release-payment-draft"))
      .toBeLessThan(order.indexOf("group-buy-create-payment-draft"));
  });

  it("CASE 8: release 被 server 以 payment_processing 拒絕 → 顯示付款確認中，不建立新 Draft", async () => {
    invoke.mockImplementation((name: string) => {
      if (name === "group-buy-resume-payment-draft") return Promise.resolve(RESUMED);
      if (name === "group-buy-release-payment-draft") {
        return Promise.resolve({ data: { released: false, reason: "payment_processing" }, error: null });
      }
      return Promise.resolve(DEFAULT_CREATE);
    });
    renderDialog();
    await screen.findByText(/已為您接續原本的付款保留/);
    screen.getByRole("button", { name: "返回修改" }).click();
    (await screen.findByRole("button", { name: "釋放房況並返回修改" })).click();
    await screen.findByText(/付款結果確認中，請勿重新付款/);
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-create-payment-draft")).toBe(false);
  });

  it("CASE 12: Draft 已 expired → 不復活、清 session、正常建立新 Draft", async () => {
    sessionStorage.setItem(
      "gb_payment_draft_ma",
      JSON.stringify({ draftId: "old", expiresAt: new Date(Date.now() + 60_000).toISOString(), phoneLast4: "5678" }),
    );
    mockInvoke({ data: { found: false, reason: "expired" }, error: null });
    renderDialog();
    await waitFor(() =>
      expect(invoke.mock.calls.some((c) => c[0] === "group-buy-create-payment-draft")).toBe(true)
    );
    expect(invoke.mock.calls.some((c) => c[0] === "group-buy-release-payment-draft")).toBe(false);
  });
});

