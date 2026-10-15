/**
 * 總部分析頁共用：篩選列（日期／業者／通路）＋可排序表格＋合計列＋CSV 匯出＋「尚無資料」。
 * 各頁只需提供欄位定義、RPC 載入與口徑文字；比率欄分母為 0 一律顯示「—」。
 */
import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, RefreshCw } from "lucide-react";

export interface AccommodationOption { id: string; name: string }
export interface Filters { from: string; to: string; accommodationIds: string[]; channel: string; includeInternal: boolean }

export type ColumnDef<R> =
  | { key: string; label: string; kind: "text"; value: (r: R) => string; align?: "left" }
  | { key: string; label: string; kind: "number"; value: (r: R) => number }
  | { key: string; label: string; kind: "rate"; num: (r: R) => number; den: (r: R) => number };

/** 台北時區的某日（offsetDays=0 為台北今天）YYYY-MM-DD */
const taipeiDay = (offsetDays = 0): string => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export const defaultFilters = (): Filters => ({
  from: taipeiDay(-29),
  to: taipeiDay(0),
  accommodationIds: [],
  channel: "all",
  includeInternal: true,
});

export const PLATFORM_LABEL = "平台（未指定館別）";
export const rateText = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

interface Props<R> {
  title: string;
  /** 不顯示卡片標題與說明（title 仍用於 CSV） */
  hideHeader?: boolean;
  description: string;
  scopeNotes: string[];
  columns: ColumnDef<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  loading: boolean;
  error: string | null;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onReload: () => void;
  accommodations: AccommodationOption[];
  channelOptions: Array<{ value: string; label: string }>;
  csvFileName: string;
  extraHeader?: ReactNode;
  showIncludeInternal?: boolean;
  showScopeNotes?: boolean;
}

export function MetricBreakdownTable<R>({
  title, hideHeader, description, scopeNotes, columns, rows, rowKey, loading, error,
  filters, onFiltersChange, onReload, accommodations, channelOptions, csvFileName, extraHeader,
  showIncludeInternal = true, showScopeNotes = true,
}: Props<R>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortValue = (c: ColumnDef<R>, r: R): number | string =>
    c.kind === "text" ? c.value(r) : c.kind === "number" ? c.value(r) : (c.den(r) > 0 ? c.num(r) / c.den(r) : -1);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(col, a), vb = sortValue(col, b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb), "zh-Hant") * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, columns, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t: Record<string, { num: number; den: number } | number> = {};
    for (const c of columns) {
      if (c.kind === "number") t[c.key] = rows.reduce((s, r) => s + c.value(r), 0);
      if (c.kind === "rate") t[c.key] = { num: rows.reduce((s, r) => s + c.num(r), 0), den: rows.reduce((s, r) => s + c.den(r), 0) };
    }
    return t;
  }, [rows, columns]);

  const cell = (c: ColumnDef<R>, r: R): string =>
    c.kind === "text" ? c.value(r) : c.kind === "number" ? c.value(r).toLocaleString() : rateText(c.num(r), c.den(r));
  const totalCell = (c: ColumnDef<R>, i: number): string => {
    if (i === 0) return "合計";
    const t = totals[c.key];
    if (c.kind === "number") return (t as number).toLocaleString();
    if (c.kind === "rate") return rateText((t as { num: number; den: number }).num, (t as { num: number; den: number }).den);
    return "";
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const nameOf = (id: string) => accommodations.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const filterDesc = `期間 ${filters.from}~${filters.to}；通路 ${channelOptions.find((o) => o.value === filters.channel)?.label ?? filters.channel}；業者 ${filters.accommodationIds.length ? filters.accommodationIds.map(nameOf).join("/") : "全部"}`;

  const exportCsv = () => {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const caliber = filters.includeInternal ? "含內部上線測試（is_internal）" : "僅真實旅客";
    const first = `# ${title} 匯出時間 ${new Date().toISOString()}；${filterDesc}${showIncludeInternal ? `；口徑：${caliber}` : ""}；${scopeNotes.join("；")}`;
    const lines = [first, columns.map((c) => esc(c.label)).join(",")];
    for (const r of sorted) lines.push(columns.map((c) => esc(c.kind === "number" ? c.value(r) : cell(c, r))).join(","));
    if (rows.length) lines.push(columns.map((c, i) => esc(totalCell(c, i))).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvFileName}_${filters.from}_${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const set = (patch: Partial<Filters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <div className="space-y-4" data-testid={`breakdown-${csvFileName}`}>
      <Card>
        {!hideHeader && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent className={hideHeader ? "space-y-4 pt-6" : "space-y-4"}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">起</label>
              <Input type="date" value={filters.from} max={filters.to} onChange={(e) => set({ from: e.target.value })} className="w-40" data-testid="bd-from" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">迄</label>
              <Input type="date" value={filters.to} min={filters.from} onChange={(e) => set({ to: e.target.value })} className="w-40" data-testid="bd-to" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">通路</label>
              <Select value={filters.channel} onValueChange={(v) => set({ channel: v })}>
                <SelectTrigger className="w-32" data-testid="bd-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channelOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={onReload} disabled={loading} data-testid="bd-reload">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="ml-1">重新統計</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} data-testid="bd-export">
              <Download className="h-4 w-4 mr-1" />匯出 CSV
            </Button>
            {showIncludeInternal && (
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" data-testid="bd-include-internal">
                <Checkbox checked={filters.includeInternal} onCheckedChange={(v) => set({ includeInternal: v === true })} />
                含內部上線測試
              </label>
            )}
            {extraHeader}
          </div>
          {showIncludeInternal && (
            <p className="text-xs font-medium text-foreground" data-testid="bd-caliber">
              {filters.includeInternal ? "口徑：含內部上線測試（is_internal）" : "口徑：僅真實旅客"}
            </p>
          )}
          <div>
            <div className="text-xs text-muted-foreground mb-2">業者（不勾＝全部）</div>
            <div className="flex flex-wrap gap-3">
              {accommodations.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={filters.accommodationIds.includes(a.id)}
                    onCheckedChange={() => set({ accommodationIds: filters.accommodationIds.includes(a.id) ? filters.accommodationIds.filter((x) => x !== a.id) : [...filters.accommodationIds, a.id] })}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          {showScopeNotes && (
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5" data-testid="bd-scope-notes">
              {scopeNotes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="bd-error">
              RPC 錯誤：{error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table data-testid="bd-table">
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.kind === "text" ? "" : "text-right"}>
                    <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => toggleSort(c.key)} data-testid={`bd-sort-${c.key}`}>
                      {c.label}
                      {sortKey === c.key ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 && !error && (
                <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground">統計中…</TableCell></TableRow>
              )}
              {error && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-destructive" data-testid="bd-error-row">
                    統計失敗：{error}
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && rows.length === 0 && (
                <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground" data-testid="bd-empty">尚無資料（n=0）</TableCell></TableRow>
              )}
              {sorted.map((r) => (
                <TableRow key={rowKey(r)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.kind === "text" ? "" : "text-right tabular-nums"}>{cell(c, r)}</TableCell>
                  ))}
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/40 font-medium" data-testid="bd-total-row">
                  {columns.map((c, i) => (
                    <TableCell key={c.key} className={c.kind === "text" ? "" : "text-right tabular-nums"}>{totalCell(c, i)}</TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
