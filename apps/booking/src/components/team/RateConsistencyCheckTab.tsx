import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettingsCompleteness } from "@lakeze/shared/hooks/use-settings-completeness";
import { RAGIC_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/bonusChecks";
import { levelOf, type CheckColumn, type CheckGroupKey, type CheckLevel, type CheckResult } from "@lakeze/shared/lib/settingsCompleteness/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Label } from "@lakeze/shared/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@lakeze/shared/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lakeze/shared/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";
import { AlertTriangle, ArrowUpRight, CheckCircle2, MinusCircle, RefreshCw, XCircle } from "lucide-react";
import SettingsGapDetailCards from "@/components/team/SettingsGapDetailCards";

const GROUPS: Array<{ key: CheckGroupKey; label: string; desc: string; errorLabel: string }> = [
  {
    key: "ragic",
    label: "Ragic 收入寫入",
    desc: "逐館檢查會影響營收計算與 Ragic 匯出的關鍵設定是否齊備。",
    errorLabel: "嚴重（會被 Ragic 排除）",
  },
  {
    key: "bonus-venue",
    label: "獎金發放（館別）",
    desc: "逐館檢查獎金四步流程中與館別綁定的設定：採計開關、業主自帶口徑、成交費率、負責人與級距規則。",
    errorLabel: "嚴重（此館獎金算不出來）",
  },
  {
    key: "bonus-global",
    label: "全站獎金設定",
    desc: "檢查不分館別的獎金設定是否齊備；每列並列出這項設定會影響哪些獎金。",
    errorLabel: "嚴重（全站獎金受影響）",
  },
];

function LevelIcon({ level }: { level: CheckLevel }) {
  if (level === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

interface FixState {
  scopeName: string;
  checkLabel: string;
  res: CheckResult;
  errorLabel: string;
}

/**
 * 設定完整性檢查（唯讀）
 * 一個 Tab、三個檢查群組（Ragic 收入寫入／獎金發放館別／全站獎金設定），
 * 共用同一組 KPI 卡、狀態矩陣與修補引導彈窗。此頁不會修改任何設定。
 */
export default function RateConsistencyCheckTab() {
  const navigate = useNavigate();
  const { ragicRows, bonusVenueRows, bonusGlobalRows, loading, reload } = useSettingsCompleteness();
  const [group, setGroup] = useState<CheckGroupKey>("ragic");
  const [showAll, setShowAll] = useState(false);
  const [fix, setFix] = useState<FixState | null>(null);

  const meta = GROUPS.find((g) => g.key === group)!;
  const isGlobal = group === "bonus-global";
  const columns: CheckColumn[] = group === "ragic" ? RAGIC_COLUMNS : BONUS_VENUE_COLUMNS;
  const venueRows = group === "ragic" ? ragicRows : bonusVenueRows;

  const sortedVenueRows = useMemo(() => {
    const weight = (l: CheckLevel) => (l === "error" ? 0 : l === "warn" ? 1 : 2);
    return [...venueRows].sort(
      (a, b) =>
        weight(levelOf(a, columns)) - weight(levelOf(b, columns)) ||
        a.accName.localeCompare(b.accName, "zh-TW"),
    );
  }, [venueRows, columns]);

  const stats = useMemo(() => {
    const levels = isGlobal
      ? bonusGlobalRows.map((r) => r.result.level)
      : sortedVenueRows.map((r) => levelOf(r, columns));
    return {
      complete: levels.filter((l) => l === "ok").length,
      warn: levels.filter((l) => l === "warn").length,
      error: levels.filter((l) => l === "error").length,
    };
  }, [isGlobal, bonusGlobalRows, sortedVenueRows, columns]);

  const visibleVenueRows = showAll
    ? sortedVenueRows
    : sortedVenueRows.filter((row) => levelOf(row, columns) !== "ok");
  const visibleGlobalRows = showAll
    ? bonusGlobalRows
    : bonusGlobalRows.filter((r) => r.result.level !== "ok");

  const cell = (res: CheckResult, checkLabel: string, scopeName: string) => {
    const content = (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
        <LevelIcon level={res.level} />
        <span className={res.level === "ok" ? "text-muted-foreground" : ""}>{res.label}</span>
        {res.level !== "ok" && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />}
      </span>
    );
    if (res.level === "ok") return content;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setFix({ scopeName, checkLabel, res, errorLabel: meta.errorLabel })}
            className="rounded text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]">
          <p className="text-xs leading-relaxed">{res.hint ?? "此項目尚未設定完成。"}</p>
          <p className="mt-1 text-xs font-medium">點擊查看修補指引 →</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm" data-testid="rate-check-onboarding-banner">
      <span>新館的負責 AM、KOL 場域、互惠額度、金流與本頁缺口，已整合到團隊後台「館別設定總覽」，可逐館直接設定。</span>
      <a href="/team/onboarding" className="font-medium underline" data-testid="rate-check-onboarding-link">前往館別設定總覽</a>
    </div>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>設定完整性檢查（唯讀）</CardTitle>
            <CardDescription>
              {meta.desc}
              <span className="text-destructive font-medium"> 紅色</span> 代表會影響計算結果，
              <span className="text-amber-600 font-medium">黃色</span> 為建議補齊。此頁不會修改任何設定。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新檢查
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={group} onValueChange={(v) => setGroup(v as CheckGroupKey)}>
          <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-max flex-nowrap justify-start">
              {GROUPS.map((g) => (
                <TabsTrigger key={g.key} value={g.key} className="whitespace-nowrap">
                  {g.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {!loading && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">設定完整</div>
              <div className="text-xl font-bold tabular-nums">{stats.complete}</div>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">有缺漏（建議補齊）</div>
              <div className="text-xl font-bold tabular-nums">{stats.warn}</div>
            </div>
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">{meta.errorLabel}</div>
              <div className="text-xl font-bold tabular-nums">{stats.error}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch id="show-all-acc" checked={showAll} onCheckedChange={setShowAll} />
            <Label htmlFor="show-all-acc" className="text-sm">
              顯示全部{isGlobal ? "設定項" : "館別"}（預設只顯示有缺漏）
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            提示：點擊任一{" "}
            <span className="underline decoration-dotted">
              紅／黃格子 <ArrowUpRight className="inline h-3 w-3" />
            </span>{" "}
            會開啟修補指引，說明原因、要去哪個頁面、需補哪些欄位。
          </p>
        </div>

        <TooltipProvider>
          <div className="overflow-x-auto">
            {isGlobal ? (
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>設定項</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>影響的獎金</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleGlobalRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="align-top">
                        <div className="font-medium">{row.label}</div>
                        {row.role && (
                          <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                            {row.role}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">{cell(row.result, row.label, "全站設定")}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex max-w-[320px] flex-wrap gap-1">
                          {row.affects.map((n) => (
                            <Badge key={n} variant="secondary" className="text-[11px] font-normal">
                              {n}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleGlobalRows.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        <MinusCircle className="mr-1 inline h-4 w-4" />
                        全站獎金設定皆完整。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>館別</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleVenueRows.map((row) => (
                    <TableRow key={row.accId}>
                      <TableCell className="whitespace-nowrap font-medium">{row.accName}</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c.key}>
                          {cell(row.checks[c.key] ?? { level: "ok", label: "—" }, c.label, row.accName)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {visibleVenueRows.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                        <MinusCircle className="mr-1 inline h-4 w-4" />
                        所有館別設定皆完整。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TooltipProvider>

        <Dialog open={!!fix} onOpenChange={(o) => !o && setFix(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {fix && <LevelIcon level={fix.res.level} />}
                {fix?.scopeName}：{fix?.checkLabel}
              </DialogTitle>
              <DialogDescription>依下列指引補齊設定，完成後回來按「已完成，重新檢查」。</DialogDescription>
            </DialogHeader>

            {fix && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">缺漏原因</div>
                  <p className="mt-1 leading-relaxed">
                    <Badge variant={fix.res.level === "error" ? "destructive" : "secondary"} className="mr-2">
                      {fix.res.level === "error" ? fix.errorLabel : "建議補齊"}
                    </Badge>
                    {fix.res.hint ?? "此項目尚未設定完成。"}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">要到哪個頁面</div>
                  <p className="mt-1">{fix.res.target ?? "對應設定頁"}</p>
                </div>
                {fix.res.fields?.length ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">需要補的欄位</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {fix.res.fields.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setFix(null);
                  reload();
                }}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                已完成，重新檢查
              </Button>
              {fix?.res.href && (
                <Button
                  onClick={() => {
                    const href = fix.res.href!;
                    setFix(null);
                    navigate(href);
                  }}
                >
                  前往設定頁
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>

    <SettingsGapDetailCards
      ragicRows={ragicRows}
      bonusVenueRows={bonusVenueRows}
      bonusGlobalRows={bonusGlobalRows}
    />
    </div>
  );
}
