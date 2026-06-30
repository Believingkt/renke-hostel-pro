import { Component, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Send, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface AccOption {
  id: string;
  name: string;
  hotel_code: string | null;
}

interface RoomOption {
  id: string;
  name: string;
  numeric_code: number;
}

interface PushResult {
  success: boolean;
  mode?: "dryrun" | "live";
  log_id?: string;
  http_status?: number;
  echo_token?: string;
  request_xml_preview?: string;
  response_xml?: string | null;
  summary?: Record<string, unknown> | null;
  error?: string | null;
}

export function HotelNabePushInventory() {
  return (
    <PushBoundary>
      <HotelNabePushContent />
    </PushBoundary>
  );
}

class PushBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error?.message ?? "推送庫存區塊顯示失敗" };
  }
  render() {
    if (this.state.error) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>推送庫存（測試）</CardTitle>
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
  return { message: fallback };
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function HotelNabePushContent() {
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [selectedAcc, setSelectedAcc] = useState<string>("");
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [invTypeCode, setInvTypeCode] = useState<string>("1063");
  const [opType, setOpType] = useState<"booking_limit" | "close" | "open">("booking_limit");
  const [bookingLimit, setBookingLimit] = useState<string>("5");
  const [start, setStart] = useState<string>(todayPlus(60));
  const [end, setEnd] = useState<string>(todayPlus(62));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
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
            id: r?.accommodation_info?.id,
            name: r?.accommodation_info?.name ?? "(未命名)",
            hotel_code: r?.hotelnabe_hotel_code ?? null,
          }))
          .filter((r) => !!r.id);
        setAccs(opts);
        const sensan = opts.find((o) => o.id === "8e3e8866-3cb0-4654-91f3-d9b09a543301");
        if (sensan) setSelectedAcc(sensan.id);
        else if (opts[0]) setSelectedAcc(opts[0].id);
      } catch (e: any) {
        toast.error("載入物業失敗：" + (e?.message ?? String(e)));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAcc) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("room_types")
          .select("id, name, numeric_code")
          .eq("accommodation_id", selectedAcc)
          .not("numeric_code", "is", null)
          .order("numeric_code");
        if (error) {
          toast.error("載入房型失敗：" + error.message);
          return;
        }
        const opts: RoomOption[] = (data ?? [])
          .filter((r: any) => r.numeric_code != null)
          .map((r: any) => ({ id: r.id, name: r.name, numeric_code: Number(r.numeric_code) }));
        setRooms(opts);
        const pkg = opts.find((o) => o.numeric_code === 1063);
        if (pkg) setInvTypeCode("1063");
        else if (opts[0]) setInvTypeCode(String(opts[0].numeric_code));
      } catch (e: any) {
        toast.error("載入房型失敗：" + (e?.message ?? String(e)));
      }
    })();
  }, [selectedAcc]);

  const selectedAccObj = useMemo(() => accs.find((a) => a.id === selectedAcc), [accs, selectedAcc]);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const body: any = {
        accommodation_id: selectedAcc,
        op_type: opType,
        inv_type_code: invTypeCode,
        start, end,
      };
      if (opType === "booking_limit") body.booking_limit = Number(bookingLimit);
      const { data, error } = await supabase.functions.invoke("hotelnabe-push-inventory", { body });
      if (error) {
        const { message: msg, httpStatus } = await parseFunctionError(error);
        setResult({ success: false, http_status: httpStatus, error: String(msg) });
        toast.error(`呼叫失敗${httpStatus ? `（HTTP ${httpStatus}）` : ""}：${msg}`);
      } else {
        const r = data as PushResult;
        setResult(r);
        if (r?.success) toast.success(`${r.mode === "live" ? "已推送" : "Dryrun 完成"}`);
        else toast.error("推送未成功：" + (r?.error ?? "請見下方訊息"));
      }
    } catch (e: any) {
      setResult({ success: false, error: e?.message ?? String(e) });
      toast.error("呼叫失敗：" + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>推送庫存（測試）</CardTitle>
          <CardDescription>
            觸發 <code className="text-xs">hotelnabe-push-inventory</code>，組
            <code className="text-xs"> OTA_HotelAvailNotifRQ </code>送至旭海
            <code className="text-xs"> /pms/inventory </code>。預設 dryrun（不會真的推），需 ops 切 <code>HOTELNABE_PUSH_MODE=live</code> 才會送出。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>正式環境</AlertTitle>
            <AlertDescription>
              此面板對接旭海**正式環境**。請務必使用遠期日期測試（預設 +60 天），測完記得人工還原；BookingLimit 會直接覆蓋遠端房量。
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>物業</Label>
              <Select value={selectedAcc} onValueChange={setSelectedAcc} disabled={loading}>
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
            <div className="space-y-2">
              <Label>房型（PMS numeric_code → InvTypeCode）</Label>
              <Select value={invTypeCode} onValueChange={setInvTypeCode} disabled={loading || rooms.length === 0}>
                <SelectTrigger><SelectValue placeholder="選擇房型" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={String(r.numeric_code)}>
                      {r.name}（{r.numeric_code}）
                    </SelectItem>
                  ))}
                  {rooms.length === 0 && <SelectItem value="__none__" disabled>無 numeric_code 的房型</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start（YYYY-MM-DD）</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>End（YYYY-MM-DD，含當日）</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>操作類型</Label>
              <Select value={opType} onValueChange={(v) => setOpType(v as any)} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking_limit">設房量（BookingLimit）</SelectItem>
                  <SelectItem value="close">關房（RestrictionStatus=Close）</SelectItem>
                  <SelectItem value="open">開房（RestrictionStatus=Open）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {opType === "booking_limit" && (
              <div className="space-y-2">
                <Label>BookingLimit（房量）</Label>
                <Input
                  type="number" min={0} step={1}
                  value={bookingLimit}
                  onChange={(e) => setBookingLimit(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleRun}
              disabled={loading || !selectedAcc || !invTypeCode}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              觸發推送
            </Button>
            {selectedAccObj?.hotel_code && <Badge variant="outline">HotelCode {selectedAccObj.hotel_code}</Badge>}
          </div>

          {result && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {result.success
                  ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> success</Badge>
                  : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> failed</Badge>}
                {result.mode && <Badge variant={result.mode === "live" ? "default" : "outline"}>{result.mode}</Badge>}
                {result.http_status != null && result.http_status !== 0 && (
                  <Badge variant="outline">HTTP {result.http_status}</Badge>
                )}
                {result.echo_token && <Badge variant="outline" className="font-mono">EchoToken {result.echo_token}</Badge>}
                {result.log_id && <Badge variant="outline" className="font-mono">log {result.log_id.slice(0, 8)}…</Badge>}
              </div>
              {result.error && (
                <div className="text-destructive whitespace-pre-wrap break-all">錯誤：{result.error}</div>
              )}
              {result.request_xml_preview && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Request XML（已遮罩密碼）</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all bg-muted/30 p-2 rounded">{result.request_xml_preview}</pre>
                </details>
              )}
              {result.response_xml && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Response XML</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all bg-muted/30 p-2 rounded">{result.response_xml}</pre>
                </details>
              )}
              {result.summary && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Summary</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all bg-muted/30 p-2 rounded">
                    {JSON.stringify(result.summary, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
