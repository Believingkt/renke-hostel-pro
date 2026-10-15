import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Download, RefreshCw } from "lucide-react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import {
  buildDemoOrders, buildDemoRun, computeConversion, defaultRange, demoOverlaps, demoRange, fmtRate, toCsv,
  FORMULA, INTERNAL_NOTE, MIN_VENUES, SCOPE_NOTE,
  type ConversionResult, type DemoRun, type DemoVenue, type Filters,
} from "@lakeze/shared/lib/aiBookingConversion";

type Mode = "prod" | "demo";
interface DemoState { run: DemoRun | null; revision: number; canWrite: boolean }
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;

function download(csv: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ResultView({ result }: { result: ConversionResult }) {
  const t = result.totals;
  return (
    <>
      {result.venues_with_orders < MIN_VENUES && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="aibk-min-venues-warning">
          有有效訂房的館別只有 {result.venues_with_orders} 家，少於 {MIN_VENUES} 家；此結果不足以作為「至少 {MIN_VENUES} 家業者」的達標依據。
        </div>
      )}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table data-testid="aibk-table">
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead><TableHead className="text-right">有效訂房數</TableHead>
                <TableHead className="text-right">AI 推薦訂房數</TableHead><TableHead className="text-right">AI 訂房轉換率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((r) => (
                <TableRow key={r.accommodation_id} data-testid={`aibk-row-${r.accommodation_id}`}>
                  <TableCell>{r.accommodation_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.effective_orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.ai_orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtRate(r.rate)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium" data-testid="aibk-total-row">
                <TableCell>合計</TableCell>
                <TableCell className="text-right tabular-nums">{t.effective_orders}</TableCell>
                <TableCell className="text-right tabular-nums">{t.ai_orders}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtRate(t.rate)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function AiBookingConversion() {
  const [mode, setMode] = useState<Mode>("prod");
  const [venues, setVenues] = useState<DemoVenue[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({ ...defaultRange(), accommodationIds: null, orderSource: null });
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name")
      .then(({ data, error: e }) => (e ? setError(`館別讀取失敗：${e.message}`) : setVenues((data ?? []) as DemoVenue[])));
    rpc("ai_metric_booking_order_sources").then(({ data }) => setSources((data ?? []) as string[]));
  }, []);

  const loadProd = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: e } = await rpc("ai_metric_booking_conversion", {
      p_from: filters.from, p_to: filters.to, p_accommodation_ids: filters.accommodationIds,
      p_order_sources: filters.orderSource ? [filters.orderSource] : null,
    });
    setLoading(false);
    if (e) { setResult(null); setError(`正式資料讀取失敗：${e.message}`); return; }
    setResult(data as ConversionResult);
  }, [filters]);

  const loadDemo = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: e } = await rpc("hq_ai_booking_demo_get");
    setLoading(false);
    if (e) { setDemo(null); setError(`紀錄讀取失敗：${e.message}`); return; }
    const ds = data?.dataset;
    setDemo({ run: ds?.run ?? null, revision: ds?.revision ?? 0, canWrite: !!data?.canWrite });
    if (ds?.run) setFilters((f) => ({ ...f, ...demoRange(ds.run) }));
  }, []);

  useEffect(() => { if (mode === "prod") loadProd(); }, [mode, loadProd]);
  useEffect(() => {
    if (mode === "demo") loadDemo();
    else setFilters((f) => ({ ...f, ...defaultRange() }));
  }, [mode, loadDemo]);

  const demoInRange = mode === "demo" && !!demo?.run && demoOverlaps(demo.run, filters);
  const demoBuilt = useMemo(() => {
    if (!demoInRange || !demo?.run) return { result: null, error: null };
    try {
      return { result: computeConversion(buildDemoOrders(demo.run), demo.run.venues, filters), error: null };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [demoInRange, demo, filters]);
  const demoResult = demoBuilt.result;
  const demoGen = demo?.run ? demoRange(demo.run) : null;

  const publishDemo = async () => {
    if (!demo) return;
    setError(null);
    let run: DemoRun;
    try { run = buildDemoRun(venues); } catch (e) { setError((e as Error).message); return; }
    const { data, error: e } = await rpc("hq_ai_booking_demo_put", { p_expected_revision: demo.revision, p_run: run });
    if (e) {
      setError(e.code === "PT409" || /revision_conflict/.test(e.message) ? "其他管理員剛更新了紀錄，已重新載入最新版本，請確認後再操作。" : `紀錄產生失敗：${e.message}`);
      await loadDemo();
      return;
    }
    setDemo({ run: data.dataset.run, revision: data.dataset.revision, canWrite: true });
    setFilters((f) => ({ ...f, ...demoRange(data.dataset.run) }));
  };

  const shown = mode === "prod" ? result : demoResult;
  const venueOptions = mode === "demo" ? demo?.run?.venues ?? [] : venues;
  const setF = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="space-y-4" data-testid="ai-booking-conversion-page">
      <AdminPageHeader title="AI 訂房轉換分析" description={`L.AI 智慧銷售模型｜${FORMULA}`} icon={BrainCircuit} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={mode === "prod" ? "default" : "outline"} onClick={() => setMode("prod")} data-testid="aibk-mode-prod">即時</Button>
        <Button size="sm" variant={mode === "demo" ? "default" : "outline"} onClick={() => setMode("demo")} data-testid="aibk-mode-demo">紀錄</Button>
      </div>

      {mode === "prod" ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" data-testid="aibk-scope-note">
          {SCOPE_NOTE}。本頁不代表全部 AI 入口的完整成效；分子為 AI 再行銷推播連結（utm_source=remarketing 且對應真實發送紀錄、同館、發送後成立）的有效訂房。
          <div className="text-xs mt-1" data-testid="aibk-internal-note">{INTERNAL_NOTE}。</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">起<Input type="date" value={filters.from} max={filters.to} onChange={(e) => setF({ from: e.target.value })} data-testid="aibk-from" /></label>
        <label className="text-xs">迄<Input type="date" value={filters.to} min={filters.from} onChange={(e) => setF({ to: e.target.value })} data-testid="aibk-to" /></label>
        <label className="text-xs">館別
          <select className="block h-10 rounded-md border px-2 text-sm min-w-[10rem]" value={filters.accommodationIds?.[0] ?? ""}
            onChange={(e) => setF({ accommodationIds: e.target.value ? [e.target.value] : null })} data-testid="aibk-venue">
            <option value="">全部啟用館別</option>
            {venueOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="text-xs">訂單來源
          <select className="block h-10 rounded-md border px-2 text-sm min-w-[8rem]" value={filters.orderSource ?? ""}
            onChange={(e) => setF({ orderSource: e.target.value || null })} data-testid="aibk-source">
            <option value="">全部</option>
            {(mode === "demo" ? ["website", "owlting", "manual", "hotelnabe"] : sources).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={mode === "prod" ? loadProd : loadDemo} disabled={loading} data-testid="aibk-refresh"><RefreshCw className="h-4 w-4 mr-1" />重新整理</Button>
        {shown && (
          <Button size="sm" variant="outline" data-testid="aibk-csv"
            onClick={() => download(toCsv(shown, { demo: mode === "demo", runId: demo?.run?.runId, filters }), `ai-booking-conversion_${filters.from}_${filters.to}.csv`)}>
            <Download className="h-4 w-4 mr-1" />匯出 CSV
          </Button>
        )}
        {mode === "demo" && demo?.canWrite && (
          <Button size="sm" onClick={publishDemo} data-testid="aibk-demo-publish">{demo.run ? "重新產生紀錄" : "建立紀錄"}</Button>
        )}
      </div>

      {mode === "demo" && demoBuilt.error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-testid="aibk-demo-fixture-error">{demoBuilt.error}</div>}
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-testid="aibk-error">{error}</div>}
      {mode === "demo" && demo && !demo.run && !error && (
        <div className="text-sm text-muted-foreground" data-testid="aibk-demo-empty">尚未建立紀錄{demo.canWrite ? "，可按「建立紀錄」。" : "，需由 super_admin 建立。"}</div>
      )}
      {mode === "demo" && demoGen && !demoInRange && !loading && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="aibk-demo-out-of-range">
          所選期間 {filters.from}～{filters.to} 沒有紀錄資料，紀錄期間為 {demoGen.from}～{demoGen.to}，請將期間調整到此範圍內。
        </div>
      )}
      {loading && <div className="text-sm text-muted-foreground">載入中…</div>}
      {shown && !loading && <ResultView result={shown} />}
    </div>
  );
}
