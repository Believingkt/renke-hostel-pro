/**
 * 總部分析頁「共用 Demo」模式：資料集存在服務端（hq_shared_demo_get／put），不同電腦讀同一 run。
 * 不呼叫任何即時 RPC。
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { buildDemoRun, DEFAULT_DEMO_NAMES, type DemoNameConfig, type DemoRun } from "@lakeze/shared/utils/demoPresentation";
import { loadDemo } from "@lakeze/shared/utils/demoRunStore";
import {
  compatibilityIssue, fetchSharedDemo, publishSharedDemo, rebuildRun, toDescriptor, verifyLocalRun,
  type SharedDemoDataset, type SharedDemoRunDescriptor,
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
