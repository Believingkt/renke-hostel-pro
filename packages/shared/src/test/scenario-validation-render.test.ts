// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import ScenarioValidation from "../../../../apps/booking/src/pages/admin/ScenarioValidation";
import { DATA_NATURE, ISOLATION_LABEL, SCENARIO_VERSION } from "@lakeze/shared/utils/scenarioSim";

/** 無法以 HQ 帳號截圖（本環境沒有總部測試帳號），改以伺服器端渲染驗證畫面標示 */
describe("情境驗證頁渲染（隔離標示與未預填結果）", () => {
  const html = renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: ["/hq/scenario-validation"] },
      React.createElement(ScenarioValidation)),
  );

  it("頁首固定顯示資料性質與隔離模擬器標示", () => {
    expect(html).toContain(DATA_NATURE);
    expect(html).toContain(ISOLATION_LABEL);
    expect(html).toContain(SCENARIO_VERSION);
    expect(html).toContain("非伺服器稽核紀錄");
  });

  it("未執行前不顯示任何結果或 KPI 達標", () => {
    expect(html).toContain("尚未執行情境測試");
    // 只允許否定式聲明，不得出現任何「已達標／達標成功」的正向宣稱
    expect(html).not.toMatch(/已達標|達標成功|已達成/);
    expect(html).toContain("不代表 N1／N2 真實成果達標");
    expect(html).not.toContain("測試通過率（邏輯驗證）");
  });

  it("提供執行按鈕、匯出按鈕與限制說明，且保留正式報表入口", () => {
    expect(html).toContain("執行情境測試");
    expect(html).toContain("匯出 CSV（情境測試資料）");
    expect(html).toContain("未驗證正式 SQL／RPC");
    expect(html).toContain("/hq/remarketing-analytics");
    expect(html).toContain("/hq/addon-analytics");
  });
});
