import { describe, expect, it } from "vitest";
import {
  hasErrors,
  saleState,
  validateCampaignWindow,
  validateStayRange,
} from "@/lib/groupBuyDateRules";

describe("團購後台日期限制規則", () => {
  it("結束時間早於開賣時間 → 報錯", () => {
    const e = validateCampaignWindow({
      sale_start: "2026-09-01T10:00:00.000Z",
      sale_end: "2026-08-31T10:00:00.000Z",
    });
    expect(e.sale_end).toBe("結束時間不可早於開賣時間");
    expect(hasErrors(e)).toBe(true);
  });

  it("結束時間等於或晚於開賣時間 → 通過", () => {
    expect(
      hasErrors(
        validateCampaignWindow({
          sale_start: "2026-09-01T10:00:00.000Z",
          sale_end: "2026-09-01T10:00:00.000Z",
        }),
      ),
    ).toBe(false);
    expect(
      hasErrors(
        validateCampaignWindow({
          sale_start: "2026-09-01T10:00:00.000Z",
          sale_end: "2026-09-10T10:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("可入住迄日早於起日 → 報錯", () => {
    const e = validateCampaignWindow({ stay_start_date: "2026-10-05", stay_end_date: "2026-10-01" });
    expect(e.stay_end_date).toBe("可入住迄日不可早於可入住起日");
  });

  it("可入住迄日早於開賣日期 → 報錯", () => {
    const e = validateCampaignWindow({
      sale_start: "2026-09-10T00:00:00.000Z",
      stay_end_date: "2026-09-01",
    });
    expect(e.stay_end_date).toBe("可入住迄日不可早於開賣日期");
  });

  it("只填單邊或全空 → 不阻擋", () => {
    expect(hasErrors(validateCampaignWindow({}))).toBe(false);
    expect(hasErrors(validateCampaignWindow({ sale_start: "2026-09-01T00:00:00.000Z" }))).toBe(false);
    expect(hasErrors(validateCampaignWindow({ stay_start_date: "2026-09-01" }))).toBe(false);
  });

  it("格式不正確 → 報錯", () => {
    expect(validateCampaignWindow({ stay_start_date: "2026/09/01" }).stay_start_date).toBeTruthy();
    expect(validateCampaignWindow({ sale_start: "not-a-date" }).sale_start).toBeTruthy();
  });
});

describe("團購前台可入住區間限制", () => {
  const win = { stay_start_date: "2026-10-01", stay_end_date: "2026-10-31" };

  it("入住日早於可入住起日 → 報錯", () => {
    expect(validateStayRange(win, "2026-09-30", "2026-10-02").checkIn).toContain("2026-10-01");
  });

  it("退房日晚於可入住迄日 → 報錯", () => {
    expect(validateStayRange(win, "2026-10-30", "2026-11-02").checkOut).toContain("2026-10-31");
  });

  it("退房日不晚於入住日 → 報錯", () => {
    expect(validateStayRange(win, "2026-10-10", "2026-10-10").checkOut).toBe("退房日必須晚於入住日");
  });

  it("區間內的合法日期 → 通過", () => {
    expect(validateStayRange(win, "2026-10-01", "2026-10-31")).toEqual({});
  });

  it("未選日期 → 提示選擇", () => {
    expect(validateStayRange(win, "", "").checkIn).toBe("請選擇入住日");
  });
});

describe("販售狀態", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  it("尚未開賣 / 販售中 / 已結束", () => {
    expect(saleState({ sale_start: "2026-09-20T00:00:00.000Z" }, now)).toBe("not_started");
    expect(saleState({ sale_start: "2026-09-01T00:00:00.000Z", sale_end: "2026-09-30T00:00:00.000Z" }, now)).toBe(
      "on_sale",
    );
    expect(saleState({ sale_end: "2026-09-01T00:00:00.000Z" }, now)).toBe("ended");
    expect(saleState({}, now)).toBe("on_sale");
  });
});
