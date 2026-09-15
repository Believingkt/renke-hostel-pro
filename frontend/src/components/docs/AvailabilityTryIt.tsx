import * as React from "react";
import { format, addDays } from "date-fns";
import { CalendarIcon, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const BASE_URL = "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api";

function toYMD(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : "";
}

export function AvailabilityTryIt() {
  const today = React.useMemo(() => new Date(), []);
  const [apiKey, setApiKey] = React.useState<string>("");
  const [from, setFrom] = React.useState<Date | undefined>(today);
  const [to, setTo] = React.useState<Date | undefined>(addDays(today, 6));
  const [roomTypeId, setRoomTypeId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<number | null>(null);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [response, setResponse] = React.useState<string>("");
  const [requestUrl, setRequestUrl] = React.useState<string>("");

  const handleRun = async () => {
    if (!apiKey.trim()) {
      toast.error("請先貼上 API Key");
      return;
    }
    if (!from || !to) {
      toast.error("請選擇 from / to 日期");
      return;
    }
    const params = new URLSearchParams({ from: toYMD(from), to: toYMD(to) });
    if (roomTypeId.trim()) params.set("room_type_id", roomTypeId.trim());
    const url = `${BASE_URL}/availability?${params.toString()}`;
    setRequestUrl(url);
    setLoading(true);
    setStatus(null);
    setDuration(null);
    setResponse("");
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "x-api-key": apiKey.trim() },
      });
      const elapsed = Math.round(performance.now() - started);
      setStatus(res.status);
      setDuration(elapsed);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
      if (res.ok) toast.success(`成功回應 ${res.status}（${elapsed}ms）`);
      else toast.error(`錯誤 ${res.status}`);
    } catch (e: any) {
      setStatus(0);
      setResponse(`Network error: ${e?.message ?? String(e)}`);
      toast.error("網路錯誤");
    } finally {
      setLoading(false);
    }
  };

  const curl = React.useMemo(() => {
    const params = new URLSearchParams({ from: toYMD(from), to: toYMD(to) });
    if (roomTypeId.trim()) params.set("room_type_id", roomTypeId.trim());
    return `curl -X GET '${BASE_URL}/availability?${params.toString()}' \\
  -H 'x-api-key: ${apiKey.trim() || "YOUR_API_KEY"}'`;
  }, [from, to, roomTypeId, apiKey]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="tryit-apikey">API Key</Label>
          <Input
            id="tryit-apikey"
            type="password"
            autoComplete="off"
            placeholder="acc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            僅暫存於瀏覽器記憶體，不會送出到本站伺服器；正式串接請放後端。
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>from（起始日期，含當日）</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !from && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {from ? toYMD(from) : <span>選擇日期</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={from}
                onSelect={setFrom}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label>to（結束日期，含當日；≤ 60 天）</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !to && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {to ? toYMD(to) : <span>選擇日期</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={to}
                onSelect={setTo}
                disabled={(d) => (from ? d < from : false)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="tryit-rtid">room_type_id（選填，可用逗號分隔多個）</Label>
          <Input
            id="tryit-rtid"
            placeholder="uuid-1,uuid-2  留空則回本館全部房型"
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleRun} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {loading ? "呼叫中…" : "呼叫 GET /availability"}
        </Button>
        {status !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-2 text-sm font-mono px-2 py-1 rounded",
              status >= 200 && status < 300
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            )}
          >
            <span>HTTP {status || "ERR"}</span>
            {duration !== null && <span className="opacity-70">· {duration}ms</span>}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">實際請求 URL</Label>
          <pre className="mt-1 text-[12px] font-mono p-3 rounded-md border bg-muted/40 overflow-x-auto whitespace-pre-wrap break-all">
            {requestUrl || `${BASE_URL}/availability?from=${toYMD(from)}&to=${toYMD(to)}${roomTypeId.trim() ? `&room_type_id=${roomTypeId.trim()}` : ""}`}
          </pre>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">等效 cURL</Label>
          <pre className="mt-1 text-[12px] font-mono p-3 rounded-md border bg-muted/40 overflow-x-auto whitespace-pre-wrap break-all">
            {curl}
          </pre>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">回應</Label>
          <pre className="mt-1 text-[12px] font-mono p-3 rounded-md border bg-muted/40 overflow-x-auto whitespace-pre-wrap break-all min-h-[120px] max-h-[480px]">
            {response || "（尚未呼叫）"}
          </pre>
        </div>
      </div>
    </div>
  );
}
