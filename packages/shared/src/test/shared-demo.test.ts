import { describe, it, expect } from "vitest";
import { buildDemoRun, DEFAULT_DEMO_NAMES, DEMO_PRESENTATION_VERSION } from "../utils/demoPresentation";
import { DEMO_FIXTURE_VERSION } from "../utils/demoFixture";
import {
  cleanNames, compatibilityIssue, fetchSharedDemo, mapRpcError, publishSharedDemo, rebuildRun, toDescriptor, verifyLocalRun,
} from "../utils/sharedDemo";

const venues = [
  { id: "11111111-1111-4111-8111-111111111111", name: "雲岫海景渡假會館" },
  { id: "22222222-2222-4222-8222-222222222222", name: "良辰民宿" },
];

describe("共用 Demo 描述與決定性重建", () => {
  const run = buildDemoRun({ venues, now: new Date("2026-10-15T01:23:45.678Z"), seed: 42 });

  it("描述只含允許欄位，且帶合成資料標記", () => {
    const d = toDescriptor(run);
    expect(Object.keys(d).sort()).toEqual(["dataNature", "demoVersion", "fixtureVersion", "generatedAt", "runId", "scenarioVersion", "venues"]);
    expect(d.dataNature).toBe("synthetic_demo");
    expect(d.runId).toMatch(/^DEMORUN-\d{8}-\d{6}-42$/);
    expect(JSON.stringify(d).length).toBeLessThan(4096);
  });

  it("另一台電腦由同一描述重建出完全相同的 run（同 runId、同事件）", () => {
    const rebuilt = rebuildRun(JSON.parse(JSON.stringify(toDescriptor(run))));
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.runId).toBe(run.runId);
    expect(rebuilt!.generatedAt).toBe(run.generatedAt);
    expect(JSON.stringify(rebuilt!.engine.events)).toBe(JSON.stringify(run.engine.events));
    expect(rebuilt!.venueDates).toEqual(run.venueDates);
  });

  it("版本不符：不重建、回報不相容（不自動改用新版）", () => {
    const d = { ...toDescriptor(run), demoVersion: "demo-pres-v0.9.0" };
    expect(compatibilityIssue(d)).toContain("不相容");
    expect(rebuildRun(d)).toBeNull();
    expect(compatibilityIssue({ ...toDescriptor(run), fixtureVersion: "demo-fixture-v0.0.1" })).toContain("fixture");
    expect(compatibilityIssue(toDescriptor(run))).toBeNull();
    expect(run.demoVersion).toBe(DEMO_PRESENTATION_VERSION);
    expect(run.fixtureVersion).toBe(DEMO_FIXTURE_VERSION);
  });

  it("runId 被竄改則重建失敗", () => {
    expect(rebuildRun({ ...toDescriptor(run), runId: "DEMORUN-20260101-000000-42" })).toBeNull();
    expect(rebuildRun({ ...toDescriptor(run), runId: "real-order-123" })).toBeNull();
  });

  it("匯入本機紀錄：只有可完全重建的合成 run 可匯入；事件被改（夾帶資料）即拒絕", () => {
    expect(verifyLocalRun(run).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(run));
    tampered.engine.events[0].travelerId = "guest@example.com";
    const r = verifyLocalRun(tampered);
    expect(r.ok).toBe(false);
    expect("reason" in r && r.reason).toContain("不一致");
    const old = { ...run, demoVersion: "demo-pres-v1.0.0" };
    expect(verifyLocalRun(old).ok).toBe(false);
  });

  it("名稱清理：去空白、空清單回預設、最多 10 項", () => {
    const n = cleanNames({ n1CampaignName: "  ", n1Segments: [" a ", ""], n2CampaignName: "X", n2ItemNames: [] });
    expect(n.n1CampaignName).toBe(DEFAULT_DEMO_NAMES.n1CampaignName);
    expect(n.n1Segments).toEqual(["a"]);
    expect(n.n2ItemNames).toEqual(DEFAULT_DEMO_NAMES.n2ItemNames);
    expect(cleanNames({ ...DEFAULT_DEMO_NAMES, n1Segments: Array.from({ length: 12 }, (_, i) => `s${i}`) }).n1Segments).toHaveLength(10);
  });
});

describe("RPC 結果對應", () => {
  it("PT409 → 衝突並帶目前 revision；42501 → 無權限；22023 → 驗證拒絕", () => {
    expect(mapRpcError({ code: "PT409", message: "revision_conflict", details: "current_revision=7" }))
      .toEqual({ kind: "conflict", message: "共用 Demo 已被其他電腦更新", currentRevision: 7 });
    expect(mapRpcError({ code: "42501", message: "forbidden" }).kind).toBe("forbidden");
    expect(mapRpcError({ code: "22023", message: "invalid_payload: x" }).kind).toBe("invalid");
    expect(mapRpcError({ message: "network" })).toEqual({ kind: "error", message: "network" });
  });

  it("fetch／publish 只呼叫兩支共用 Demo RPC，參數為描述與清理後名稱", async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client = { rpc: async (fn: string, args?: Record<string, unknown>) => { calls.push({ fn, args }); return { data: { dataset: null, canWrite: true }, error: null }; } };
    const run = buildDemoRun({ venues, seed: 1 });
    expect(await fetchSharedDemo(client)).toEqual({ ok: true, dataset: null, canWrite: true });
    await publishSharedDemo(client, 3, toDescriptor(run), DEFAULT_DEMO_NAMES);
    expect(calls.map((c) => c.fn)).toEqual(["hq_shared_demo_get", "hq_shared_demo_put"]);
    expect(calls[1].args).toEqual({ p_expected_revision: 3, p_run: toDescriptor(run), p_names: DEFAULT_DEMO_NAMES });
  });

  it("讀取錯誤或例外 → ok:false（不回傳空資料集）", async () => {
    const bad = { rpc: async () => ({ data: null, error: { code: "42501", message: "forbidden" } }) };
    expect((await fetchSharedDemo(bad)).ok).toBe(false);
    const thrower = { rpc: () => { throw new Error("offline"); } };
    expect(await fetchSharedDemo(thrower as any)).toEqual({ ok: false, error: { kind: "error", message: "offline" } });
    const weird = { rpc: async () => ({ data: null, error: null }) };
    expect((await fetchSharedDemo(weird)).ok).toBe(false);
  });
});
