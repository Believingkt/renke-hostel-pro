// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import RemarketingAnalytics from "../../../../apps/booking/src/pages/admin/RemarketingAnalytics";
import AddonRecAnalytics from "../../../../apps/booking/src/pages/admin/AddonRecAnalytics";


const render = (el: React.ReactElement) =>
  renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/hq"] }, el));

describe("兩頁預設為即時模式", () => {
  const rem = render(React.createElement(RemarketingAnalytics));
  const addon = render(React.createElement(AddonRecAnalytics));

  it("提供即時／共用 Demo 切換（無紀錄按鈕、無模式說明文字），預設不顯示資料集面板，且無簡報示範或模擬字樣", () => {
    for (const html of [rem, addon]) {
      expect(html).toContain("analytics-mode-toggle");
      expect(html).toContain("即時");
      expect(html).not.toContain("analytics-mode-demo");
      expect(html).toContain("analytics-mode-shared-demo");
      expect(html).not.toContain("demo-control-panel");
      expect(html).not.toContain("簡報示範");
      expect(html).not.toContain("即時：資料來自正式 RPC 即時彙總。");
    }
  });

  it("即時模式仍保留原有口徑說明與情境驗證入口", () => {
    expect(rem).toContain("remarketing-scenario-entry");
    expect(addon).toContain("addon-scenario-entry");
    expect(rem).toContain("不回填、不模擬");
    expect(addon).toContain("不回填、不模擬");
    expect(rem).toContain("含內部上線測試");
    expect(addon).toContain("含內部上線測試");
  });
});
