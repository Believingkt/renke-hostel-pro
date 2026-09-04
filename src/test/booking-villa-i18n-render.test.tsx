import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookingLocaleProvider } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import SectionTabsNav from "@/components/booking-villa/SectionTabsNav";
import VillaOverviewBar from "@/components/booking-villa/VillaOverviewBar";
import PackagePhotoCarousel from "@/components/booking-villa/PackagePhotoCarousel";
import VillaPhotoCarousel from "@/components/booking-villa/VillaPhotoCarousel";
import VillaPhotoLightbox from "@/components/booking-villa/VillaPhotoLightbox";
import VillaLocationCompact from "@/components/booking-villa/VillaLocationCompact";
import FloatingAIChat from "@/components/booking-villa/FloatingAIChat";
import SimilarStaysCarousel from "@/components/booking-villa/SimilarStaysCarousel";
import { translate } from "@/lib/bookingI18n";
import CapacityPriceLadder from "@/components/booking-villa/CapacityPriceLadder";
import EditSearchSheet from "@/components/booking-villa/EditSearchSheet";

// 1B-1：mock Supabase client（僅本測試檔，避免網路呼叫；不改任何 global mock）
// coverage remediation：在同一 mock 內補上登入使用者、聊天歷史、帶價方案，
// 並記錄所有 mutating method（insert/update/delete/upsert）呼叫，供 invariant 斷言。
const mockState = vi.hoisted(() => ({
  mutations: [] as string[],
  villaMessages: [
    { id: "m1", role: "user", content: "mock 歷史訊息一" },
    { id: "m2", role: "assistant", content: "mock 歷史回覆一" },
  ],
  packagePrice: 12345,
}));

vi.mock("@/integrations/supabase/client", () => {
  const MUTATING = new Set(["insert", "update", "delete", "upsert"]);
  const chain = (result: any, table: string): any => {
    const self: any = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === "then")
          return (resolve: any, reject: any) =>
            Promise.resolve(result).then(resolve, reject);
        if (typeof prop === "string" && MUTATING.has(prop)) {
          mockState.mutations.push(`${table}.${String(prop)}`);
        }
        return () => self;
      },
      apply: () => self,
    });
    return self;
  };
  return {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
        getSession: () =>
          Promise.resolve({
            data: { session: { access_token: "tok", user: { id: "user-1" } } },
          }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      from: (table: string) =>
        chain(
          {
            data:
              table === "accommodation_info"
                ? [
                    {
                      id: "acc-near-1",
                      name: "鄰近測試館",
                      region_1: "宜蘭",
                      google_reviews_cache: null,
                      og_image_url: null,
                    },
                  ]
                : table === "accommodation_packages"
                  ? [
                      {
                        accommodation_id: "acc-near-1",
                        guest_count: 2,
                        guest_count_max: 4,
                        sale_price: mockState.packagePrice,
                        original_price: 15000,
                        enabled: true,
                        applicable_tiers: null,
                        tier_prices: null,
                        excluded_date_ranges: null,
                      },
                    ]
                  : table === "villa_chat_messages"
                    ? mockState.villaMessages
                    : [],
          },
          table,
        ),
    },
  };
});

const toastErrorSpy = vi.hoisted(() => vi.fn());
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, toast: { ...actual.toast, error: toastErrorSpy } };
});

const mockNavigateSpy = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigateSpy,
  };
});

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

