import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingLocaleProvider } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import SectionTabsNav from "@/components/booking-villa/SectionTabsNav";
import VillaOverviewBar from "@/components/booking-villa/VillaOverviewBar";
import PackagePhotoCarousel from "@/components/booking-villa/PackagePhotoCarousel";
import VillaPhotoCarousel from "@/components/booking-villa/VillaPhotoCarousel";
import VillaPhotoLightbox from "@/components/booking-villa/VillaPhotoLightbox";
import VillaLocationCompact from "@/components/booking-villa/VillaLocationCompact";
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

const PHOTOS = [
  { id: "p1", photo_url: "/p1.jpg", title: null },
  { id: "p2", photo_url: "/p2.jpg", title: null },
  { id: "p3", photo_url: "/p3.jpg", title: null },
];

const ADDRESS = "台南市安平區試驗路 123 號";
const MAPS_HREF = `https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}`;

const renderWithLocale = (ui: React.ReactElement) =>
  render(<BookingLocaleProvider>{ui}</BookingLocaleProvider>);

describe("booking villa i18n phase 1A-2: media + location display", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // jsdom 未實作 scrollIntoView（僅測試環境墊片）
    Element.prototype.scrollIntoView =
      Element.prototype.scrollIntoView || (() => {});
  });

  it("carousel renders Chinese labels by default", () => {
    renderWithLocale(<VillaPhotoCarousel photos={PHOTOS} accommodationName="測試館" />);
    expect(screen.getByText("查看全部照片")).toBeInTheDocument();
    expect(screen.getByLabelText("上一張")).toBeInTheDocument();
    expect(screen.getByLabelText("下一張")).toBeInTheDocument();
  });

  it("carousel renders English labels when locale is en", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderWithLocale(<VillaPhotoCarousel photos={PHOTOS} accommodationName="測試館" />);
    expect(screen.getByText("View all photos")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous photo")).toBeInTheDocument();
    expect(screen.getByLabelText("Next photo")).toBeInTheDocument();
  });

  it("lightbox renders Chinese labels by default", () => {
    renderWithLocale(
      <VillaPhotoLightbox photos={PHOTOS} accommodationName="測試館" onClose={() => {}} />,
    );
    expect(screen.getByLabelText("關閉")).toBeInTheDocument();
    expect(screen.getByText("全部照片")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("lightbox renders English labels when locale is en", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderWithLocale(
      <VillaPhotoLightbox photos={PHOTOS} accommodationName="測試館" onClose={() => {}} />,
    );
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
    expect(screen.getByText("All photos")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("location section renders Chinese labels by default", () => {
    renderWithLocale(<VillaLocationCompact address={ADDRESS} />);
    expect(screen.getByText("交通建議")).toBeInTheDocument();
    // tab 按鈕與內容標題同時存在 → 用 getAllByText
    expect(screen.getAllByText("大眾運輸").length).toBeGreaterThan(0);
    expect(screen.getByText("自行開車")).toBeInTheDocument();
    expect(screen.getByText("週邊景點")).toBeInTheDocument();
    expect(screen.getByLabelText("放大地圖")).toBeInTheDocument();
  });

  it("location section renders English labels when locale is en", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderWithLocale(<VillaLocationCompact address={ADDRESS} />);
    expect(screen.getByText("Getting Here")).toBeInTheDocument();
    expect(screen.getAllByText("Public Transit").length).toBeGreaterThan(0);
    expect(screen.getByText("Driving")).toBeInTheDocument();
    expect(screen.getByText("Nearby Attractions")).toBeInTheDocument();
    expect(screen.getByLabelText("Enlarge map")).toBeInTheDocument();
  });

  it("keeps carousel scroll and lightbox state across language switch", () => {
    const urlBefore = window.location.href;
    renderWithLocale(
      <>
        <BookingLanguageSwitch />
        <VillaPhotoCarousel photos={PHOTOS} accommodationName="測試館" />
      </>,
    );
    // 開啟 lightbox（點第一張圖，單張模式）
    fireEvent.click(screen.getByAltText("住宿照片 1"));
    expect(screen.getByLabelText("關閉")).toBeInTheDocument();
    // 切到第二張（carousel 與 lightbox 各有「下一張」，取最後一個 = lightbox）
    const nextBtns = screen.getAllByLabelText("下一張");
    fireEvent.click(nextBtns[nextBtns.length - 1]);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    // 切換語言
    fireEvent.click(screen.getByLabelText("Switch to English"));
    // lightbox 仍開啟、image index 不變
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("View all photos")).toBeInTheDocument();
    // URL 不變
    expect(window.location.href).toBe(urlBefore);
  });

  it("keeps address and Google Maps href identical across language switch", () => {
    const urlBefore = window.location.href;
    renderWithLocale(
      <>
        <BookingLanguageSwitch />
        <VillaLocationCompact address={ADDRESS} />
      </>,
    );
    const mapLink = screen.getByLabelText("放大地圖");
    expect(mapLink).toHaveAttribute("href", MAPS_HREF);
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Switch to English"));

    const mapLinkEn = screen.getByLabelText("Enlarge map");
    expect(mapLinkEn).toHaveAttribute("href", MAPS_HREF);
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(window.location.href).toBe(urlBefore);
  });

  it("keeps location tab selection across language switch", () => {
    renderWithLocale(
      <>
        <BookingLanguageSwitch />
        <VillaLocationCompact address={ADDRESS} locationInfo={{ driving_info: "<p>drive</p>" }} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "自行開車" }));
    expect(screen.getByText("drive")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Switch to English"));
    // tab state 保留：Driving tab 仍 active，內容仍顯示
    expect(screen.getByRole("button", { name: "Driving" })).toBeInTheDocument();
    expect(screen.getByText("drive")).toBeInTheDocument();
  });
});
