import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlayCircle, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface AccOption { id: string; name: string; hotel_code: string | null; sync_enabled: boolean }

interface RoomResult {
  room_type_id: string;
  room_type_name: string;
  inv_type_code: string;
  total_days: number;
  available_days: number;
  closed_days: number;
  no_rip_days: number;
  merged_messages: { start: string; end: string; booking_limit: number; nights: number }[];
  merged_message_count: number;
  expected_no_price_dates: string[];
  expected_no_price_count: number;
  enqueued: number;
  already_pending: number;
}
interface BackfillResult {
  ok: boolean;
  mode: "dryrun" | "enqueue";
  accommodation_id: string;
  hotel_code: string;
  from_date: string;
  to_date: string;
  span_days: number;
  price_max_date: string;
  rooms: RoomResult[];
  totals: {
    rooms: number;
    merged_messages: number;
    enqueued: number;
    already_pending: number;
    expected_no_price: number;
  };
  error?: string;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export function HotelNabeBackfillPanel() {
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(todayISO());
  const [toDate, setToDate] = useState<string>("2026-12-30");
  const [priceMax, setPriceMax] = useState<string>("2026-12-30");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("accommodation_hotelnabe_config")
        .select("hotelnabe_hotel_code, sync_enabled, accommodation_info:accommodation_id (id, name)")
        .order("hotelnabe_hotel_code");
      if (error) { toast.error("載入設定失敗：" + error.message); return; }
      const opts: AccOption[] = (data ?? [])
        .map((r: any) => ({
          id: r.accommodation_info?.id,
          name: r.accommodation_info?.name ?? "(未命名)",
          hotel_code: r.hotelnabe_hotel_code ?? null,
          sync_enabled: !!r.sync_enabled,
        }))
        .filter((r) => !!r.id);
      setAccs(opts);
      const sensan = opts.find((o) => o.id === "8e3e8866-3cb0-4654-91f3-d9b09a543301");
      setSelected(sensan?.id ?? opts[0]?.id ?? "");
    })();
  }, []);

  const selectedAcc = useMemo(() => accs.find((a) => a.id === selected), [accs, selected]);

  const run = async (mode: "dryrun" | "enqueue") => {
    if (!selected) return;
    if (mode === "enqueue") {
      const ok = window.confirm(
        `確定要把 ${fromDate} ~ ${toDate} 排入 queue？\n這會交給既有 cron worker 於 live 模式下實際推送到旭海。`,
      );
      if (!ok) return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("hotelnabe-backfill-inventory", {
        body: {
          accommodation_id: selected,
          from_date: fromDate,
          to_date: toDate,
          mode,
          price_max_date: priceMax,
        },
      });
      if (error) {
        toast.error("呼叫失敗：" + (error.message ?? String(error)));
        setResult({ ok: false, error: error.message } as any);
      } else {
        setResult(data as BackfillResult);
        if ((data as BackfillResult)?.ok) {
          toast.success(mode === "dryrun"
            ? `DRYRUN 完成，共 ${(data as BackfillResult).totals.merged_messages} 筆合併訊息`
            : `已排入 ${(data as BackfillResult).totals.enqueued} 筆（已存在 pending：${(data as BackfillResult).totals.already_pending}）`);
        } else {
          toast.error("執行失敗：" + ((data as any)?.error ?? "未知錯誤"));
        }
      }
    } catch (e: any) {
      toast.error("呼叫失敗：" + (e?.message ?? String(e)));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>旭海 ARI 補推（Backfill）</CardTitle>
          <CardDescription>
            對指定物業 + 日期範圍，將每個房型每日排入 <code className="text-xs">hotelnabe_ari_push_queue</code>
            （reason=<code className="text-xs">backfill</code>，去重靠既有 pending 唯一索引），交給既有 cron worker 推送。
            預設 <b>DRYRUN</b>：不 enqueue、只回傳每日 remaining、合併後訊息、與預期會被 450 skip 的日期。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>物業</Label>
              <Select value={selected} onValueChange={setSelected} disabled={loading}>
                <SelectTrigger><SelectValue placeholder="選擇物業" /></SelectTrigger>
                <SelectContent>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.hotel_code ? `（${a.hotel_code}）` : ""}{a.sync_enabled ? "  ✅ sync" : "  ⛔ sync off"}
                    </SelectItem>
                  ))}
                  {accs.length === 0 && <SelectItem value="__none__" disabled>尚無物業</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>起日</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>迄日（含）</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>房價上限日（超過視為預期 450 skip）</Label>
              <Input type="date" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} disabled={loading} />
            </div>
            <div className="flex items-end gap-2 md:col-span-3">
              <Button variant="outline" size="sm" onClick={() => { setFromDate(todayISO()); setToDate("2026-12-30"); }}>
                今天 ~ 2026-12-30
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setFromDate(todayISO()); setToDate(addMonths(todayISO(), 3)); }}>
                今天 + 3 個月
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run("dryrun")} disabled={!selected || loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              DRYRUN 預覽
            </Button>
            <Button onClick={() => run("enqueue")} disabled={!selected || loading || !selectedAcc?.sync_enabled}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              實際排入 queue（live）
            </Button>
            {!selectedAcc?.sync_enabled && (
              <span className="text-xs text-muted-foreground self-center">
                <AlertTriangle className="inline h-3 w-3 mr-1" />該物業 sync_enabled = false，無法 enqueue
              </span>
            )}
          </div>

          {result?.ok && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge>mode {result.mode}</Badge>
                <Badge variant="outline">HotelCode {result.hotel_code}</Badge>
                <Badge variant="outline">{result.from_date} ~ {result.to_date}</Badge>
                <Badge variant="outline">{result.span_days} 天</Badge>
                <Badge variant="outline">合併訊息 {result.totals.merged_messages}</Badge>
                {result.mode === "enqueue" && (
                  <>
                    <Badge>已 enqueue {result.totals.enqueued}</Badge>
                    <Badge variant="outline">重複跳過 {result.totals.already_pending}</Badge>
                  </>
                )}
                {result.totals.expected_no_price > 0 && (
                  <Badge variant="destructive">預期 450 skip {result.totals.expected_no_price} 天</Badge>
                )}
              </div>
            </div>
          )}

          {result?.ok && result.rooms.map((r) => (
            <Card key={r.room_type_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {r.room_type_name}
                  <Badge variant="outline" className="font-mono">InvType {r.inv_type_code}</Badge>
                  <Badge variant="outline">available {r.available_days}</Badge>
                  <Badge variant="outline">closed {r.closed_days}</Badge>
                  {r.no_rip_days > 0 && <Badge variant="destructive">無 RIP {r.no_rip_days}</Badge>}
                  {r.expected_no_price_count > 0 && (
                    <Badge variant="destructive">預期 450 skip {r.expected_no_price_count}</Badge>
                  )}
                  {result.mode === "enqueue" && <Badge>enqueued {r.enqueued}</Badge>}
                </CardTitle>
                <CardDescription>合併後 AvailStatusMessage 共 {r.merged_message_count} 筆</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Start</TableHead><TableHead>End</TableHead>
                      <TableHead className="text-right">Nights</TableHead>
                      <TableHead className="text-right">BookingLimit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.merged_messages.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{m.start}</TableCell>
                        <TableCell className="font-mono text-xs">{m.end}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.nights}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant={m.booking_limit === 0 ? "destructive" : "outline"}>{m.booking_limit}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {r.expected_no_price_count > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <b>預期 450 skip 日期：</b>{r.expected_no_price_dates.slice(0, 20).join("、")}
                    {r.expected_no_price_dates.length > 20 && ` …（共 ${r.expected_no_price_dates.length}）`}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
