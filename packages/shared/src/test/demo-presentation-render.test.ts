// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import RemarketingAnalytics from "../../../../apps/booking/src/pages/admin/RemarketingAnalytics";
import AddonRecAnalytics from "../../../../apps/booking/src/pages/admin/AddonRecAnalytics";
import { DEMO_BANNER, DEMO_ROW_NATURE } from "@lakeze/shared/utils/demoPresentation";

const render = (el: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/hq"] }, el));

describe("兩頁預設為正式營運模式（示範標示不得預先出現）", () => {
  const rem = render(React.createElement(RemarketingAnalytics));
  const addon = render(React.createElement(AddonRecAnalytics));

  it("提供正式／示範切換，且預設不顯示任何示範橫幅或示範列標示", () => {
    for (const html of [rem, addon]) {
      expect(html).toContain("analytics-mode-toggle");
      expect(html).toContain("正式營運");
      expect(html).toContain("簡報示範");
      expect(html).not.toContain(DEMO_BANNER);
      expect(html).not.toContain(DEMO_ROW_NATURE);
      expect(html).not.toContain("demo-control-panel");
      expect(html).toContain("正式營運：資料來自正式 RPC 即時彙總。");
    }
  });

  it("正式模式仍保留原有口徑說明與情境驗證入口", () => {
    expect(rem).toContain("remarketing-scenario-entry");
    expect(addon).toContain("addon-scenario-entry");
    expect(rem).toContain("不回填、不模擬");
    expect(addon).toContain("不回填、不模擬");
    expect(rem).toContain("含內部上線測試");
    expect(addon).toContain("含內部上線測試");
  });
});
