import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingLocaleProvider } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import SectionTabsNav from "@/components/booking-villa/SectionTabsNav";
import VillaOverviewBar from "@/components/booking-villa/VillaOverviewBar";
import PackagePhotoCarousel from "@/components/booking-villa/PackagePhotoCarousel";
import { translate } from "@/lib/bookingI18n";

/** BookingVilla 實際傳入 SectionTabsNav 的 section id（不得因語言改變） */
const SECTION_IDS = [
  "capacity-price-section",
  "facilities",
  "location",
  "reviews",
  "faq",
  "about",
  "policy",
  "similar",
];

const tabsFor = (lang: "zh-TW" | "en") => [
  { id: "capacity-price-section", label: translate(lang, "booking.villa.tabs.plans") },
  { id: "facilities", label: translate(lang, "booking.villa.tabs.facilities") },
  { id: "location", label: translate(lang, "booking.villa.tabs.location") },
  { id: "reviews", label: translate(lang, "booking.villa.tabs.reviews") },
  { id: "faq", label: translate(lang, "booking.villa.tabs.faq") },
  { id: "about", label: translate(lang, "booking.villa.tabs.about") },
  { id: "policy", label: translate(lang, "booking.villa.tabs.policy") },
  { id: "similar", label: translate(lang, "booking.villa.tabs.similar") },
];

const Display = ({ lang }: { lang: "zh-TW" | "en" }) => (
  <>
    <BookingLanguageSwitch />
    <SectionTabsNav tabs={tabsFor(lang)} />
    <VillaOverviewBar totalRooms={6} minCapacity={6} maxCapacity={20} totalSize={80} />
    <PackagePhotoCarousel photos={[{ url: "/a.jpg", rtName: "" }, { url: "/b.jpg", rtName: "" }]} />
  </>
);

describe("booking villa display i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // jsdom 未實作 scrollTo / IntersectionObserver（僅測試環境墊片）
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
    (window as any).ResizeObserver =
      (window as any).ResizeObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    (globalThis as any).ResizeObserver = (window as any).ResizeObserver;
    (window as any).IntersectionObserver =
      (window as any).IntersectionObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    (globalThis as any).IntersectionObserver = (window as any).IntersectionObserver;
  });

  it("renders Chinese by default", () => {
    render(
      <BookingLocaleProvider>
        <Display lang="zh-TW" />
      </BookingLocaleProvider>,
    );
    expect(screen.getByText("入住方案")).toBeInTheDocument();
    expect(screen.getByText("常見問題")).toBeInTheDocument();
    expect(screen.getByLabelText("上一張")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "區塊導覽" })).toBeInTheDocument();
  });

  it("renders English when stored locale is en", () => {
    window.localStorage.setItem("booking_lang", "en");
    render(
      <BookingLocaleProvider>
        <Display lang="en" />
      </BookingLocaleProvider>,
    );
    expect(screen.getByText("Stay Options")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous photo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Section navigation" })).toBeInTheDocument();
  });

  it("keeps section ids and numeric values identical across locales", () => {
    expect(tabsFor("zh-TW").map((t) => t.id)).toEqual(SECTION_IDS);
    expect(tabsFor("en").map((t) => t.id)).toEqual(SECTION_IDS);

    const zh = render(
      <BookingLocaleProvider>
        <VillaOverviewBar totalRooms={6} minCapacity={6} maxCapacity={20} totalSize={80} />
      </BookingLocaleProvider>,
    );
    expect(zh.getByText("6")).toBeInTheDocument();
    expect(zh.getByText("6~20")).toBeInTheDocument();
    expect(zh.getByText("80")).toBeInTheDocument();
    zh.unmount();

    window.localStorage.setItem("booking_lang", "en");
    const en = render(
      <BookingLocaleProvider>
        <VillaOverviewBar totalRooms={6} minCapacity={6} maxCapacity={20} totalSize={80} />
      </BookingLocaleProvider>,
    );
    expect(en.getByText("6")).toBeInTheDocument();
    expect(en.getByText("6~20")).toBeInTheDocument();
    expect(en.getByText("80")).toBeInTheDocument();
  });

  it("exposes accessible switch state", () => {
    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
      </BookingLocaleProvider>,
    );
    const group = screen.getByRole("group", { name: "語言選擇" });
    expect(group).toBeInTheDocument();
    const zhBtn = screen.getByLabelText("切換為繁體中文");
    const enBtn = screen.getByLabelText("Switch to English");
    expect(zhBtn).toHaveAttribute("aria-pressed", "true");
    expect(enBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(enBtn);
    expect(enBtn).toHaveAttribute("aria-pressed", "true");
    expect(zhBtn).toHaveAttribute("aria-pressed", "false");
  });
});
