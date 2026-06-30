import { Component, Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Inbox, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface LogRow {
  id: string;
  created_at: string;
  hotelnabe_hotel_code: string | null;
  ota_code: string | null;
  ota_res_id: string | null;
  hotelnabe_res_id: string | null;
  res_status: string | null;
  success: boolean | null;
  http_status: number | null;
  mode: string | null;
  error_message: string | null;
  parsed_order_id: string | null;
  request_xml: string | null;
  response_xml: string | null;
}

interface HotelMap {
  [hotelCode: string]: { accommodationId: string; name: string };
}

const PASSWORD_MASK_RE = /(<Password[^>]*>)([^<]*)(<\/Password>)/gi;
function maskXml(xml: string | null): string {
  if (!xml) return "";
  return xml.replace(PASSWORD_MASK_RE, "$1********$3");
}

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || "未知錯誤" };
  }
  componentDidCatch(err: Error) {
    console.error("[HotelNabeInboundLog] crashed:", err);
  }
  render() {
    if (this.state.error) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            載入失敗：{this.state.error}
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function Content() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hotelMap, setHotelMap] = useState<HotelMap>({});

  const [successFilter, setSuccessFilter] = useState<string>("all"); // all|success|failed
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: logData, error: logErr }, { data: cfgData }] = await Promise.all([
        supabase
          .from("hotelnabe_order_inbound_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("accommodation_hotelnabe_config")
          .select("hotelnabe_hotel_code, accommodation_id, accommodation_info(name)"),
      ]);
      if (logErr) throw logErr;
      setRows((logData ?? []) as LogRow[]);
      const map: HotelMap = {};
      ((cfgData ?? []) as Array<{
        hotelnabe_hotel_code: string | null;
        accommodation_id: string;
        accommodation_info: { name: string } | null;
      }>).forEach((r) => {
        if (r.hotelnabe_hotel_code) {
          map[r.hotelnabe_hotel_code] = {
            accommodationId: r.accommodation_id,
            name: r.accommodation_info?.name ?? r.hotelnabe_hotel_code,
          };
        }
      });
      setHotelMap(map);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.res_status && s.add(r.res_status));
    return Array.from(s).sort();
  }, [rows]);

  const hotelOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.hotelnabe_hotel_code && s.add(r.hotelnabe_hotel_code));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (successFilter === "success" && !r.success) return false;
    if (successFilter === "failed" && r.success) return false;
    if (statusFilter !== "all" && r.res_status !== statusFilter) return false;
    if (hotelFilter !== "all" && r.hotelnabe_hotel_code !== hotelFilter) return false;
    return true;
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              旭海收訂單記錄
            </CardTitle>
            <CardDescription>
              hotelnabe_order_inbound_log,顯示最近 100 筆。唯讀。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">成功/失敗</label>
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失敗</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">ResStatus</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">物業 (HotelCode)</label>
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {hotelOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}{hotelMap[c] ? ` · ${hotelMap[c].name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            載入失敗:{err}
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {loading ? "載入中…" : "目前沒有任何記錄"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="whitespace-nowrap">時間</TableHead>
                  <TableHead>HotelCode</TableHead>
                  <TableHead>OTA</TableHead>
                  <TableHead>OTA ResId</TableHead>
                  <TableHead>HNabe ResId</TableHead>
                  <TableHead>ResStatus</TableHead>
                  <TableHead>結果</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="max-w-[280px]">錯誤訊息</TableHead>
                  <TableHead>訂單</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const hotelName = r.hotelnabe_hotel_code ? hotelMap[r.hotelnabe_hotel_code]?.name : null;
                  return (
                    <Fragment key={r.id}>
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => toggle(r.id)}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-xs">
                          {format(new Date(r.created_at), "MM/dd HH:mm:ss")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.hotelnabe_hotel_code ?? "-"}
                          {hotelName && (
                            <div className="text-[10px] text-muted-foreground">{hotelName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.ota_code ?? "-"}</TableCell>
                        <TableCell className="text-xs font-mono">{r.ota_res_id ?? "-"}</TableCell>
                        <TableCell className="text-xs font-mono">{r.hotelnabe_res_id ?? "-"}</TableCell>
                        <TableCell className="text-xs">{r.res_status ?? "-"}</TableCell>
                        <TableCell>
                          {r.success ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">成功</Badge>
                          ) : (
                            <Badge variant="destructive">失敗</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{r.http_status ?? "-"}</TableCell>
                        <TableCell className="text-xs">
                          {r.mode ? (
                            <Badge variant={r.mode === "live" ? "default" : "outline"}>{r.mode}</Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs text-destructive truncate" title={r.error_message ?? ""}>
                          {r.error_message ?? ""}
                        </TableCell>
                        <TableCell>
                          {r.parsed_order_id ? (
                            <Link
                              to={`/orders?id=${r.parsed_order_id}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              查看 <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={12} className="p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs font-semibold mb-1">Request XML (密碼遮罩)</div>
                                <pre className="text-[11px] bg-background border rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                  {maskXml(r.request_xml) || "(空)"}
                                </pre>
                              </div>
                              <div>
                                <div className="text-xs font-semibold mb-1">Response XML</div>
                                <pre className="text-[11px] bg-background border rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                  {r.response_xml || "(空)"}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          顯示 {filtered.length} / {rows.length} 筆。寫入由 hotelnabe-order-receiver Edge Function 產生,僅 HQ admin 可存取。
        </p>
      </CardContent>
    </Card>
  );
}

export function HotelNabeInboundLog() {
  return (
    <Boundary>
      <Content />
    </Boundary>
  );
}
