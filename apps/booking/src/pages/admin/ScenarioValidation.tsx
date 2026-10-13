/**
 * 總部後台 → N1／N2 情境驗證（隔離模擬器）
 *
 * 明確定位：這是「情境測試資料，非實際營運成果」的隔離模擬器。
 * - 不寫入任何正式訂單／營收／庫存／行銷事件，不發送 Email／LINE，不呼叫金流或 PMS，不執行任何 RPC。
 * - 僅讀取既有館名供選擇；旅客為合成 ID，不複製真實個資。
 * - 執行結果只保存在此瀏覽器的隔離 localStorage，不是伺服器稽核紀錄。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@lakeze/shared/components/ui/alert";
import { FlaskConical, Download, Play, ShieldAlert, Trash2 } from "lucide-react";
import {
  buildRun, toCsv, formatRate, CASE_SPECS, SCENARIO_VERSION, DATA_NATURE, ISOLATION_LABEL,
  N1_ATTRIBUTION_HOURS, N2_ATTRIBUTION_DAYS, RATE_BASIS_NOTE,
  type RunResult, type ScenarioVenue,
} from "@lakeze/shared/utils/scenarioSim";
import { loadRuns, saveRun, clearRuns, MAX_RUNS, type StoreMode } from "@lakeze/shared/utils/scenarioRunStore";

const DEFAULT_VENUE_COUNT = 5;

const LIMITATIONS = [
  "未驗證正式 SQL／RPC（ai_metric_remarketing_breakdown、ai_metric_addon_breakdown）的實際查詢結果。",
  "未驗證實際發送與寄達（Email／LINE）、付款與訂單寫入、OTA／PMS 串接、端到端串接。",
  "本頁不重構任何正式流程；正式 /hq/remarketing-analytics、/hq/addon-analytics 與其「含內部上線測試」口徑完全保留。",
  "情境館別僅用於標示情境歸屬，不代表該業者已實際參與測試。",
  `歸因視窗（N1 ${N1_ATTRIBUTION_HOURS} 小時、N2 ${N2_ATTRIBUTION_DAYS} 日）為本模擬器參數，未經正式 RPC 比對，不宣稱與正式口徑一致。`,
  "匯出的 CSV 僅供情境驗證附件，不可匯入正式資料；不作為 N1／N2 真實成果達標依據。",
];

export default function ScenarioValidation() {
  const [venues, setVenues] = useState<ScenarioVenue[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<StoreMode>("localStorage");
  const [recovered, setRecovered] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void supabase
      .from("accommodation_info")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const list = ((data as ScenarioVenue[]) ?? []).map((v) => ({ id: v.id, name: v.name }));
        setVenues(list);
        setSelected(list.slice(0, DEFAULT_VENUE_COUNT).map((v) => v.id));
      });
  }, []);

  useEffect(() => {
    const loaded = loadRuns();
    setRuns(loaded.runs);
    setMode(loaded.mode);
    setRecovered(loaded.recovered);
    setActiveRunId(loaded.runs[0]?.runId ?? null);
  }, []);

  const activeRun = useMemo(() => runs.find((r) => r.runId === activeRunId) ?? null, [runs, activeRunId]);

  const execute = useCallback(() => {
    const picked = venues.filter((v) => selected.includes(v.id));
    if (picked.length === 0) return;
    setRunning(true);
    // 每次 run 完全獨立：事件只由本次 buildRun 產生，不讀取也不累加任何歷史 run
    const run = buildRun({ venues: picked, now: new Date() });
    const after = saveRun(run);
    setRuns(after.runs);
    setMode(after.mode);
    setActiveRunId(run.runId);
    setRunning(false);
  }, [venues, selected]);

  const download = useCallback(() => {
    if (!activeRun) return;
    const blob = new Blob([`\uFEFF${toCsv(activeRun)}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scenario-validation_${activeRun.runId}_情境測試資料.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeRun]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-4" data-testid="scenario-validation-page">
      <AdminPageHeader
        title="N1／N2 情境驗證（隔離模擬器）"
        description="以合成事件驗證再行銷歸因（N1）與加購推薦歸因（N2）的計算邏輯；不製造任何實際營運成果"
        icon={FlaskConical}
      />

      <Alert variant="destructive" data-testid="scenario-banner">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>{DATA_NATURE} ・ {ISOLATION_LABEL}</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>本頁所有數字皆為模擬事件計算結果，<strong>不是實際營運成果，也不代表 N1／N2 真實成果達標</strong>。</p>
          <p>不寫入正式訂單／營收／庫存／行銷事件，不發信、不發 LINE、不呼叫金流或 PMS、不執行任何 RPC 或 migration。</p>
          <p>
            執行紀錄僅保存在<strong>此瀏覽器</strong>（隔離 localStorage，最多 {MAX_RUNS} 筆），非伺服器稽核紀錄。
            目前儲存模式：{mode === "localStorage" ? "此瀏覽器 localStorage" : "記憶體（localStorage 不可用）"}
            {recovered ? "；偵測到損壞或版本不符的舊紀錄，已捨棄。" : ""}
          </p>
          <p>情境版本：{SCENARIO_VERSION}</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">情境館別（預設 5 家）</CardTitle>
          <CardDescription>
            僅讀取既有館名供選擇；館名旁標「情境」，<strong>不表示該業者已實際參測</strong>。可多選後批次執行，每次執行為獨立 run。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
              <label key={v.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={selected.includes(v.id)}
                  onCheckedChange={() => toggle(v.id)}
                  data-testid={`scenario-venue-${v.id}`}
                />
                <span>{v.name}</span>
                <Badge variant="outline" className="ml-auto">情境</Badge>
              </label>
            ))}
            {venues.length === 0 && <p className="text-sm text-muted-foreground">載入館名中…</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={execute} disabled={running || selected.length === 0} data-testid="scenario-run-btn">
              <Play className="mr-2 h-4 w-4" />
              執行情境測試（{selected.length} 家 × {CASE_SPECS.length} 案例）
            </Button>
            <Button variant="outline" onClick={download} disabled={!activeRun} data-testid="scenario-export-btn">
              <Download className="mr-2 h-4 w-4" />
              匯出 CSV（情境測試資料）
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearRuns();
                setRuns([]);
                setActiveRunId(null);
              }}
              disabled={runs.length === 0}
              data-testid="scenario-clear-btn"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              清除本機情境紀錄
            </Button>
            <span className="text-xs text-muted-foreground">
              尚未執行前不顯示任何結果；不預先填造執行結果，也不顯示正式 KPI 達標。
            </span>
          </div>
        </CardContent>
      </Card>

      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">執行紀錄（每次 run 隔離，不跨 run 累加）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <Button
                key={r.runId}
                size="sm"
                variant={r.runId === activeRunId ? "default" : "outline"}
                onClick={() => setActiveRunId(r.runId)}
                data-testid={`scenario-run-${r.runId}`}
              >
                {r.runId} ・ {r.executedAt}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {!activeRun && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="scenario-empty">
            尚未執行情境測試。按下「執行情境測試」後才會產生 run ID、真實執行時間與模擬事件。
          </CardContent>
        </Card>
      )}

      {activeRun && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">本次執行統計（{DATA_NATURE}）</CardTitle>
              <CardDescription>
                run ID：{activeRun.runId} ・ 執行時間：{activeRun.executedAt}（Asia/Taipei） ・ 情境版本：{activeRun.scenarioVersion}
                ・ 情境館別：{activeRun.venues.map((v) => `${v.name}（情境）`).join("、")}
                <span className="mt-1 block">{RATE_BASIS_NOTE}</span>
              </CardDescription>
            </CardHeader>
            {activeRun.scenarioVersion !== SCENARIO_VERSION && (
              <CardContent className="pt-0">
                <Alert variant="destructive" data-testid="scenario-legacy-warning">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>舊口徑結果（{activeRun.scenarioVersion}）</AlertTitle>
                  <AlertDescription className="text-sm">
                    此 run 以舊版口徑計算（skipped 發送的點擊曾混入點擊率分子），與現行 {SCENARIO_VERSION} <strong>不相容</strong>。
                    不會自動套用新公式，請重新執行情境測試後再引用；兩個版本的數字不可混用。
                  </AlertDescription>
                </Alert>
              </CardContent>
            )}
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-md border p-3" data-testid="scenario-pass-rate">
                <p className="text-xs text-muted-foreground">測試通過率（邏輯驗證）</p>
                <p className="text-2xl font-bold">{formatRate(activeRun.summary.passRatePct)}</p>
                <p className="text-xs text-muted-foreground">
                  {activeRun.summary.casePassed}/{activeRun.summary.caseTotal} 案例通過
                </p>
              </div>
              <div className="rounded-md border p-3" data-testid="scenario-n1-cvr">
                <p className="text-xs text-muted-foreground">模擬 N1 轉換率（非實際營運）</p>
                <p className="text-2xl font-bold">{formatRate(activeRun.summary.simN1Cvr)}</p>
                <p className="text-xs text-muted-foreground">
                  模擬下單 {activeRun.summary.orders}／模擬發送 {activeRun.summary.sends}
                </p>
              </div>
              <div className="rounded-md border p-3" data-testid="scenario-n1-ctr">
                <p className="text-xs text-muted-foreground">模擬 N1 點擊率（非實際營運）</p>
                <p className="text-2xl font-bold">{formatRate(activeRun.summary.simN1Ctr)}</p>
                <p className="text-xs text-muted-foreground">
                  模擬點擊（eligible sent）{activeRun.summary.clicks}／模擬發送 {activeRun.summary.sends}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="scenario-n1-skipped-clicks">
                  skipped 發送點擊：{activeRun.summary.skippedClicks ?? 0}（不計入點擊率）
                </p>
              </div>
              <div className="rounded-md border p-3" data-testid="scenario-n2-cvr">
                <p className="text-xs text-muted-foreground">模擬 N2 加購轉換率（非實際營運）</p>
                <p className="text-2xl font-bold">{formatRate(activeRun.summary.simN2Cvr)}</p>
                <p className="text-xs text-muted-foreground">
                  模擬成交 {activeRun.summary.purchasedQty}／模擬推薦 {activeRun.summary.shown}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">案例明細（{DATA_NATURE}）</CardTitle>
              <CardDescription>
                每案獨立預期值／實際值／判定；分子分母由本次事件計算，分母 0 顯示「—」。
                N1 歸因視窗 {N1_ATTRIBUTION_HOURS} 小時、N2 歸因視窗 {N2_ATTRIBUTION_DAYS} 日，<strong>皆為本模擬器參數，未經正式 RPC 比對</strong>。
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table data-testid="scenario-case-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>情境館別</TableHead>
                    <TableHead>軌道</TableHead>
                    <TableHead>案例</TableHead>
                    <TableHead>合成對象</TableHead>
                    <TableHead>模擬事件</TableHead>
                    <TableHead>公式</TableHead>
                    <TableHead>預期值</TableHead>
                    <TableHead>實際值</TableHead>
                    <TableHead>判定</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRun.cases.map((c, i) => (
                    <TableRow key={`${c.venueId}-${c.caseId}-${i}`}>
                      <TableCell className="whitespace-nowrap text-sm">{c.venueName}（情境）</TableCell>
                      <TableCell><Badge variant="outline">{c.track}</Badge></TableCell>
                      <TableCell className="text-sm">{c.title}</TableCell>
                      <TableCell className="font-mono text-xs">{c.travelerId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.note}</TableCell>
                      <TableCell className="max-w-[260px] text-xs text-muted-foreground">{c.formula}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {Object.entries(c.expected).map(([k, v]) => `${k}=${v === null ? "—" : v}`).join("; ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {Object.entries(c.actual).map(([k, v]) => `${k}=${v === null ? "—" : v}`).join("; ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.passed ? "default" : "destructive"}>{c.passed ? "通過" : "失敗"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">模擬事件彙總（{DATA_NATURE}）</CardTitle>
              <CardDescription>左：N1 每情境活動每通路；右：N2 每情境館別每品項。全部由本次模擬事件計算。「skipped 點擊」僅供明細，不進入點擊率分子。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-x-auto">
                <Table data-testid="scenario-n1-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>情境館別</TableHead>
                      <TableHead>情境活動</TableHead>
                      <TableHead>通路</TableHead>
                      <TableHead className="text-right">發送</TableHead>
                      <TableHead className="text-right">點擊</TableHead>
                      <TableHead className="text-right">skipped 點擊</TableHead>
                      <TableHead className="text-right">點擊率</TableHead>
                      <TableHead className="text-right">下單</TableHead>
                      <TableHead className="text-right">轉換率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeRun.n1.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="text-sm">{r.venueName}（情境）</TableCell>
                        <TableCell className="text-xs">{r.campaignName}</TableCell>
                        <TableCell className="text-xs">{r.channel}</TableCell>
                        <TableCell className="text-right">{r.sends}</TableCell>
                        <TableCell className="text-right">{r.clicks}</TableCell>
                        <TableCell className="text-right">{r.skippedClicks ?? 0}</TableCell>
                        <TableCell className="text-right">{formatRate(r.sends > 0 ? Math.round((r.clicks / r.sends) * 1000) / 10 : null)}</TableCell>
                        <TableCell className="text-right">{r.orders}</TableCell>
                        <TableCell className="text-right">{formatRate(r.sends > 0 ? Math.round((r.orders / r.sends) * 1000) / 10 : null)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="overflow-x-auto">
                <Table data-testid="scenario-n2-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>情境館別</TableHead>
                      <TableHead>情境品項</TableHead>
                      <TableHead className="text-right">推薦</TableHead>
                      <TableHead className="text-right">成交數量</TableHead>
                      <TableHead className="text-right">加購轉換率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeRun.n2.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="text-sm">{r.venueName}（情境）</TableCell>
                        <TableCell className="text-xs">{r.itemName}</TableCell>
                        <TableCell className="text-right">{r.shown}</TableCell>
                        <TableCell className="text-right">{r.purchasedQty}</TableCell>
                        <TableCell className="text-right">{formatRate(r.shown > 0 ? Math.round((r.purchasedQty / r.shown) * 1000) / 10 : null)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">限制與未驗證範圍</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="pt-2">
            正式報表入口：
            <Link to="/hq/remarketing-analytics" className="ml-1 underline">再行銷轉換分析</Link>
            <span className="mx-1">·</span>
            <Link to="/hq/addon-analytics" className="underline">加購推薦分析</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
