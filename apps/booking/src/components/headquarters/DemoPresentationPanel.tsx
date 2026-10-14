/**
 * 總部分析頁的「紀錄」檢視控制面板（本機資料集，與即時 RPC 完全隔離）。
 * - 切換預設為「即時」；紀錄模式不呼叫任何即時 RPC、不顯示即時總計。
 * - 資料集只存在此瀏覽器的版本化 localStorage（不同 origin 各自獨立，部署後需重新建立一次）。
 * - 名稱可編輯，只影響本機資料集設定，不修改任何真正活動或品項。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Play, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildDemoRun, DEMO_PRESENTATION_VERSION, DEFAULT_DEMO_NAMES,
  type DemoNameConfig, type DemoRun,
} from "@lakeze/shared/utils/demoPresentation";
import { fixtureBreakdown, DEMO_FIXTURE_VERSION } from "@lakeze/shared/utils/demoFixture";
import { Alert, AlertDescription, AlertTitle } from "@lakeze/shared/components/ui/alert";
import { loadDemo, saveDemoNames, saveDemoRun, clearDemo, type DemoStoreMode } from "@lakeze/shared/utils/demoRunStore";
import type { AccommodationOption } from "@/components/headquarters/MetricBreakdownTable";

const DEMO_VENUE_COUNT = 5;

/** 暫時隱藏紀錄檢視的資料集控制面板（之後要開啟時改回 true） */
export const SHOW_DEMO_CONTROL_PANEL = false;
/** 暫時隱藏紀錄檢視表格上方的口徑說明清單（之後要開啟時改回 true） */
export const SHOW_DEMO_SCOPE_NOTES = false;

export type AnalyticsMode = "live" | "demo";

export function useDemoPresentation(accommodations: AccommodationOption[]) {
  const [mode, setMode] = useState<AnalyticsMode>("live");
  const [run, setRun] = useState<DemoRun | null>(null);
  const [names, setNames] = useState<DemoNameConfig>(DEFAULT_DEMO_NAMES);
  const [storeMode, setStoreMode] = useState<DemoStoreMode>("localStorage");
  const [recovered, setRecovered] = useState(false);
  const [staleVersion, setStaleVersion] = useState<string | undefined>(undefined);

  const refresh = useCallback(() => {
    const loaded = loadDemo();
    setRun(loaded.run);
    setNames(loaded.names);
    setStoreMode(loaded.mode);
    setRecovered(loaded.recovered);
    setStaleVersion(loaded.staleVersion);
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
    setStaleVersion(undefined);
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

  return { mode, setMode, run, names, updateNames, generate, clear, storeMode, recovered, staleVersion, refresh };
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
        即時
      </Button>
      <Button
        size="sm"
        variant={mode === "demo" ? "default" : "ghost"}
        onClick={() => onChange("demo")}
        data-testid="analytics-mode-demo"
      >
        紀錄
      </Button>
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
  staleVersion?: string;
  canGenerate: boolean;
}

export function DemoControlPanel({
  track, run, names, onNamesChange, onGenerate, onClear, storeMode, recovered, staleVersion, canGenerate,
}: PanelProps) {
  const [showCases, setShowCases] = useState(false);
  const breakdown = useMemo(
    () => (run ? fixtureBreakdown(run.engine.events, track) : []),
    [run, track],
  );

  return (
    <Card data-testid="demo-control-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">展示資料集（本機，與即時資料獨立）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onGenerate} disabled={!canGenerate} data-testid="demo-generate-btn">
            <Play className="mr-1 h-4 w-4" />
            {run ? "重新產生資料集" : "建立展示資料集"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={!run} data-testid="demo-clear-btn">
            <Trash2 className="mr-1 h-4 w-4" />清除本機資料集
          </Button>
          <Badge variant="outline">資料集版本 {DEMO_PRESENTATION_VERSION}</Badge>
          <span className="text-xs text-muted-foreground">
            儲存位置：{storeMode === "localStorage" ? "此瀏覽器 localStorage" : "記憶體（localStorage 不可用）"}；
            不同網域各自獨立，部署後請在該網域重新建立一次。
          </span>
        </div>

        {recovered && (
          <Alert variant="destructive" data-testid="demo-stale-version-alert">
            <AlertTitle>偵測到舊版資料集（{staleVersion ?? "版本不符"}）</AlertTitle>
            <AlertDescription className="text-sm">
              舊批次與現行 {DEMO_PRESENTATION_VERSION} 口徑／量級不相容，已捨棄（<strong>不會被當成新版數據使用</strong>）；
              你的名稱設定已保留。請按上方「建立展示資料集」重新產生一次。
            </AlertDescription>
          </Alert>
        )}

        {run ? (
          <div className="space-y-1 text-xs text-muted-foreground" data-testid="demo-run-meta">
            <p>
              run ID：<span className="font-mono">{run.runId}</span> ・ 生成時間：{run.generatedAt}（Asia/Taipei）
              ・ 引擎版本：{run.scenarioVersion} ・ 資料集版本：{run.demoVersion}
              ・ fixture：{run.fixtureVersion ?? DEMO_FIXTURE_VERSION}
            </p>
            <p>
              館別（{run.venues.length} 家）：
              {run.venues.map((v) => `${v.name}（發送日 ${run.venueDates[v.id]}）`).join("、")}
            </p>
            <p>館名為引用名稱（公開館級欄位，非個資）。</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="demo-empty-hint">
            尚未建立資料集。按下「建立展示資料集」後才會產生 run ID、生成時間與事件（不預填任何結果）。
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {track === "N1" ? (
            <>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">活動名稱（可編輯，僅影響本頁顯示）</span>
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
                <span className="text-xs text-muted-foreground">活動名稱（可編輯，僅影響本頁顯示）</span>
                <Input
                  value={names.n2CampaignName}
                  onChange={(e) => onNamesChange({ n2CampaignName: e.target.value })}
                  data-testid="demo-n2-campaign-name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">加購品項（以「、」分隔，共 4 項）</span>
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
          名稱編輯只寫入本機設定，<strong>不會修改任何真正的行銷活動或加購品項</strong>；調整名稱不會改變任何數字。
        </p>

        {run && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setShowCases((v) => !v)} data-testid="demo-toggle-cases">
              {showCases ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
              事件明細（可追溯，{breakdown.reduce((s, r) => s + r.count, 0)} 筆事件，含超時／取消／他人／跨館等樣本）
            </Button>
            {showCases && (
              <div className="mt-2 overflow-x-auto">
                <Table data-testid="demo-case-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>事件類別（caseId）</TableHead>
                      <TableHead>說明</TableHead>
                      <TableHead className="text-right">件數</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.map((r) => (
                      <TableRow key={r.caseId}>
                        <TableCell className="font-mono text-xs">{r.caseId}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.label}</TableCell>
                        <TableCell className="text-right text-xs">{r.count.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