describe("booking villa i18n phase 1B-1: AI chat static UI + similar stays title", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockState.mutations.length = 0;
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
  });

  const renderAI = () =>
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <FloatingAIChat
            accommodationId="acc-1"
            accommodationName="測試館"
            contactHref="https://example.com/contact"
          />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );

  it("renders AI chat fixed UI in zh-TW by default", () => {
    renderAI();
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    expect(screen.getByText("AI 管家")).toBeInTheDocument();
    expect(screen.getByText("測試館・回答基本問題")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("輸入您的問題…")).toBeInTheDocument();
    const human = screen.getByText("需要真人協助？點此轉接客服");
    expect(human.closest("a")).toHaveAttribute("href", "https://example.com/contact");
  });

  it("renders AI chat fixed UI in English", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderAI();
    fireEvent.click(screen.getByLabelText("Open AI concierge"));
    expect(screen.getByText("AI Concierge")).toBeInTheDocument();
    expect(screen.getByText("測試館・Answers general questions")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your question…")).toBeInTheDocument();
    const human = screen.getByText("Need a human? Contact our team");
    expect(human.closest("a")).toHaveAttribute("href", "https://example.com/contact");
  });

  it("keeps AI chat open, input draft and human link across language switch", () => {
    const urlBefore = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    renderAI();
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    const input = screen.getByPlaceholderText("輸入您的問題…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "可以帶寵物嗎？" } });
    expect(input.value).toBe("可以帶寵物嗎？");

    fireEvent.click(screen.getByLabelText("Switch to English"));

    // chat 仍開啟（切換後仍以英文 placeholder 存在）
    const inputEn = screen.getByPlaceholderText("Type your question…") as HTMLInputElement;
    expect(inputEn.value).toBe("可以帶寵物嗎？"); // 輸入草稿不變
    expect(screen.getByText("AI Concierge")).toBeInTheDocument();
    // human-contact destination 不變
    const human = screen.getByText("Need a human? Contact our team");
    expect(human.closest("a")).toHaveAttribute("href", "https://example.com/contact");
    // URL / history 不變
    expect(window.location.href).toBe(urlBefore);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it("renders similar stays title in zh-TW and keeps card content", async () => {
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <SimilarStaysCarousel excludeId="acc-self" region="宜蘭" />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("您可能也喜歡")).toBeInTheDocument();
    expect(await screen.findByText("鄰近測試館")).toBeInTheDocument();
  });

  it("renders similar stays title in English with identical card data across switch", async () => {
    const urlBefore = window.location.href;
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <SimilarStaysCarousel excludeId="acc-self" region="宜蘭" />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("您可能也喜歡")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Switch to English"));
    expect(await screen.findByText("You may also like")).toBeInTheDocument();
    // 卡片資料與順序不變
    expect(screen.getByText("鄰近測試館")).toBeInTheDocument();
    expect(window.location.href).toBe(urlBefore);
  });
});

/**
 * 1B-1 TEST COVERAGE REMEDIATION（僅測試檔；產品程式 0 修改）
 * 明確覆蓋原指令 17 項 targeted invariants：
 *  1. AI 固定 UI zh-TW   2. AI 固定 UI en   3. 開啟按鈕 aria 雙語
 *  4. 關閉提示／清除對話 aria 雙語   5. placeholder 雙語
 *  6. Similar 標題 zh   7. Similar 標題 en   8. 切換後 chat 保持開啟
 *  9. chat messages mock 不變   10. input draft 不變   11. human-contact href 不變
 * 12. Similar 卡片價格/評論/順序不變   13. 不呼叫 AI API   14. 不呼叫 navigate
 * 15. 不改 search params   16. 不呼叫 Supabase mutation   17. 價格 mock 值不變
 */
