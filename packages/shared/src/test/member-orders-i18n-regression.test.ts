/**
 * 第三批（會員中心雙語）迴歸測試。
 *
 * 目的：證明「只改顯示文字」——
 * 1. member-order-manage／send-order-confirmation 的呼叫名稱、body、呼叫次數完全不變。
 * 2. 取消／改期／人數變更的判斷條件與狀態值未被雙語化改動。
 * 3. 中文模式不會呼叫 translate-content（hook 內建規則），且語言切換不觸發重新查詢。
 * 4. 字典 zh／en 鍵值一一對應，會員中心不再殘留寫死中文顯示字串。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const detail = read("apps/booking/src/pages/MemberOrderDetail.tsx");
const list = read("apps/booking/src/pages/MemberOrders.tsx");
const calendarBtn = read("apps/booking/src/components/booking/AddToCalendarButton.tsx");
const dict = read("packages/shared/src/lib/bookingI18n.ts");
const hook = read("packages/shared/src/hooks/use-translated-fields.tsx");

describe("會員中心雙語：後端呼叫完全不變", () => {
  it("member-order-manage 仍為 3 個呼叫點", () => {
    expect(detail.match(/functions\.invoke\("member-order-manage"/g)?.length).toBe(3);
  });

  it("取消／試算／人數試算的 invoke body 逐字不變", () => {
    expect(detail).toContain(
      `const { data, error } = await supabase.functions.invoke("member-order-manage", {
        body: { orderNumber: order.order_number, ...payload },
      });`,
    );
    expect(detail).toContain(
      `const { data } = await supabase.functions.invoke("member-order-manage", {
        body: { orderNumber: order.order_number, action: "cancel_quote" },
      });`,
    );
    expect(detail).toContain(
      `const { data } = await supabase.functions.invoke("member-order-manage", {
        body: {
          orderNumber: order.order_number,
          action: "change_guests_quote",
          guestCount: n,
        },
      });`,
    );
  });

  it("send-order-confirmation 仍為 1 個呼叫點且參數不變", () => {
    expect(detail.match(/functions\.invoke\("send-order-confirmation"/g)?.length).toBe(1);
    expect(detail).toContain(`body: {
          orderNumber: order.order_number,
          triggerSource: "member_resend",
          siteUrl: window.location.origin,
        },`);
  });

  it("claim-order 呼叫參數不變、仍只有 1 處", () => {
    expect(list.match(/functions\.invoke\("claim-order"/g)?.length).toBe(1);
    expect(list).toContain(`body: {
          order_number: claimOrderNumber.trim(),
          guest_name: claimGuestName.trim(),
          phone_last4: last4,
        },`);
  });

  it("取消／改期的 action 名稱與條件判斷未被更動", () => {
    expect(detail).toContain(`runAction({ action: "cancel" }`);
    expect(detail).toContain(`action: dateChangeLocked ? "request_date_change" : "change_dates",`);
    expect(detail).toContain(`action: "change_guests",`);
    expect(detail).toContain(`confirmPriceChange: priceChangeAck || !guestPriceChanged,`);
    expect(detail).toContain(
      `["paid", "deposit_paid", "partial"].includes(String(order.payment_status))`,
    );
    expect(detail).toContain(`const fullyPaid = ["paid", "fully_paid"].includes(String(order.payment_status));`);
  });
});

describe("會員中心雙語：語言只影響顯示層", () => {
  it("中文模式不呼叫 translate-content", () => {
    expect(hook).toContain(`if (lang !== "en" || valid.length === 0) return;`);
    expect(hook).toContain(`if (lang !== "en") return field.text;`);
  });

  it("兩頁都以 BookingLocaleProvider 包裝，不改動任何資料載入相依", () => {
    expect(detail).toContain("<BookingLocaleProvider>");
    expect(list).toContain("<BookingLocaleProvider>");
    // 資料載入 effect 的相依陣列不含語言，切換語言不會重新查詢
    expect(detail).toContain(`}, [orderNumber, reloadKey, native]);`);
    expect(list).toContain(`}, [native]);`);
  });

  it("不含任何寫死的中文顯示字串（顯示層皆走字典）", () => {
    const forbidden = [
      "取消訂單", "更改訂單", "延長入住", "管理訂單", "住宿詳情", "旅客資訊",
      "認領歷史訂單", "再次預訂", "撰寫評論", "修改訂單", "加入行事曆",
    ];
    for (const word of forbidden) {
      expect(detail.includes(`>${word}`)).toBe(false);
      expect(list.includes(`>${word}`)).toBe(false);
      expect(calendarBtn.includes(`>${word}`)).toBe(false);
    }
  });
});

describe("字典完整性", () => {
  const keysOf = (block: string) =>
    [...block.matchAll(/"(booking\.(?:member|calendar)\.[^"]+)":/g)].map((m) => m[1]);

  it("zh 與 en 的會員中心鍵值一一對應", () => {
    const enStart = dict.indexOf("const en: Record<BookingI18nKey, string> = {");
    const zhKeys = keysOf(dict.slice(0, enStart));
    const enKeys = keysOf(dict.slice(enStart));
    expect(zhKeys.length).toBeGreaterThan(150);
    expect(new Set(enKeys)).toEqual(new Set(zhKeys));
  });

  it("行事曆按鈕文字使用字典鍵", () => {
    expect(calendarBtn).toContain(`t("booking.calendar.add")`);
  });
});
