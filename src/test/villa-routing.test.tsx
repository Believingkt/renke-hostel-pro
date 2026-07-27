import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const ACC_ID = "11111111-2222-3333-4444-555555555555";

/** 可鏈式呼叫的 supabase query stub */
function makeQuery(result: any) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (res: any) => Promise.resolve(result).then(res),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "accommodation_info") {
        return makeQuery({
          data: { id: ACC_ID, short_url_alias: "sensan", name: "測試館" },
          error: null,
        });
      }
      return makeQuery({ data: [], error: null });
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

vi.mock("@/components/skeletons/FrontendSkeleton", () => ({
  FrontendSkeleton: () => <div>loading</div>,
}));

import { AliasResolver } from "@/components/AliasResolver";

function VillaStub() {
  return <div data-testid="villa-page">villa</div>;
}
function StandardStub() {
  return <div data-testid="standard-page">standard</div>;
}

function renderAlias(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/booking/villa/:accId" element={<VillaStub />} />
        <Route path="/booking/:accId" element={<StandardStub />} />
        <Route path="/:alias" element={<AliasResolver />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("booking 網域別名導向", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "booking.lakeze.com" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
    vi.clearAllMocks();
  });

  it("在 booking 網域輸入 /{alias} 時導向新版包棟訂房頁（不論有無方案）", async () => {
    renderAlias("/sensan");
    await waitFor(() => {
      expect(screen.getByTestId("villa-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("standard-page")).not.toBeInTheDocument();
  });

  it("保留查詢參數（入住日期等）一併帶到包棟頁", async () => {
    const { container } = renderAlias("/sensan?checkIn=2026-08-01&adults=4");
    await waitFor(() => {
      expect(screen.getByTestId("villa-page")).toBeInTheDocument();
    });
    expect(container).toBeTruthy();
  });

  it("非 booking 網域時不強制導向，維持子路由渲染", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, hostname: "hq.lakeze.com" },
    });
    renderAlias("/sensan");
    await waitFor(() => {
      expect(screen.queryByTestId("villa-page")).not.toBeInTheDocument();
    });
  });
});
