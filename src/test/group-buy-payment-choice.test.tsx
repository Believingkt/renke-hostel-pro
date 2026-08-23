import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GroupBuyConfirmDialog from "@/components/groupbuy/GroupBuyConfirmDialog";

const base = {
  open: true,
  onOpenChange: vi.fn(),
  submitting: false,
  onConfirm: vi.fn(),
  venueName: "測試民宿",
  packageName: "測試方案",
  checkIn: "2026-09-01",
  checkOut: "2026-09-02",
  nights: 1,
  roomQuantity: 1,
  guestSummary: "2 大人",
  baseTotal: 10000,
  childExtraTotal: 0,
  total: 10000,
  deposit: 3000,
  balance: 7000,
  depositPct: 30,
  guestName: "測試",
  guestPhone: "0912345678",
  guestEmail: "t@example.com",
};

describe("團購確認層付款方式（不落 DB、不呼叫 TapPay）", () => {
  it("CASE 1/3: enable_atm=false → 不顯示 ATM 選項，按鈕為匯款資訊", () => {
    render(<GroupBuyConfirmDialog {...base} atmEnabled={false} />);
    expect(screen.queryByText("ATM 虛擬帳號")).toBeNull();
    expect(screen.queryByText("訂金付款方式")).toBeNull();
    expect(screen.getByText("確認訂房並取得匯款資訊")).toBeTruthy();
  });

  it("CASE 2: enable_atm=true → 同時顯示銀行匯款與 ATM 選項", () => {
    render(
      <GroupBuyConfirmDialog {...base} atmEnabled paymentMethod="atm" onPaymentMethodChange={vi.fn()} />,
    );
    expect(screen.getByText("訂金付款方式")).toBeTruthy();
    expect(screen.getByText("銀行匯款（人工對帳）")).toBeTruthy();
    expect(screen.getByText("ATM 虛擬帳號")).toBeTruthy();
    expect(screen.getByText("確認訂房並取得虛擬帳號")).toBeTruthy();
  });
});
