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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";

type Category = "room" | "facility" | "policy" | "location" | "faq" | "other";
const CATEGORY_LABEL: Record<Category, string> = {
  room: "房型", facility: "設施", policy: "政策", location: "周邊景點", faq: "常見問答", other: "其他",
};
const CATEGORY_OPTIONS: Category[] = ["room", "facility", "policy", "location", "faq", "other"];

type Row = {
  id: string; category: Category; title: string; content: string;
  tags: string[]; priority: number; is_active: boolean; updated_at: string;
};
const empty = (): Omit<Row, "id" | "updated_at"> => ({
  category: "faq", title: "", content: "", tags: [], priority: 5, is_active: true,
});

export default function AdminAiTrainingKnowledge() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id" | "updated_at">>(empty());
  const [tagInput, setTagInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data } = await supabase.from("ai_knowledge").select("*")
      .eq("accommodation_id", currentAccommodationId)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [currentAccommodationId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tab !== "all" && r.category !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.content.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, tab, search]);

  const openNew = () => { setEditing(null); setForm(empty()); setTagInput(""); setDialogOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ category: r.category, title: r.title, content: r.content, tags: r.tags, priority: r.priority, is_active: r.is_active });
    setTagInput(""); setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("標題必填"); return; }
    if (!currentAccommodationId) return;
    const payload = { ...form, title: form.title.trim(), accommodation_id: currentAccommodationId };
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
    await supabase.from("ai_knowledge").update({ is_active: v }).eq("id", r.id);
    setRows(rows.map((x) => x.id === r.id ? { ...x, is_active: v } : x));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) { setTagInput(""); return; }
    setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">知識庫</h1>
          <p className="text-sm text-muted-foreground mt-1">管理本民宿的房型、設施、政策、地點等知識條目。</p>
        </div>
        <Button onClick={openNew} className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">
          <Plus className="h-4 w-4" />新增知識
        </Button>
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
        <Input placeholder="搜尋..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>標題</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>標籤</TableHead>
              <TableHead className="w-20">優先權</TableHead>
              <TableHead className="w-20">啟用</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? null : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無資料</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell><Badge variant="secondary">{CATEGORY_LABEL[r.category]}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                </TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} /></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "編輯知識" : "新增知識"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div>
                <Label>分類</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
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
              <Label>內容</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="font-mono text-sm min-h-[200px]" />
            </div>
            <div>
              <Label>標籤</Label>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Enter 加入" />
                <Button type="button" variant="outline" onClick={addTag}>加入</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}<button onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>優先權：{form.priority}</Label>
              <Slider value={[form.priority]} onValueChange={(v) => setForm({ ...form, priority: v[0] })} min={0} max={10} step={1} />
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
