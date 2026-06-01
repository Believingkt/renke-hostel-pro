import { describe, it, expect } from "vitest";
import {
  isAmountSuspicious,
  isGuestCountValid,
  AMOUNT_MIN_SUSPICIOUS,
  AMOUNT_MAX_SUSPICIOUS,
  GUEST_COUNT_MIN,
  GUEST_COUNT_MAX,
} from "./owltingFillupValidation";

describe("OwlTing fillup — amount boundary", () => {
  it("空字串 / null / undefined 不應觸發警示（尚未輸入）", () => {
    expect(isAmountSuspicious("")).toBe(false);
    expect(isAmountSuspicious(null)).toBe(false);
    expect(isAmountSuspicious(undefined)).toBe(false);
  });

  it("非數字字串不觸發警示", () => {
    expect(isAmountSuspicious("abc")).toBe(false);
  });

  it("金額 < 100 觸發警示（含 parser bug 殘留：total_amount=1）", () => {
    expect(isAmountSuspicious(1)).toBe(true);
    expect(isAmountSuspicious(0)).toBe(true);
    expect(isAmountSuspicious(99)).toBe(true);
    expect(isAmountSuspicious("50")).toBe(true);
  });

  it("金額 = 100（下邊界）不觸發警示", () => {
    expect(isAmountSuspicious(AMOUNT_MIN_SUSPICIOUS)).toBe(false);
    expect(isAmountSuspicious("100")).toBe(false);
  });

  it("金額 = 100,000（上邊界）不觸發警示", () => {
    expect(isAmountSuspicious(AMOUNT_MAX_SUSPICIOUS)).toBe(false);
    expect(isAmountSuspicious("100000")).toBe(false);
  });

  it("金額 > 100,000 觸發警示", () => {
    expect(isAmountSuspicious(100_001)).toBe(true);
    expect(isAmountSuspicious(999_999)).toBe(true);
    expect(isAmountSuspicious("500000")).toBe(true);
  });

  it("正常範圍金額不觸發", () => {
    expect(isAmountSuspicious(3800)).toBe(false);
    expect(isAmountSuspicious(15000)).toBe(false);
    expect(isAmountSuspicious(99999)).toBe(false);
  });
});

describe("OwlTing fillup — guest_count boundary", () => {
  it("空字串 / null / undefined 視為無效", () => {
    expect(isGuestCountValid("")).toBe(false);
    expect(isGuestCountValid(null)).toBe(false);
    expect(isGuestCountValid(undefined)).toBe(false);
  });

  it("人數 < 1 無效", () => {
    expect(isGuestCountValid(0)).toBe(false);
    expect(isGuestCountValid(-1)).toBe(false);
    expect(isGuestCountValid("0")).toBe(false);
  });

  it("人數 = 1（下邊界）有效", () => {
    expect(isGuestCountValid(GUEST_COUNT_MIN)).toBe(true);
    expect(isGuestCountValid("1")).toBe(true);
  });

  it("人數 = 50（上邊界）有效", () => {
    expect(isGuestCountValid(GUEST_COUNT_MAX)).toBe(true);
    expect(isGuestCountValid("50")).toBe(true);
  });

  it("人數 > 50 無效", () => {
    expect(isGuestCountValid(51)).toBe(false);
    expect(isGuestCountValid(100)).toBe(false);
    expect(isGuestCountValid("999")).toBe(false);
  });

  it("非整數無效（如 2.5、1.1）", () => {
    expect(isGuestCountValid(2.5)).toBe(false);
    expect(isGuestCountValid("1.5")).toBe(false);
  });

  it("正常範圍人數有效", () => {
    expect(isGuestCountValid(2)).toBe(true);
    expect(isGuestCountValid(4)).toBe(true);
    expect(isGuestCountValid(10)).toBe(true);
  });

  it("非數字字串無效", () => {
    expect(isGuestCountValid("abc")).toBe(false);
  });
});
