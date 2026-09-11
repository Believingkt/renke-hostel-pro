/**
 * 第一階段雙語 pipeline 測試：
 * 1. 中文模式不呼叫 translate-content
 * 2. 英文模式顯示翻譯後的動態內容
 * 3. 翻譯結果快取，不重複呼叫
 * 4. 切換語言不清空已選狀態、不觸發任何寫入（沿用既有測試的驗證方式）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BookingLocaleProvider } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import { useTranslatedFields } from "@/hooks/use-translated-fields";
import { translate } from "@/lib/bookingI18n";
import { useState } from "react";

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const ROOM = {
  table: "room_types",
  column: "name",
  id: "room-1",
  text: "湖景四人房",
};

const Harness = () => {
  const { tf } = useTranslatedFields([ROOM]);
  const [selected, setSelected] = useState("2026-10-01");
  return (
    <div>
      <span data-testid="room">{tf(ROOM)}</span>
      <span data-testid="selected">{selected}</span>
      <button onClick={() => setSelected("2026-11-11")}>change</button>
    </div>
  );
};

describe("dynamic content translation pipeline", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invokeMock.mockReset();
    fromMock.mockReset();
    invokeMock.mockResolvedValue({
      data: { translations: { "room_types.name.room-1": "Lake View Quad Room" } },
      error: null,
    });
  });

  it("中文模式：完全不呼叫 translate-content，顯示原文", async () => {
    render(
      <BookingLocaleProvider>
        <Harness />
      </BookingLocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("room").textContent).toBe("湖景四人房"));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("英文模式：呼叫 translate-content 並顯示翻譯結果", async () => {
    window.localStorage.setItem("booking_lang", "en");
    render(
      <BookingLocaleProvider>
        <Harness />
      </BookingLocaleProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("room").textContent).toBe("Lake View Quad Room"),
    );
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("translate-content");
    expect(invokeMock.mock.calls[0][1]).toEqual({
      body: { lang: "en", items: [ROOM] },
    });
  });

  it("同一批文字不會重複呼叫（前端快取）", async () => {
    window.localStorage.setItem("booking_lang", "en");
    render(
      <BookingLocaleProvider>
        <Harness />
      </BookingLocaleProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("room").textContent).toBe("Lake View Quad Room"),
    );
    // 觸發重新 render（狀態變更），不應再次呼叫翻譯
    fireEvent.click(screen.getByText("change"));
    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("2026-11-11"));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("切換語言：不清空已選狀態、不寫入資料庫、不改網址", async () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const before = window.location.href;

    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
        <Harness />
      </BookingLocaleProvider>,
    );

    fireEvent.click(screen.getByText("change"));
    expect(screen.getByTestId("selected").textContent).toBe("2026-11-11");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Switch to English"));
    });

    // 已選狀態保留
    expect(screen.getByTestId("selected").textContent).toBe("2026-11-11");
    // 沒有任何資料庫寫入
    expect(fromMock).not.toHaveBeenCalled();
    // 只呼叫翻譯，沒有呼叫其他 Edge Function
    expect(invokeMock.mock.calls.every((c) => c[0] === "translate-content")).toBe(true);
    // 網址完全不變
    expect(window.location.href).toBe(before);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("翻譯失敗時顯示原文，不丟出錯誤", async () => {
    window.localStorage.setItem("booking_lang", "en");
    invokeMock.mockResolvedValue({ data: null, error: new Error("boom") });
    render(
      <BookingLocaleProvider>
        <Harness />
      </BookingLocaleProvider>,
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("room").textContent).toBe("湖景四人房");
  });
});

describe("PaymentResult 固定文案字典", () => {
  const keys = [
    "booking.payment.loading.title",
    "booking.payment.creating.title",
    "booking.payment.booking.title",
    "booking.payment.field.orderNumber",
    "booking.payment.field.roomType",
    "booking.payment.field.checkIn",
    "booking.payment.field.checkOut",
    "booking.payment.field.paidAmount",
    "booking.payment.field.transactionId",
    "booking.payment.field.authCode",
    "booking.payment.success.title",
    "booking.payment.failed.title",
    "booking.payment.error.title",
    "booking.payment.error.contact",
    "booking.payment.action.home",
    "booking.payment.action.retry",
    "booking.payment.action.retryPayment",
    "booking.payment.action.orders",
    "booking.payment.msg.missingRecTradeId",
    "booking.payment.msg.verifyFailed",
    "booking.payment.msg.queryError",
    "booking.payment.msg.paidButOrderFailed",
    "booking.payment.msg.groupBuyConfirmFailed",
    "booking.payment.msg.groupBuyNetworkFailed",
  ];

  it("每個 key 都有中英文，且英文不殘留中文字", () => {
    for (const k of keys) {
      const zh = translate("zh-TW", k);
      const en = translate("en", k);
      expect(zh, k).not.toBe("");
      expect(en, k).not.toBe("");
      expect(/[\u4e00-\u9fff]/.test(en), `${k} 英文殘留中文: ${en}`).toBe(false);
    }
  });
});
