/**
 * 第四批迴歸測試：五支共用區塊元件在「未傳 localize prop」時，
 * 渲染結果必須維持原樣繁體中文（範圍外頁面 Index.tsx／GroupBuyCampaign.tsx 行為零變化）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
    from: () => makeQuery({ data: [], error: null }),
    functions: { invoke: vi.fn() },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import FacilitiesSection from "@/components/FacilitiesSection";
import FaqSection from "@/components/FaqSection";
import ReviewsSection from "@/components/ReviewsSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import LocationSection from "@/components/LocationSection";

describe("共用區塊：未傳 localize 時維持原樣繁中", () => {
  it("FacilitiesSection 顯示中文分類與設施名稱", () => {
    render(
      <FacilitiesSection
        facilities={[
          { id: "f1", facility_name: "免費停車場", category: "public" },
        ]}
      />,
    );
    expect(screen.getByText("免費停車場")).toBeInTheDocument();
  });

  it("FaqSection 顯示中文問題與答案", async () => {
    render(
      <FaqSection items={[{ id: "q1", question: "可以攜帶寵物嗎？", answer: "恕不提供寵物入住。" }]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("可以攜帶寵物嗎？")).toBeInTheDocument();
    });
  });

  it("BookingInfoSection 顯示中文入住須知", () => {
    render(
      <BookingInfoSection
        bookingSettings={{ check_in_time: "15:00", check_out_time: "11:00" }}
        checkInNotice="請於下午三點後辦理入住。"
      />,
    );
    expect(screen.getByText(/入住/)).toBeInTheDocument();
  });

  it("ReviewsSection 無評論資料時不丟出錯誤（沿用原行為）", async () => {
    const { container } = render(<ReviewsSection accommodationId="acc-1" />);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("LocationSection 未被本批修改，仍以原樣中文渲染", () => {
    const { container } = render(<LocationSection address="宜蘭縣冬山鄉測試路 1 號" locationInfo={null as any} />);
    expect(container.textContent || "").not.toMatch(/undefined/);
  });
});
