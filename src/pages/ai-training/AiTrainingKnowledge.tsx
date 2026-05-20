import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Upload, Download } from "lucide-react";

type Category = "room" | "facility" | "policy" | "location" | "faq" | "other";
const CATEGORY_LABEL: Record<Category, string> = {
  room: "房型", facility: "設施", policy: "政策",
  location: "周邊景點", faq: "常見問答", other: "其他",
};
const CATEGORY_OPTIONS: Category[] = ["room", "facility", "policy", "location", "faq", "other"];

type Row = {
  id: string;
  category: Category;
  title: string;
  content: string;
  tags: string[];
  priority: number;
  is_active: boolean;
  updated_at: string;
};

const empty = (): Omit<Row, "id" | "updated_at"> => ({
  category: "faq", title: "", content: "", tags: [], priority: 5, is_active: true,
});

export default function AiTrainingKnowledge() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id" | "updated_at">>(empty());
  const [tagInput, setTagInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contentTab, setContentTab] = useState<"edit" | "preview">("edit");

  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importAll, setImportAll] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("ai_knowledge").select("*")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab !== "all" && r.category !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.content.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, tab, search]);

  const openNew = () => { setEditing(null); setForm(empty()); setTagInput(""); setContentTab("edit"); setDialogOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ category: r.category, title: r.title, content: r.content, tags: r.tags, priority: r.priority, is_active: r.is_active });
    setTagInput(""); setContentTab("edit"); setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("標題必填"); return; }
    const payload = { ...form, title: form.title.trim() };
    const res = editing
      ? await supabase.from("ai_knowledge").update(payload).eq("id", editing.id)
      : await supabase.from("ai_knowledge").insert(payload);
    if (res.error) { toast.error("儲存失敗：" + res.error.message); return; }
    toast.success(editing ? "已更新" : "已新增");
    setDialogOpen(false);
    await load();
  };

  const remove = async (r: Row) => {
    if (!confirm(`刪除「${r.title}」？`)) return;
    const { error } = await supabase.from("ai_knowledge").delete().eq("id", r.id);
    if (error) { toast.error("刪除失敗"); return; }
    toast.success("已刪除"); await load();
  };

  const toggleActive = async (r: Row, v: boolean) => {
    const { error } = await supabase.from("ai_knowledge").update({ is_active: v }).eq("id", r.id);
    if (error) { toast.error("更新失敗"); return; }
    setRows(rows.map((x) => x.id === r.id ? { ...x, is_active: v } : x));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) { setTagInput(""); return; }
    setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  };
  const removeTag = (t: string) => setForm({ ...form, tags: form.tags.filter((x) => x !== t) });

  // CSV
  const exportCsv = () => {
    const header = ["category", "title", "content", "tags", "priority", "is_active"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const cells = [
        r.category, r.title, r.content, r.tags.join("|"),
        String(r.priority), String(r.is_active),
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai_knowledge_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const parseCsv = (text: string): any[] => {
    // Tiny CSV parser handling quoted fields
    const rows: string[][] = [];
    let cur: string[] = []; let val = ""; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { val += '"'; i++; }
        else if (c === '"') inQ = false;
        else val += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { cur.push(val); val = ""; }
        else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
        else if (c === "\r") { /* skip */ }
        else val += c;
      }
    }
    if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
    return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
      const o: any = {};
      headers.forEach((h, i) => o[h] = r[i] ?? "");
      return o;
    });
  };

  const onCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) { toast.error("CSV 沒有資料"); return; }
    setImportAll(parsed);
    setImportPreview(parsed.slice(0, 5));
    setImportOpen(true);
    e.target.value = "";
  };

  const confirmImport = async () => {
    const payload = importAll.map((r) => {
      const raw = String(r.category || "").trim();
      const cat = (raw === "attraction" ? "location" : raw) as Category;
      return {
        category: (CATEGORY_OPTIONS.includes(cat) ? cat : "other") as Category,
      title: String(r.title || "").trim(),
      content: String(r.content || ""),
      tags: r.tags ? String(r.tags).split("|").map((s: string) => s.trim()).filter(Boolean) : [],
      priority: Number.isFinite(+r.priority) ? Math.max(0, Math.min(10, +r.priority)) : 5,
      is_active: String(r.is_active ?? "true").toLowerCase() !== "false",
    })).filter((r) => r.title);
    if (!payload.length) { toast.error("沒有可匯入的列"); return; }
    const { error } = await supabase.from("ai_knowledge").insert(payload);
    if (error) { toast.error("匯入失敗：" + error.message); return; }
    toast.success(`已匯入 ${payload.length} 筆`);
    setImportOpen(false); setImportPreview(null); setImportAll([]);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">知識庫</h1>
          <p className="text-sm text-muted-foreground mt-1">管理房型、設施、政策、地點等知識條目。</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className="inline-flex">
            <input type="file" accept=".csv" className="hidden" onChange={onCsvFile} id="csv-import" />
            <Button variant="outline" size="sm" asChild>
              <span className="cursor-pointer"><Upload className="h-4 w-4" />批次匯入</span>
            </Button>
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" />匯出 CSV
          </Button>
          <Button size="sm" className="bg-[#F97316] hover:bg-[#F97316]/90 text-white" onClick={openNew}>
            <Plus className="h-4 w-4" />新增知識
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            {CATEGORY_OPTIONS.map((c) => (
              <TabsTrigger key={c} value={c}>{CATEGORY_LABEL[c]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          placeholder="搜尋標題或內容..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>標題</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>標籤</TableHead>
              <TableHead className="w-20">優先權</TableHead>
              <TableHead className="w-40">最後更新</TableHead>
              <TableHead className="w-20">啟用</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? null : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">尚無資料</TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell><Badge variant="secondary">{CATEGORY_LABEL[r.category]}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                    {r.tags.length > 3 && <span className="text-xs text-muted-foreground">+{r.tags.length - 3}</span>}
                  </div>
                </TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.updated_at).toLocaleString("zh-TW")}
                </TableCell>
                <TableCell>
                  <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* 新增/編輯 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯知識" : "新增知識"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div>
                <Label>分類</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>啟用</Label>
                <div className="h-10 flex items-center">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              </div>
            </div>
            <div>
              <Label>標題 *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>內容（支援 Markdown）</Label>
              <Tabs value={contentTab} onValueChange={(v) => setContentTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="edit">編輯</TabsTrigger>
                  <TabsTrigger value="preview">預覽</TabsTrigger>
                </TabsList>
              </Tabs>
              {contentTab === "edit" ? (
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="font-mono text-sm min-h-[200px]"
                />
              ) : (
                <div className="prose prose-sm max-w-none border rounded-md p-3 bg-muted/30 min-h-[200px] whitespace-pre-wrap">
                  {form.content || "（無內容）"}
                </div>
              )}
            </div>
            <div>
              <Label>標籤</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="輸入後按 Enter"
                />
                <Button type="button" variant="outline" onClick={addTag}>加入</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}<button onClick={() => removeTag(t)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>優先權：{form.priority}</Label>
              <Slider
                value={[form.priority]}
                onValueChange={(v) => setForm({ ...form, priority: v[0] })}
                min={0} max={10} step={1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 匯入預覽 */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>批次匯入預覽（共 {importAll.length} 筆，顯示前 5 筆）</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            CSV 欄位：category, title, content, tags（用 | 分隔）, priority, is_active
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分類</TableHead>
                  <TableHead>標題</TableHead>
                  <TableHead>內容</TableHead>
                  <TableHead>標籤</TableHead>
                  <TableHead>優先權</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importPreview || []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.category}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.content}</TableCell>
                    <TableCell>{r.tags}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={confirmImport} className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">
              確認匯入 {importAll.length} 筆
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
