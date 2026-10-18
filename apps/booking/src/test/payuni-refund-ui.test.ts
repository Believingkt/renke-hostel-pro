import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRefundBankAccountValid, EMPTY_REFUND_BANK_ACCOUNT } from "@/components/payuni/RefundBankAccountForm";

const dialog = readFileSync(resolve(__dirname, "../components/orders/CancelOrderDialog.tsx"), "utf8");
const member = readFileSync(resolve(__dirname, "../pages/MemberOrderDetail.tsx"), "utf8");
const ok = { bank_code: "812", bank_sub_code: "", account_no: "1234567890128901", holder_name: "王小明", uid: "A123456789" };

describe("PAYUNi W7 退款帳戶表單驗證（與後端 validateBankAccount 同規則）", () => {
  it("完整帳戶通過；統編 8 碼也通過", () => {
    expect(isRefundBankAccountValid(ok)).toBe(true);
    expect(isRefundBankAccountValid({ ...ok, uid: "12345678" })).toBe(true);
  });
  it("銀行代碼非 3 碼、分行非 4 碼、帳號過短、缺戶名、缺 UID → 不通過", () => {
    expect(isRefundBankAccountValid(EMPTY_REFUND_BANK_ACCOUNT)).toBe(false);
    expect(isRefundBankAccountValid({ ...ok, bank_code: "81" })).toBe(false);
    expect(isRefundBankAccountValid({ ...ok, bank_sub_code: "16" })).toBe(false);
    expect(isRefundBankAccountValid({ ...ok, account_no: "123" })).toBe(false);
    expect(isRefundBankAccountValid({ ...ok, holder_name: " " })).toBe(false);
    expect(isRefundBankAccountValid({ ...ok, uid: "" })).toBe(false);
  });
});

describe("PAYUNi W7 取消對話框分流（TapPay 文案與條件不變）", () => {
  it("TapPay 卡別集合與退刷說明維持原樣", () => {
    expect(dialog).toContain(`const CARD_METHODS = new Set(["credit_card", "credit_card_3ds"]);`);
    expect(dialog).toContain(`"系統將即時呼叫 TapPay 退款至原刷卡"`);
  });
  it("PAYUNi 信用卡可自動退款；ATM 只有在後端回報 needsBankAccount 時才顯示並要求帳戶", () => {
    expect(dialog).toContain(`const showAutoRefund = isCard || method === PAYUNI_CARD || payuniAtmAuto;`);
    expect(dialog).toContain(`const payuniAtmAuto = method === PAYUNI_ATM && !!quote?.payuni?.needsBankAccount;`);
    expect(dialog).toContain(`...(needsBankAccount ? { bankAccount } : {}),`);
  });
  it("會員取消不送金額，只在 PAYUNi ATM 時附帶帳戶", () => {
    expect(member).toContain(`runAction({ action: "cancel", bankAccount: refundAccount }`);
    expect(member).not.toMatch(/runAction\(\{ action: "cancel"[^}]*refundAmount/);
  });
});
