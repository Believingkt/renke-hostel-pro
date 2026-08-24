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
    expect(screen.queryByText("付款方式")).toBeNull();
    expect(screen.getByText("確認訂房並取得匯款資訊")).toBeTruthy();
  });

  it("CASE 2: enable_atm=true → 同時顯示銀行匯款與 ATM 選項", () => {
    render(
      <GroupBuyConfirmDialog {...base} atmEnabled paymentMethod="atm" onPaymentMethodChange={vi.fn()} />,
    );
    expect(screen.getByText("付款方式")).toBeTruthy();
    expect(screen.getByText("銀行匯款（人工對帳）")).toBeTruthy();
    expect(screen.getByText("ATM 虛擬帳號")).toBeTruthy();
    expect(screen.getByText("確認訂房並取得虛擬帳號")).toBeTruthy();
  });

  it("CASE 1: enable_credit_card=false → 不顯示信用卡選項", () => {
    render(<GroupBuyConfirmDialog {...base} atmEnabled creditCardEnabled={false} onPaymentMethodChange={vi.fn()} />);
    expect(screen.queryByText("信用卡（3D 驗證）")).toBeNull();
  });

  it("CASE 2: enable_credit_card=true、ATM=false → 銀行匯款＋信用卡兩種", () => {
    render(
      <GroupBuyConfirmDialog
        {...base}
        atmEnabled={false}
        creditCardEnabled
        paymentMethod="credit_card"
        onPaymentMethodChange={vi.fn()}
      />,
    );
    expect(screen.getByText("銀行匯款（人工對帳）")).toBeTruthy();
    expect(screen.queryByText("ATM 虛擬帳號")).toBeNull();
    expect(screen.getByText("信用卡（3D 驗證）")).toBeTruthy();
    expect(screen.getByText("前往信用卡付款")).toBeTruthy();
  });

  it("CASE 3: ATM 與信用卡皆開啟 → 三種付款方式", () => {
    render(
      <GroupBuyConfirmDialog {...base} atmEnabled creditCardEnabled paymentMethod="atm" onPaymentMethodChange={vi.fn()} />,
    );
    expect(screen.getByText("銀行匯款（人工對帳）")).toBeTruthy();
    expect(screen.getByText("ATM 虛擬帳號")).toBeTruthy();
    expect(screen.getByText("信用卡（3D 驗證）")).toBeTruthy();
  });
});

describe("Phase F2：三種付款方式各自獨立開關", () => {
  it("CASE 1 bank only：不顯示付款方式選擇，按鈕為匯款資訊", () => {
    render(<GroupBuyConfirmDialog {...base} bankTransferEnabled atmEnabled={false} creditCardEnabled={false} />);
    expect(screen.queryByText("付款方式")).toBeNull();
    expect(screen.getByText("確認訂房並取得匯款資訊")).toBeTruthy();
  });

  it("CASE 2 ATM only：完全沒有銀行匯款選項與匯款按鈕", () => {
    render(
      <GroupBuyConfirmDialog {...base} bankTransferEnabled={false} atmEnabled creditCardEnabled={false} />,
    );
    expect(screen.queryByText("銀行匯款（人工對帳）")).toBeNull();
    expect(screen.queryByText("確認訂房並取得匯款資訊")).toBeNull();
    expect(screen.getByText("確認訂房並取得虛擬帳號")).toBeTruthy();
  });

  it("CASE 3 credit only：直接進信用卡流程，無 fallback 到 bank", () => {
    render(
      <GroupBuyConfirmDialog {...base} bankTransferEnabled={false} atmEnabled={false} creditCardEnabled />,
    );
    expect(screen.queryByText("銀行匯款（人工對帳）")).toBeNull();
    expect(screen.getByText("前往信用卡付款")).toBeTruthy();
  });

  it("CASE 6 ATM + credit：兩種選項且不含銀行匯款", () => {
    render(<GroupBuyConfirmDialog {...base} bankTransferEnabled={false} atmEnabled creditCardEnabled />);
    expect(screen.getByText("付款方式")).toBeTruthy();
    expect(screen.queryByText("銀行匯款（人工對帳）")).toBeNull();
    expect(screen.getByText("ATM 虛擬帳號")).toBeTruthy();
    expect(screen.getByText("信用卡（3D 驗證）")).toBeTruthy();
  });

  it("CASE 7 all three：三種付款方式皆顯示", () => {
    render(<GroupBuyConfirmDialog {...base} bankTransferEnabled atmEnabled creditCardEnabled />);
    expect(screen.getByText("銀行匯款（人工對帳）")).toBeTruthy();
    expect(screen.getByText("ATM 虛擬帳號")).toBeTruthy();
    expect(screen.getByText("信用卡（3D 驗證）")).toBeTruthy();
  });

  it("CASE 10 三種全關：顯示無可用付款方式且不可送出", () => {
    render(
      <GroupBuyConfirmDialog
        {...base}
        bankTransferEnabled={false}
        atmEnabled={false}
        creditCardEnabled={false}
      />,
    );
    expect(screen.getByText("目前此活動暫無可用付款方式，請聯絡客服。")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /確認訂房並取得匯款資訊/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
