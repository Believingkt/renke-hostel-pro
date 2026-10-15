import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildDemoRun, DEFAULT_DEMO_NAMES } from "@lakeze/shared/utils/demoPresentation";
import { toDescriptor } from "@lakeze/shared/utils/sharedDemo";

const VENUES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "雲岫海景渡假會館" },
  { id: "22222222-2222-4222-8222-222222222222", name: "良辰民宿" },
];
const RUN = buildDemoRun({ venues: VENUES, seed: 7 });
const dataset = (revision: number, names = DEFAULT_DEMO_NAMES) => ({
  revision, status: "active", dataNature: "synthetic_demo", demoVersion: RUN.demoVersion, scenarioVersion: RUN.scenarioVersion,
  fixtureVersion: RUN.fixtureVersion, runId: RUN.runId, generatedAt: RUN.generatedAt, run: toDescriptor(RUN), names, updatedAt: "2026-10-15T00:00:00Z",
});

const state = {
  calls: [] as Array<{ fn: string; args?: any }>,
  handlers: {} as Record<string, (args: any) => { data: any; error: any }>,
};

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args?: any) => {
      state.calls.push({ fn, args });
      const h = state.handlers[fn];
      return h ? h(args) : { data: [], error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: VENUES, error: null }) }) }) }),
  },
}));

import RemarketingAnalytics from "@/pages/admin/RemarketingAnalytics";
import AddonRecAnalytics from "@/pages/admin/AddonRecAnalytics";

const open = async (Page: React.ComponentType) => {
  render(<MemoryRouter><Page /></MemoryRouter>);
  fireEvent.click(screen.getByTestId("analytics-mode-shared-demo"));
};
const liveRpcCalls = () => state.calls.filter((c) => c.fn.startsWith("ai_metric_"));

beforeEach(() => { state.calls = []; state.handlers = {}; });

describe("共用資料集（紀錄）模式", () => {
  it("預設仍為即時；按鈕名稱為「紀錄」，切換後不再呼叫即時 RPC，只讀 hq_shared_demo_get", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(3), canWrite: false }, error: null });
    render(<MemoryRouter><RemarketingAnalytics /></MemoryRouter>);
    await waitFor(() => expect(liveRpcCalls().length).toBe(1));
    expect(screen.getByTestId("analytics-mode-shared-demo").textContent).toBe("紀錄");
    expect(screen.queryByTestId("analytics-mode-demo")).toBeNull();
    fireEvent.click(screen.getByTestId("analytics-mode-shared-demo"));
    await screen.findByTestId("breakdown-remarketing-analytics-shared");
    expect(liveRpcCalls().length).toBe(1);
    expect(state.calls.filter((c) => c.fn === "hq_shared_demo_get")).toHaveLength(1);
  });

  it("讀到資料集即顯示表格；無表格標題／資料來源、無資料集面板、無說明文字、無 Demo 標示", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(3), canWrite: true }, error: null });
    await open(RemarketingAnalytics);
    expect(await screen.findByTestId("breakdown-remarketing-analytics-shared")).toBeTruthy();
    expect(screen.queryByText("再行銷轉換明細")).toBeNull();
    expect(screen.queryByText(/資料來源：共用資料集/)).toBeNull();
    expect(screen.getByTestId("bd-export")).toBeTruthy();
    for (const id of ["shared-demo-panel", "shared-demo-banner", "shared-demo-meta", "shared-demo-publish-btn", "shared-demo-import-local-btn", "shared-demo-save-names"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText(/共用 Demo 資料集/)).toBeNull();
    expect(screen.queryByText(/即時：資料來自正式 RPC/)).toBeNull();
    expect(screen.queryByText(/Demo 測試資料，非實際營運成果/)).toBeNull();
    expect(screen.queryByText("資料性質")).toBeNull();
  });

  it("CSV 匯出：檔名與內容不帶 Demo 標示", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(2), canWrite: false }, error: null });
    const blobs: Blob[] = [];
    const names: string[] = [];
    (URL as any).createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x"; };
    (URL as any).revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    await open(AddonRecAnalytics);
    await screen.findByTestId("breakdown-addon-rec-analytics-shared");
    fireEvent.click(await screen.findByTestId("bd-export"));
    const text = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(blobs[0]); });
    expect(names[0]).toMatch(/^addon-rec-analytics-shared_/);
    expect(text).not.toContain("Demo 測試資料");
    expect(text).not.toContain("資料性質");
    expect(text).toContain("加購推薦明細");
    click.mockRestore();
  });

  for (const [label, handler] of [
    ["讀取失敗", () => ({ data: null, error: { code: "42501", message: "forbidden" } })],
    ["尚未發布", () => ({ data: { dataset: null, canWrite: true }, error: null })],
    ["版本不相容", () => ({ data: { dataset: { ...dataset(4), run: { ...toDescriptor(RUN), demoVersion: "demo-pres-v0.1.0" } }, canWrite: true }, error: null })],
  ] as const) {
    it(`${label}：不顯示表格與任何提示，也不自動寫入`, async () => {
      state.handlers.hq_shared_demo_get = handler as any;
      await open(RemarketingAnalytics);
      await waitFor(() => expect(state.calls.some((c) => c.fn === "hq_shared_demo_get")).toBe(true));
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByTestId("breakdown-remarketing-analytics-shared")).toBeNull();
      for (const id of ["shared-demo-load-error", "shared-demo-empty", "shared-demo-incompatible", "shared-demo-loading", "shared-demo-panel"]) {
        expect(screen.queryByTestId(id)).toBeNull();
      }
      expect(state.calls.some((c) => c.fn === "hq_shared_demo_put")).toBe(false);
    });
  }
});
