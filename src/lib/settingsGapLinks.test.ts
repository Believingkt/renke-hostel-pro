import { describe, it, expect } from "vitest";
import {
  buildGapHref,
  GAP_TARGETS,
  parseOwnerSettlementFocus,
  type GapKey,
} from "./settingsGapLinks";

const ACC = "5f764d55-ae11-4631-80fe-2e611853deae";

describe("buildGapHref", () => {
  it("合作期間導向獎金發放規則 Tab，不帶 focus", () => {
    expect(buildGapHref("partnership", ACC)).toBe(`/hq/bonus-settings?tab=bonus&acc=${ACC}`);
  });

  it("月結費率導向業主月結 Tab 並 focus 服務費卡片", () => {
    expect(buildGapHref("settlementRule", ACC)).toBe(
      `/hq/bonus-settings?tab=owner-settlement&acc=${ACC}&focus=service-fee`,
    );
  });

  it("行銷費約定 focus 行銷費卡片", () => {
    expect(buildGapHref("marketingFee", ACC)).toBe(
      `/hq/bonus-settings?tab=owner-settlement&acc=${ACC}&focus=marketing-fee`,
    );
  });

  it("歷史費率殘留 focus 歷史版本區塊", () => {
    expect(buildGapHref("legacyRate", ACC)).toBe(
      `/hq/bonus-settings?tab=owner-settlement&acc=${ACC}&focus=history`,
    );
  });

  it("訂房設定沒有 HQ 對應頁，回傳 null", () => {
    expect(buildGapHref("bookingSetting", ACC)).toBeNull();
  });

  it("所有 HQ 連結都同時帶 tab 與 acc", () => {
    (Object.keys(GAP_TARGETS) as GapKey[]).forEach((key) => {
      const href = buildGapHref(key, ACC);
      if (!href) return;
      const qs = new URLSearchParams(href.split("?")[1]);
      expect(qs.get("acc")).toBe(ACC);
      expect(["bonus", "owner-settlement"]).toContain(qs.get("tab"));
      // 業主月結頁的缺漏一定要有 focus，才會捲到正確卡片
      if (qs.get("tab") === "owner-settlement") {
        expect(parseOwnerSettlementFocus(qs.get("focus"))).not.toBeNull();
      }
    });
  });
});

describe("parseOwnerSettlementFocus", () => {
  it("只接受已知值", () => {
    expect(parseOwnerSettlementFocus("marketing-fee")).toBe("marketing-fee");
    expect(parseOwnerSettlementFocus("unknown")).toBeNull();
    expect(parseOwnerSettlementFocus(null)).toBeNull();
  });
});
