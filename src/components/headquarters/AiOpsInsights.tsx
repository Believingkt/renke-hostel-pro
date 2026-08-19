/**
 * 總部後台 → 營運分析 → AI 營運洞察
 *
 * 三層結構：
 *  1. GenAI 摘要（進頁面讀快取，可手動重新生成）
 *  2. AI 異常判讀（每項附真實數字）
 *  3. AI 洞察卡（落庫、可指派負責人、可追蹤狀態、含改善前／後成效對照）
 *
 * 效能：沒有任何排程，只在讀快取與手動重新生成時呼叫模型。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Sparkles, AlertTriangle, PlusCircle, CheckCircle2, Loader2 } from "lucide-react";

interface AccommodationOption {
  id: string;
  name: string;
}

interface Anomaly {
  key?: string;
  title?: string;
  severity?: string;
  metrics?: { label: string; value: string }[];
  root_cause?: string;
  recommended_action?: string;
}

interface InsightCard {
  id: string;
  accommodation_id: string | null;
  period_days: number;
  signal_key: string | null;
  issue_summary: string;
  key_metrics: { label: string; value: string }[] | null;
  root_cause: string | null;
  recommended_action: string | null;
  assignee_id: string | null;
  status: string;
  baseline_snapshot: Record<string, number | string | null> | null;
  followup_snapshot: Record<string, number | string | null> | null;
  completed_at: string | null;
  created_at: string;
}

const PERIODS = [7, 14, 30];
const STATUS_LABEL: Record<string, string> = {
  pending: "待處理",
  in_progress: "進行中",
  completed: "已完成",
};
const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};
const SNAPSHOT_LABEL: Record<string, string> = {
  sessions: "造訪工作階段",
  orders: "訂單數",
  conversion_rate: "轉換率(%)",
  room_view_sessions: "瀏覽房型階段",
  revenue: "營收",
  addon_rate: "加購率(%)",
  ai_conversations: "AI 對話數",
  line_conversion_rate: "LINE 成單率(%)",
  trip_orders: "行程訂單",
};

export function AiOpsInsights({ accommodations }: { accommodations: AccommodationOption[] }) {
  const { toast } = useToast();
  const [periodDays, setPeriodDays] = useState(30);
  const [accId, setAccId] = useState<string>("all");
  const [summary, setSummary] = useState<string>("");
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const scopeId = accId === "all" ? null : accId;

  const loadCache = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("ai_ops_insight_cache")
      .select("summary, anomalies, metrics, generated_at")
      .eq("period_days", periodDays);
    q = scopeId ? q.eq("accommodation_id", scopeId) : q.is("accommodation_id", null);
    const { data } = await q.maybeSingle();
    setSummary(data?.summary ?? "");
    setAnomalies((data?.anomalies as Anomaly[]) ?? []);
    setMetrics(data?.metrics ?? null);
    setGeneratedAt(data?.generated_at ?? null);
    setLoading(false);
  }, [periodDays, scopeId]);

  const loadCards = useCallback(async () => {
    let q = supabase
      .from("ai_insight_cards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    q = scopeId ? q.eq("accommodation_id", scopeId) : q;
    const { data } = await q;
    setCards((data as unknown as InsightCard[]) ?? []);
  }, [scopeId]);

  useEffect(() => {
    loadCache();
    loadCards();
  }, [loadCache, loadCards]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, name, email")
      .order("name")
      .limit(200)
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  const regenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-ops-insights", {
        body: { action: "generate", accommodation_id: scopeId, period_days: periodDays },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary ?? "");
      setAnomalies(data.anomalies ?? []);
      setMetrics(data.metrics ?? null);
      setGeneratedAt(data.generated_at ?? null);
      toast({ title: "AI 洞察已更新" });
    } catch (e) {
      toast({ title: "生成失敗", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const fetchSnapshot = async () => {
    const { data } = await supabase.functions.invoke("ai-ops-insights", {
      body: { action: "snapshot", accommodation_id: scopeId, period_days: periodDays },
    });
    return data?.snapshot ?? null;
  };

  const createCard = async (a: Anomaly) => {
    setBusyCardId(a.key ?? a.title ?? "new");
    try {
      const snapshot = await fetchSnapshot();
      const { error } = await supabase.from("ai_insight_cards").insert({
        accommodation_id: scopeId,
        period_days: periodDays,
        signal_key: a.key ?? null,
        issue_summary: a.title ?? "未命名異常",
        key_metrics: a.metrics ?? [],
        root_cause: a.root_cause ?? null,
        recommended_action: a.recommended_action ?? null,
        baseline_snapshot: snapshot,
        baseline_captured_at: new Date().toISOString(),
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "洞察卡已建立" });
      loadCards();
    } catch (e) {
      toast({ title: "建立失敗", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyCardId(null);
    }
  };

  const updateCard = async (id: string, patch: Record<string, unknown>) => {
    setBusyCardId(id);
    const { error } = await supabase.from("ai_insight_cards").update(patch).eq("id", id);
    setBusyCardId(null);
    if (error) {
      toast({ title: "更新失敗", description: error.message, variant: "destructive" });
      return;
    }
    loadCards();
  };

  const captureFollowup = async (card: InsightCard) => {
    setBusyCardId(card.id);
    const snapshot = await fetchSnapshot();
    setBusyCardId(null);
    if (!snapshot) {
      toast({ title: "抓取指標失敗", variant: "destructive" });
      return;
    }
    updateCard(card.id, { followup_snapshot: snapshot, followup_captured_at: new Date().toISOString() });
  };

  const funnel = metrics?.funnel;
  const accName = useMemo(
    () => (scopeId ? accommodations.find((a) => a.id === scopeId)?.name : "全館彙總"),
    [scopeId, accommodations],
  );

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={accId} onValueChange={setAccId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全館彙總</SelectItem>
            {accommodations.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border border-border">
          {PERIODS.map((d) => (
            <button
              key={d}
              onClick={() => setPeriodDays(d)}
              className={`px-3 py-1.5 text-sm ${periodDays === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {d} 天
            </button>
          ))}
        </div>
        <Button onClick={regenerate} disabled={generating} size="sm" className="gap-1">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新生成
        </Button>
        {generatedAt && (
          <span className="text-xs text-muted-foreground">
            生成時間：{new Date(generatedAt).toLocaleString("zh-TW")}
          </span>
        )}
      </div>

      {/* 功能一：GenAI 摘要 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 營運摘要（{accName}・最近 {periodDays} 天）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? null : summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">尚未生成，請按「重新生成」。</p>
          )}
          {funnel && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ["造訪", funnel.sessions],
                ["瀏覽房型", funnel.room_view_sessions],
                ["進入結帳", funnel.checkout_sessions],
                ["完成訂單", funnel.orders],
                ["轉換率", `${funnel.conversion_rate}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border border-border p-2">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-bold tabular-nums">{String(value)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 功能二：AI 異常判讀 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            AI 異常判讀
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {anomalies.length === 0 ? (
            <p className="text-sm text-muted-foreground">本期未偵測到異常訊號，或尚未生成。</p>
          ) : (
            anomalies.map((a, i) => (
              <div key={a.key ?? i} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={SEVERITY_STYLE[a.severity ?? "low"]}>
                    {a.severity === "high" ? "高" : a.severity === "medium" ? "中" : "低"}
                  </Badge>
                  <span className="text-sm font-semibold">{a.title}</span>
                </div>
                {!!a.metrics?.length && (
                  <div className="flex flex-wrap gap-2">
                    {a.metrics.map((m, k) => (
                      <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs tabular-nums">
                        {m.label}：{m.value}
                      </span>
                    ))}
                  </div>
                )}
                {a.root_cause && <p className="text-sm text-muted-foreground">可能原因：{a.root_cause}</p>}
                {a.recommended_action && <p className="text-sm">建議行動：{a.recommended_action}</p>}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={busyCardId === (a.key ?? a.title ?? "new")}
                  onClick={() => createCard(a)}
                >
                  <PlusCircle className="h-4 w-4" />
                  建立洞察卡
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 功能三：AI 洞察卡 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI 洞察卡（可追蹤的改善任務）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無洞察卡。</p>
          ) : (
            cards.map((c) => (
              <div key={c.id} className="rounded-md border border-border p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{c.issue_summary}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "completed" ? "default" : "secondary"}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("zh-TW")}
                    </span>
                  </div>
                </div>

                {!!c.key_metrics?.length && (
                  <div className="flex flex-wrap gap-2">
                    {c.key_metrics.map((m, k) => (
                      <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs tabular-nums">
                        {m.label}：{m.value}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">可能原因</div>
                    <Textarea
                      defaultValue={c.root_cause ?? ""}
                      rows={3}
                      onBlur={(e) =>
                        e.target.value !== (c.root_cause ?? "") && updateCard(c.id, { root_cause: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">建議行動</div>
                    <Textarea
                      defaultValue={c.recommended_action ?? ""}
                      rows={3}
                      onBlur={(e) =>
                        e.target.value !== (c.recommended_action ?? "") &&
                        updateCard(c.id, { recommended_action: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={c.assignee_id ?? "none"}
                    onValueChange={(v) => updateCard(c.id, { assignee_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="指派負責人" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未指派</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email || u.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={c.status} onValueChange={(v) => updateCard(c.id, { status: v })}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([v, label]) => (
                        <SelectItem key={v} value={v}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={busyCardId === c.id}
                    onClick={() => captureFollowup(c)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    抓取改善後指標
                  </Button>
                  {c.completed_at && (
                    <span className="text-xs text-muted-foreground">
                      完成於 {new Date(c.completed_at).toLocaleDateString("zh-TW")}
                    </span>
                  )}
                </div>

                {/* 成效對照 */}
                {c.baseline_snapshot && (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left font-medium">指標</th>
                          <th className="p-2 text-right font-medium">改善前</th>
                          <th className="p-2 text-right font-medium">改善後</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(SNAPSHOT_LABEL).map(([key, label]) => (
                          <tr key={key} className="border-t border-border">
                            <td className="p-2">{label}</td>
                            <td className="p-2 text-right tabular-nums">
                              {String(c.baseline_snapshot?.[key] ?? "—")}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {c.followup_snapshot ? String(c.followup_snapshot[key] ?? "—") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AiOpsInsights;
