import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Button } from "@lakeze/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { getOrderSourceConfig } from "@lakeze/shared/utils/orderHelpers";
import {
  currentVersion, effectiveExplain, upcomingVersions, versionStatus, type OverrideRow, type Track,
} from "@/lib/venueSourceVersions";
import { SourceVersionDialog } from "./SourceVersionDialog";

const STATUS_BADGE = {
  current: <Badge>本月採用</Badge>,
  future: <Badge variant="outline">已排定</Badge>,
  history: <Badge variant="secondary">歷史</Badge>,
};

function SourceBadges({ sources, testId }: { sources: string[]; testId: string }) {
  if (sources.length === 0) return <span className="text-sm text-muted-foreground" data-testid={testId}>（未設定任何來源）</span>;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {sources.map((s) => <Badge key={s} variant="outline" className={getOrderSourceConfig(s).className}>{getOrderSourceConfig(s).label}</Badge>)}
    </div>
  );
}

type Props = {
  track: Track; title: string; rows: OverrideRow[]; globalSources: string[]; options: string[];
  months: string[]; monthStart: string; canEdit: boolean;
  onSave: (track: Track, month: string, sources: string[] | null) => Promise<boolean>;
  onCancelFuture: (row: OverrideRow) => void;
};

/** 單一軌（共用／KOL）的來源設定：本月採用版本、已排定版本、歷史版本、新增／改回全站 */
export function SourceTrackBlock({ track, title, rows, globalSources, options, months, monthStart, canEdit, onSave, onCancelFuture }: Props) {
  const [dialog, setDialog] = useState<"custom" | "global" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const cur = currentVersion(rows, monthStart);
  const isCustom = Array.isArray(cur?.included_order_sources);
  const curSources = isCustom ? cur!.included_order_sources! : globalSources;
  const sorted = [...rows].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const tid = `bonus-sources-${track}`;

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid={tid}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant={isCustom ? "default" : "secondary"} data-testid={`${tid}-mode`}>{isCustom ? "本館自訂" : "沿用全站"}</Badge>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">本月計算採用{cur ? `（生效日 ${cur.effective_from}）` : ""}：</p>
        <SourceBadges sources={curSources} testId={`${tid}-current`} />
      </div>
      {upcomingVersions(rows, monthStart).map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-xs" data-testid={`${tid}-upcoming-${r.effective_from}`}>
          <span>已排定 {r.effective_from}：{r.included_order_sources ? "本館自訂" : "改回沿用全站"}（{effectiveExplain(r.effective_from)}）</span>
          {canEdit && <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={() => onCancelFuture(r)} data-testid={`${tid}-cancel-${r.effective_from}`}>取消排定</Button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialog("custom")} data-testid={`${tid}-add-btn`}>新增本館自訂版本</Button>
          {(isCustom || rows.some((r) => r.effective_from > monthStart && r.included_order_sources)) && (
            <Button size="sm" variant="ghost" onClick={() => setDialog("global")} data-testid={`${tid}-revert-btn`}>改回沿用全站</Button>
          )}
        </div>
      )}
      <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => setShowHistory((v) => !v)} data-testid={`${tid}-history-toggle`}>
        {showHistory ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}版本紀錄（{rows.length}）
      </Button>
      {showHistory && (rows.length === 0 ? <p className="text-xs text-muted-foreground">尚無版本，一直沿用全站設定。</p> : (
        <Table data-testid={`${tid}-history`}>
          <TableHeader><TableRow><TableHead>生效日</TableHead><TableHead>內容</TableHead><TableHead>狀態</TableHead></TableRow></TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{r.effective_from}</TableCell>
                <TableCell className="text-xs">{r.included_order_sources ? r.included_order_sources.map((s) => getOrderSourceConfig(s).label).join("、") || "（無來源）" : "改回沿用全站"}</TableCell>
                <TableCell>{STATUS_BADGE[versionStatus(r, rows, monthStart)]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ))}
      {dialog && (
        <SourceVersionDialog mode={dialog} title={title} months={months} options={options} globalSources={globalSources}
          takenMonths={rows.filter((r) => r.effective_from >= monthStart).map((r) => r.effective_from)}
          initial={curSources} onClose={() => setDialog(null)} onSubmit={(m, s) => onSave(track, m, s)} />
      )}
    </div>
  );
}
