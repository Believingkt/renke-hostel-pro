/**
 * 簡報示範資料的隔離儲存：只存在「此瀏覽器」的 localStorage，與正式資料完全無關。
 * - 版本化 key（含示範版本）；版本不符或內容損壞一律捨棄，要求重新建立示範資料。
 * - 不同 origin（預覽／正式網域）各自獨立，部署後需在該網域重新建立一次。
 * - localStorage 不可用時降級為記憶體模式，不丟出例外。
 */
import { DEFAULT_DEMO_NAMES, DEMO_PRESENTATION_VERSION, type DemoNameConfig, type DemoRun } from "./demoPresentation";

export const DEMO_STORE_KEY = "lakeze.hq_presentation_demo.v1";
export const DEMO_STORE_VERSION = 1;

export type DemoStoreMode = "localStorage" | "memory";

export interface DemoStoreState {
  version: number;
  demoVersion: string;
  run: DemoRun | null;
  names: DemoNameConfig;
}

export interface DemoLoadResult {
  run: DemoRun | null;
  names: DemoNameConfig;
  mode: DemoStoreMode;
  /** 舊資料損壞或版本不符而被捨棄 */
  recovered: boolean;
}

let memoryState: DemoStoreState | null = null;

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${DEMO_STORE_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function isRunLike(value: unknown): value is DemoRun {
  const r = value as DemoRun;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.runId === "string" &&
    typeof r.generatedAt === "string" &&
    !!r.engine &&
    Array.isArray(r.engine.events) &&
    Array.isArray(r.venues)
  );
}

function normalizeNames(value: unknown): DemoNameConfig {
  const n = value as DemoNameConfig;
  if (!n || typeof n !== "object") return { ...DEFAULT_DEMO_NAMES };
  return {
    n1CampaignName: typeof n.n1CampaignName === "string" ? n.n1CampaignName : DEFAULT_DEMO_NAMES.n1CampaignName,
    n1Segments: Array.isArray(n.n1Segments) ? n.n1Segments.map(String) : [...DEFAULT_DEMO_NAMES.n1Segments],
    n2CampaignName: typeof n.n2CampaignName === "string" ? n.n2CampaignName : DEFAULT_DEMO_NAMES.n2CampaignName,
    n2ItemNames: Array.isArray(n.n2ItemNames) ? n.n2ItemNames.map(String) : [...DEFAULT_DEMO_NAMES.n2ItemNames],
  };
}

export function loadDemo(): DemoLoadResult {
  const s = storage();
  if (!s) {
    return {
      run: memoryState?.run ?? null,
      names: normalizeNames(memoryState?.names),
      mode: "memory",
      recovered: false,
    };
  }
  const raw = s.getItem(DEMO_STORE_KEY);
  if (!raw) return { run: null, names: { ...DEFAULT_DEMO_NAMES }, mode: "localStorage", recovered: false };
  try {
    const parsed = JSON.parse(raw) as DemoStoreState;
    const versionOk = parsed?.version === DEMO_STORE_VERSION && parsed?.demoVersion === DEMO_PRESENTATION_VERSION;
    if (!versionOk) {
      s.removeItem(DEMO_STORE_KEY);
      return { run: null, names: { ...DEFAULT_DEMO_NAMES }, mode: "localStorage", recovered: true };
    }
    const run = isRunLike(parsed.run) ? parsed.run : null;
    return {
      run,
      names: normalizeNames(parsed.names),
      mode: "localStorage",
      recovered: parsed.run != null && run == null,
    };
  } catch {
    try {
      s.removeItem(DEMO_STORE_KEY);
    } catch {
      /* 忽略 */
    }
    return { run: null, names: { ...DEFAULT_DEMO_NAMES }, mode: "localStorage", recovered: true };
  }
}

function persist(state: DemoStoreState): DemoLoadResult {
  const s = storage();
  if (!s) {
    memoryState = state;
    return { run: state.run, names: state.names, mode: "memory", recovered: false };
  }
  try {
    s.setItem(DEMO_STORE_KEY, JSON.stringify(state));
    return { run: state.run, names: state.names, mode: "localStorage", recovered: false };
  } catch {
    memoryState = state;
    return { run: state.run, names: state.names, mode: "memory", recovered: false };
  }
}

/** 重新執行示範資料：直接以新 run 取代，不與舊 run 累加 */
export function saveDemoRun(run: DemoRun): DemoLoadResult {
  const current = loadDemo();
  return persist({
    version: DEMO_STORE_VERSION,
    demoVersion: DEMO_PRESENTATION_VERSION,
    run,
    names: current.names,
  });
}

/** 名稱編輯只影響示範設定，不改任何正式活動或品項 */
export function saveDemoNames(names: DemoNameConfig): DemoLoadResult {
  const current = loadDemo();
  return persist({
    version: DEMO_STORE_VERSION,
    demoVersion: DEMO_PRESENTATION_VERSION,
    run: current.run,
    names,
  });
}

export function clearDemo(): void {
  memoryState = null;
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(DEMO_STORE_KEY);
  } catch {
    /* 忽略 */
  }
}
