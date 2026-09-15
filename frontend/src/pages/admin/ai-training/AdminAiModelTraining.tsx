import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Download, Import, Plus, ChevronRight, CheckCircle2, AlertTriangle,
  Database, Brain, MessageSquareText, Sparkles, UserCheck, RefreshCw, ArrowRight, ArrowDown,
} from "lucide-react";

interface EvalSample {
  id: string;
  conversation_id: string | null;
  test_input: string;
  ai_output: string;
  semantic_label: string | null;
  needs_human_fix: boolean;
  lang: string;
  has_lang_error: boolean;
  note: string | null;
  created_at: string;
}

const LANG_LABEL: Record<string, string> = { zh: "中文", ja: "日文", en: "英文" };
const LABEL_TEXT: Record<string, string> = { correct: "正確", acceptable: "可接受", unusable: "不可用" };
const MIN_SAMPLES = 30;

/* ---------------- 訓練流程圖 ---------------- */
const FLOW_STEPS = [
  { icon: Database, title: "資料來源", desc: "知識庫（ai_knowledge）＋ 對話範例（ai_examples）＋ 回覆樣板" },
  { icon: Brain, title: "意圖辨識", desc: "解析旅客問句意圖：查房 / 價格 / 設施 / 交通 / 訂房" },
  { icon: MessageSquareText, title: "回覆生成", desc: "系統提示詞＋樣板風格，生成中／日／英三語回覆" },
  { icon: Sparkles, title: "推薦模型", desc: "依語意帶出房型、票券活動、餐飲等 1–3 張推薦卡" },
  { icon: UserCheck, title: "人工標註回饋", desc: "抽樣標註語意適切、是否需修正、多語錯誤" },
  { icon: RefreshCw, title: "優化迴圈", desc: "指標未達標 → 補知識庫／調整提示詞與樣板 → 重新評測" },
];

