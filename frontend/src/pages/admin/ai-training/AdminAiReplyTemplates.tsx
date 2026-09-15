import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, MessageSquareText } from "lucide-react";

interface ReplyTemplate {
  id: string;
  name: string;
  scenario: string;
  template: string;
  sort: number;
  is_active: boolean;
}

const emptyForm = { name: "", scenario: "", template: "", sort: 0, is_active: true };

export default function AdminAiReplyTemplates() {
  const [rows, setRows] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_reply_templates")
      .select("id, name, scenario, template, sort, is_active")
      .order("sort", { ascending: true });
    if (error) toast.error("讀取失敗：" + error.message);
    setRows((data as ReplyTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort: rows.length });
    setDialogOpen(true);
  };

  const openEdit = (row: ReplyTemplate) => {
    setEditingId(row.id);
    setForm({
      name: row.name, scenario: row.scenario, template: row.template,
      sort: row.sort, is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.scenario.trim() || !form.template.trim()) {
      toast.error("名稱、情境與樣板內容為必填");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      scenario: form.scenario.trim(),
      template: form.template.trim(),
      sort: Number(form.sort) || 0,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from("ai_reply_templates").update(payload).eq("id", editingId)
      : await supabase.from("ai_reply_templates").insert(payload);
    setSaving(false);
    if (error) { toast.error("儲存失敗：" + error.message); return; }
    toast.success(editingId ? "已更新樣板" : "已新增樣板");
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (row: ReplyTemplate) => {
    const activeCount = rows.filter((r) => r.is_active).length;
    if (row.is_active && activeCount <= 3) {
      toast.error("至少需保留 3 種啟用中的回覆樣板");
      return;
    }
    const { error } = await supabase
      .from("ai_reply_templates").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { toast.error("更新失敗：" + error.message); return; }
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index], b = rows[target];
    await supabase.from("ai_reply_templates").update({ sort: b.sort }).eq("id", a.id);
    await supabase.from("ai_reply_templates").update({ sort: a.sort }).eq("id", b.id);
    load();
  };

  const doDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ai_reply_templates").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) { toast.error("刪除失敗：" + error.message); return; }
    toast.success("已刪除樣板");
    load();
  };

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareText className="h-6 w-6 text-primary" />
            回覆樣板管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理小安對話的回覆風格樣板，啟用中的樣板會作為情境提示帶入 AI 回覆。
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> 新增樣板
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">啟用狀態</CardTitle>
          <CardDescription>
            目前啟用中 {activeCount} 種樣板
            {activeCount < 3 && <span className="text-destructive"> — 建議至少維持 3 種</span>}
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? null : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">尚無樣板</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <Card key={row.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{row.name}</span>
                      <Badge variant="secondary">{row.scenario}</Badge>
                      <Badge variant={row.is_active ? "default" : "outline"}>
                        {row.is_active ? "啟用中" : "停用"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => move(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Separator />
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
                  {row.template}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯回覆樣板" : "新增回覆樣板"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>樣板名稱</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：標準推薦" />
            </div>
            <div className="space-y-2">
              <Label>情境</Label>
              <Input value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} placeholder="例如：房型查詢 / 促購 / 導引" />
            </div>
            <div className="space-y-2">
              <Label>樣板內容</Label>
              <Textarea
                rows={8}
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
                placeholder="可使用 {{房型}}、{{價格}}、{{日期}} 等變數"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-2 w-32">
                <Label>排序</Label>
                <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <Label>啟用</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除此回覆樣板？</AlertDialogTitle>
            <AlertDialogDescription>刪除後無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
