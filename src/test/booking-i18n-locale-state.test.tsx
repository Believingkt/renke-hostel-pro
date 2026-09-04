import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  BookingLocaleProvider,
  useBookingLocale,
} from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import { translate, normalizeBookingLang } from "@/lib/bookingI18n";

const Probe = () => {
  const { lang, t } = useBookingLocale();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="login">{t("booking.villa.header.login")}</span>
      <span data-testid="missing">{t("booking.villa.__nope__")}</span>
    </div>
  );
};

describe("booking locale state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to zh-TW", () => {
    render(
      <BookingLocaleProvider>
        <Probe />
      </BookingLocaleProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("zh-TW");
    expect(screen.getByTestId("login").textContent).toBe("登入");
  });

  it("restores en from localStorage", () => {
    window.localStorage.setItem("booking_lang", "en");
    render(
      <BookingLocaleProvider>
        <Probe />
      </BookingLocaleProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("login").textContent).toBe("Log In");
  });

  it("falls back to zh-TW for invalid stored value", () => {
    window.localStorage.setItem("booking_lang", "fr-CA");
    render(
      <BookingLocaleProvider>
        <Probe />
      </BookingLocaleProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("zh-TW");
    expect(normalizeBookingLang("fr-CA")).toBe("zh-TW");
  });

  it("writes localStorage on switch and never touches the URL or history", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const before = window.location.href;

    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
        <Probe />
      </BookingLocaleProvider>,
    );

    fireEvent.click(screen.getByLabelText("Switch to English"));

    expect(window.localStorage.getItem("booking_lang")).toBe("en");
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(window.location.href).toBe(before);
    expect(window.location.search).not.toContain("lang");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("missing key never renders the raw key", () => {
    render(
      <BookingLocaleProvider>
        <Probe />
      </BookingLocaleProvider>,
    );
    expect(screen.getByTestId("missing").textContent).not.toContain("booking.villa.__nope__");
  });

  it("english dictionary falls back to zh for unknown keys", () => {
    expect(translate("en", "booking.villa.tabs.plans")).toBe("Stay Options");
    expect(translate("en", "booking.villa.header.share")).toBe("Share");
  });
});