function TrainingFlow() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI 模型訓練與優化流程</CardTitle>
          <CardDescription>資料 → 意圖辨識 → 回覆生成 → 推薦模型 → 人工標註回饋 → 優化迴圈</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-stretch gap-2">
            {FLOW_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.title}>
                  <div className="flex items-start gap-4 rounded-lg border border-primary/25 bg-card p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">STEP {i + 1}</Badge>
                        <span className="font-semibold">{s.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-4 w-4 text-primary/60" />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 text-primary" />
              優化迴圈回饋至「資料來源」與「回覆生成」
              <ArrowRight className="h-4 w-4 text-primary" />
              STEP 1 / STEP 3
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">查核標準</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-lg border p-3">內容語意適切率 <span className="font-semibold text-primary">≥ 95%</span></div>
          <div className="rounded-lg border p-3">AI 回覆需人工修正比例 <span className="font-semibold text-primary">≤ 10%</span></div>
          <div className="rounded-lg border p-3">多語生成錯誤率 <span className="font-semibold text-primary">≤ 5%</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- 指標卡 ---------------- */
function MetricCard({
  title, value, standard, pass, hint,
}: { title: string; value: number | null; standard: string; pass: boolean | null; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end gap-3">
          <span className="text-3xl font-bold tabular-nums">
            {value === null ? "—" : `${value.toFixed(1)}%`}
          </span>
          {pass !== null && (
            <Badge variant={pass ? "default" : "destructive"} className="mb-1">
              {pass ? "達標" : "未達標"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">標準 {standard}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminAiModelTraining() {
  const [samples, setSamples] = useState<EvalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(20);
  const [cursor, setCursor] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ test_input: "", ai_output: "", lang: "zh" });

  // 標註中的暫存
  const [draft, setDraft] = useState<{ needs_human_fix: boolean; lang: string; has_lang_error: boolean; note: string }>({
    needs_human_fix: false, lang: "zh", has_lang_error: false, note: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_eval_samples")
      .select("id, conversation_id, test_input, ai_output, semantic_label, needs_human_fix, lang, has_lang_error, note, created_at")
      .order("created_at", { ascending: true });
    if (error) toast.error("讀取失敗：" + error.message);
    setSamples((data as EvalSample[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unlabeled = useMemo(() => samples.filter((s) => !s.semantic_label), [samples]);
  const labeled = useMemo(() => samples.filter((s) => s.semantic_label), [samples]);

  const metrics = useMemo(() => {
    const total = labeled.length;
    if (total === 0) return { total: 0, semantic: null, fix: null, langErr: null };
    const ok = labeled.filter((s) => s.semantic_label === "correct" || s.semantic_label === "acceptable").length;
    const fix = labeled.filter((s) => s.needs_human_fix).length;
    const err = labeled.filter((s) => s.has_lang_error).length;
    return {
      total,
      semantic: (ok / total) * 100,
      fix: (fix / total) * 100,
      langErr: (err / total) * 100,
    };
  }, [labeled]);

  const current = unlabeled[Math.min(cursor, Math.max(unlabeled.length - 1, 0))];

  useEffect(() => {
    if (current) {
      setDraft({
        needs_human_fix: current.needs_human_fix,
        lang: current.lang || "zh",
        has_lang_error: current.has_lang_error,
        note: current.note || "",
      });
    }
  }, [current?.id]);

  /* -------- 抽樣匯入 -------- */
  const extractPair = (messages: any): { input: string; output: string } => {
    const arr = Array.isArray(messages) ? messages : [];
    const firstUser = arr.find((m: any) => m?.role === "user");
    const lastAssistant = [...arr].reverse().find((m: any) => m?.role === "assistant");
    const toText = (c: any) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x: any) => x?.text || "").join(" ") : "");
    return {
      input: toText(firstUser?.content).slice(0, 2000),
      output: toText(lastAssistant?.content).slice(0, 4000),
    };
  };

  const importSamples = async () => {
    setImporting(true);
    try {
      const { data: logs, error } = await supabase
        .from("ai_conversation_logs")
        .select("id, messages, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.max(importCount * 3, 60));
      if (error) throw error;

      const existing = new Set(samples.map((s) => s.conversation_id).filter(Boolean) as string[]);
      const rows: any[] = [];
      for (const log of logs || []) {
        if (rows.length >= importCount) break;
        if (existing.has(log.id)) continue;
        const { input, output } = extractPair(log.messages);
        if (!input || !output) continue;
        rows.push({ conversation_id: log.id, test_input: input, ai_output: output, lang: "zh" });
      }
      if (rows.length === 0) {
        toast.info("沒有可匯入的新對話");
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const reviewer = userData?.user?.id ?? null;
      const { error: insErr } = await supabase
        .from("ai_eval_samples")
        .insert(rows.map((r) => ({ ...r, reviewer })));
      if (insErr) throw insErr;
      toast.success(`已匯入 ${rows.length} 筆樣本`);
      setCursor(0);
      load();
    } catch (e: any) {
      toast.error("匯入失敗：" + (e?.message || String(e)));
    } finally {
      setImporting(false);
    }
  };

  /* -------- 標註 -------- */
  const saveLabel = async (label: "correct" | "acceptable" | "unusable") => {
    if (!current) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("ai_eval_samples")
      .update({
        semantic_label: label,
        needs_human_fix: draft.needs_human_fix,
        lang: draft.lang,
        has_lang_error: draft.has_lang_error,
        note: draft.note || null,
        reviewer: userData?.user?.id ?? null,
      })
      .eq("id", current.id);
    if (error) { toast.error("儲存失敗：" + error.message); return; }
    setSamples((prev) => prev.map((s) => (s.id === current.id
      ? { ...s, semantic_label: label, ...draft, note: draft.note || null }
      : s)));
    setDraft({ needs_human_fix: false, lang: "zh", has_lang_error: false, note: "" });
    setCursor(0);
    toast.success("已標註，前往下一筆");
  };

  const addManual = async () => {
    if (!manual.test_input.trim() || !manual.ai_output.trim()) {
      toast.error("問句與回覆為必填");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("ai_eval_samples").insert({
      test_input: manual.test_input.trim(),
      ai_output: manual.ai_output.trim(),
      lang: manual.lang,
      reviewer: userData?.user?.id ?? null,
    });
    if (error) { toast.error("新增失敗：" + error.message); return; }
    toast.success("已新增樣本");
    setManual({ test_input: "", ai_output: "", lang: "zh" });
    setManualOpen(false);
    load();
  };

  /* -------- CSV 匯出 -------- */
  const exportCsv = () => {
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["編號", "測試問句", "AI 回覆", "語意標註", "需人工修正", "語言", "多語正確", "備註", "建立時間"];
    const lines = samples.map((s, i) => [
      String(i + 1),
      esc(s.test_input),
      esc(s.ai_output),
      s.semantic_label ? LABEL_TEXT[s.semantic_label] : "未標註",
      s.needs_human_fix ? "是" : "否",
      LANG_LABEL[s.lang] || s.lang,
      s.has_lang_error ? "否" : "是",
      esc(s.note || ""),
      new Date(s.created_at).toLocaleString("zh-TW"),
    ].join(","));
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI測試紀錄表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progress = samples.length ? (labeled.length / samples.length) * 100 : 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">模型訓練</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI 模型訓練優化流程與三項量化查核指標的人工標註評測
        </p>
      </div>

      <Tabs defaultValue="flow">
        <TabsList>
          <TabsTrigger value="flow">訓練流程</TabsTrigger>
          <TabsTrigger value="metrics">指標總覽</TabsTrigger>
          <TabsTrigger value="label">標註評測</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="mt-4">
          <TrainingFlow />
        </TabsContent>

        <TabsContent value="metrics" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="內容語意適切率"
              value={metrics.semantic}
              standard="≥ 95%"
              pass={metrics.semantic === null ? null : metrics.semantic >= 95}
              hint="(正確 + 可接受) ÷ 已標註樣本"
            />
            <MetricCard
              title="AI 回覆需人工修正比例"
              value={metrics.fix}
              standard="≤ 10%"
              pass={metrics.fix === null ? null : metrics.fix <= 10}
              hint="需人工修正樣本 ÷ 已標註樣本"
            />
            <MetricCard
              title="多語生成錯誤率"
              value={metrics.langErr}
              standard="≤ 5%"
              pass={metrics.langErr === null ? null : metrics.langErr <= 5}
              hint="多語錯誤樣本 ÷ 已標註樣本"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">標註進度</CardTitle>
              <CardDescription>
                總樣本 {samples.length} 筆，已標註 {labeled.length} 筆，未標註 {unlabeled.length} 筆
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={progress} />
              {labeled.length < MIN_SAMPLES && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                  <span>
                    樣本不足：已標註 {labeled.length} 筆，建議至少 {MIN_SAMPLES} 筆才具統計代表性，目前指標僅供參考。
                  </span>
                </div>
              )}
              {labeled.length >= MIN_SAMPLES && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  樣本數已達統計代表性門檻
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="label" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">樣本來源</CardTitle>
              <CardDescription>從最近的對話紀錄抽樣匯入，或手動新增測試樣本</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-2 w-32">
                <Label>抽樣筆數</Label>
                <Input
                  type="number" min={1} max={100} value={importCount}
                  onChange={(e) => setImportCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                />
              </div>
              <Button onClick={importSamples} disabled={importing}>
                <Import className="mr-2 h-4 w-4" /> {importing ? "匯入中…" : "抽樣匯入"}
              </Button>
              <Button variant="outline" onClick={() => setManualOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> 手動新增樣本
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={samples.length === 0}>
                <Download className="mr-2 h-4 w-4" /> CSV 匯出
              </Button>
            </CardContent>
          </Card>

          {loading ? null : !current ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
                <p className="font-medium">目前沒有待標註樣本</p>
                <p className="text-sm text-muted-foreground">可抽樣匯入更多對話，或手動新增測試樣本</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">逐筆標註</CardTitle>
                  <Badge variant="secondary">剩餘 {unlabeled.length} 筆待標註</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">測試問句</Label>
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {current.test_input}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">AI 回覆</Label>
                  <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap max-h-72 overflow-y-auto">
                    {current.ai_output}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>語言</Label>
                    <Select value={draft.lang} onValueChange={(v) => setDraft({ ...draft, lang: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh">中文</SelectItem>
                        <SelectItem value="ja">日文</SelectItem>
                        <SelectItem value="en">英文</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 pt-7 cursor-pointer">
                    <Checkbox
                      checked={draft.needs_human_fix}
                      onCheckedChange={(v) => setDraft({ ...draft, needs_human_fix: Boolean(v) })}
                    />
                    <span className="text-sm">需人工修正</span>
                  </label>
                  <label className="flex items-center gap-2 pt-7 cursor-pointer">
                    <Checkbox
                      checked={draft.has_lang_error}
                      onCheckedChange={(v) => setDraft({ ...draft, has_lang_error: Boolean(v) })}
                    />
                    <span className="text-sm">多語生成錯誤</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>備註</Label>
                  <Textarea
                    rows={2} value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    placeholder="選填：說明錯誤原因或修正方向"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => saveLabel("correct")}>
                    語意正確 <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button variant="secondary" onClick={() => saveLabel("acceptable")}>
                    可接受 <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                  <Button variant="destructive" onClick={() => saveLabel("unusable")}>
                    不可用 <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {labeled.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">已標註樣本（{labeled.length}）</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 whitespace-nowrap">編號</th>
                      <th className="py-2 pr-3">問句</th>
                      <th className="py-2 pr-3 whitespace-nowrap">標註</th>
                      <th className="py-2 pr-3 whitespace-nowrap">需修正</th>
                      <th className="py-2 pr-3 whitespace-nowrap">語言</th>
                      <th className="py-2 pr-3 whitespace-nowrap">多語正確</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labeled.map((s, i) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-3 max-w-md truncate">{s.test_input}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={s.semantic_label === "unusable" ? "destructive" : "secondary"}>
                            {LABEL_TEXT[s.semantic_label || ""]}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">{s.needs_human_fix ? "是" : "否"}</td>
                        <td className="py-2 pr-3">{LANG_LABEL[s.lang] || s.lang}</td>
                        <td className="py-2 pr-3">{s.has_lang_error ? "否" : "是"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>手動新增測試樣本</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>測試問句</Label>
              <Textarea rows={2} value={manual.test_input} onChange={(e) => setManual({ ...manual, test_input: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>AI 回覆</Label>
              <Textarea rows={5} value={manual.ai_output} onChange={(e) => setManual({ ...manual, ai_output: e.target.value })} />
            </div>
            <div className="space-y-2 w-40">
              <Label>語言</Label>
              <Select value={manual.lang} onValueChange={(v) => setManual({ ...manual, lang: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="ja">日文</SelectItem>
                  <SelectItem value="en">英文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>取消</Button>
            <Button onClick={addManual}>新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
