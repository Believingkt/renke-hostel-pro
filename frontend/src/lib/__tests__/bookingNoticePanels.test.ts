import { describe, it, expect } from "vitest";
import { applyVisibleKeys, buildBookingNoticePanels } from "@/lib/bookingNoticePanels";

const settings = {
  check_in_time: "15:00",
  check_out_time: "11:00",
  payment_methods: ["刷卡", "匯款"],
  cancellation_policy: "<p>取消政策</p>",
};

const customSections = [
  { id: "a", section_title: "自訂 A", section_subtitle: null, section_content: "<p>A</p>", display_order: 2, is_enabled: true },
  { id: "b", section_title: "自訂 B", section_subtitle: null, section_content: "<p>B</p>", display_order: 1, is_enabled: false },
];

describe("bookingNoticePanels", () => {
  it("組出入住/付款/取消/重要事項面板", () => {
    const panels = buildBookingNoticePanels(settings, "<p>重要</p>", customSections);
    expect(panels.map((p) => p.key)).toEqual(["checkIn", "payment", "cancellation", "important", "custom-a"]);
    expect(panels[0].textRows).toHaveLength(2);
  });

  it("visibleKeys 決定顯示與排序，無效 key 略過", () => {
    const panels = buildBookingNoticePanels(settings, "", []);
    expect(applyVisibleKeys(panels, ["cancellation", "checkIn", "nope"]).map((p) => p.key)).toEqual([
      "cancellation",
      "checkIn",
    ]);
  });

  it("visibleKeys 為 null 時全部顯示", () => {
    const panels = buildBookingNoticePanels(settings, "", []);
    expect(applyVisibleKeys(panels, null)).toHaveLength(panels.length);
  });

  it("完全無資料時回傳空陣列（前台據此隱藏區塊）", () => {
    expect(buildBookingNoticePanels(null, "", [])).toEqual([]);
  });
});
