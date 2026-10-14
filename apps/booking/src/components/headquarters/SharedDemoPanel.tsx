/**
 * 總部分析頁「共用 Demo」模式：資料集存在服務端（hq_shared_demo_get／put），不同電腦讀同一 run。
 * 一律標示「Demo 測試資料，非實際營運成果」，不受 SHOW_DEMO_* 旗標影響；不呼叫任何即時 RPC。
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@lakeze/shared/components/ui/alert";
import { FlaskConical, RefreshCw, Upload, Send } from "lucide-react";
import { buildDemoRun, DEFAULT_DEMO_NAMES, type DemoNameConfig, type DemoRun } from "@lakeze/shared/utils/demoPresentation";
import { loadDemo } from "@lakeze/shared/utils/demoRunStore";
import {
  compatibilityIssue, fetchSharedDemo, publishSharedDemo, rebuildRun, toDescriptor, verifyLocalRun,
  SHARED_DEMO_LABEL, type SharedDemoDataset, type SharedDemoRunDescriptor,
} from "@lakeze/shared/utils/sharedDemo";
import type { AccommodationOption } from "@/components/headquarters/MetricBreakdownTable";

const DEMO_VENUE_COUNT = 5;
type Attempt = { run: SharedDemoRunDescriptor; names: DemoNameConfig };

export function useSharedDemo(accommodations: AccommodationOption[], active: boolean) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<SharedDemoDataset | null>(null);
  const [run, setRun] = useState<DemoRun | null>(null);
  const [incompatible, setIncompatible] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ currentRevision: number; attempt: Attempt } | null>(null);

  const apply = useCallback((d: SharedDemoDataset | null, write: boolean) => {
    setDataset(d);
    setCanWrite(write);
    const issue = d ? compatibilityIssue(d.run) : null;
    const rebuilt = d && !issue ? rebuildRun(d.run) : null;
    setIncompatible(issue ?? (d && !rebuilt ? "資料集無法由目前 fixture 重建" : null));
    setRun(rebuilt);
  }, []);

  const load = useCallback(async () => {
    setStatus("loading"); setLoadError(null);
    const res = await fetchSharedDemo(supabase as any);
    if ("error" in res) { setLoadError(res.error.message); setDataset(null); setRun(null); setStatus("error"); return; }
    apply(res.dataset, res.canWrite);
    setStatus("ready");
  }, [apply]);

  useEffect(() => { if (active) void load(); }, [active, load]);

  const write = useCallback(async (attempt: Attempt, expected: number) => {
    setBusy(true); setActionError(null);
    const res = await publishSharedDemo(supabase as any, expected, attempt.run, attempt.names);
    setBusy(false);
    if (!("error" in res)) { setConflict(null); apply(res.dataset, res.canWrite); setStatus("ready"); return; }
    if (res.error.kind === "conflict") setConflict({ currentRevision: res.error.currentRevision, attempt });
    else setActionError(res.error.message);
  }, [apply]);

  const publishNew = useCallback(() => {
    const venues = accommodations.slice(0, DEMO_VENUE_COUNT).map((a) => ({ id: a.id, name: a.name }));
    if (!venues.length) return;
    void write({ run: toDescriptor(buildDemoRun({ venues })), names: dataset?.names ?? DEFAULT_DEMO_NAMES }, dataset?.revision ?? 0);
  }, [accommodations, dataset, write]);

  const importLocal = useCallback(() => {
    const local = loadDemo();
    if (!local.run) { setActionError("此瀏覽器沒有可匯入的本機紀錄"); return; }
    const v = verifyLocalRun(local.run);
    if ("reason" in v) { setActionError(`本機紀錄無法匯入：${v.reason}`); return; }
    void write({ run: v.descriptor, names: local.names }, dataset?.revision ?? 0);
  }, [dataset, write]);

  const saveNames = useCallback((names: DemoNameConfig) => {
    if (dataset) void write({ run: dataset.run, names }, dataset.revision);
  }, [dataset, write]);

  const reloadLatest = useCallback(() => { setConflict(null); void load(); }, [load]);
  const overwriteLatest = useCallback(() => {
    if (conflict && conflict.currentRevision >= 0) void write(conflict.attempt, conflict.currentRevision);
  }, [conflict, write]);

  return {
    status, loadError, dataset, run, incompatible, canWrite, busy, actionError, conflict,
    load, publishNew, importLocal, saveNames, reloadLatest, overwriteLatest,
    showTable: status === "ready" && !!run && !!dataset,
  };
}

export type SharedDemoState = ReturnType<typeof useSharedDemo>;

export function SharedDemoBanner() {
  return (
    <Alert className="border-amber-400 bg-amber-50 text-amber-900" data-testid="shared-demo-banner">
      <FlaskConical className="h-4 w-4" />
      <AlertTitle>共用 Demo</AlertTitle>
      <AlertDescription>{SHARED_DEMO_LABEL}。資料為合成 fixture，未讀取任何正式營運資料或即時 RPC。</AlertDescription>
    </Alert>
  );
}

function ConflictAlert({ s }: { s: SharedDemoState }) {
  if (!s.conflict) return null;
  return (
    <Alert variant="destructive" data-testid="shared-demo-conflict">
      <AlertTitle>其他電腦已更新共用 Demo（目前 revision {s.conflict.currentRevision}）</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>你的變更尚未寫入，未覆蓋任何人的資料。</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={s.reloadLatest} data-testid="shared-demo-conflict-reload">載入最新版本</Button>
          <Button size="sm" onClick={s.overwriteLatest} disabled={s.busy || s.conflict.currentRevision < 0} data-testid="shared-demo-conflict-overwrite">
            以我的變更覆蓋最新版本
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function StatusBlock({ s }: { s: SharedDemoState }) {
  if (s.status === "loading" || s.status === "idle") return <p className="text-xs text-muted-foreground" data-testid="shared-demo-loading">讀取共用 Demo 中…</p>;
  if (s.status === "error") {
    return (
      <Alert variant="destructive" data-testid="shared-demo-load-error">
        <AlertTitle>讀取失敗</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{s.loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void s.load()} data-testid="shared-demo-retry"><RefreshCw className="mr-1 h-4 w-4" />重試</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!s.dataset) {
    return <p className="text-xs text-muted-foreground" data-testid="shared-demo-empty">尚未發布共用 Demo。{s.canWrite ? "請按「建立並發布」。" : "請聯絡 super_admin 發布。"}</p>;
  }
  if (s.incompatible) {
    return (
      <Alert variant="destructive" data-testid="shared-demo-incompatible">
        <AlertTitle>共用 Demo 版本不相容，未顯示數據</AlertTitle>
        <AlertDescription>{s.incompatible}。{s.canWrite ? "請按「重新發布」以目前版本建立。" : "請聯絡 super_admin 重新發布。"}</AlertDescription>
      </Alert>
    );
  }
  const d = s.dataset;
  return (
    <p className="text-xs text-muted-foreground" data-testid="shared-demo-meta">
      revision <span className="font-mono" data-testid="shared-demo-revision">{d.revision}</span> ・ run ID：
      <span className="font-mono" data-testid="shared-demo-run-id">{d.runId}</span> ・ 生成時間：{d.generatedAt} ・ 資料集 {d.demoVersion} ・ fixture {d.fixtureVersion} ・ 最後更新 {d.updatedAt}
    </p>
  );
}

function NamesEditor({ s, track }: { s: SharedDemoState; track: "N1" | "N2" }) {
  const [draft, setDraft] = useState<DemoNameConfig>(s.dataset?.names ?? DEFAULT_DEMO_NAMES);
  useEffect(() => { if (s.dataset) setDraft(s.dataset.names); }, [s.dataset]);
  if (!s.dataset || !s.canWrite) return null;
  const campaignKey = track === "N1" ? "n1CampaignName" : "n2CampaignName";
  const listKey = track === "N1" ? "n1Segments" : "n2ItemNames";
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="space-y-1"><span className="text-xs text-muted-foreground">活動名稱（共用 Demo）</span>
        <Input value={draft[campaignKey]} onChange={(e) => setDraft({ ...draft, [campaignKey]: e.target.value })} data-testid="shared-demo-campaign-name" /></label>
      <label className="space-y-1"><span className="text-xs text-muted-foreground">{track === "N1" ? "各館客群標籤" : "加購品項"}（以「、」分隔）</span>
        <Input value={draft[listKey].join("、")} onChange={(e) => setDraft({ ...draft, [listKey]: e.target.value.split("、") })} data-testid="shared-demo-list-names" /></label>
      <Button size="sm" variant="outline" disabled={s.busy} onClick={() => s.saveNames(draft)} data-testid="shared-demo-save-names">儲存名稱</Button>
    </div>
  );
}

export function SharedDemoControls({ s, track, canGenerate }: { s: SharedDemoState; track: "N1" | "N2"; canGenerate: boolean }) {
  return (
    <Card data-testid="shared-demo-panel">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">共用 Demo 資料集<Badge variant="outline">{SHARED_DEMO_LABEL}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <StatusBlock s={s} />
        <ConflictAlert s={s} />
        {s.actionError && <p className="text-xs text-destructive" data-testid="shared-demo-action-error">{s.actionError}</p>}
        {s.canWrite && s.status === "ready" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={s.publishNew} disabled={s.busy || !canGenerate} data-testid="shared-demo-publish-btn">
              <Send className="mr-1 h-4 w-4" />{s.dataset ? "重新發布" : "建立並發布"}
            </Button>
            <Button size="sm" variant="outline" onClick={s.importLocal} disabled={s.busy} data-testid="shared-demo-import-local-btn">
              <Upload className="mr-1 h-4 w-4" />匯入本機紀錄
            </Button>
          </div>
        )}
        <NamesEditor s={s} track={track} />
      </CardContent>
    </Card>
  );
}

/** 表格與 CSV 每列都帶「資料性質」欄 */
export const SHARED_DEMO_NATURE_COLUMN = { key: "nature", label: "資料性質", kind: "text" as const, value: () => SHARED_DEMO_LABEL };
export const SHARED_DEMO_TITLE_SUFFIX = `（共用 Demo｜${SHARED_DEMO_LABEL}）`;
