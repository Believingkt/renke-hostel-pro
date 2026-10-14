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

describe("共用 Demo 模式", () => {
  it("預設仍為即時；切到共用 Demo 後不再呼叫即時 RPC，只讀 hq_shared_demo_get", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(3), canWrite: false }, error: null });
    render(<MemoryRouter><RemarketingAnalytics /></MemoryRouter>);
    await waitFor(() => expect(liveRpcCalls().length).toBe(1));
    expect(screen.queryByTestId("shared-demo-banner")).toBeNull();
    fireEvent.click(screen.getByTestId("analytics-mode-shared-demo"));
    await screen.findByTestId("shared-demo-meta");
    expect(liveRpcCalls().length).toBe(1);
    expect(state.calls.filter((c) => c.fn === "hq_shared_demo_get")).toHaveLength(1);
  });

  it("admin（唯讀）：固定標示、表格含資料性質欄與 Demo 標題，無發布／匯入按鈕；新電腦直接讀到同一 run", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(3), canWrite: false }, error: null });
    await open(RemarketingAnalytics);
    expect(screen.getByTestId("shared-demo-banner").textContent).toContain("Demo 測試資料，非實際營運成果");
    expect((await screen.findByTestId("shared-demo-run-id")).textContent).toBe(RUN.runId);
    expect(screen.getByTestId("shared-demo-revision").textContent).toBe("3");
    expect(screen.getByText(/再行銷轉換明細（共用 Demo｜Demo 測試資料，非實際營運成果）/)).toBeTruthy();
    expect(screen.getByText("資料性質")).toBeTruthy();
    expect(screen.queryByTestId("shared-demo-publish-btn")).toBeNull();
    expect(screen.queryByTestId("shared-demo-import-local-btn")).toBeNull();
    expect(screen.queryByTestId("shared-demo-save-names")).toBeNull();
  });

  it("CSV 匯出檔名與檔內標題、每列都可辨識為 Demo", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(2), canWrite: false }, error: null });
    const blobs: Blob[] = [];
    const names: string[] = [];
    (URL as any).createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x"; };
    (URL as any).revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    await open(AddonRecAnalytics);
    await screen.findByTestId("shared-demo-meta");
    fireEvent.click(await screen.findByTestId("bd-export"));
    const text = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(blobs[0]); });
    expect(names[0]).toMatch(/^DEMO-shared-addon-rec-analytics_/);
    const lines = text.replace(/^\ufeff/, "").split("\n");
    expect(lines[0]).toContain("共用 Demo｜Demo 測試資料，非實際營運成果");
    expect(lines[1]).toContain("資料性質");
    expect(lines.slice(2, -1).every((l) => l.startsWith('"Demo 測試資料，非實際營運成果"'))).toBe(true);
    click.mockRestore();
  });

  it("讀取失敗：顯示讀取失敗與重試，不顯示空表、不自動以本機資料補上", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: null, error: { code: "42501", message: "forbidden" } });
    await open(RemarketingAnalytics);
    expect((await screen.findByTestId("shared-demo-load-error")).textContent).toContain("讀取失敗");
    expect(screen.queryByTestId("breakdown-DEMO-shared-remarketing-analytics")).toBeNull();
    expect(state.calls.some((c) => c.fn === "hq_shared_demo_put")).toBe(false);
    expect(screen.getByTestId("shared-demo-banner")).toBeTruthy();
  });

  it("版本不相容：不顯示數據、不自動重建", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: { ...dataset(4), run: { ...toDescriptor(RUN), demoVersion: "demo-pres-v0.1.0" } }, canWrite: true }, error: null });
    await open(RemarketingAnalytics);
    await screen.findByTestId("shared-demo-incompatible");
    expect(screen.queryByTestId("breakdown-DEMO-shared-remarketing-analytics")).toBeNull();
    expect(state.calls.some((c) => c.fn === "hq_shared_demo_put")).toBe(false);
  });

  it("super_admin：revision 衝突時不覆蓋，提供「載入最新」與「以我的變更覆蓋」並可恢復", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: dataset(5), canWrite: true }, error: null });
    let putCount = 0;
    state.handlers.hq_shared_demo_put = (args) => {
      putCount += 1;
      if (args.p_expected_revision !== 6) return { data: null, error: { code: "PT409", message: "revision_conflict", details: "current_revision=6" } };
      return { data: { dataset: dataset(7, args.p_names), canWrite: true }, error: null };
    };
    await open(RemarketingAnalytics);
    await screen.findByTestId("shared-demo-meta");
    fireEvent.change(screen.getByTestId("shared-demo-campaign-name"), { target: { value: "冬季回訪邀約" } });
    fireEvent.click(screen.getByTestId("shared-demo-save-names"));
    expect((await screen.findByTestId("shared-demo-conflict")).textContent).toContain("revision 6");
    expect(screen.getByTestId("shared-demo-revision").textContent).toBe("5");
    fireEvent.click(screen.getByTestId("shared-demo-conflict-overwrite"));
    await waitFor(() => expect(screen.getByTestId("shared-demo-revision").textContent).toBe("7"));
    expect(screen.queryByTestId("shared-demo-conflict")).toBeNull();
    const puts = state.calls.filter((c) => c.fn === "hq_shared_demo_put");
    expect(puts.map((p) => p.args.p_expected_revision)).toEqual([5, 6]);
    expect(puts[1].args.p_names.n1CampaignName).toBe("冬季回訪邀約");
    expect(putCount).toBe(2);
  });

  it("super_admin 匯入本機紀錄：無本機資料時明確提示，不自動上傳", async () => {
    localStorage.clear();
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: null, canWrite: true }, error: null });
    await open(AddonRecAnalytics);
    await screen.findByTestId("shared-demo-empty");
    fireEvent.click(screen.getByTestId("shared-demo-import-local-btn"));
    expect((await screen.findByTestId("shared-demo-action-error")).textContent).toContain("沒有可匯入的本機紀錄");
    expect(state.calls.some((c) => c.fn === "hq_shared_demo_put")).toBe(false);
  });

  it("super_admin 建立並發布：以 expected revision 0 上傳描述（只含允許欄位）", async () => {
    state.handlers.hq_shared_demo_get = () => ({ data: { dataset: null, canWrite: true }, error: null });
    state.handlers.hq_shared_demo_put = (args) => ({ data: { dataset: { ...dataset(1), run: args.p_run, runId: args.p_run.runId, generatedAt: args.p_run.generatedAt }, canWrite: true }, error: null });
    await open(AddonRecAnalytics);
    await screen.findByTestId("shared-demo-empty");
    fireEvent.click(screen.getByTestId("shared-demo-publish-btn"));
    await waitFor(() => expect(screen.getByTestId("shared-demo-revision").textContent).toBe("1"));
    const put = state.calls.find((c) => c.fn === "hq_shared_demo_put")!;
    expect(put.args.p_expected_revision).toBe(0);
    expect(Object.keys(put.args.p_run).sort()).toEqual(["dataNature", "demoVersion", "fixtureVersion", "generatedAt", "runId", "scenarioVersion", "venues"]);
    expect(put.args.p_run.venues).toEqual(VENUES);
  });
});
