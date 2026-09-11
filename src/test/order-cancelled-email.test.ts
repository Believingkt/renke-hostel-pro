import { describe, it, expect } from "vitest";
import { buildCancelEmail } from "../../supabase/functions/_shared/orderCancelledEmail.ts";
import { readFileSync } from "fs";
import { resolve } from "path";

const baseOrder = {
  id: "4f050d3d-e799-4724-a79e-5d59a83070b6",
  order_number: "VH2S26D9",
  guest_name: "潘佩玟",
  guest_email: "pan651129@gmail.com",
  check_in_date: "2026-10-10",
  check_out_date: "2026-10-11",
  final_price: 47850,
};

const common = {
  order: baseOrder,
  roomName: "12 人 (含以下) 包區",
  accName: "森山寫照",
  accPhone: "02-77022269",
  accEmail: "",
};

describe("orderCancelledEmail", () => {
  it("case 1: guest_request 為預設，維持既有取消結果／退款區塊文案", () => {
    const a = buildCancelEmail({ ...common, chargedFee: 100, refunded: 900 });
    const b = buildCancelEmail({ ...common, chargedFee: 100, refunded: 900, cancelKind: "guest_request" });
    expect(a.html).toBe(b.html);
    expect(a.subject).toBe("【森山寫照】訂單已取消 - 訂單編號 VH2S26D9");
    expect(a.html).toContain("我們已依您的要求取消以下訂單");
    expect(a.html).toContain("取消結果");
    expect(a.html).toContain("取消手續費：<strong>NT$ 100</strong>");
    expect(a.html).toContain("退款金額：<strong>NT$ 900</strong>");
    expect(a.html).toContain("退款將由原付款管道退回");
  });

  it("case 2: atm_expired 顯示逾期自動取消文案，且不出現退款區塊", () => {
    const { html, subject } = buildCancelEmail({
      ...common,
      cancelKind: "atm_expired",
      deadlineText: "2026/08/13 17:11",
    });
    expect(subject).toBe("【森山寫照】訂單已取消 - 訂單編號 VH2S26D9");
    expect(html).toContain("未於付款期限內完成 ATM 匯款");
    expect(html).toContain("ATM 虛擬帳號付款期限已逾期，系統自動取消此訂單。");
    expect(html).toContain("原付款期限：<strong>2026/08/13 17:11</strong>");
    expect(html).toContain("請勿再匯款至原虛擬帳號");
    expect(html).not.toContain("取消手續費");
    expect(html).not.toContain("退款金額");
    expect(html).not.toContain("退款將由原付款管道退回");
  });

  it("case 3: atm_expired 未提供 deadlineText 時不輸出期限行", () => {
    const { html } = buildCancelEmail({ ...common, cancelKind: "atm_expired" });
    expect(html).not.toContain("原付款期限");
    expect(html).toContain("ATM 虛擬帳號付款期限已逾期");
  });

  it("case 4: needManual 與 refunded=0 時只顯示人工處理，不顯示退款管道說明", () => {
    const { html } = buildCancelEmail({ ...common, chargedFee: 0, refunded: 0, needManual: true });
    expect(html).toContain("部分款項需由客服人員人工處理");
    expect(html).not.toContain("退款將由原付款管道退回");
    expect(html).toContain("退款金額：<strong>NT$ 0</strong>");
  });

  it("case 5: previewTo 有值時完全不寫 booking_email_log（原始碼守衛存在）", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/orderCancelledEmail.ts"),
      "utf8",
    );
    const guardIdx = src.indexOf("if (!previewTo) {");
    const logIdx = src.indexOf('from("booking_email_log")');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(guardIdx);
    // booking_email_log 寫入只出現一次，且被 previewTo 守衛包住
    expect(src.split('from("booking_email_log")').length - 1).toBe(1);
    expect(src).toContain("const recipient = previewTo || order.guest_email;");
  });
});
