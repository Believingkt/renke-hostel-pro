/**
 * 總部後台 → 營運分析 → AI 成效指標（結案 F2：M1 / M2 / N1 / N2）
 * - 進頁面以 RPC ai_metric_dashboard 即時彙總（HQ 管理員限定），不排程、不回填。
 * - 四張指標卡（比率、分子／分母、樣本數、公式與口徑）＋各館明細表＋CSV 匯出＋測試帳號排除名單管理。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Input } from "@lakeze/shared/components/ui/input";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { useToast } from "@lakeze/shared/hooks/use-toast";
import { Download, Loader2, RefreshCw, Trash2, UserX } from "lucide-react";

interface AccommodationOption { id: string; name: string }
type Channel = "all" | "web" | "line" | "email";

interface Row {
  accommodation_id: string | null;
  m1_num: number; m1_den: number;
  m2_num: number; m2_den: number;
  n1_num: number; n1_den: number;
  n2_num: number; n2_den: number;
}
interface Exclusion { id: string; kind: "email" | "line_user_id"; value: string; note: string | null; created_at: string }

const ATTR_DAYS = 7;
const METRICS = [
  { key: "m1", label: "M1 行程推薦點擊率", formula: "trip_rec_click ÷ trip_rec_shown",
    note: "分母：AI 行程卡曝光（官網小安／電腦版管家／LINE 管家／行程產生頁）；分子：被點擊過的曝光數——新資料以曝光編號 rec_id 一一對應，舊資料無 rec_id 時以曝光數為上限，故 ≤100%。" },
  { key: "m2", label: "M2 行程複製收藏分享率", formula: "(trip_save＋trip_favorite＋trip_share＋trip_copy) ÷ trip_rec_shown",
    note: "分子：收藏、加入我的行程、開啟分享、複製分享連結；各動作各自以 rec_id 去重（舊資料每種動作以曝光數為上限）後相加。同一次推薦可同時被多種動作，故比率可能 >100%。" },
  { key: "n1", label: "N1 再行銷轉換率", formula: "歸因成立訂單數 ÷ 實際寄達推播數",
    note: "寄達口徑：remarketing_sends.status='sent' 且 is_test=false（無 delivered 回報，以成功送出近似）。歸因：訂單 utm_source=remarketing 且 utm_content=推播 ID，訂單非取消／暫鎖且在寄送之後。" },
  { key: "n2", label: "N2 加購轉換率", formula: "推薦後成交加購數量 ÷ addon_rec_shown",
    note: `個人層級歸因：同館同品項，LINE 以 line_user_id、官網以 session_key 對應，成交須在推薦後 ${ATTR_DAYS} 天內。` },
] as const;

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "尚無資料");
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export function AiMetricDashboard({ accommodations }: { accommodations: AccommodationOption[] }) {
  const { toast } = useToast();
  const [from, setFrom] = useState(() => fmtDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [channel, setChannel] = useState<Channel>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [includeInternal, setIncludeInternal] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [exKind, setExKind] = useState<"email" | "line_user_id">("email");
  const [exValue, setExValue] = useState("");
  const [exNote, setExNote] = useState("");

  const nameOf = useCallback(
    (id: string | null) => (id ? accommodations.find((a) => a.id === id)?.name ?? id.slice(0, 8) : "未指定館"),
    [accommodations],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("ai_metric_dashboard" as any, {
      p_from: from,
      p_to: to,
      p_accommodation_ids: selected.length ? selected : null,
      p_channel: channel === "all" ? null : channel,
      p_attribution_days: ATTR_DAYS,
      p_include_internal: includeInternal,
    } as any);
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(((data as any[]) ?? []).map((r) => ({
        accommodation_id: r.accommodation_id ?? null,
        m1_num: Number(r.m1_num), m1_den: Number(r.m1_den),
        m2_num: Number(r.m2_num), m2_den: Number(r.m2_den),
        n1_num: Number(r.n1_num), n1_den: Number(r.n1_den),
        n2_num: Number(r.n2_num), n2_den: Number(r.n2_den),
      })));
    }
    setLoading(false);
  }, [from, to, selected, channel, includeInternal]);

  const loadExclusions = useCallback(async () => {
    const { data } = await supabase.from("ai_metric_exclusions" as any).select("*").order("created_at", { ascending: false });
    setExclusions(((data as any[]) ?? []) as Exclusion[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadExclusions(); }, [loadExclusions]);

  const total = useMemo<Row>(() => {
    const t: Row = { accommodation_id: null, m1_num: 0, m1_den: 0, m2_num: 0, m2_den: 0, n1_num: 0, n1_den: 0, n2_num: 0, n2_den: 0 };
    for (const r of rows ?? []) for (const k of Object.keys(t) as (keyof Row)[]) if (k !== "accommodation_id") (t[k] as number) += r[k] as number;
    return t;
  }, [rows]);

  const sortedRows = useMemo(
    () => [...(rows ?? [])].sort((a, b) => nameOf(a.accommodation_id).localeCompare(nameOf(b.accommodation_id), "zh-Hant")),
    [rows, nameOf],
  );

  const addExclusion = async () => {
    const v = exValue.trim();
    if (!v) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("ai_metric_exclusions" as any).insert({ kind: exKind, value: v, note: exNote.trim() || null, created_by: u.user?.id ?? null } as any);
    if (error) return toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    setExValue(""); setExNote("");
    await loadExclusions();
    await load();
  };
  const removeExclusion = async (id: string) => {
    const { error } = await supabase.from("ai_metric_exclusions" as any).delete().eq("id", id);
    if (error) return toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
    await loadExclusions();
    await load();
  };

  const exportCsv = () => {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const filterDesc = `期間 ${from}~${to}；管道 ${channel === "all" ? "全部" : channel}；館別 ${selected.length ? selected.map(nameOf).join("/") : "全部"}；口徑：${includeInternal ? "含內部上線測試（is_internal）" : "僅真實旅客"}；排除名單 ${exclusions.length} 筆`;
    const header1 = `# AI 成效指標 匯出時間 ${new Date().toISOString()}；${filterDesc}；${METRICS.map((m) => `${m.label}＝${m.formula}（${m.note}）`).join("；")}`;
    const cols = ["館別", "M1 分子", "M1 分母", "M1 比率", "M2 分子", "M2 分母", "M2 比率", "N1 分子", "N1 分母", "N1 比率", "N2 分子", "N2 分母", "N2 比率"];
    const line = (name: string, r: Row) => [
      name, r.m1_num, r.m1_den, pct(r.m1_num, r.m1_den), r.m2_num, r.m2_den, pct(r.m2_num, r.m2_den),
      r.n1_num, r.n1_den, pct(r.n1_num, r.n1_den), r.n2_num, r.n2_den, pct(r.n2_num, r.n2_den),
    ].map(esc).join(",");
    const body = [header1, cols.map(esc).join(","), ...sortedRows.map((r) => line(nameOf(r.accommodation_id), r)), line("合計", total)].join("\n");
    const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-metrics_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleAcc = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-6" data-testid="ai-metric-dashboard">
      {/* 篩選 */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">起</label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} data-testid="metric-from" className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">迄</label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-testid="metric-to" className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">管道</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger className="w-32" data-testid="metric-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="web">web</SelectItem>
                  <SelectItem value="line">line</SelectItem>
                  <SelectItem value="email">email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="metric-refresh">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1">重新統計</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows?.length} data-testid="metric-export-csv">
              <Download className="h-4 w-4 mr-1" />匯出 CSV
            </Button>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer" data-testid="metric-include-internal">
              <Checkbox checked={includeInternal} onCheckedChange={(v) => setIncludeInternal(v === true)} />
              含內部上線測試
            </label>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">館別（不勾＝全部）</div>
            <div className="flex flex-wrap gap-3" data-testid="metric-acc-filter">
              {accommodations.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={selected.includes(a.id)} onCheckedChange={() => toggleAcc(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="metric-caliber">
            {includeInternal
              ? "口徑：含內部上線測試（is_internal）＋真實旅客（仍排除下方排除名單）"
              : "口徑：僅真實旅客（排除 is_internal 與下方排除名單）"}
            ；日期以台北時區計；統計於進頁面時即時彙總，不回填、不模擬歷史數據。同一旅客同日對同一行程的重複點擊／重複動作只計一次。
          </p>
          {error && <p className="text-sm text-destructive" data-testid="metric-error">{error}</p>}
        </CardContent>
      </Card>

      {/* 四張指標卡 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => {
          const num = total[`${m.key}_num` as keyof Row] as number;
          const den = total[`${m.key}_den` as keyof Row] as number;
          return (
            <Card key={m.key} data-testid={`metric-card-${m.key}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
                <CardDescription className="text-xs">{m.formula}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-3xl font-semibold" data-testid={`metric-rate-${m.key}`}>{loading ? "…" : pct(num, den)}</div>
                <div className="text-sm text-muted-foreground">分子 {num.toLocaleString()} ／ 分母 {den.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">樣本數 n={den.toLocaleString()}{den === 0 && "（尚無資料）"}</div>
                <p className="text-[11px] leading-snug text-muted-foreground pt-1">{m.note}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 各館明細 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">各館明細</CardTitle>
          <CardDescription>每館一列：四項指標的分子／分母與比率（抽樣業者請由此表截圖）</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="metric-table">
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead>
                {METRICS.map((m) => <TableHead key={m.key} className="text-right">{m.key.toUpperCase()}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && sortedRows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">尚無資料（n=0）</TableCell></TableRow>
              )}
              {sortedRows.map((r) => (
                <TableRow key={r.accommodation_id ?? "null"} data-testid={`metric-row-${r.accommodation_id ?? "none"}`}>
                  <TableCell className="font-medium">{nameOf(r.accommodation_id)}</TableCell>
                  {METRICS.map((m) => {
                    const num = r[`${m.key}_num` as keyof Row] as number;
                    const den = r[`${m.key}_den` as keyof Row] as number;
                    return (
                      <TableCell key={m.key} className="text-right whitespace-nowrap">
                        <div className="font-medium">{pct(num, den)}</div>
                        <div className="text-xs text-muted-foreground">{num} / {den}</div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {sortedRows.length > 0 && (
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>合計</TableCell>
                  {METRICS.map((m) => {
                    const num = total[`${m.key}_num` as keyof Row] as number;
                    const den = total[`${m.key}_den` as keyof Row] as number;
                    return (
                      <TableCell key={m.key} className="text-right whitespace-nowrap">
                        <div>{pct(num, den)}</div>
                        <div className="text-xs text-muted-foreground">{num} / {den}</div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 排除名單 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><UserX className="h-4 w-4" />測試帳號排除名單</CardTitle>
          <CardDescription>加入後預設自動排除：email 會對應會員綁定的 LINE 帳號、訂單 Email、推播收件人；LINE ID 直接排除。另沿用再行銷 is_test 標記。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Select value={exKind} onValueChange={(v) => setExKind(v as "email" | "line_user_id")}>
              <SelectTrigger className="w-36" data-testid="exclusion-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="line_user_id">LINE user ID</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder={exKind === "email" ? "name@example.com" : "Uxxxxxxxx…"} value={exValue} onChange={(e) => setExValue(e.target.value)} className="w-64" data-testid="exclusion-value" />
            <Input placeholder="備註（選填）" value={exNote} onChange={(e) => setExNote(e.target.value)} className="w-48" data-testid="exclusion-note" />
            <Button size="sm" onClick={() => void addExclusion()} disabled={!exValue.trim()} data-testid="exclusion-add">加入</Button>
          </div>
          {exclusions.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無排除名單</p>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="exclusion-list">
              {exclusions.map((x) => (
                <Badge key={x.id} variant="secondary" className="gap-1 pr-1">
                  <span className="text-[10px] uppercase text-muted-foreground">{x.kind === "email" ? "email" : "line"}</span>
                  <span>{x.value}</span>
                  {x.note && <span className="text-muted-foreground">（{x.note}）</span>}
                  <button type="button" onClick={() => void removeExclusion(x.id)} className="ml-1 rounded hover:bg-muted p-0.5" aria-label="移除" data-testid={`exclusion-remove-${x.id}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AiMetricDashboard;
