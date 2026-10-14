/**
 * 總部「共用 Demo」：服務端只存合成 run 的描述（runId、生成時間、版本、館別），
 * 各電腦以同一描述在前端決定性重建同一批 fixture 事件。不讀寫任何正式營運資料。
 */
import {
  buildDemoRun, DEFAULT_DEMO_NAMES, DEMO_PRESENTATION_VERSION,
  type DemoNameConfig, type DemoRun,
} from "./demoPresentation";
import { DEMO_FIXTURE_VERSION } from "./demoFixture";
import { SCENARIO_VERSION, type ScenarioVenue } from "./scenarioSim";

export const SHARED_DEMO_LABEL = "Demo 測試資料，非實際營運成果";
export const SHARED_DEMO_DATA_NATURE = "synthetic_demo";

export interface SharedDemoRunDescriptor {
  runId: string;
  generatedAt: string;
  demoVersion: string;
  scenarioVersion: string;
  fixtureVersion: string;
  dataNature: typeof SHARED_DEMO_DATA_NATURE;
  venues: ScenarioVenue[];
}

export interface SharedDemoDataset {
  revision: number;
  status: string;
  dataNature: string;
  demoVersion: string;
  scenarioVersion: string;
  fixtureVersion: string;
  runId: string;
  generatedAt: string;
  run: SharedDemoRunDescriptor;
  names: DemoNameConfig;
  updatedAt: string;
}

export type SharedDemoError =
  | { kind: "conflict"; message: string; currentRevision: number }
  | { kind: "forbidden" | "invalid" | "error"; message: string };

export type SharedDemoResult =
  | { ok: true; dataset: SharedDemoDataset | null; canWrite: boolean }
  | { ok: false; error: SharedDemoError };

const RUN_ID_RE = /^DEMORUN-\d{8}-\d{6}-(\d{1,4})$/;

export function toDescriptor(run: DemoRun): SharedDemoRunDescriptor {
  return {
    runId: run.runId,
    generatedAt: run.generatedAt,
    demoVersion: run.demoVersion,
    scenarioVersion: run.scenarioVersion,
    fixtureVersion: run.fixtureVersion ?? "",
    dataNature: SHARED_DEMO_DATA_NATURE,
    venues: run.venues.map((v) => ({ id: v.id, name: v.name })),
  };
}

/** 版本必須與目前前端 fixture 完全一致，否則不顯示（不自動重建、不改口徑） */
export function compatibilityIssue(d: Pick<SharedDemoRunDescriptor, "demoVersion" | "scenarioVersion" | "fixtureVersion">): string | null {
  if (d.demoVersion !== DEMO_PRESENTATION_VERSION) return `資料集版本 ${d.demoVersion} 與目前 ${DEMO_PRESENTATION_VERSION} 不相容`;
  if (d.fixtureVersion !== DEMO_FIXTURE_VERSION) return `fixture 版本 ${d.fixtureVersion} 與目前 ${DEMO_FIXTURE_VERSION} 不相容`;
  if (d.scenarioVersion !== SCENARIO_VERSION) return `引擎版本 ${d.scenarioVersion} 與目前 ${SCENARIO_VERSION} 不相容`;
  return null;
}

/** 由描述決定性重建 run；runId／生成時間不一致即視為無效 */
export function rebuildRun(d: SharedDemoRunDescriptor): DemoRun | null {
  const m = RUN_ID_RE.exec(d.runId);
  const now = new Date(d.generatedAt);
  if (!m || Number.isNaN(now.getTime()) || compatibilityIssue(d)) return null;
  const run = buildDemoRun({ venues: d.venues.map((v) => ({ id: v.id, name: v.name })), now, seed: Number(m[1]) });
  return run.runId === d.runId && run.generatedAt === d.generatedAt ? run : null;
}

/** 本機紀錄只能在「可由描述完全重建出相同事件」時才可匯入（證明為合成 fixture，非真實資料） */
export function verifyLocalRun(run: DemoRun): { ok: true; descriptor: SharedDemoRunDescriptor } | { ok: false; reason: string } {
  const descriptor = toDescriptor(run);
  const issue = compatibilityIssue(descriptor);
  if (issue) return { ok: false, reason: issue };
  const rebuilt = rebuildRun(descriptor);
  if (!rebuilt) return { ok: false, reason: "run ID 或生成時間格式不符" };
  if (JSON.stringify(rebuilt.engine.events) !== JSON.stringify(run.engine.events)) {
    return { ok: false, reason: "事件內容與 fixture 重建結果不一致，拒絕匯入" };
  }
  return { ok: true, descriptor };
}

export function cleanNames(n: DemoNameConfig): DemoNameConfig {
  const list = (a: string[], fb: string[]) => {
    const out = a.map((s) => s.trim()).filter(Boolean).slice(0, 10);
    return out.length ? out : [...fb];
  };
  return {
    n1CampaignName: n.n1CampaignName.trim() || DEFAULT_DEMO_NAMES.n1CampaignName,
    n1Segments: list(n.n1Segments, DEFAULT_DEMO_NAMES.n1Segments),
    n2CampaignName: n.n2CampaignName.trim() || DEFAULT_DEMO_NAMES.n2CampaignName,
    n2ItemNames: list(n.n2ItemNames, DEFAULT_DEMO_NAMES.n2ItemNames),
  };
}

export function mapRpcError(error: { code?: string; message?: string; details?: string }): SharedDemoError {
  const message = error.message ?? "未知錯誤";
  if (error.code === "PT409" || message === "revision_conflict") {
    const m = /current_revision=(\d+)/.exec(error.details ?? "");
    return { kind: "conflict", message: "共用 Demo 已被其他電腦更新", currentRevision: m ? Number(m[1]) : -1 };
  }
  if (error.code === "42501") return { kind: "forbidden", message: "沒有權限存取共用 Demo" };
  if (error.code === "22023") return { kind: "invalid", message: `伺服器拒絕資料：${message}` };
  return { kind: "error", message: `${error.code ? `[${error.code}] ` : ""}${message}` };
}

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }> };

function toResult(res: { data: unknown; error: any }): SharedDemoResult {
  if (res.error) return { ok: false, error: mapRpcError(res.error) };
  const d = res.data as { dataset: SharedDemoDataset | null; canWrite: boolean } | null;
  if (!d || typeof d !== "object" || !("dataset" in d)) return { ok: false, error: { kind: "error", message: "伺服器回應格式不符" } };
  return { ok: true, dataset: d.dataset, canWrite: !!d.canWrite };
}

export async function fetchSharedDemo(client: RpcClient): Promise<SharedDemoResult> {
  try {
    return toResult(await client.rpc("hq_shared_demo_get"));
  } catch (e) {
    return { ok: false, error: { kind: "error", message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function publishSharedDemo(
  client: RpcClient, expectedRevision: number, run: SharedDemoRunDescriptor, names: DemoNameConfig,
): Promise<SharedDemoResult> {
  try {
    return toResult(await client.rpc("hq_shared_demo_put", {
      p_expected_revision: expectedRevision, p_run: run, p_names: cleanNames(names),
    }));
  } catch (e) {
    return { ok: false, error: { kind: "error", message: e instanceof Error ? e.message : String(e) } };
  }
}
