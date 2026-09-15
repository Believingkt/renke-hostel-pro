import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAccommodationLogo } from "./use-accommodation-logo";

// Helper function to wait for async updates
const waitFor = async (callback: () => void, timeout = 1000) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      callback();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  callback(); // Final attempt, will throw if still failing
};

// Mock supabase client
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

const mockSubscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOn = vi.fn<any>(() => ({ subscribe: mockSubscribe }));
const mockChannel = vi.fn(() => ({ on: mockOn }));
const mockRemoveChannel = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => mockFrom(),
    channel: () => mockChannel(),
    removeChannel: () => mockRemoveChannel(),
  },
}));

// Mock AccommodationContext
const mockCurrentAccommodationId = vi.fn(() => "test-accommodation-id");

vi.mock("@/contexts/AccommodationContext", () => ({
  useAccommodation: () => ({
    currentAccommodationId: mockCurrentAccommodationId(),
  }),
}));

describe("useAccommodationLogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentAccommodationId.mockReturnValue("test-accommodation-id");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("初始狀態", () => {
    it("應該有正確的初始值", () => {
      const { result } = renderHook(() => useAccommodationLogo());

      expect(result.current.logoUrl).toBe(null);
      expect(result.current.accommodationId).toBe("test-accommodation-id");
      expect(result.current.accommodationName).toBe("");
    });

    it("當沒有 accommodationId 時不應該 fetch", () => {
      mockCurrentAccommodationId.mockReturnValue(null);

      renderHook(() => useAccommodationLogo());

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe("Fetch Logo", () => {
    it("應該 fetch header logo（預設 variant）", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: "https://example.com/header-logo.png" },
        error: null,
      });

      const { result } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockFrom).toHaveBeenCalledWith("accommodation_info");
      expect(mockSelect).toHaveBeenCalledWith("header_logo_url");
      expect(mockEq).toHaveBeenCalledWith("id", "test-accommodation-id");
      expect(result.current.logoUrl).toBe("https://example.com/header-logo.png");
    });

    it("應該 fetch footer logo（variant: footer）", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { footer_logo_url: "https://example.com/footer-logo.png" },
        error: null,
      });

      const { result } = renderHook(() =>
        useAccommodationLogo({ variant: "footer" })
      );

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockSelect).toHaveBeenCalledWith("footer_logo_url");
      expect(result.current.logoUrl).toBe("https://example.com/footer-logo.png");
    });

    it("應該同時 fetch 住宿名稱（fetchName: true）", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          header_logo_url: "https://example.com/logo.png",
          name: "測試住宿",
        },
        error: null,
      });

      const { result } = renderHook(() =>
        useAccommodationLogo({ fetchName: true })
      );

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(mockSelect).toHaveBeenCalledWith("header_logo_url,name");
      expect(result.current.logoUrl).toBe("https://example.com/logo.png");
      expect(result.current.accommodationName).toBe("測試住宿");
    });

    it("當 fetch 失敗時應該設定 isLoaded 為 true", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: new Error("Database error"),
      });

      const { result } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.logoUrl).toBe(null);
    });

    it("當資料為 null 時應該正確處理", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: null },
        error: null,
      });

      const { result } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });

      expect(result.current.logoUrl).toBe(null);
    });
  });

  describe("外部狀態覆蓋", () => {
    it("當提供外部狀態時不應該 fetch", () => {
      const { result } = renderHook(() =>
        useAccommodationLogo({
          externalLogoUrl: "https://external.com/logo.png",
          externalIsLoaded: true,
        })
      );

      expect(mockFrom).not.toHaveBeenCalled();
      expect(result.current.logoUrl).toBe("https://external.com/logo.png");
      expect(result.current.isLoaded).toBe(true);
    });

    it("當外部 logo 為 null 時應該正確處理", () => {
      const { result } = renderHook(() =>
        useAccommodationLogo({
          externalLogoUrl: null,
          externalIsLoaded: true,
        })
      );

      expect(result.current.logoUrl).toBe(null);
      expect(result.current.isLoaded).toBe(true);
    });

    it("當外部 isLoaded 為 false 時應該正確回傳", () => {
      const { result } = renderHook(() =>
        useAccommodationLogo({
          externalLogoUrl: "https://external.com/logo.png",
          externalIsLoaded: false,
        })
      );

      expect(result.current.isLoaded).toBe(false);
    });
  });

  describe("Realtime 訂閱", () => {
    it("應該建立正確的 channel 名稱（header）", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      renderHook(() => useAccommodationLogo({ variant: "header" }));

      await waitFor(() => {
        expect(mockChannel).toHaveBeenCalledWith(
          "accommodation-header-logo-test-accommodation-id"
        );
      });
    });

    it("應該建立正確的 channel 名稱（footer）", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      renderHook(() => useAccommodationLogo({ variant: "footer" }));

      await waitFor(() => {
        expect(mockChannel).toHaveBeenCalledWith(
          "accommodation-footer-logo-test-accommodation-id"
        );
      });
    });

    it("應該訂閱正確的 postgres_changes 事件", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(mockOn).toHaveBeenCalledWith(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "accommodation_info",
            filter: "id=eq.test-accommodation-id",
          },
          expect.any(Function)
        );
      });
    });

    it("應該在 unmount 時移除 channel", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const { unmount } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it("realtime 更新應該更新 logo URL", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: "https://old.com/logo.png" },
        error: null,
      });

      let realtimeCallback: ((payload: { new: Record<string, string | null> }) => void) | undefined;
      mockOn.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_event: any, _config: any, callback: any) => {
          realtimeCallback = callback;
          return { subscribe: mockSubscribe };
        }
      );

      const { result } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(result.current.logoUrl).toBe("https://old.com/logo.png");
      });

      // 模擬 realtime 更新
      act(() => {
        realtimeCallback({
          new: { header_logo_url: "https://new.com/logo.png" },
        });
      });

      expect(result.current.logoUrl).toBe("https://new.com/logo.png");
    });

    it("realtime 更新應該更新住宿名稱（fetchName: true）", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: "https://example.com/logo.png", name: "舊名稱" },
        error: null,
      });

      let realtimeCallback: ((payload: { new: Record<string, string | null> }) => void) | undefined;
      mockOn.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_event: any, _config: any, callback: any) => {
          realtimeCallback = callback;
          return { subscribe: mockSubscribe };
        }
      );

      const { result } = renderHook(() =>
        useAccommodationLogo({ fetchName: true })
      );

      await waitFor(() => {
        expect(result.current.accommodationName).toBe("舊名稱");
      });

      // 模擬 realtime 更新
      act(() => {
        realtimeCallback({
          new: { name: "新名稱" },
        });
      });

      expect(result.current.accommodationName).toBe("新名稱");
    });

    it("當使用外部狀態時不應該建立 channel", () => {
      renderHook(() =>
        useAccommodationLogo({
          externalLogoUrl: "https://external.com/logo.png",
          externalIsLoaded: true,
        })
      );

      expect(mockChannel).not.toHaveBeenCalled();
    });
  });

  describe("住宿切換", () => {
    it("當 accommodationId 改變時應該重新 fetch", async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: "https://first.com/logo.png" },
        error: null,
      });

      const { result, rerender } = renderHook(() => useAccommodationLogo());

      await waitFor(() => {
        expect(result.current.logoUrl).toBe("https://first.com/logo.png");
      });

      // 切換住宿
      mockCurrentAccommodationId.mockReturnValue("new-accommodation-id");
      mockMaybeSingle.mockResolvedValue({
        data: { header_logo_url: "https://second.com/logo.png" },
        error: null,
      });

      rerender();

      await waitFor(() => {
        expect(mockEq).toHaveBeenCalledWith("id", "new-accommodation-id");
      });
    });
  });
});