describe("booking villa i18n phase 1B-1: coverage remediation (items 1-17)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockState.mutations.length = 0;
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const renderAI = () =>
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <FloatingAIChat
            accommodationId="acc-1"
            accommodationName="測試館"
            contactHref="https://example.com/contact"
          />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );

  const renderSimilar = () =>
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <SimilarStaysCarousel excludeId="acc-self" region="宜蘭" />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );

  it("items 1+3+5: AI fixed UI, open-button aria and placeholder in zh-TW", () => {
    renderAI();
    // item 3 (zh)：開啟按鈕 aria-label
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    // item 1 (zh)：固定 UI
    expect(screen.getByText("AI 管家")).toBeInTheDocument();
    expect(screen.getByText("測試館・回答基本問題")).toBeInTheDocument();
    expect(screen.getByText("需要真人協助？點此轉接客服")).toBeInTheDocument();
    // item 5 (zh)：placeholder
    expect(screen.getByPlaceholderText("輸入您的問題…")).toBeInTheDocument();
  });

  it("items 2+3+5: AI fixed UI, open-button aria and placeholder in en", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderAI();
    // item 3 (en)
    fireEvent.click(screen.getByLabelText("Open AI concierge"));
    // item 2 (en)
    expect(screen.getByText("AI Concierge")).toBeInTheDocument();
    expect(screen.getByText("測試館・Answers general questions")).toBeInTheDocument();
    expect(screen.getByText("Need a human? Contact our team")).toBeInTheDocument();
    // item 5 (en)
    expect(screen.getByPlaceholderText("Type your question…")).toBeInTheDocument();
  });

  it("item 4: hint close aria-label in both languages", async () => {
    vi.useFakeTimers();
    try {
      renderAI();
      // 提示氣泡於 5 秒後出現
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByLabelText("關閉提示")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Switch to English"));
      expect(screen.getByLabelText("Dismiss hint")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("item 4: clear-history aria-label in both languages (mocked history)", async () => {
    renderAI();
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    // 等待 mock 歷史訊息載入 → 清除按鈕出現
    expect(await screen.findByLabelText("清除對話")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Switch to English"));
    expect(await screen.findByLabelText("Clear conversation")).toBeInTheDocument();
  });

  it("items 8+9+10+11+13+14+15+16: full AI chat state invariants across switch", async () => {
    const urlBefore = window.location.href;
    const searchBefore = window.location.search;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      renderAI();
      fireEvent.click(screen.getByLabelText("開啟 AI 管家"));

      // item 9：mock 歷史訊息載入（切換前）
      expect(await screen.findByText("mock 歷史訊息一")).toBeInTheDocument();
      expect(screen.getByText("mock 歷史回覆一")).toBeInTheDocument();

      // item 10：輸入草稿（切換前）
      const input = screen.getByPlaceholderText("輸入您的問題…") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "可以帶寵物嗎？" } });
      expect(input.value).toBe("可以帶寵物嗎？");

      // item 11：human-contact href（切換前）
      const humanZh = screen.getByText("需要真人協助？點此轉接客服");
      expect(humanZh.closest("a")).toHaveAttribute("href", "https://example.com/contact");

      fireEvent.click(screen.getByLabelText("Switch to English"));

      // item 8：chat 仍保持開啟
      expect(screen.getByText("AI Concierge")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Type your question…")).toBeInTheDocument();

      // item 9：messages mock 切換前後完全相同
      expect(screen.getByText("mock 歷史訊息一")).toBeInTheDocument();
      expect(screen.getByText("mock 歷史回覆一")).toBeInTheDocument();

      // item 10：input draft 切換前後完全相同
      const inputEn = screen.getByPlaceholderText("Type your question…") as HTMLInputElement;
      expect(inputEn.value).toBe("可以帶寵物嗎？");

      // item 11：human-contact href 切換前後完全相同
      const humanEn = screen.getByText("Need a human? Contact our team");
      expect(humanEn.closest("a")).toHaveAttribute("href", "https://example.com/contact");

      // item 13：切換語言不呼叫 AI API、不送出新 chat request
      expect(fetchSpy).not.toHaveBeenCalled();

      // item 14：不呼叫 navigate（history 無任何寫入）
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();

      // item 15：search params 不變
      expect(window.location.search).toBe(searchBefore);
      expect(window.location.href).toBe(urlBefore);

      // item 16：整個流程不呼叫任何 Supabase mutation
      expect(mockState.mutations).toEqual([]);
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });

  it("items 6+7+12+14+15+16+17: similar stays invariants across switch", async () => {
    const urlBefore = window.location.href;
    const searchBefore = window.location.search;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      renderSimilar();

      // item 6：標題 zh-TW
      expect(await screen.findByText("您可能也喜歡")).toBeInTheDocument();

      // 卡片資料快照（切換前）：名稱、價格、順序
      const cardsBefore = screen
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((txt) => txt && txt.includes("鄰近測試館"));
      expect(cardsBefore).toHaveLength(1);
      expect(cardsBefore[0]).toContain("NT$12,345"); // item 17：價格 mock 值

      fireEvent.click(screen.getByLabelText("Switch to English"));

      // item 7：標題 en
      expect(await screen.findByText("You may also like")).toBeInTheDocument();

      // item 12 + 17：卡片價格 / 內容 / 順序切換前後完全相同
      const cardsAfter = screen
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((txt) => txt && txt.includes("鄰近測試館"));
      expect(cardsAfter).toEqual(cardsBefore);
      expect(cardsAfter[0]).toContain("NT$12,345");

      // item 14：不呼叫 navigate
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();

      // item 15：search params 不變
      expect(window.location.search).toBe(searchBefore);
      expect(window.location.href).toBe(urlBefore);

      // item 16：不呼叫 Supabase mutation
      expect(mockState.mutations).toEqual([]);
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });

  it("item 13: language switch alone never triggers an AI API request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderAI();
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    fireEvent.click(screen.getByLabelText("Switch to English"));
    fireEvent.click(screen.getByLabelText("切換為繁體中文"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * 1B-2A：AI 開場歡迎卡顯示翻譯（僅測試檔；產品程式 0 修改於本批測試之外的白名單內）
 * 涵蓋：開場白 zh/en、動態 accommodationName 保留、fallback「本民宿」/「this property」、
 * 切換語言不動 messages/input/chips、chip click 仍寫入原始中文、AI request 0、
 * 不 navigate、不改 search params、不呼叫 Supabase mutation。
 * suggestion chips 永久排除翻譯。
 */
describe("booking villa i18n phase 1B-2A: AI greeting display only", () => {
  const CHIP_TEXTS = ["有哪些房型？", "可以帶寵物嗎？", "有附停車場嗎？", "幾點可以入住？"];
  // <br /> 會把開場白拆成多個 text node，改以 <p> textContent 比對
  const expectGreeting = (text: string) =>
    expect(
      screen.getByText((_c, el) => el?.tagName === "P" && (el.textContent ?? "").includes(text)),
    ).toBeInTheDocument();
  const queryGreeting = (text: string) =>
    screen.queryByText((_c, el) => el?.tagName === "P" && (el.textContent ?? "").includes(text));
  let savedMessages: typeof mockState.villaMessages;

  beforeEach(() => {
    window.localStorage.clear();
    mockState.mutations.length = 0;
    savedMessages = mockState.villaMessages;
    mockState.villaMessages = []; // 強制 messages.length === 0，顯示開場歡迎卡
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
  });

  afterEach(() => {
    mockState.villaMessages = savedMessages;
  });

  const renderChat = (name?: string) =>
    render(
      <MemoryRouter>
        <BookingLocaleProvider>
          <BookingLanguageSwitch />
          <FloatingAIChat
            accommodationId="acc-1"
            accommodationName={name}
            contactHref="https://example.com/contact"
          />
        </BookingLocaleProvider>
      </MemoryRouter>,
    );

  it("renders greeting card in zh-TW with dynamic accommodationName", () => {
    renderChat("測試館");
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    expectGreeting("您好，我是 測試館 的 AI 管家，");
    expectGreeting("可以回答房型、價格、設施等基本問題。");
    // suggestion chips 維持原中文
    CHIP_TEXTS.forEach((q) => expect(screen.getByText(q)).toBeInTheDocument());
  });

  it("renders greeting card in English with identical dynamic accommodationName", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderChat("測試館");
    fireEvent.click(screen.getByLabelText("Open AI concierge"));
    expectGreeting("Hello, I'm the AI concierge of 測試館,");
    expectGreeting("I can answer basic questions about room types, prices, and facilities.");
    // 館名原文不翻譯、不替換
    expect(screen.queryByText(/Test Property/i)).not.toBeInTheDocument();
  });

  it("uses zh-TW fallback「本民宿」when accommodationName is missing", () => {
    renderChat(undefined);
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    expectGreeting("您好，我是 本民宿 的 AI 管家，");
  });

  it("uses English fallback「this property」when accommodationName is missing", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderChat(undefined);
    fireEvent.click(screen.getByLabelText("Open AI concierge"));
    expectGreeting("Hello, I'm the AI concierge of this property,");
  });

  it("keeps chat state, input draft, chips and no AI request across language switch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const urlBefore = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      renderChat("測試館");
      fireEvent.click(screen.getByLabelText("開啟 AI 管家"));

      // 開場白 zh-TW
      expectGreeting("您好，我是 測試館 的 AI 管家，");

      // chip click 只寫入原始中文 input，不送 AI request
      fireEvent.click(screen.getByRole("button", { name: "可以帶寵物嗎？" }));
      const input = screen.getByPlaceholderText("輸入您的問題…") as HTMLInputElement;
      expect(input.value).toBe("可以帶寵物嗎？");
      expect(fetchSpy).not.toHaveBeenCalled();

      // chips 文字與順序快照（切換前）
      const chipsBefore = CHIP_TEXTS.map((q) => screen.getByRole("button", { name: q }).textContent);

      // 切換語言
      fireEvent.click(screen.getByLabelText("Switch to English"));

      // chat 仍開啟，開場白改為英文（messages 仍為空，未被建立/修改）
      expectGreeting("Hello, I'm the AI concierge of 測試館,");
      expect(queryGreeting("mock 歷史訊息一")).not.toBeInTheDocument();

      // input draft 完全相同（仍為原始中文 chip 值）
      const inputEn = screen.getByPlaceholderText("Type your question…") as HTMLInputElement;
      expect(inputEn.value).toBe("可以帶寵物嗎？");

      // chips 中文文字、順序完全相同
      CHIP_TEXTS.forEach((q, i) => {
        const chip = screen.getByRole("button", { name: q });
        expect(chip.textContent).toBe(chipsBefore[i]);
      });

      // 切換後 chip click 仍寫入原始中文、不送 AI request
      fireEvent.click(screen.getByRole("button", { name: "有附停車場嗎？" }));
      expect((screen.getByPlaceholderText("Type your question…") as HTMLInputElement).value).toBe("有附停車場嗎？");
      expect(fetchSpy).not.toHaveBeenCalled();

      // human-contact destination 不變
      const human = screen.getByText("Need a human? Contact our team");
      expect(human.closest("a")).toHaveAttribute("href", "https://example.com/contact");

      // URL / search params 不變、無 mutation
      expect(window.location.href).toBe(urlBefore);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(mockState.mutations).toEqual([]);
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not invoke React Router useNavigate during language switch", () => {
    mockNavigateSpy.mockClear();
    renderChat("測試館");
    fireEvent.click(screen.getByLabelText("開啟 AI 管家"));
    fireEvent.click(screen.getByLabelText("Switch to English"));
    fireEvent.click(screen.getByLabelText("切換為繁體中文"));
    // 直接攔截 useNavigate 回傳的 navigate function，斷言語言切換從未觸發導航
    expect(mockNavigateSpy).not.toHaveBeenCalled();
  });
});

/**
 * 1C-1：business-mixed 元件中的純顯示 micro-label 翻譯
 * 範圍：CapacityPriceLadder 滑動提示 / 左右箭頭 aria-label
 *       EditSearchSheet Counter 加減鈕 aria-label
 * 禁止：不改計價、房況、人數、日期、方案、CTA、錯誤訊息、state、URL
 */
describe("booking villa i18n phase 1C-1: micro-labels display only", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockState.mutations.length = 0;
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
    window.matchMedia =
      window.matchMedia ||
      (() => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList));
  });

  const renderLadder = () =>
    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
        <CapacityPriceLadder
          roomTypes={[
            { id: "rt-1", name: "測試房", capacity: 6, base_price: 10000, room_count: 1 },
          ]}
          onSelect={() => {}}
          nights={1}
          checkIn={new Date("2026-10-05")}
        />
      </BookingLocaleProvider>,
    );

  const setScrollerOverflow = (container: HTMLElement) => {
    const scroller = container.querySelector(".overflow-x-auto.no-scrollbar") as HTMLElement | null;
    if (!scroller) return;
    Object.defineProperty(scroller, "clientWidth", { value: 100, configurable: true });
    Object.defineProperty(scroller, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "scrollLeft", { value: 10, configurable: true });
    fireEvent.scroll(scroller);
  };

  it("renders CapacityPriceLadder scroll labels in zh-TW", async () => {
    const { container } = renderLadder();
    await act(async () => setScrollerOverflow(container));
    expect(screen.getByText("滑動看更多 ›")).toBeInTheDocument();
    expect(screen.getByLabelText("向左滑動")).toBeInTheDocument();
    expect(screen.getByLabelText("向右滑動")).toBeInTheDocument();
  });

  it("renders CapacityPriceLadder scroll labels in English", async () => {
    window.localStorage.setItem("booking_lang", "en");
    const { container } = renderLadder();
    await act(async () => setScrollerOverflow(container));
    expect(screen.getByText("Swipe for more ›")).toBeInTheDocument();
    expect(screen.getByLabelText("Scroll left")).toBeInTheDocument();
    expect(screen.getByLabelText("Scroll right")).toBeInTheDocument();
  });

  it("updates CapacityPriceLadder scroll labels across language switch", async () => {
    const urlBefore = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      const { container } = renderLadder();
      await act(async () => setScrollerOverflow(container));
      expect(screen.getByText("滑動看更多 ›")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Switch to English"));
      await act(async () => setScrollerOverflow(container));
      expect(screen.getByText("Swipe for more ›")).toBeInTheDocument();
      expect(screen.getByLabelText("Scroll left")).toBeInTheDocument();
      expect(screen.getByLabelText("Scroll right")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("切換為繁體中文"));
      await act(async () => setScrollerOverflow(container));
      expect(screen.getByText("滑動看更多 ›")).toBeInTheDocument();
      expect(screen.getByLabelText("向左滑動")).toBeInTheDocument();

      expect(window.location.href).toBe(urlBefore);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(mockState.mutations).toEqual([]);
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });

  const renderSheet = () =>
    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
        <EditSearchSheet
          open={true}
          onOpenChange={() => {}}
          checkIn={null}
          checkOut={null}
          adults={2}
          children={0}
          rooms={1}
          availableDates={new Set()}
          onConfirm={() => {}}
        />
      </BookingLocaleProvider>,
    );

  it("renders EditSearchSheet Counter aria labels in zh-TW", () => {
    renderSheet();
    expect(screen.getAllByLabelText("減少").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("增加").length).toBeGreaterThan(0);
  });

  it("renders EditSearchSheet Counter aria labels in English", () => {
    window.localStorage.setItem("booking_lang", "en");
    renderSheet();
    expect(screen.getAllByLabelText("Decrease").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Increase").length).toBeGreaterThan(0);
  });

  it("updates EditSearchSheet Counter aria labels across language switch", () => {
    const urlBefore = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      renderSheet();
      expect(screen.getAllByLabelText("減少").length).toBeGreaterThan(0);

      fireEvent.click(screen.getByLabelText("Switch to English"));
      expect(screen.getAllByLabelText("Decrease").length).toBeGreaterThan(0);
      expect(screen.queryByLabelText("減少")).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("切換為繁體中文"));
      expect(screen.getAllByLabelText("減少").length).toBeGreaterThan(0);

      expect(window.location.href).toBe(urlBefore);
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(mockState.mutations).toEqual([]);
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });
});

