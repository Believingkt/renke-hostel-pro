import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";

type Row = {
  id: string;
  scenario: string;
  user_message: string;
  ideal_response: string;
  explanation: string | null;
  is_active: boolean;
};

const empty = (): Omit<Row, "id"> => ({
  scenario: "", user_message: "", ideal_response: "", explanation: "", is_active: true,
});

export default function AiTrainingExamples() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarioFilter, setScenarioFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("ai_examples").select("*")
      .order("scenario").order("user_message");
    setRows((data as Row[]) || []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const scenarios = useMemo(() => Array.from(new Set(rows.map((r) => r.scenario))).filter(Boolean), [rows]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (scenarioFilter !== "all" && r.scenario !== scenarioFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.user_message.toLowerCase().includes(q) &&
          !r.ideal_response.toLowerCase().includes(q) &&
          !r.scenario.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, scenarioFilter, search]);

  const openNew = () => { setEditing(null); setForm(empty()); setDialogOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ scenario: r.scenario, user_message: r.user_message, ideal_response: r.ideal_response, explanation: r.explanation || "", is_active: r.is_active });
    setDialogOpen(true);
  };
  const openCopy = (r: Row) => {
    setEditing(null);
    setForm({ scenario: r.scenario, user_message: r.user_message, ideal_response: r.ideal_response, explanation: r.explanation || "", is_active: r.is_active });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.scenario.trim() || !form.user_message.trim() || !form.ideal_response.trim()) {
      toast.error("情境、使用者問句、AI 回答皆必填"); return;
    }
    const payload = {
      scenario: form.scenario.trim(),
      user_message: form.user_message.trim(),
      ideal_response: form.ideal_response.trim(),
      explanation: form.explanation?.trim() || null,
      is_active: form.is_active,
    };
    const res = editing
      ? await supabase.from("ai_examples").update(payload).eq("id", editing.id)
      : await supabase.from("ai_examples").insert(payload);
    if (res.error) { toast.error("儲存失敗：" + res.error.message); return; }
    toast.success(editing ? "已更新" : "已新增");
    setDialogOpen(false); await load();
  };

  const remove = async (r: Row) => {
    if (!confirm("刪除此範例？")) return;
    const { error } = await supabase.from("ai_examples").delete().eq("id", r.id);
    if (error) { toast.error("刪除失敗"); return; }
    toast.success("已刪除"); await load();
  };

  const toggleActive = async (r: Row, v: boolean) => {
    const { error } = await supabase.from("ai_examples").update({ is_active: v }).eq("id", r.id);
    if (error) { toast.error("更新失敗"); return; }
    setRows(rows.map((x) => x.id === r.id ? { ...x, is_active: v } : x));
  };

  const toggleExpand = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">對話範例訓練</h1>
          <p className="text-sm text-muted-foreground mt-1">提供理想對話範例，協助小安學習回應風格。</p>
        </div>
        <Button size="sm" className="bg-[#F97316] hover:bg-[#F97316]/90 text-white" onClick={openNew}>
          <Plus className="h-4 w-4" />新增範例
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部情境</SelectItem>
            {scenarios.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="搜尋..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {loading ? null : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          尚無範例
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => {
            const isExp = expanded.has(r.id);
            const long = r.ideal_response.length > 200;
            return (
              <Card key={r.id} className={`p-4 space-y-3 ${!r.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{r.scenario}</Badge>
                  <div className="flex items-center gap-1">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => openCopy(r)}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="font-medium mb-1">👤 使用者：</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{r.user_message}</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium mb-1">🤖 小安：</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">
                    {isExp || !long ? r.ideal_response : r.ideal_response.slice(0, 200) + "..."}
                  </div>
                  {long && (
                    <button onClick={() => toggleExpand(r.id)} className="text-xs text-primary hover:underline mt-1">
                      {isExp ? "收起" : "展開"}
                    </button>
                  )}
                </div>
                {r.explanation && (
                  <div className="text-xs bg-muted/40 rounded p-2">💡 {r.explanation}</div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯範例" : "新增範例"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>情境</Label>
              <Input
                list="scenario-list"
                value={form.scenario}
                onChange={(e) => setForm({ ...form, scenario: e.target.value })}
                placeholder="例如：詢問價格、變更日期"
              />
              <datalist id="scenario-list">
                {scenarios.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <Label>使用者問句</Label>
              <Textarea
                value={form.user_message}
                onChange={(e) => setForm({ ...form, user_message: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div>
              <Label>AI 理想回答</Label>
              <Textarea
                value={form.ideal_response}
                onChange={(e) => setForm({ ...form, ideal_response: e.target.value })}
                className="min-h-[120px]"
              />
            </div>
            <div>
              <Label>說明（為什麼這樣回）</Label>
              <Textarea
                value={form.explanation || ""}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="min-h-[60px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>啟用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
