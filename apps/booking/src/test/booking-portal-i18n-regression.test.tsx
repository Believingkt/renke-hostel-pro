/**
 * 第五批（BookingPortal 首頁）迴歸測試
 * 目的：證明語系切換只影響「顯示文字」，送出的搜尋值／人數狀態一律維持原始值。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PortalSearchBar from "@/components/booking-portal/PortalSearchBar";
import { BookingLocaleProvider } from "@lakeze/shared/contexts/BookingLocaleContext";
import { BOOKING_LANG_STORAGE_KEY } from "@lakeze/shared/lib/bookingI18n";

const baseProps = () => ({
  searchQuery: "",
  onSearchQueryChange: vi.fn(),
  checkIn: undefined,
  checkOut: undefined,
  onCheckInChange: vi.fn(),
  onCheckOutChange: vi.fn(),
  adults: 2,
  onAdultsChange: vi.fn(),
  children: 0,
  onChildrenChange: vi.fn(),
  rooms: 1,
  onRoomsChange: vi.fn(),
  onSearch: vi.fn(),
});

const renderBar = (lang: "zh" | "en", props: ReturnType<typeof baseProps>) => {
  window.localStorage.setItem(BOOKING_LANG_STORAGE_KEY, lang);
  return render(
    <BookingLocaleProvider>
      <PortalSearchBar {...props} />
    </BookingLocaleProvider>,
  );
};

describe("BookingPortal 第五批 i18n 迴歸", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("繁中模式顯示中文標籤", () => {
    renderBar("zh", baseProps());
    expect(screen.getAllByText("搜尋").length).toBeGreaterThan(0);
    expect(screen.getAllByText("宜蘭").length).toBeGreaterThan(0);
  });

  it("英文模式顯示英文標籤，且不殘留對應中文", () => {
    renderBar("en", baseProps());
    expect(screen.getAllByText("Search").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yilan").length).toBeGreaterThan(0);
    expect(screen.queryByText("搜尋")).toBeNull();
    expect(screen.queryByText("宜蘭")).toBeNull();
  });

  it("英文模式下點擊地區快捷鍵，送出的搜尋字串仍是原始中文地名", () => {
    const props = baseProps();
    renderBar("en", props);
    fireEvent.click(screen.getAllByText("Yilan")[0]);
    expect(props.onSearchQueryChange).toHaveBeenCalledWith("宜蘭");
  });

  it("英文模式下送出搜尋，不改變任何搜尋狀態值", () => {
    const props = baseProps();
    renderBar("en", props);
    fireEvent.click(screen.getAllByText("Search")[0]);
    expect(props.onSearch).toHaveBeenCalledTimes(1);
    expect(props.onCheckInChange).not.toHaveBeenCalled();
    expect(props.onCheckOutChange).not.toHaveBeenCalled();
    expect(props.onAdultsChange).not.toHaveBeenCalled();
    expect(props.onChildrenChange).not.toHaveBeenCalled();
  });
});