/**
 * Phase 1C-2B：CapacityPriceLadder 固定顯示文字（15 keys）
 * 僅驗證顯示層；價格 / tier / 人數 / payload / URL 全部為 invariant。
 */
const ROOM_TYPES = [
  { id: "rt-1", name: "測試房", capacity: 6, base_price: 10000, room_count: 3 },
];

/** 週四入住 2 晚 → 第 2 晚為週五，方案不在該時段 → 觸發 fallback 詳細計算區塊 */
const CHECK_IN = new Date("2026-10-01T00:00:00"); // Thursday
const LADDER_TABLE: any = {
  weekday: [
    {
      guestCount: 6,
      original: 20000,
      sale: 15000,
      roomAllocation: "雙人房 3 間",
      tags: ["best_value", "early_bird", "meal_included", "few_people", "mystery_tag"],
      includes: [{ text: "迎賓下午茶", available: "yes" }],
    },
  ],
  friday_sunday: [
    {
      guestCount: 12,
      original: 30000,
      sale: 25000,
      roomAllocation: "四人房 3 間",
      planName: "旺日方案",
    },
  ],
  weekend: [],
};

describe("booking villa i18n phase 1C-2B: capacity price ladder fixed display", () => {
  let fetchSpy: any;

  beforeEach(() => {
    window.localStorage.clear();
    mockState.mutations.length = 0;
    mockNavigateSpy.mockClear();
    Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
    (window as any).ResizeObserver =
      (window as any).ResizeObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    (globalThis as any).ResizeObserver = (window as any).ResizeObserver;
    fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any),
    );
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  const renderLadder2B = (overrides: Record<string, any> = {}) =>
    render(
      <BookingLocaleProvider>
        <BookingLanguageSwitch />
        <CapacityPriceLadder
          roomTypes={ROOM_TYPES as any}
          onSelect={overrides.onSelect ?? (() => {})}
          nights={2}
          checkIn={CHECK_IN}
          pricingTable={LADDER_TABLE}
          childExtraTotal={12345}
          childExtraBreakdown={[{ key: "kid", label: "兒童", count: 1, subtotal: 12345 }]}
          childRuleLines={[
            { key: "kid", label: "兒童", ageRange: "7-11 歲", feeText: "每晚加價", capText: "", count: 1 },
          ]}
          {...overrides}
        />
      </BookingLocaleProvider>,
    );

  const openChildPopover = () => {
    fireEvent.click(screen.getByText("含兒童加價 +NT$12,345"));
  };

  it("renders all 15 fixed strings in zh-TW", () => {
    // 1. 全空方案
    const empty = render(
      <BookingLocaleProvider>
        <CapacityPriceLadder roomTypes={[]} onSelect={() => {}} nights={1} />
      </BookingLocaleProvider>,
    );
    expect(empty.getByText("目前沒有可預訂的方案")).toBeInTheDocument();
    empty.unmount();

    // 2. 該時段無方案
    const emptyTier = render(
      <BookingLocaleProvider>
        <CapacityPriceLadder
          roomTypes={ROOM_TYPES as any}
          onSelect={() => {}}
          nights={1}
          checkIn={CHECK_IN}
          pricingTable={{ weekday: [], friday_sunday: [], weekend: [] } as any}
        />
      </BookingLocaleProvider>,
    );
    expect(emptyTier.getByText("此時段目前沒有可預訂的方案")).toBeInTheDocument();
    emptyTier.unmount();

    renderLadder2B();
    expect(screen.getByText("ROOM ALLOCATION")).toBeInTheDocument();
    expect(screen.getByText("尊榮禮遇")).toBeInTheDocument();
    expect(screen.getByText("早鳥優惠")).toBeInTheDocument();
    expect(screen.getByText("一泊二食")).toBeInTheDocument();
    expect(screen.getByText("少人數包棟")).toBeInTheDocument();
    expect(screen.getByText("展開詳細計算")).toBeInTheDocument();
    fireEvent.click(screen.getByText("展開詳細計算"));
    expect(screen.getByText("收合詳細計算")).toBeInTheDocument();
    fireEvent.click(screen.getByText("收合詳細計算"));
    expect(screen.getByText("預約這段專屬假期")).toBeInTheDocument();

    openChildPopover();
    expect(screen.getByText("兒童加價明細")).toBeInTheDocument();
    expect(screen.getByText("您選擇的兒童年齡層規則")).toBeInTheDocument();
    expect(screen.getByText("合計")).toBeInTheDocument();
  });

  it("renders all 15 fixed strings in English", () => {
    window.localStorage.setItem("booking_lang", "en");

    const empty = render(
      <BookingLocaleProvider>
        <CapacityPriceLadder roomTypes={[]} onSelect={() => {}} nights={1} />
      </BookingLocaleProvider>,
    );
    expect(empty.getByText("No bookable plans available")).toBeInTheDocument();
    empty.unmount();

    const emptyTier = render(
      <BookingLocaleProvider>
        <CapacityPriceLadder
          roomTypes={ROOM_TYPES as any}
          onSelect={() => {}}
          nights={1}
          checkIn={CHECK_IN}
          pricingTable={{ weekday: [], friday_sunday: [], weekend: [] } as any}
        />
      </BookingLocaleProvider>,
    );
    expect(emptyTier.getByText("No plans available for this period")).toBeInTheDocument();
    emptyTier.unmount();

    renderLadder2B();
    expect(screen.getByText("ROOM ALLOCATION")).toBeInTheDocument();
    expect(screen.getByText("Exclusive Perks")).toBeInTheDocument();
    expect(screen.getByText("Early Bird Offer")).toBeInTheDocument();
    expect(screen.getByText("Two Meals Included")).toBeInTheDocument();
    expect(screen.getByText("Private Stay for Small Groups")).toBeInTheDocument();
    expect(screen.getByText("Show breakdown")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show breakdown"));
    expect(screen.getByText("Hide breakdown")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hide breakdown"));
    expect(screen.getByText("Book this stay")).toBeInTheDocument();

    openChildPopover();
    expect(screen.getByText("Child surcharge details")).toBeInTheDocument();
    expect(screen.getByText("Rules for the selected child age groups")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("switches zh-TW → English → zh-TW and keeps prices / guest count / tier / expansion state", () => {
    const urlBefore = window.location.href;
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    try {
      const { container } = renderLadder2B();
      const priceOf = () =>
        Array.from(container.querySelectorAll("*"))
          .map((el) => el.textContent || "")
          .filter((txt) => txt.startsWith("NT$") && txt.length < 20);
      const guestLine = () => container.querySelector("h3")?.textContent;

      fireEvent.click(screen.getByText("展開詳細計算"));
      const zhPrices = priceOf();
      const zhGuest = guestLine();
      expect(screen.getByText("含兒童加價 +NT$12,345")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Switch to English"));
      expect(screen.getByText("Book this stay")).toBeInTheDocument();
      expect(screen.getByText("Hide breakdown")).toBeInTheDocument(); // 展開狀態不變
      expect(screen.getByText("含兒童加價 +NT$12,345")).toBeInTheDocument();
      expect(priceOf()).toEqual(zhPrices);
      expect(guestLine()).toBe(zhGuest);

      fireEvent.click(screen.getByLabelText("切換為繁體中文"));
      expect(screen.getByText("預約這段專屬假期")).toBeInTheDocument();
      expect(screen.getByText("收合詳細計算")).toBeInTheDocument();
      expect(priceOf()).toEqual(zhPrices);
      expect(guestLine()).toBe(zhGuest);

      expect(window.location.href).toBe(urlBefore);
      expect(window.location.search).not.toContain("lang");
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(mockNavigateSpy).not.toHaveBeenCalled();
      expect(mockState.mutations).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
    }
  });

  it("keeps tag enum keys separate from displayed labels and falls back to the raw unknown tag", () => {
    renderLadder2B();
    // enum key 不得出現在畫面
    expect(screen.queryByText("early_bird")).not.toBeInTheDocument();
    expect(screen.queryByText("meal_included")).not.toBeInTheDocument();
    expect(screen.queryByText("few_people")).not.toBeInTheDocument();
    // 未知 tag 維持原字串
    expect(screen.getByText("mystery_tag")).toBeInTheDocument();
    // 原始資料 enum key 未被翻譯改寫
    expect(LADDER_TABLE.weekday[0].tags).toEqual([
      "best_value",
      "early_bird",
      "meal_included",
      "few_people",
      "mystery_tag",
    ]);

    fireEvent.click(screen.getByLabelText("Switch to English"));
    expect(screen.getByText("mystery_tag")).toBeInTheDocument();
    expect(LADDER_TABLE.weekday[0].tags).toContain("meal_included");
  });

  it("prefers the dynamic childBlockReason and never calls onSelect when blocked", () => {
    const onSelect = vi.fn();
    renderLadder2B({ onSelect, childBlocked: true, childBlockReason: "動態原因：不接待 3 歲以下" });
    fireEvent.click(screen.getByText("預約這段專屬假期"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(toastErrorSpy).toHaveBeenCalled();
    expect(toastErrorSpy.mock.calls[0][0]).toBe("動態原因：不接待 3 歲以下");
    expect(toastErrorSpy.mock.calls[0][1].description).toBe("請點選上方搜尋條調整人數後再試。");
  });

  it("uses the translated toast fallback only when childBlockReason is missing", () => {
    window.localStorage.setItem("booking_lang", "en");
    const onSelect = vi.fn();
    renderLadder2B({ onSelect, childBlocked: true });
    fireEvent.click(screen.getByText("Book this stay"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(toastErrorSpy.mock.calls[0][0]).toBe(
      "The selected number of children does not meet this property's policy",
    );
    expect(toastErrorSpy.mock.calls[0][1].description).toBe(
      "Please adjust the guest count in the search bar above and try again.",
    );
  });

  it("emits an identical CapacityOption payload in both languages and keeps data-book-cta", () => {
    const serialize = (o: any) =>
      JSON.stringify(o, (_k, v) => (v instanceof Date ? v.toISOString() : v));

    const zhSelect = vi.fn();
    const zh = renderLadder2B({ onSelect: zhSelect });
    const zhCta = zh.container.querySelector('[data-book-cta="true"]') as HTMLElement;
    expect(zhCta).toBeTruthy();
    fireEvent.click(zhCta);
    const zhPayload = serialize(zhSelect.mock.calls[0][0]);
    zh.unmount();

    window.localStorage.setItem("booking_lang", "en");
    const enSelect = vi.fn();
    const en = renderLadder2B({ onSelect: enSelect });
    const enCta = en.container.querySelector('[data-book-cta="true"]') as HTMLElement;
    expect(enCta).toBeTruthy();
    expect(enCta.textContent).toContain("Book this stay");
    fireEvent.click(enCta);
    const enPayload = serialize(enSelect.mock.calls[0][0]);

    expect(enPayload).toBe(zhPayload);
    expect(mockNavigateSpy).not.toHaveBeenCalled();
    expect(mockState.mutations).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
