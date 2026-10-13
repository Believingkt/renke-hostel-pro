/**
 * 總部分析頁的「簡報示範」控制面板（隔離、前端純模擬）。
 * - 切換預設為「正式營運」；示範模式下不呼叫任何正式 RPC、不顯示正式總計。
 * - 示範資料只存在此瀏覽器的版本化 localStorage（不同 origin 各自獨立，部署後需重新建立一次）。
 * - 名稱可編輯供簡報調整，只影響隔離示範設定，不修改任何真正活動或品項。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { FlaskConical, Play, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildDemoRun, DEMO_BANNER, DEMO_PRESENTATION_VERSION, DEFAULT_DEMO_NAMES,
  type DemoNameConfig, type DemoRun,
} from "@lakeze/shared/utils/demoPresentation";
import { loadDemo, saveDemoNames, saveDemoRun, clearDemo, type DemoStoreMode } from "@lakeze/shared/utils/demoRunStore";
import type { AccommodationOption } from "@/components/headquarters/MetricBreakdownTable";

const DEMO_VENUE_COUNT = 5;

export type AnalyticsMode = "live" | "demo";

export function useDemoPresentation(accommodations: AccommodationOption[]) {
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [run, setRun] = useState<DemoRun | null>(null);
  const [names, setNames] = useState<DemoNameConfig>(DEFAULT_DEMO_NAMES);
  const [storeMode, setStoreMode] = useState<DemoStoreMode>("localStorage");
  const [recovered, setRecovered] = useState(false);

  const refresh = useCallback(() => {
    const loaded = loadDemo();
    setRun(loaded.run);
    setNames(loaded.names);
    setStoreMode(loaded.mode);
    setRecovered(loaded.recovered);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const generate = useCallback(() => {
    const venues = accommodations.slice(0, DEMO_VENUE_COUNT).map((a) => ({ id: a.id, name: a.name }));
    if (venues.length === 0) return;
    // 重新執行＝整組取代，不與舊 run 累加
    const next = buildDemoRun({ venues, now: new Date() });
    const saved = saveDemoRun(next);
    setRun(saved.run);
    setStoreMode(saved.mode);
    setRecovered(false);
  }, [accommodations]);

  const updateNames = useCallback((patch: Partial<DemoNameConfig>) => {
    setNames((prev) => {
      const next = { ...prev, ...patch };
      const saved = saveDemoNames(next);
      setStoreMode(saved.mode);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    clearDemo();
    setRun(null);
    setNames(DEFAULT_DEMO_NAMES);
  }, []);

  return { mode, setMode, run, names, updateNames, generate, clear, storeMode, recovered, refresh };
}

export function AnalyticsModeToggle({ mode, onChange }: { mode: AnalyticsMode; onChange: (m: AnalyticsMode) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" data-testid="analytics-mode-toggle">
      <Button
        size="sm"
        variant={mode === "live" ? "default" : "ghost"}
        onClick={() => onChange("live")}
        data-testid="analytics-mode-live"
      >
        正式營運
      </Button>
      <Button
        size="sm"
        variant={mode === "demo" ? "default" : "ghost"}
        onClick={() => onChange("demo")}
        data-testid="analytics-mode-demo"
      >
        簡報示範
      </Button>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
      data-testid="demo-banner"
    >
      <FlaskConical className="h-4 w-4" />
      {DEMO_BANNER}
    </div>
  );
}

interface PanelProps {
  track: "N1" | "N2";
  run: DemoRun | null;
  names: DemoNameConfig;
  onNamesChange: (patch: Partial<DemoNameConfig>) => void;
  onGenerate: () => void;
  onClear: () => void;
  storeMode: DemoStoreMode;
  recovered: boolean;
  canGenerate: boolean;
}

export function DemoControlPanel({
  track, run, names, onNamesChange, onGenerate, onClear, storeMode, recovered, canGenerate,
}: PanelProps) {
  const [showCases, setShowCases] = useState(false);
  const cases = useMemo(
    () => (run ? run.engine.cases.filter((c) => c.track === track) : []),
    [run, track],
  );

  return (
    <Card data-testid="demo-control-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">簡報示範資料（隔離模擬，與正式資料無關）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onGenerate} disabled={!canGenerate} data-testid="demo-generate-btn">
            <Play className="mr-1 h-4 w-4" />
            {run ? "重新執行示範資料" : "建立示範資料"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={!run} data-testid="demo-clear-btn">
            <Trash2 className="mr-1 h-4 w-4" />清除本機示範資料
          </Button>
          <Badge variant="outline">示範版本 {DEMO_PRESENTATION_VERSION}</Badge>
          <span className="text-xs text-muted-foreground">
            儲存位置：{storeMode === "localStorage" ? "此瀏覽器 localStorage" : "記憶體（localStorage 不可用）"}；
            不同網域（預覽／正式）各自獨立，部署後請在該網域重新建立一次。
            {recovered ? "（偵測到版本不符的舊示範資料，已捨棄）" : ""}
          </span>
        </div>

        {run ? (
          <div className="space-y-1 text-xs text-muted-foreground" data-testid="demo-run-meta">
            <p>
              run ID：<span className="font-mono">{run.runId}</span> ・ 生成時間：{run.generatedAt}（Asia/Taipei）
              ・ 情境引擎版本：{run.scenarioVersion} ・ 示範版本：{run.demoVersion}
            </p>
            <p>
              示範館別（{run.venues.length} 家）：
              {run.venues.map((v) => `${v.name}（示範發送日 ${run.venueDates[v.id]}）`).join("、")}
            </p>
            <p>館名為引用名稱（公開館級欄位，非個資），數據為模擬；不代表該業者或該活動有這些實際成交。</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="demo-empty-hint">
            尚未建立示範資料。按下「建立示範資料」後才會產生 run ID、生成時間與模擬事件（不預填任何結果）。
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {track === "N1" ? (
            <>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">示範活動名稱（可編輯，僅影響示範顯示）</span>
                <Input
                  value={names.n1CampaignName}
                  onChange={(e) => onNamesChange({ n1CampaignName: e.target.value })}
                  data-testid="demo-n1-campaign-name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">各館客群標籤（以「、」分隔，依館別順序套用）</span>
                <Input
                  value={names.n1Segments.join("、")}
                  onChange={(e) => onNamesChange({ n1Segments: e.target.value.split("、").map((s) => s.trim()).filter(Boolean) })}
                  data-testid="demo-n1-segments"
                />
              </label>
            </>
          ) : (
            <>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">示範活動名稱（可編輯，僅影響示範顯示）</span>
                <Input
                  value={names.n2CampaignName}
                  onChange={(e) => onNamesChange({ n2CampaignName: e.target.value })}
                  data-testid="demo-n2-campaign-name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">示範加購品項（以「、」分隔，共 4 項）</span>
                <Input
                  value={names.n2ItemNames.join("、")}
                  onChange={(e) => onNamesChange({ n2ItemNames: e.target.value.split("、").map((s) => s.trim()).filter(Boolean) })}
                  data-testid="demo-n2-items"
                />
              </label>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          名稱編輯只寫入隔離示範設定，<strong>不會修改任何真正的行銷活動或加購品項</strong>；調整名稱不會改變任何數字。
        </p>

        {run && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setShowCases((v) => !v)} data-testid="demo-toggle-cases">
              {showCases ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
              技術案例明細（{cases.length} 筆，含未成交／超時／取消／零分母）
            </Button>
            {showCases && (
              <div className="mt-2 overflow-x-auto">
                <Table data-testid="demo-case-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>示範館別</TableHead>
                      <TableHead>技術案例</TableHead>
                      <TableHead>模擬事件</TableHead>
                      <TableHead>預期</TableHead>
                      <TableHead>實際</TableHead>
                      <TableHead>判定</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((c, i) => (
                      <TableRow key={`${c.venueId}-${c.caseId}-${i}`}>
                        <TableCell className="text-xs">{c.venueName}（示範）</TableCell>
                        <TableCell className="text-xs">{c.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.note}</TableCell>
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
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          完整技術案例與歸因規則驗證另見
          <Link to="/hq/scenario-validation" className="mx-1 underline">N1／N2 情境驗證（隔離模擬器）</Link>。
        </p>
      </CardContent>
    </Card>
  );
}
