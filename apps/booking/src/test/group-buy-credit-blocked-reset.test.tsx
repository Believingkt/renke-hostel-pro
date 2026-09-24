import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const invoke = vi.fn();
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invoke(...a) } },
}));
vi.mock("@/hooks/use-tappay-config", () => ({
  useTapPayConfig: () => ({ config: null, loading: false, error: null }),
}));
vi.mock("@/utils/tappayPrime", () => ({ getTapPayPrime: vi.fn() }));
vi.mock("@/components/groupbuy/CancellationPolicyLines", () => ({
  CancellationPolicyLines: () => null,
}));

import { GroupBuyCreditCardDialog } from "@/components/groupbuy/GroupBuyCreditCardDialog";

const baseReq = {
  slug: "camp",
  campaignPackageId: "pkg-10",
  checkInDate: "2026-09-09",
  checkOutDate: "2026-09-10",
  adultCount: 2,
  childCount: 0,
  toddlerCount: 0,
  infantCount: 0,
  guestName: "test",
  guestPhone: "0912345678",
  guestEmail: "test@example.com",
  guestNote: "",
};

function setup(req: typeof baseReq, open = true) {
  return render(
    <GroupBuyCreditCardDialog
      open={open}
      onOpenChange={() => {}}
      amount={38950}
      packageName="12人包棟烤肉專案"
      buildRequest={() => req}
    />,
  );
}

describe("信用卡 Modal blocked 狀態不得跨 booking attempt 沿用", () => {
  beforeEach(() => {
    invoke.mockReset();
    sessionStorage.clear();
    invoke.mockImplementation((fn: string) => {
      if (fn === "group-buy-resume-payment-draft") {
        return Promise.resolve({
          data: { found: false, alreadyPaid: true, reason: "converted", orderNumber: "DB3U47P4" },
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          success: true,
          draftId: "new-draft",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          amountToCharge: 38950,
          total: 38950,
        },
        error: null,
      });
    });
  });

  it("CASE 12：換方案後 blocked 清除，不再顯示舊訂單編號", async () => {
    const { rerender } = setup(baseReq);
    await waitFor(() => expect(screen.getByText(/DB3U47P4/)).toBeTruthy());

    // 收到「無可續付 draft」的新 attempt
    invoke.mockImplementation((fn: string) =>
      fn === "group-buy-resume-payment-draft"
        ? Promise.resolve({ data: { found: false }, error: null })
        : Promise.resolve({
          data: {
            success: true,
            draftId: "new-draft",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            amountToCharge: 38950,
          },
          error: null,
        })
    );

    rerender(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={() => {}}
        amount={38950}
        packageName="12人包棟烤肉專案"
        buildRequest={() => ({ ...baseReq, campaignPackageId: "pkg-12" })}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/DB3U47P4/)).toBeNull());
  });

  it("CASE 13：換日期後 blocked 清除", async () => {
    const { rerender } = setup(baseReq);
    await waitFor(() => expect(screen.getByText(/DB3U47P4/)).toBeTruthy());
    rerender(
      <GroupBuyCreditCardDialog
        open
        onOpenChange={() => {}}
        amount={38950}
        packageName="12人包棟烤肉專案"
        buildRequest={() => ({ ...baseReq, checkInDate: "2026-09-10", checkOutDate: "2026-09-12" })}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/DB3U47P4/)).toBeNull());
  });

  it("關閉 Modal 後重新開啟不得沿用 blocked", async () => {
    const { rerender } = setup(baseReq);
    await waitFor(() => expect(screen.getByText(/DB3U47P4/)).toBeTruthy());
    rerender(
      <GroupBuyCreditCardDialog
        open={false}
        onOpenChange={() => {}}
        amount={38950}
        packageName="12人包棟烤肉專案"
        buildRequest={() => baseReq}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/DB3U47P4/)).toBeNull());
  });
});
