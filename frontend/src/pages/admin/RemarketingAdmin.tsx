import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { Plus, Sparkles, Send, Users, Eye, MousePointerClick, TrendingUp, Trash2, RefreshCw } from "lucide-react";

type Rule = { field: string; op: string; value: string };
type Campaign = {
  id: string;
  name: string;
  description: string | null;
  segment: { dimension?: string; rules?: Rule[] };
  channel: string;
  content: { subject?: string; body?: string; cta_text?: string; cta_url?: string };
  recommend_products: string[];
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const DIMENSIONS = [
  { value: "preference", label: "偏好分群（興趣標籤）" },
  { value: "consumption", label: "消費分群（金額 / 次數）" },
  { value: "potential", label: "潛在回流（久未回訪）" },
];

const FIELDS = [
  { value: "interest_tags", label: "興趣標籤", ops: ["contains", "not_contains"], numeric: false },
  { value: "custom_needs", label: "客製需求", ops: ["contains", "not_contains"], numeric: false },
  { value: "total_amount", label: "消費總額", ops: ["gte", "lte", "gt", "lt"], numeric: true },
  { value: "order_count", label: "訂單數", ops: ["gte", "lte", "eq"], numeric: true },
  { value: "avg_amount", label: "平均客單", ops: ["gte", "lte"], numeric: true },
  { value: "days_since_last_order", label: "未回訪天數", ops: ["gte", "lte"], numeric: true },
];

const OP_LABEL: Record<string, string> = {
  contains: "包含", not_contains: "不包含", gt: "大於", gte: "大於等於", lt: "小於", lte: "小於等於", eq: "等於",
};

const STATUS_LABEL: Record<string, string> = { draft: "草稿", scheduled: "已排程", sent: "已發送" };

const emptyCampaign = (): Campaign => ({
  id: "",
  name: "",
  description: "",
  segment: { dimension: "preference", rules: [] },
  channel: "email",
  content: { subject: "", body: "", cta_text: "立即查看", cta_url: "https://booking.lakeze.com/" },
  recommend_products: [],
  status: "draft",
  scheduled_at: null,
  sent_at: null,
  created_at: "",
});

const localized = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  const o = v as Record<string, string>;
  return o.zh ?? o["zh-TW"] ?? o.en ?? Object.values(o)[0] ?? "";
};

