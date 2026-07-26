/**
 * TapPay ATM 虛擬帳號單筆金額限制
 * TapPay 對虛擬帳號代收有單筆金額上限，超過會回 status 10050 "Out of range : amount"。
 * 超過上限時應改用信用卡或聯繫客服分次付款。
 */
export const ATM_MIN_AMOUNT = 1;
export const ATM_MAX_AMOUNT = 30000;

export function isAtmAmountAllowed(amount: number): boolean {
  return Number.isInteger(amount) && amount >= ATM_MIN_AMOUNT && amount <= ATM_MAX_AMOUNT;
}

export function atmAmountLimitMessage(amount?: number): string {
  const over = typeof amount === "number" ? `（本筆 NT$ ${amount.toLocaleString()}）` : "";
  return `ATM 虛擬帳號單筆上限為 NT$ ${ATM_MAX_AMOUNT.toLocaleString()}${over}，請改用信用卡付款或聯繫客服協助分次收款。`;
}
