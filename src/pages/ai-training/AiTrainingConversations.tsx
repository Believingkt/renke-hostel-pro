import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, SkipForward, ExternalLink, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, subDays, startOfDay } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Rating = "good" | "bad" | null;

interface LogRow {
  id: string;
  session_id: string;
  prompt_version: number | null;
  messages: Array<{ role: string; content: string }>;
  user_rating: Rating;
  admin_note: string | null;
  created_at: string;
}

export default function AiTrainingConversations() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<"all" | "none" | "good" | "bad">("all");
  const [versionFilter, setVersionFilter] = useState<string>("all");
  const [versionOptions, setVersionOptions] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [dateOpen, setDateOpen] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    today: 0,
    week: 0,
    goodRate: 0,
    unrated: 0,
  });

  const selected = useMemo(() => logs.find((l) => l.id === selectedId) || null, [logs, selectedId]);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    setNoteDraft(selected?.admin_note ?? "");
  }, [selectedId]);

  const loadVersions = async () => {
    const { data } = await supabase
      .from("ai_prompts")
      .select("version")
      .order("version", { ascending: false });
    setVersionOptions((data || []).map((d: any) => d.version));
  };

  const loadStats = async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

    const [{ count: tc }, { count: wc }, { data: rated }, { count: unrated }] = await Promise.all([
      supabase
        .from("ai_conversation_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart),
      supabase
        .from("ai_conversation_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekStart),
      supabase
        .from("ai_conversation_logs")
        .select("user_rating")
        .gte("created_at", weekStart)
        .not("user_rating", "is", null),
      supabase
        .from("ai_conversation_logs")
        .select("id", { count: "exact", head: true })
        .is("user_rating", null),
    ]);

    const good = (rated || []).filter((r: any) => r.user_rating === "good").length;
    const total = rated?.length || 0;
    setStats({
      today: tc ?? 0,
      week: wc ?? 0,
      goodRate: total > 0 ? Math.round((good / total) * 100) : 0,
      unrated: unrated ?? 0,
    });
  };

  const loadLogs = async () => {
    setLoading(true);
    let q = supabase
      .from("ai_conversation_logs")
      .select("*")
      .gte("created_at", startOfDay(dateRange.from).toISOString())
      .lte("created_at", new Date(dateRange.to.getTime() + 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    if (ratingFilter === "none") q = q.is("user_rating", null);
    else if (ratingFilter === "good" || ratingFilter === "bad") q = q.eq("user_rating", ratingFilter);

    if (versionFilter !== "all") q = q.eq("prompt_version", Number(versionFilter));

    const { data, error } = await q;
    if (error) {
      toast.error("讀取失敗：" + error.message);
    }
    setLogs((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadVersions();
    void loadStats();
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [ratingFilter, versionFilter, dateRange.from, dateRange.to]);

  const saveNote = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("ai_conversation_logs")
      .update({ admin_note: noteDraft })
      .eq("id", selected.id);
    if (error) return toast.error("備註儲存失敗");
    setLogs((prev) => prev.map((l) => (l.id === selected.id ? { ...l, admin_note: noteDraft } : l)));
    toast.success("備註已儲存");
  };

  const setRating = async (rating: Rating) => {
    if (!selected) return;
    const { error } = await supabase
      .from("ai_conversation_logs")
      .update({ user_rating: rating })
      .eq("id", selected.id);
    if (error) return toast.error("評分失敗");
    setLogs((prev) => prev.map((l) => (l.id === selected.id ? { ...l, user_rating: rating } : l)));
    void loadStats();
    toast.success(rating === null ? "已略過" : "已評分");
  };

  const convertToExample = () => {
    if (!selected) return;
    const userMsg = selected.messages.find((m) => m.role === "user")?.content || "";
    const assistantMsg = [...selected.messages].reverse().find((m) => m.role === "assistant")?.content || "";
    const params = new URLSearchParams({
      prefill: "true",
      user_message: userMsg.slice(0, 500),
      ideal_response: assistantMsg.slice(0, 1000),
    });
    window.open(`/hq/ai-training/examples?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">今日對話數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">本週對話數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.week}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">本週好評率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12">
                <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" className="stroke-muted" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    className="stroke-primary"
                    strokeWidth="3"
                    strokeDasharray={`${(stats.goodRate / 100) * 100.5} 100.5`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="text-2xl font-bold">{stats.goodRate}%</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">未評分數量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unrated}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(dateRange.from, "MM/dd")} ~ {format(dateRange.to, "MM/dd")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(r: any) => {
                if (r?.from && r?.to) {
                  setDateRange({ from: r.from, to: r.to });
                  setDateOpen(false);
                }
              }}
              numberOfMonths={2}
              locale={zhTW}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Select value={ratingFilter} onValueChange={(v: any) => setRatingFilter(v)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部評分</SelectItem>
            <SelectItem value="none">未評分</SelectItem>
            <SelectItem value="good">👍 好評</SelectItem>
            <SelectItem value="bad">👎 壞評</SelectItem>
          </SelectContent>
        </Select>

        <Select value={versionFilter} onValueChange={setVersionFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部版本</SelectItem>
            {versionOptions.map((v) => (
              <SelectItem key={v} value={String(v)}>v{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main two-column */}
      <div className="grid lg:grid-cols-[380px_1fr] gap-4 min-h-[500px]">
        {/* List */}
        <div className="border rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 text-xs text-muted-foreground bg-muted border-b">
            共 {logs.length} 筆
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {loading && <div className="p-4 text-sm text-muted-foreground">載入中…</div>}
            {!loading && logs.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">沒有資料</div>
            )}
            {logs.map((log) => {
              const firstUser = log.messages.find((m) => m.role === "user")?.content || "(無訊息)";
              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedId(log.id)}
                  className={cn(
                    "w-full text-left border-b px-3 py-2.5 hover:bg-muted/50 transition-colors",
                    selectedId === log.id && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(log.created_at), "MM/dd HH:mm")}</span>
                    <span className="font-mono">…{log.session_id.slice(-6)}</span>
                  </div>
                  <div className="text-sm mt-1 truncate">{firstUser}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {log.messages.length} 則
                    </Badge>
                    {log.prompt_version && (
                      <Badge variant="outline" className="text-[10px] h-5">v{log.prompt_version}</Badge>
                    )}
                    {log.user_rating === "good" && <span>👍</span>}
                    {log.user_rating === "bad" && <span>👎</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="border rounded-lg flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              請從左側選擇一筆對話
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-3 text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-mono">{selected.session_id}</span> · {format(new Date(selected.created_at), "yyyy/MM/dd HH:mm")}
                </div>
                <div>
                  版本 {selected.prompt_version ? `v${selected.prompt_version}` : "—"} · {selected.messages.length} 則訊息
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[500px]">
                {selected.messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground ml-auto"
                        : "bg-muted"
                    )}
                  >
                    {m.content}
                  </div>
                ))}
              </div>

              <div className="border-t p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={selected.user_rating === "good" ? "default" : "outline"}
                    onClick={() => setRating("good")}
                  >
                    <ThumbsUp className="h-4 w-4 mr-1" /> 好評
                  </Button>
                  <Button
                    size="sm"
                    variant={selected.user_rating === "bad" ? "default" : "outline"}
                    onClick={() => setRating("bad")}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" /> 壞評
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRating(null)}>
                    <SkipForward className="h-4 w-4 mr-1" /> 略過
                  </Button>
                  <div className="ml-auto">
                    <Button size="sm" variant="outline" onClick={convertToExample}>
                      <ExternalLink className="h-4 w-4 mr-1" /> 轉為訓練範例
                    </Button>
                  </div>
                </div>
                <Textarea
                  placeholder="備註（自動儲存）"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={saveNote}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