export default function RemarketingAdmin() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Campaign>(emptyCampaign());
  const [products, setProducts] = useState<{ id: string; name: string; type: string | null }[]>([]);
  const [preview, setPreview] = useState<{ total: number; email_reachable: number; summary: string; preview: any[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [statsFor, setStatsFor] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("remarketing_campaigns" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "載入失敗", description: error.message, variant: "destructive" });
    else setCampaigns((data ?? []) as unknown as Campaign[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from("trip_products").select("id,name,type").limit(200).then(({ data }) => {
      setProducts((data ?? []).map((p: any) => ({ id: p.id, name: localized(p.name), type: p.type })));
    });
    supabase.from("traveler_profiles").select("interest_tags").limit(500).then(({ data }) => {
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => (r.interest_tags ?? []).forEach((t: string) => set.add(t)));
      setAllTags([...set].slice(0, 40));
    });
  }, []);

  const openCreate = () => { setDraft(emptyCampaign()); setPreview(null); setStep(1); setDialogOpen(true); };
  const openEdit = (c: Campaign) => { setDraft({ ...c }); setPreview(null); setStep(1); setDialogOpen(true); };

  const setRule = (i: number, patch: Partial<Rule>) => {
    const rules = [...(draft.segment.rules ?? [])];
    rules[i] = { ...rules[i], ...patch };
    setDraft({ ...draft, segment: { ...draft.segment, rules } });
  };
  const addRule = () =>
    setDraft({ ...draft, segment: { ...draft.segment, rules: [...(draft.segment.rules ?? []), { field: "interest_tags", op: "contains", value: "" }] } });
  const removeRule = (i: number) =>
    setDraft({ ...draft, segment: { ...draft.segment, rules: (draft.segment.rules ?? []).filter((_, k) => k !== i) } });

  const runPreview = async () => {
    setPreviewing(true);
    const { data, error } = await supabase.functions.invoke("remarketing-preview", { body: { segment: draft.segment } });
    setPreviewing(false);
    if (error || (data as any)?.error) {
      toast({ title: "預覽失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    setPreview(data as any);
  };

  // 依命中旅客的興趣標籤自動建議商品
  const suggestedProducts = useMemo(() => {
    const tags = new Set<string>();
    (preview?.preview ?? []).forEach((p) => (p.interest_tags ?? []).forEach((t: string) => tags.add(String(t).toLowerCase())));
    (draft.segment.rules ?? []).forEach((r) => {
      if (r.field === "interest_tags" && r.op === "contains") String(r.value).split(/[,、\s]+/).forEach((t) => t && tags.add(t.toLowerCase()));
    });
    if (!tags.size) return [];
    return products.filter((p) => [...tags].some((t) => p.name.toLowerCase().includes(t) || (p.type ?? "").toLowerCase().includes(t))).slice(0, 8);
  }, [preview, products, draft.segment.rules]);

  const generateCopy = async () => {
    const { data, error } = await supabase.functions.invoke("remarketing-copy", {
      body: {
        segment_summary: preview?.summary ?? draft.name,
        interest_tags: (draft.segment.rules ?? []).filter((r) => r.field === "interest_tags").map((r) => r.value),
        product_names: products.filter((p) => draft.recommend_products.includes(p.id)).map((p) => p.name),
      },
    });
    if (error || (data as any)?.error) {
      toast({ title: "AI 產生失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    const d = data as any;
    setDraft((prev) => ({ ...prev, content: { ...prev.content, subject: d.subject, body: d.body, cta_text: d.cta_text } }));
    toast({ title: "已產生文案", description: "可再手動微調" });
  };

  const save = async () => {
    if (!draft.name.trim()) { toast({ title: "請輸入活動名稱", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      name: draft.name,
      description: draft.description,
      segment: draft.segment,
      channel: draft.channel,
      content: draft.content,
      recommend_products: draft.recommend_products,
      status: draft.status === "sent" ? "sent" : draft.scheduled_at ? "scheduled" : "draft",
      scheduled_at: draft.scheduled_at,
    };
    const q = draft.id
      ? supabase.from("remarketing_campaigns" as any).update(payload).eq("id", draft.id)
      : supabase.from("remarketing_campaigns" as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
    toast({ title: "已儲存" });
    setDialogOpen(false);
    load();
  };

  const send = async (c: Campaign, dryRun = false) => {
    setSendingId(c.id);
    const { data, error } = await supabase.functions.invoke("remarketing-send", { body: { campaign_id: c.id, dry_run: dryRun } });
    setSendingId(null);
    if (error || (data as any)?.error) {
      toast({ title: "發送失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    const d = data as any;
    toast({ title: dryRun ? "試算完成" : "發送完成", description: `命中 ${d.matched} · 成功 ${d.sent} · 略過 ${d.skipped} · 失敗 ${d.failed}` });
    load();
  };

  const remove = async (c: Campaign) => {
    const { error } = await supabase.from("remarketing_campaigns" as any).delete().eq("id", c.id);
    if (error) { toast({ title: "刪除失敗", description: error.message, variant: "destructive" }); return; }
    toast({ title: "已刪除" });
    load();
  };

  const openStats = async (c: Campaign) => {
    setStatsFor(c);
    const { data } = await supabase
      .from("remarketing_sends" as any)
      .select("*")
      .eq("campaign_id", c.id)
      .order("sent_at", { ascending: false })
      .limit(500);
    setSends((data ?? []) as any[]);
  };

  const stats = useMemo(() => {
    const sent = sends.filter((s) => s.status === "sent").length;
    const opened = sends.filter((s) => s.opened_at).length;
    const clicked = sends.filter((s) => s.clicked_at).length;
    return { sent, opened, clicked, failed: sends.filter((s) => s.status === "failed").length };
  }, [sends]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI 二次再行銷推播</h1>
          <p className="text-sm text-muted-foreground mt-1">依旅客資料匯流（CDP）的行為洞察分群，推薦二次回流商品並發送推播。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />重新整理</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />建立活動</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">活動列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? null : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">尚無再行銷活動</p>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">活動名稱</TableHead>
                  <TableHead className="w-[14%]">分群維度</TableHead>
                  <TableHead className="w-[10%]">通路</TableHead>
                  <TableHead className="w-[10%]">狀態</TableHead>
                  <TableHead className="w-[16%]">發送時間</TableHead>
                  <TableHead className="w-[28%] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="truncate font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{DIMENSIONS.find((d) => d.value === c.segment?.dimension)?.label.split("（")[0] ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{c.channel === "line_share" ? "LINE 文案" : "Email"}</TableCell>
                    <TableCell><Badge variant={c.status === "sent" ? "default" : "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{c.sent_at ? new Date(c.sent_at).toLocaleString("zh-TW", { hour12: false }) : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openStats(c)}><TrendingUp className="h-4 w-4 mr-1" />成效</Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>編輯</Button>
                      <Button size="sm" variant="outline" disabled={sendingId === c.id} onClick={() => send(c)}>
                        <Send className="h-4 w-4 mr-1" />發送
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 建立 / 編輯（三步驟） */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.id ? "編輯活動" : "建立再行銷活動"}（步驟 {step}/3）</DialogTitle></DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>活動名稱</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例：夏季潛水客回訪推播" />
              </div>
              <div className="space-y-2">
                <Label>活動說明</Label>
                <Input value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>分群維度</Label>
                <Select value={draft.segment.dimension ?? "preference"} onValueChange={(v) => setDraft({ ...draft, segment: { ...draft.segment, dimension: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>分群條件（全部符合）</Label>
                  <Button size="sm" variant="outline" onClick={addRule}><Plus className="h-4 w-4 mr-1" />新增條件</Button>
                </div>
                {(draft.segment.rules ?? []).map((r, i) => {
                  const f = FIELDS.find((x) => x.value === r.field) ?? FIELDS[0];
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      <Select value={r.field} onValueChange={(v) => setRule(i, { field: v, op: (FIELDS.find((x) => x.value === v) ?? FIELDS[0]).ops[0], value: "" })}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{FIELDS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={r.op} onValueChange={(v) => setRule(i, { op: v })}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{f.ops.map((o) => <SelectItem key={o} value={o}>{OP_LABEL[o]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input
                        className="flex-1"
                        type={f.numeric ? "number" : "text"}
                        value={r.value}
                        placeholder={f.numeric ? "數值" : "標籤關鍵字，可用逗號分隔"}
                        onChange={(e) => setRule(i, { value: e.target.value })}
                      />
                      <Button size="icon" variant="ghost" onClick={() => removeRule(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                {allTags.length > 0 && (
                  <p className="text-xs text-muted-foreground">現有標籤參考：{allTags.slice(0, 15).join("、")}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={runPreview} disabled={previewing}>
                  <Users className="h-4 w-4 mr-2" />{previewing ? "計算中…" : "預覽命中旅客"}
                </Button>
                {preview && (
                  <span className="text-sm text-muted-foreground">
                    命中 <b className="text-foreground tabular-nums">{preview.total}</b> 位 · 可寄信 <b className="text-foreground tabular-nums">{preview.email_reachable}</b> 位
                  </span>
                )}
              </div>
              {preview && preview.preview.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  <Table className="table-fixed">
                    <TableHeader><TableRow><TableHead>旅客</TableHead><TableHead>Email</TableHead><TableHead>標籤</TableHead><TableHead className="text-right">消費額</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {preview.preview.slice(0, 20).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="truncate">{p.display_name ?? "—"}</TableCell>
                          <TableCell className="truncate text-xs">{p.email ?? "—"}</TableCell>
                          <TableCell className="truncate text-xs">{(p.interest_tags ?? []).join("、") || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(p.total_amount).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>推播通路</Label>
                <Select value={draft.channel} onValueChange={(v) => setDraft({ ...draft, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email（自動寄送）</SelectItem>
                    <SelectItem value="line_share">LINE 分享文案（產出後人工發送）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>二次回流推薦商品</Label>
                  {suggestedProducts.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, recommend_products: suggestedProducts.map((p) => p.id) })}>
                      <Sparkles className="h-4 w-4 mr-1" />套用建議（{suggestedProducts.length}）
                    </Button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3 space-y-2">
                  {products.length === 0 && <p className="text-sm text-muted-foreground">尚無旅遊商品</p>}
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={draft.recommend_products.includes(p.id)}
                        onCheckedChange={(v) =>
                          setDraft({
                            ...draft,
                            recommend_products: v
                              ? [...draft.recommend_products, p.id]
                              : draft.recommend_products.filter((x) => x !== p.id),
                          })
                        }
                      />
                      <span className="truncate">{p.name || p.id}</span>
                      {suggestedProducts.some((s) => s.id === p.id) && <Badge variant="secondary" className="text-xs">建議</Badge>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={generateCopy}><Sparkles className="h-4 w-4 mr-2" />AI 產生文案</Button>
              </div>
              <div className="space-y-2">
                <Label>信件主旨 / 訊息標題</Label>
                <Input value={draft.content.subject ?? ""} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, subject: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>內文</Label>
                <Textarea rows={5} value={draft.content.body ?? ""} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, body: e.target.value } })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CTA 按鈕文字</Label>
                  <Input value={draft.content.cta_text ?? ""} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, cta_text: e.target.value } })} />
                </div>
                <div className="space-y-2">
                  <Label>CTA 連結</Label>
                  <Input value={draft.content.cta_url ?? ""} onChange={(e) => setDraft({ ...draft, content: { ...draft.content, cta_url: e.target.value } })} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">活動名稱</span><span className="font-medium">{draft.name || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">命中旅客</span><span className="tabular-nums">{preview ? `${preview.total} 位（可寄信 ${preview.email_reachable}）` : "尚未預覽"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">通路</span><span>{draft.channel === "line_share" ? "LINE 分享文案" : "Email"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">推薦商品</span><span className="tabular-nums">{draft.recommend_products.length} 項</span></div>
                </CardContent>
              </Card>
              <div className="space-y-2">
                <Label>排程時間（留空表示手動發送）</Label>
                <Input
                  type="datetime-local"
                  value={draft.scheduled_at ? draft.scheduled_at.slice(0, 16) : ""}
                  onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div className="border rounded-md p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">{draft.content.subject || "（未設定主旨）"}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{draft.content.body || "（未設定內文）"}</p>
                {draft.content.cta_text && <p className="text-sm mt-3"><span className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md">{draft.content.cta_text}</span></p>}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>上一步</Button>}
            {step < 3 && <Button onClick={() => setStep(step + 1)}>下一步</Button>}
            {step === 3 && <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存活動"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 成效 */}
      <Sheet open={!!statsFor} onOpenChange={(o) => !o && setStatsFor(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{statsFor?.name} — 發送成效</SheetTitle></SheetHeader>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "已發送", value: stats.sent, icon: Send },
              { label: "開信", value: stats.opened, icon: Eye },
              { label: "點擊", value: stats.clicked, icon: MousePointerClick },
              { label: "失敗", value: stats.failed, icon: Users },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-3 text-center">
                  <s.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            點擊率 {stats.sent ? ((stats.clicked / stats.sent) * 100).toFixed(1) : "0.0"}%
          </p>
          <Table className="table-fixed mt-4">
            <TableHeader><TableRow><TableHead>收件人</TableHead><TableHead className="w-20">狀態</TableHead><TableHead className="w-28">發送</TableHead><TableHead className="w-28">點擊</TableHead></TableRow></TableHeader>
            <TableBody>
              {sends.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="truncate text-xs">{s.recipient ?? "—"}</TableCell>
                  <TableCell><Badge variant={s.status === "sent" ? "default" : "secondary"} className="text-xs">{s.status}</Badge></TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{s.sent_at ? new Date(s.sent_at).toLocaleDateString("zh-TW") : "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{s.clicked_at ? new Date(s.clicked_at).toLocaleDateString("zh-TW") : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SheetContent>
      </Sheet>
    </div>
  );
}
