import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Phase 2E.1：BUSINESS_PROFILE 模式下必須隱藏舊 Places「立即同步」按鈕，
 * 避免館主誤以為該按鈕會同步 Business Profile 評論。
 */

const state = { reviewSource: "PLACES" as "PLACES" | "BUSINESS_PROFILE" };

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@lakeze/shared/components/website-content/GoogleReviewsSettings", () => ({
  GoogleReviewsSettings: () => <div data-testid="places-settings" />,
}));
vi.mock("@/components/website-content/GoogleBusinessProfileSettings", () => ({
  GoogleBusinessProfileSettings: () => <div data-testid="gbp-settings" />,
}));
vi.mock("@/components/website-content/GoogleBusinessProfileReviews", () => ({
  GoogleBusinessProfileReviews: () => <div data-testid="gbp-reviews">同步評論</div>,
}));
vi.mock("@/components/website-content/GoogleReviewsPreview", () => ({
  GoogleReviewsPreview: () => <div data-testid="preview" />,
}));

const ACC_INFO = {
  google_place_id: "place-1",
  google_reviews_cache: { rating: 4.8, reviews: [] },
  google_reviews_cached_at: "2026-08-30T00:00:00Z",
  google_reviews_display_count: 5,
  google_reviews_selected_keys: [],
};

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "accommodation_info"
              ? { data: ACC_INFO, error: null }
              : { data: { review_source: state.reviewSource }, error: null },
        }),
      }),
      update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "acc-1" }], error: null }) }) }),
    }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
  },
}));

import { GoogleReviewsMonitor } from "@/components/website-content/GoogleReviewsMonitor";

const setup = () => render(<GoogleReviewsMonitor accommodationId="acc-1" />);

describe("GoogleReviewsMonitor Places sync button visibility", () => {
  beforeEach(() => {
    state.reviewSource = "PLACES";
    vi.clearAllMocks();
  });

  it("PLACES 模式：顯示 Places「立即同步」按鈕", async () => {
    setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /立即同步/ })).toBeTruthy());
  });

  it("BUSINESS_PROFILE 模式：隱藏 Places「立即同步」按鈕", async () => {
    state.reviewSource = "BUSINESS_PROFILE";
    setup();
    await waitFor(() => expect(screen.getByTestId("gbp-reviews")).toBeTruthy());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /立即同步/ })).toBeNull(),
    );
  });

  it("BUSINESS_PROFILE 模式：GBP 同步入口仍可見", async () => {
    state.reviewSource = "BUSINESS_PROFILE";
    setup();
    await waitFor(() => expect(screen.getByTestId("gbp-reviews").textContent).toContain("同步評論"));
  });
});
