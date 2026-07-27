import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams, useLocation } from "react-router-dom";

const ACC_ID = "11111111-2222-3333-4444-555555555555";

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
  };
  return {
    supabase: {
      from: () => chain,
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

vi.mock("@/contexts/AccommodationContext", () => ({
  useAccommodation: () => ({
    currentAccommodationId: ACC_ID,
    setCurrentAccommodationId: () => {},
    userAccommodations: [],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-accommodation-cache", () => ({
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

vi.mock("@/hooks/use-page-analytics", () => ({ usePageAnalytics: () => {} }));

// 尚未設定任何方案的館別（旅行日系列現況）
vi.mock("@/hooks/use-accommodation-packages", () => ({
  useAccommodationPackages: () => ({ packages: [], loading: false }),
}));

vi.mock("@/components/skeletons/FrontendSkeleton", () => ({
  FrontendSkeleton: () => <div>loading</div>,
}));

import BookingAccommodation from "@/pages/BookingAccommodation";

function VillaStub() {
  const { accId } = useParams();
  const location = useLocation();
  return (
    <div data-testid="villa-page" data-acc={accId} data-search={location.search}>
      villa
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/booking/villa/:accId" element={<VillaStub />} />
        <Route path="/booking/:accId" element={<BookingAccommodation />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("/booking/:accId 一律導向新版包棟訂房頁", () => {
  it("即使館別尚未設定任何入住方案也導向包棟頁", async () => {
    renderAt(`/booking/${ACC_ID}`);
    await waitFor(() => {
      expect(screen.getByTestId("villa-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("villa-page").getAttribute("data-acc")).toBe(ACC_ID);
  });

  it("帶入住日期/人數查詢參數時完整保留（關鍵訂房流程）", async () => {
    renderAt(`/booking/${ACC_ID}?checkIn=2026-08-01&checkOut=2026-08-02&adults=4`);
    await waitFor(() => {
      expect(screen.getByTestId("villa-page")).toBeInTheDocument();
    });
    const search = screen.getByTestId("villa-page").getAttribute("data-search") || "";
    expect(search).toContain("checkIn=2026-08-01");
    expect(search).toContain("checkOut=2026-08-02");
    expect(search).toContain("adults=4");
  });
});
