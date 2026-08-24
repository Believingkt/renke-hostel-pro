import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  MANUAL_REFUND_REQUIRED_FIELDS as CLIENT_FIELDS,
  MANUAL_REFUND_INTRO as CLIENT_INTRO,
} from "@/lib/manualRefundRequest";
import {
  manualRefundRequestHtml,
  MANUAL_REFUND_INTRO,
  MANUAL_REFUND_NO_CONTACT,
  MANUAL_REFUND_REQUIRED_FIELDS,
} from "../../supabase/functions/_shared/manualRefundRequest.ts";
import { ManualRefundRequestNotice } from "@/components/groupbuy/ManualRefundRequestNotice";
import { RefundSummaryPanel } from "@/components/groupbuy/RefundSummaryPanel";

const contact = { phone: "03-1234567", lineId: "@lakeze", websiteUrl: "https://example.com", email: null };

const renderNotice = () =>
  render(
    <MemoryRouter>
      <ManualRefundRequestNotice contact={contact} />
    </MemoryRouter>,
  );

describe("前台人工退款申請引導（CASE 1-2）", () => {
  it("server 與前台文案一致", () => {
    expect([...CLIENT_FIELDS]).toEqual(MANUAL_REFUND_REQUIRED_FIELDS);
    expect(CLIENT_INTRO).toBe(MANUAL_REFUND_INTRO);
  });

  it("CASE 1/2 ATM 或 Bank pending_manual → 顯示客服、官方 LINE 與帳戶資料清單", () => {
    const { container } = renderNotice();
    const text = container.textContent ?? "";
    expect(text).toContain("退款處理中");
    expect(text).toContain("您的退款將由館方人工辦理。");
    for (const f of MANUAL_REFUND_REQUIRED_FIELDS) expect(text).toContain(f);
    expect(screen.getByText("聯繫客服")).toBeInTheDocument();
    expect(screen.getByText("官方 LINE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /官方 LINE/ })).toHaveAttribute(
      "href",
      "https://line.me/R/ti/p/%40lakeze",
    );
    expect(text).not.toContain("定金");
  });

  it("館別沒有 contact 設定 → 顯示 fallback 文案且不顯示按鈕", () => {
    const { container } = render(<ManualRefundRequestNotice contact={{}} />);
    expect(container.textContent).toContain(MANUAL_REFUND_NO_CONTACT);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("不得出現任何銀行帳號輸入欄位或上傳欄位", () => {
    const { container } = renderNotice();
    expect(container.querySelectorAll("input, textarea, form")).toHaveLength(0);
  });
});

describe("退款完成後不再索取帳戶資料（CASE 3-5）", () => {
  const refunded = (label: string, isCard: boolean) => ({
    status: "refunded",
    paidAmount: 30,
    policyRefundAmount: 30,
    feeAmount: isCard ? 0 : 10,
    refundedAmount: isCard ? 30 : 20,
    remainingRefundable: 0,
    paymentMethodLabel: label,
    refundChannelLabel: isCard ? "原信用卡退刷（TapPay）" : "人工匯款退款",
    isCardOrder: isCard,
  });

  it.each([
    ["CASE 3 ATM refunded", "ATM 虛擬帳號"],
    ["CASE 4 Bank refunded", "銀行匯款"],
  ])("%s 不顯示提供帳戶資料", (_name, label) => {
    const { container } = render(<RefundSummaryPanel refund={refunded(label, false)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("退款已完成");
    expect(text).toContain(label);
    expect(text).not.toContain("存摺封面");
    expect(text).not.toContain("退款帳號");
    expect(text).not.toContain("聯繫客服");
  });

  it("CASE 5 信用卡不出現人工退款資料", () => {
    const { container } = render(<RefundSummaryPanel refund={refunded("信用卡", true)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("原信用卡退刷（TapPay）");
    for (const bad of ["存摺封面", "退款帳號", "銀行代碼", "人工退款手續費", "人工退款說明"]) {
      expect(text).not.toContain(bad);
    }
  });
});

describe("Email 人工退款說明（CASE 6-9）", () => {
  it("CASE 6/7 取消 Email（ATM／Bank）包含人工退款申請說明與館別 contact", () => {
    const html = manualRefundRequestHtml(contact);
    expect(html).toContain(MANUAL_REFUND_INTRO);
    for (const f of MANUAL_REFUND_REQUIRED_FIELDS) expect(html).toContain(f);
    expect(html).toContain("https://line.me/R/ti/p/%40lakeze");
    expect(html).toContain("03-1234567");
    expect(html).toContain("https://example.com");
    expect(html).not.toContain(MANUAL_REFUND_NO_CONTACT);
  });

  it("沒有館別 contact 設定 → fallback「請聯繫客服協助辦理退款。」", () => {
    expect(manualRefundRequestHtml(null)).toContain(MANUAL_REFUND_NO_CONTACT);
  });
});
