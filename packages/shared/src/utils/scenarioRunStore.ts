/**
 * N1／N2 情境驗證的隔離儲存：僅存於「此瀏覽器」的 localStorage，不是伺服器稽核紀錄。
 * - 版本化 key，版本不符直接忽略舊資料。
 * - 內容損壞或 localStorage 不可用時，降級為記憶體模式，不丟出例外。
 * - 只保留最近 MAX_RUNS 筆，避免無限成長。
 */
import type { RunResult } from "./scenarioSim";

export const STORE_KEY = "lakeze.scenario_validation.runs.v1";
export const STORE_VERSION = 1;
export const MAX_RUNS = 10;

export interface StoreState {
  version: number;
  runs: RunResult[];
}

export type StoreMode = "localStorage" | "memory";

export interface LoadResult {
  runs: RunResult[];
  mode: StoreMode;
  /** 舊資料損壞或版本不符而被捨棄 */
  recovered: boolean;
}

let memoryRuns: RunResult[] = [];

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${STORE_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function isRunLike(value: unknown): value is RunResult {
  const r = value as RunResult;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.runId === "string" &&
    typeof r.executedAt === "string" &&
    Array.isArray(r.cases) &&
    Array.isArray(r.events) &&
    !!r.summary
  );
}

export function loadRuns(): LoadResult {
  const s = storage();
  if (!s) return { runs: memoryRuns.slice(), mode: "memory", recovered: false };
  const raw = s.getItem(STORE_KEY);
  if (!raw) return { runs: [], mode: "localStorage", recovered: false };
  try {
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.runs)) {
      s.removeItem(STORE_KEY);
      return { runs: [], mode: "localStorage", recovered: true };
    }
    const runs = parsed.runs.filter(isRunLike).slice(0, MAX_RUNS);
    return { runs, mode: "localStorage", recovered: runs.length !== parsed.runs.length };
  } catch {
    try {
      s.removeItem(STORE_KEY);
    } catch {
      /* 忽略 */
    }
    return { runs: [], mode: "localStorage", recovered: true };
  }
}

/** 新 run 置頂；每次 run 各自獨立保存，不與既有 run 合併或累加 */
export function saveRun(run: RunResult): LoadResult {
  const current = loadRuns();
  const runs = [run, ...current.runs.filter((r) => r.runId !== run.runId)].slice(0, MAX_RUNS);
  const s = storage();
  if (!s) {
    memoryRuns = runs;
    return { runs, mode: "memory", recovered: current.recovered };
  }
  try {
    s.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, runs } satisfies StoreState));
    return { runs, mode: "localStorage", recovered: current.recovered };
  } catch {
    memoryRuns = runs;
    return { runs, mode: "memory", recovered: current.recovered };
  }
}

export function clearRuns(): void {
  memoryRuns = [];
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORE_KEY);
  } catch {
    /* 忽略 */
  }
}
