import { Component, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlayCircle, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface AccOption {
  id: string;
  name: string;
  hotel_code: string | null;
}

interface MappingReport {
  matched: { hotelnabe_room_id: string | null; hotelnabe_room_type_code: string; our_room_type_id: string; our_room_type_name: string }[];
  mismatch: { hotelnabe_room_id: string | null; hotelnabe_room_type_code: string | null; reason: string }[];
  missing_on_our_side: { hotelnabe_room_id: string | null; hotelnabe_room_type_code: string }[];
  unused_on_our_side: { our_room_type_id: string; our_room_type_name: string; numeric_code: number }[];
  totals: { remote: number; ours: number; matched: number; missing: number; mismatch: number; unused: number };
}

interface RatePlanReport {
  matched: { hotelnabe_rate_plan_id: string | null; hotelnabe_rate_plan_code: string; our_package_id: string; our_package_name: string }[];
  mismatch: { hotelnabe_rate_plan_id: string | null; hotelnabe_rate_plan_code: string | null; reason: string }[];
  missing_on_our_side: { hotelnabe_rate_plan_id: string | null; hotelnabe_rate_plan_code: string }[];
  unused_on_our_side: { our_package_id: string; our_package_name: string; numeric_code: number }[];
  totals: { remote: number; ours: number; matched: number; missing: number; mismatch: number; unused: number };
}

interface RetrieveResult {
  success: boolean;
  log_id?: string;
  http_status?: number;
  echo_token?: string;
  report?: (MappingReport | { mapping?: MappingReport; rate_plan_mapping?: RatePlanReport | null; mode?: string; [key: string]: unknown }) | null;
  error?: string;
}

export function HotelNabeRoomVerify() {
  return (
    <HotelNabeRoomVerifyBoundary>
      <HotelNabeRoomVerifyContent />
    </HotelNabeRoomVerifyBoundary>
  );
}

class HotelNabeRoomVerifyBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error?.message ?? "旭海房型驗證區塊顯示失敗" };
  }

  render() {
    if (this.state.error) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>旭海房型對應驗證</CardTitle>
            <CardDescription>此區塊暫時無法顯示，未影響其他後台功能。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive whitespace-pre-wrap break-all">
              {this.state.error}
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function getMappingReport(report: RetrieveResult["report"]): MappingReport | null {
  if (!report || typeof report !== "object") return null;
  const candidate = "mapping" in report ? (report as { mapping?: unknown }).mapping : report;
  if (!candidate || typeof candidate !== "object") return null;
  const r = candidate as Partial<MappingReport>;
  const matched = (Array.isArray(r.matched) ? r.matched : []).map((m: any) => ({
    hotelnabe_room_id: m?.hotelnabe_room_id ?? null,
    hotelnabe_room_type_code: String(m?.hotelnabe_room_type_code ?? "—"),
    our_room_type_id: String(m?.our_room_type_id ?? ""),
    our_room_type_name: String(m?.our_room_type_name ?? "—"),
  }));
  const mismatch = (Array.isArray(r.mismatch) ? r.mismatch : []).map((m: any) => ({
    hotelnabe_room_id: m?.hotelnabe_room_id ?? null,
    hotelnabe_room_type_code: m?.hotelnabe_room_type_code ?? null,
    reason: String(m?.reason ?? "—"),
  }));
  const missing = (Array.isArray(r.missing_on_our_side) ? r.missing_on_our_side : []).map((m: any) => ({
    hotelnabe_room_id: m?.hotelnabe_room_id ?? null,
    hotelnabe_room_type_code: String(m?.hotelnabe_room_type_code ?? "—"),
  }));
  const unused = (Array.isArray(r.unused_on_our_side) ? r.unused_on_our_side : []).map((m: any) => ({
    our_room_type_id: String(m?.our_room_type_id ?? ""),
    our_room_type_name: String(m?.our_room_type_name ?? "—"),
    numeric_code: Number(m?.numeric_code ?? 0),
  }));
  return {
    matched,
    mismatch,
    missing_on_our_side: missing,
    unused_on_our_side: unused,
    totals: {
      remote: Number(r.totals?.remote ?? 0),
      ours: Number(r.totals?.ours ?? 0),
      matched: Number(r.totals?.matched ?? 0),
      missing: Number(r.totals?.missing ?? 0),
      mismatch: Number(r.totals?.mismatch ?? 0),
      unused: Number(r.totals?.unused ?? 0),
    },
  };
}

function getRatePlanReport(report: RetrieveResult["report"]): RatePlanReport | null {
  if (!report || typeof report !== "object") return null;
  const candidate = "rate_plan_mapping" in report ? (report as any).rate_plan_mapping : null;
  if (!candidate || typeof candidate !== "object") return null;
  const r = candidate as Partial<RatePlanReport>;
  const matched = (Array.isArray(r.matched) ? r.matched : []).map((m: any) => ({
    hotelnabe_rate_plan_id: m?.hotelnabe_rate_plan_id ?? null,
    hotelnabe_rate_plan_code: String(m?.hotelnabe_rate_plan_code ?? "—"),
    our_package_id: String(m?.our_package_id ?? ""),
    our_package_name: String(m?.our_package_name ?? "—"),
  }));
  const mismatch = (Array.isArray(r.mismatch) ? r.mismatch : []).map((m: any) => ({
    hotelnabe_rate_plan_id: m?.hotelnabe_rate_plan_id ?? null,
    hotelnabe_rate_plan_code: m?.hotelnabe_rate_plan_code ?? null,
    reason: String(m?.reason ?? "—"),
  }));
  const missing = (Array.isArray(r.missing_on_our_side) ? r.missing_on_our_side : []).map((m: any) => ({
    hotelnabe_rate_plan_id: m?.hotelnabe_rate_plan_id ?? null,
    hotelnabe_rate_plan_code: String(m?.hotelnabe_rate_plan_code ?? "—"),
  }));
  const unused = (Array.isArray(r.unused_on_our_side) ? r.unused_on_our_side : []).map((m: any) => ({
    our_package_id: String(m?.our_package_id ?? ""),
    our_package_name: String(m?.our_package_name ?? "—"),
    numeric_code: Number(m?.numeric_code ?? 0),
  }));
  return {
    matched, mismatch, missing_on_our_side: missing, unused_on_our_side: unused,
    totals: {
      remote: Number(r.totals?.remote ?? 0),
      ours: Number(r.totals?.ours ?? 0),
      matched: Number(r.totals?.matched ?? 0),
      missing: Number(r.totals?.missing ?? 0),
      mismatch: Number(r.totals?.mismatch ?? 0),
      unused: Number(r.totals?.unused ?? 0),
    },
  };
}

async function parseFunctionError(error: unknown): Promise<{ message: string; httpStatus?: number }> {
  const fallback = error instanceof Error ? error.message : String(error ?? "未知錯誤");
  const ctx = (error as { context?: unknown } | null | undefined)?.context;
  if (!ctx) return { message: fallback };

  const maybeResponse = ctx as Partial<Response>;
  if (typeof maybeResponse.clone === "function") {
    const httpStatus = typeof maybeResponse.status === "number" ? maybeResponse.status : undefined;
    try {
      const json = await maybeResponse.clone().json();
      const message = json?.error || json?.detail || JSON.stringify(json);
      return { message: String(message || fallback), httpStatus };
    } catch {
      try {
        const text = await maybeResponse.clone().text();
        return { message: text || fallback, httpStatus };
      } catch {
        return { message: fallback, httpStatus };
      }
    }
  }

  if (typeof ctx === "object") {
    const c = ctx as Record<string, unknown>;
    const message = c.error || c.detail || c.message || JSON.stringify(c);
    return { message: String(message || fallback) };
  }

  return { message: String(ctx || fallback) };
}

function HotelNabeRoomVerifyContent() {
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RetrieveResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("accommodation_hotelnabe_config")
        .select("hotelnabe_hotel_code, accommodation_info:accommodation_id (id, name)")
        .order("hotelnabe_hotel_code");
      if (error) {
        toast.error("載入旭海設定失敗：" + error.message);
        return;
      }
      const opts: AccOption[] = (data ?? [])
        .map((r: any) => ({
          id: r.accommodation_info?.id,
          name: r.accommodation_info?.name ?? "(未命名)",
          hotel_code: r.hotelnabe_hotel_code ?? null,
        }))
        .filter((r) => !!r.id);
      setAccs(opts);
      // 預設淞湘卉館
      const sensan = opts.find((o) => o.id === "8e3e8866-3cb0-4654-91f3-d9b09a543301");
      if (sensan) setSelected(sensan.id);
      else if (opts[0]) setSelected(opts[0].id);
    })();
  }, []);

  const selectedAcc = useMemo(() => accs.find((a) => a.id === selected), [accs, selected]);

  const handleRun = async (mode: "roomOnly" | "roomAndRate" = "roomOnly") => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("hotelnabe-retrieve-rooms", {
        body: { accommodation_id: selected, mode },
      });
      if (error) {
        const { message: msg, httpStatus } = await parseFunctionError(error);
        setResult({ success: false, http_status: httpStatus, error: String(msg) });
        toast.error(`呼叫失敗${httpStatus ? `（HTTP ${httpStatus}）` : ""}：${msg}`);
      } else {
        setResult(data as RetrieveResult);
        if ((data as RetrieveResult)?.success) toast.success("驗證完成");
        else toast.error("驗證未成功：" + ((data as RetrieveResult)?.error ?? "請見下方訊息"));
      }
    } catch (e: any) {
      setResult({ success: false, error: e?.message ?? String(e) });
      toast.error("呼叫失敗：" + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  const r = getMappingReport(result?.report);
  const rp = getRatePlanReport(result?.report);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>旭海房型對應驗證（唯讀）</CardTitle>
          <CardDescription>
            對選定物業觸發 <code className="text-xs">hotelnabe-retrieve-rooms</code>，向旭海正式環境
            <code className="text-xs"> /pms/retrieveRoomOnly </code> 拉房型清單，與我方
            <code className="text-xs"> room_types.numeric_code </code>比對；此操作不會變更任何資料。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 min-w-[260px]">
              <Label>物業（已設定旭海 Hotel Code）</Label>
              <Select value={selected} onValueChange={setSelected} disabled={loading}>
                <SelectTrigger><SelectValue placeholder="選擇物業" /></SelectTrigger>
                <SelectContent>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.hotel_code ? `（HotelCode ${a.hotel_code}）` : ""}
                    </SelectItem>
                  ))}
                  {accs.length === 0 && <SelectItem value="__none__" disabled>尚無物業</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleRun} disabled={!selected || loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              驗證旭海房型對應
            </Button>
          </div>

          {result && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {result.success
                  ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> success</Badge>
                  : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> failed</Badge>}
                {result.http_status != null && <Badge variant="outline">HTTP {result.http_status}</Badge>}
                {result.echo_token && <Badge variant="outline" className="font-mono">EchoToken {result.echo_token}</Badge>}
                {result.log_id && <Badge variant="outline" className="font-mono">log {result.log_id.slice(0, 8)}…</Badge>}
                {selectedAcc?.hotel_code && <Badge variant="outline">HotelCode {selectedAcc.hotel_code}</Badge>}
              </div>
              {result.error && (
                <div className="text-destructive whitespace-pre-wrap break-all">錯誤：{result.error}</div>
              )}
              {r && (
                <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                  <span>旭海回傳 {r.totals.remote} 筆 / 我方 {r.totals.ours} 筆</span>
                  <span>· matched {r.totals.matched}</span>
                  <span>· missing {r.totals.missing}</span>
                  <span>· mismatch {r.totals.mismatch}</span>
                  <span>· unused {r.totals.unused}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {r && (
        <>
          <ReportSection
            title="✅ matched（對得上）"
            count={r.matched.length}
            empty="無對應成功項目"
            tone="default"
            columns={["RoomID（旭海）", "RoomTypeCode", "我方房型"]}
            rows={r.matched.map((m) => [m.hotelnabe_room_id ?? "—", m.hotelnabe_room_type_code, m.our_room_type_name])}
          />
          <ReportSection
            title="⚠️ missing_on_our_side（旭海有、我方查無）"
            count={r.missing_on_our_side.length}
            empty="無此分類"
            tone="warn"
            columns={["RoomID（旭海）", "RoomTypeCode"]}
            rows={r.missing_on_our_side.map((m) => [m.hotelnabe_room_id ?? "—", m.hotelnabe_room_type_code])}
          />
          <ReportSection
            title="❌ mismatch（旭海未回傳 RoomTypeCode 或非數字）"
            count={r.mismatch.length}
            empty="無此分類"
            tone="error"
            columns={["RoomID（旭海）", "RoomTypeCode", "原因"]}
            rows={r.mismatch.map((m) => [m.hotelnabe_room_id ?? "—", m.hotelnabe_room_type_code ?? "—", m.reason])}
          />
          <ReportSection
            title="ℹ️ unused_on_our_side（我方有 numeric_code 但旭海未回傳）"
            count={r.unused_on_our_side.length}
            empty="無此分類"
            tone="muted"
            columns={["我方房型", "numeric_code"]}
            rows={r.unused_on_our_side.map((m) => [m.our_room_type_name, String(m.numeric_code)])}
          />
        </>
      )}
    </div>
  );
}

function ReportSection({
  title, count, empty, columns, rows, tone,
}: {
  title: string;
  count: number;
  empty: string;
  columns: string[];
  rows: (string | number)[][];
  tone: "default" | "warn" | "error" | "muted";
}) {
  const Icon = tone === "error" ? XCircle : tone === "warn" ? AlertTriangle : tone === "muted" ? undefined : CheckCircle2;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
          <Badge variant="outline">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) => (
                    <TableCell key={j} className={j === 0 ? "font-mono text-sm" : "text-sm"}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
