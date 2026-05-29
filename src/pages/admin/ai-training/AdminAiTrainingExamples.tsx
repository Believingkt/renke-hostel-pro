import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";

type Row = {
  id: string; scenario: string; user_message: string;
  ideal_response: string; explanation: string | null; is_active: boolean;
};
const empty = () => ({ scenario: "", user_message: "", ideal_response: "", explanation: "", is_active: true });

export default function AdminAiTrainingExamples() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(empty());
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data } = await supabase.from("ai_examples").select("*")
      .eq("accommodation_id", currentAccommodationId)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [currentAccommodationId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.scenario.trim() || !form.user_message.trim() || !form.ideal_response.trim()) {
      toast.error("情境、用戶訊息、理想回應皆必填"); return;
    }
    if (!currentAccommodationId) return;
    const payload = { ...form, accommodation_id: currentAccommodationId };
    const res = editing
      ? await supabase.from("ai_examples").update(payload).eq("id", editing.id)
      : await supabase.from("ai_examples").insert(payload);
    if (res.error) { toast.error("儲存失敗：" + res.error.message); return; }
    toast.success(editing ? "已更新" : "已新增");
    setOpen(false); await load();
  };

  const remove = async (r: Row) => {
    if (!confirm(`刪除「${r.scenario}」？`)) return;
    await supabase.from("ai_examples").delete().eq("id", r.id);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">對話範例</h1>
          <p className="text-sm text-muted-foreground mt-1">教 AI 在特定情境下應該如何回應。</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}
          className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">
          <Plus className="h-4 w-4" />新增範例
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>情境</TableHead>
              <TableHead>用戶訊息</TableHead>
              <TableHead>理想回應</TableHead>
              <TableHead className="w-20">啟用</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? null : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">尚無資料</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.scenario}</TableCell>
                <TableCell className="max-w-xs truncate">{r.user_message}</TableCell>
                <TableCell className="max-w-xs truncate">{r.ideal_response}</TableCell>
                <TableCell>
                  <Switch checked={r.is_active} onCheckedChange={async (v) => {
                    await supabase.from("ai_examples").update({ is_active: v }).eq("id", r.id);
                    setRows(rows.map((x) => x.id === r.id ? { ...x, is_active: v } : x));
                  }} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => {
                    setEditing(r);
                    setForm({ scenario: r.scenario, user_message: r.user_message, ideal_response: r.ideal_response, explanation: r.explanation || "", is_active: r.is_active });
                    setOpen(true);
                  }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "編輯範例" : "新增範例"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>情境 *</Label>
              <Input value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })}
                placeholder="例：客人詢問是否可帶寵物" />
            </div>
            <div>
              <Label>用戶訊息 *</Label>
              <Textarea value={form.user_message} onChange={(e) => setForm({ ...form, user_message: e.target.value })}
                className="min-h-[80px]" />
            </div>
            <div>
              <Label>理想回應 *</Label>
              <Textarea value={form.ideal_response} onChange={(e) => setForm({ ...form, ideal_response: e.target.value })}
                className="min-h-[120px]" />
            </div>
            <div>
              <Label>說明（選填）</Label>
              <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                className="min-h-[60px]" placeholder="為什麼這樣回最好？" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
