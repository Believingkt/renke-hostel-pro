/**
 * BookingSearchResults / BookingAccommodation 雙語迴歸測試
 *
 * 驗證重點（切換語言只影響顯示，不影響任何商業邏輯）：
 * 1. 中文模式完全不呼叫 translate-content
 * 2. 英文模式固定文字顯示英文，動態內容（民宿／方案名稱）顯示翻譯結果
 * 3. 切換語言不重新查詢資料（supabase.from 呼叫次數不變）
 * 4. 切換語言後點選房源，導頁參數（住宿 ID、搜尋條件）完全一致
 * 5. /booking/:accId 導向包棟頁的行為與查詢參數不因語言而改變
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams, useLocation } from "react-router-dom";

const IDS = vi.hoisted(() => ({
  ACC_ID: "11111111-2222-3333-4444-555555555555",
  PKG_ID: "99999999-2222-3333-4444-555555555555",
  RT_ID: "77777777-2222-3333-4444-555555555555",
}));
const { ACC_ID, PKG_ID, RT_ID } = IDS;

const state = vi.hoisted(() => ({
  fromCalls: [] as string[],
  invokes: [] as string[],
  bookingCalls: [] as any[],
}));

vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const rows: Record<string, any[]> = {
    accommodation_info: [
      {
        id: IDS.ACC_ID,
        name: "森山四季",
        type: "villa",
        region_1: "宜蘭縣",
        region_2: "冬山鄉",
        country: "台灣",
        feature_tags_override: null,
        nearby_station: null,
        review_summary: null,
        rating_score: 4.8,
        search_card_photos: null,
        child_age_rules: null,
      },
    ],
    room_types: [
      {
        id: IDS.RT_ID,
        name: "四人房",
        description: null,
        base_price: 5000,
        capacity: 4,
        size_sqm: 20,
        room_count: 2,
        accommodation_id: IDS.ACC_ID,
        display_order: 1,
      },
    ],
    accommodation_packages: [
      {
        id: IDS.PKG_ID,
        accommodation_id: IDS.ACC_ID,
        name: "全包棟一泊二食",
        enabled: true,
        guest_count: 8,
        guest_count_max: 10,
        sale_price: 20000,
        applicable_tiers: ["weekday", "weekend", "peak"],
        tier_prices: {},
        excluded_date_ranges: [],
        room_allocation: null,
        primary_room_type_id: IDS.RT_ID,
        room_type_ids: [IDS.RT_ID],
        display_order: 1,
      },
    ],
  };
  const chain = (table: string): any => {
    const self: any = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === "then")
          return (resolve: any, reject: any) =>
            Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
        if (prop === "maybeSingle")
          return () => Promise.resolve({ data: null, error: null });
        return () => self;
      },
      apply: () => self,
    });
    return self;
  };
  return {
    supabase: {
      from: (table: string) => {
        state.fromCalls.push(table);
        return chain(table);
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      functions: {
        invoke: (fn: string) => {
          state.invokes.push(fn);
          return Promise.resolve({
            data: {
              translations: {
                [`accommodation_info.name.${IDS.ACC_ID}`]: "Sensan Villa",
                [`accommodation_packages.name.${IDS.PKG_ID}`]: "Whole-house stay with two meals",
              },
            },
            error: null,
          });
        },
      },
    },
  };
});

vi.mock("@lakeze/shared/lib/inventoryQuery", () => ({ fetchAdjustedInventory: () => Promise.resolve([]) }));
vi.mock("@lakeze/shared/hooks/use-is-native-app", () => ({ useIsNativeApp: () => false }));
vi.mock("@/components/native/PullToRefresh", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@lakeze/shared/components/BookingFooter", () => ({ default: () => null }));
vi.mock("@lakeze/shared/components/member/MobileBottomNav", () => ({ default: () => null }));
vi.mock("@/components/booking-portal/RoomFilterBar", () => ({ default: () => null }));
vi.mock("@/components/booking-portal/PortalSearchBar", () => ({ default: () => null }));
vi.mock("@lakeze/shared/components/booking-portal/SearchRoomCard", () => ({
  default: ({ data, onClick }: any) => (
    <button data-testid="room-card" onClick={onClick}>
      {data.accommodation_name} | {data.name}
    </button>
  ),
}));
vi.mock("@lakeze/shared/contexts/AccommodationContext", () => ({
  useAccommodation: () => ({
    currentAccommodationId: IDS.ACC_ID,
    setCurrentAccommodationId: () => {},
    userAccommodations: [],
    isLoading: false,
  }),
}));
vi.mock("@lakeze/shared/hooks/use-accommodation-cache", () => ({
  DEFAULT_SECTIONS_ORDER: [],
  useAccommodationCache: () => ({
    info: null,
    heroPhotos: [],
    galleryPhotos: [],
    secondaryData: null,
    isLoading: true,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@lakeze/shared/hooks/use-page-analytics", () => ({ usePageAnalytics: () => {} }));
vi.mock("@lakeze/shared/hooks/use-accommodation-packages", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, useAccommodationPackages: () => ({ packages: [], loading: false }) };
});

vi.mock("@lakeze/shared/lib/frontendUrl", () => ({
  openFrontendBooking: (arg: any) => state.bookingCalls.push(arg),
}));

import BookingSearchResults from "@/pages/BookingSearchResults";
import BookingAccommodation from "@/pages/BookingAccommodation";

const switchTo = async (label: "EN" | "繁中") => {
  await act(async () => {
    fireEvent.click(screen.getAllByText(label)[0]);
  });
};

beforeEach(() => {
  state.fromCalls = [];
  state.invokes = [];
  state.bookingCalls = [];
  window.localStorage.clear();
});

afterEach(() => vi.clearAllMocks());

const renderSearch = () =>
  render(
    <MemoryRouter initialEntries={["/booking/search?adults=2"]}>
      <Routes>
        <Route path="/booking/search" element={<BookingSearchResults />} />
      </Routes>
    </MemoryRouter>,
  );

describe("BookingSearchResults 雙語顯示", () => {
  it("中文模式顯示中文，且完全不呼叫 translate-content", async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByTestId("room-card")).toBeInTheDocument());
    expect(screen.getByText(/找到 1 個房型/)).toBeInTheDocument();
    expect(screen.getByText("篩選")).toBeInTheDocument();
    expect(state.invokes).not.toContain("translate-content");
  });

  it("切換英文後固定文字與動態內容都顯示英文", async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByTestId("room-card")).toBeInTheDocument());
    await switchTo("EN");
    expect(screen.getByText(/1 option\(s\) found/)).toBeInTheDocument();
    expect(screen.getByText("Filters")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("room-card").textContent).toContain("Sensan Villa"),
    );
    expect(screen.getByTestId("room-card").textContent).toContain(
      "Whole-house stay with two meals",
    );
    expect(state.invokes.filter((f) => f === "translate-content")).toHaveLength(1);
  });

  it("切換語言不重新查詢任何資料表", async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByTestId("room-card")).toBeInTheDocument());
    const before = [...state.fromCalls];
    await switchTo("EN");
    await switchTo("繁中");
    expect(state.fromCalls).toEqual(before);
  });

  it("切換語言後點選房源，導頁參數完全一致", async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByTestId("room-card")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("room-card"));
    const zhCall = JSON.stringify(state.bookingCalls[0]);
    await switchTo("EN");
    fireEvent.click(screen.getByTestId("room-card"));
    const enCall = JSON.stringify(state.bookingCalls[1]);
    expect(enCall).toBe(zhCall);
    expect(state.bookingCalls[1].accommodationId).toBe(ACC_ID);
    expect(state.bookingCalls[1].params.adults).toBe("2");
  });

  it("語言選擇會被記住（localStorage）且不寫入網址", async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByTestId("room-card")).toBeInTheDocument());
    await switchTo("EN");
    expect(window.localStorage.getItem("booking_lang")).toBe("en");
    expect(window.location.search).not.toContain("lang");
  });
});

function VillaStub() {
  const { accId } = useParams();
  const location = useLocation();
  return <div data-testid="villa" data-acc={accId} data-search={location.search} />;
}

describe("BookingAccommodation 語言 Provider 不影響導頁", () => {
  it.each(["zh-TW", "en"])("語言 %s 下仍導向包棟頁並保留查詢參數", async (lang) => {
    window.localStorage.setItem("booking_lang", lang);
    render(
      <MemoryRouter
        initialEntries={[`/booking/${ACC_ID}?checkIn=2026-10-01&checkOut=2026-10-02&adults=4`]}
      >
        <Routes>
          <Route path="/booking/villa/:accId" element={<VillaStub />} />
          <Route path="/booking/:accId" element={<BookingAccommodation />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("villa")).toBeInTheDocument());
    expect(screen.getByTestId("villa").getAttribute("data-acc")).toBe(ACC_ID);
    const search = screen.getByTestId("villa").getAttribute("data-search") || "";
    expect(search).toContain("checkIn=2026-10-01");
    expect(search).toContain("adults=4");
  });
});
