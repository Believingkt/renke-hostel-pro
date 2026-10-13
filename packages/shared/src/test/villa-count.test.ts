import { describe, it, expect } from "vitest";
import { computeVillaCount } from "@lakeze/shared/utils/villaCount";

describe("HQ 包棟數（民宿數量卡）", () => {
  it("天送幸福和苑：daily_villa_capacity 11 → 11", () => {
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: 11, hasExclusiveRoomType: true }]),
    ).toBe(11);
  });

  it("森山寫照：daily_villa_capacity 為 null 但有包棟房型 → 1", () => {
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: true }]),
    ).toBe(1);
  });

  it("沒有包棟房型的館（如溫泉飯店）→ 0", () => {
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: false }]),
    ).toBe(0);
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: 0, hasExclusiveRoomType: false }]),
    ).toBe(0);
  });

  it("daily_villa_capacity 為 0 但有包棟房型 → 1", () => {
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: 0, hasExclusiveRoomType: true }]),
    ).toBe(1);
  });

  it("停用的館不計入", () => {
    expect(
      computeVillaCount([
        { is_active: false, daily_villa_capacity: 11, hasExclusiveRoomType: true },
        { is_active: true, daily_villa_capacity: 6, hasExclusiveRoomType: true },
      ]),
    ).toBe(6);
  });

  it("不以房型數量加總（哈庫納 6 個包棟方案仍只算 1 棟，設定 daily_villa_capacity=1）", () => {
    expect(
      computeVillaCount([{ is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true }]),
    ).toBe(1);
  });

  it("驗收：全部民宿（目前正式設定）合計 28", () => {
    const all = [
      { name: "天送幸福和苑", is_active: true, daily_villa_capacity: 11, hasExclusiveRoomType: true },
      { name: "雲岫海景渡假會館", is_active: true, daily_villa_capacity: 6, hasExclusiveRoomType: true },
      { name: "哈庫納馬塔塔", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "四季山宿", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "良辰暖居", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "旅行日-DAIDODO", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "旅行日-The Nomad Inn Osaka", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "旅行日-光", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "旅行日-艾屋吉屋", is_active: true, daily_villa_capacity: 1, hasExclusiveRoomType: true },
      { name: "森山寫照", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: true },
      { name: "櫻家小築", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: true },
      { name: "奧莉薇雅生活小酒店", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: true },
      { name: "淞湘卉館", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: true },
      { name: "沐恩國際溫泉度假飯店", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: false },
      { name: "沐恩遠東溫泉度假飯店", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: false },
      { name: "艾玹爾溫泉會館", is_active: true, daily_villa_capacity: null, hasExclusiveRoomType: false },
    ];
    expect(computeVillaCount(all)).toBe(28);
  });

  it("單一館篩選時只算該館", () => {
    const all = [
      { is_active: true, daily_villa_capacity: 11, hasExclusiveRoomType: true },
      { is_active: true, daily_villa_capacity: 6, hasExclusiveRoomType: true },
    ];
    expect(computeVillaCount([all[1]])).toBe(6);
  });

  it("空陣列／null → 0", () => {
    expect(computeVillaCount([])).toBe(0);
    expect(computeVillaCount(null)).toBe(0);
  });
});
