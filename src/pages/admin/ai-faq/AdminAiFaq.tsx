import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAuditLog } from "@/hooks/use-audit-log";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import KnowledgeTestPanel from "@/components/admin/KnowledgeTestPanel";

type Category = "room" | "facility" | "policy" | "location" | "faq" | "other";
const CATEGORY_LABEL: Record<Category, string> = {
  faq: "常見問答", room: "房型", facility: "設施", policy: "入住規定",
  location: "交通與周邊", other: "其他",
};
const CATEGORY_OPTIONS: Category[] = ["faq", "room", "facility", "policy", "location", "other"];

const MAX_TITLE = 120;
const MAX_CONTENT = 4000;

interface Row {
  id: string;
  category: Category;
  title: string;
  content: string;
  is_active: boolean;
  updated_at: string;
}

const empty = () => ({
  category: "faq" as Category,
  title: "",
  content: "",
  is_active: true,
});

export default function AdminAiFaq() {
  const { currentAccommodationId } = useAccommodation();
  const { logAction } = useAuditLog();

  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(empty());
  const [contentTab, setContentTab] = useState<"edit" | "preview">("edit");

  const load = useCallback(async () => {
    if (!currentAccommodationId) { setRows([]); return; }
    const { data, error } = await supabase
      .from("ai_knowledge")
      .select("id, category, title, content, is_active, updated_at")
      .eq("accommodation_id", currentAccommodationId)
      .order("updated_at", { ascending: false });
    if (error) { toast.error("讀取失敗：" + error.message); return; }
    setRows((data as Row[]) || []);
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

  const openNew = () => {
    setEditing(null);
    setForm(empty());
    setContentTab("edit");
    setDialogOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({ category: r.category, title: r.title, content: r.content, is_active: r.is_active });
    setContentTab("edit");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!currentAccommodationId) { toast.error("請先選擇館別"); return; }
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title) { toast.error("請填寫問題"); return; }
    if (!content) { toast.error("請填寫回答內容"); return; }
    if (title.length > MAX_TITLE) { toast.error(`問題請控制在 ${MAX_TITLE} 字以內`); return; }
    if (content.length > MAX_CONTENT) { toast.error(`回答請控制在 ${MAX_CONTENT} 字以內`); return; }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("ai_knowledge")
          .update({ category: form.category, title, content, is_active: form.is_active })
          .eq("id", editing.id);
        if (error) { toast.error("儲存失敗：" + error.message); return; }
        await logAction({
          actionType: "update",
          actionCategory: "accommodation",
          entityType: "ai_knowledge",
          entityId: editing.id,
          entityName: title,
          accommodationId: currentAccommodationId,
          details: { category: form.category, is_active: form.is_active },
        });
      } else {
        const { data, error } = await supabase
          .from("ai_knowledge")
          .insert({
            accommodation_id: currentAccommodationId,
            category: form.category,
            title,
            content,
            is_active: form.is_active,
          })
          .select("id")
          .single();
        if (error) { toast.error("儲存失敗：" + error.message); return; }
        await logAction({
          actionType: "create",
          actionCategory: "accommodation",
          entityType: "ai_knowledge",
          entityId: data?.id || "",
          entityName: title,
          accommodationId: currentAccommodationId,
          details: { category: form.category, is_active: form.is_active },
        });
      }
      toast.success(editing ? "已更新" : "已新增");
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: Row, v: boolean) => {
    const { error } = await supabase
      .from("ai_knowledge")
      .update({ is_active: v })
      .eq("id", r.id);
    if (error) { toast.error("更新失敗：" + error.message); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: v } : x)));
    await logAction({
      actionType: v ? "enable" : "disable",
      actionCategory: "accommodation",
      entityType: "ai_knowledge",
      entityId: r.id,
      entityName: r.title,
      accommodationId: currentAccommodationId,
      details: { is_active: v },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">常見問題</h1>
          <p className="text-sm text-muted-foreground mt-1">
            這裡寫的問答，線上客服回覆客人時會直接引用，儲存後立即生效。
          </p>
        </div>
        <Button size="sm" className="bg-[#F97316] hover:bg-[#F97316]/90 text-white" onClick={openNew}>
          <Plus className="h-4 w-4" />新增問答
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | Category)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            {CATEGORY_OPTIONS.map((c) => (
              <TabsTrigger key={c} value={c}>{CATEGORY_LABEL[c]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          placeholder="搜尋問題或回答內容..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>問題</TableHead>
              <TableHead className="w-28">分類</TableHead>
              <TableHead className="w-40">最後更新</TableHead>
              <TableHead className="w-20">啟用</TableHead>
              <TableHead className="w-20 text-right">編輯</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  尚無問答，點右上角「新增問答」開始建立。
                </TableCell>
              </TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium truncate">{r.title}</TableCell>
                <TableCell><Badge variant="secondary">{CATEGORY_LABEL[r.category]}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(r.updated_at).toLocaleString("zh-TW")}
                </TableCell>
                <TableCell>
                  <Switch checked={r.is_active} onCheckedChange={(v) => void toggleActive(r, v)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯問答" : "新增問答"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div>
                <Label>分類</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as Category })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>是否啟用</Label>
                <div className="h-10 flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <span className="text-xs text-muted-foreground">
                    關閉後客服就不會再引用這則
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Label>問題 *（客人會怎麼問）</Label>
              <Input
                value={form.title}
                maxLength={MAX_TITLE}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例：可以帶寵物入住嗎？"
              />
              <div className="text-xs text-muted-foreground mt-1">
                {form.title.length}/{MAX_TITLE}
              </div>
            </div>

            <div>
              <Label>回答 *</Label>
              <Tabs value={contentTab} onValueChange={(v) => setContentTab(v as "edit" | "preview")}>
                <TabsList>
                  <TabsTrigger value="edit">編輯</TabsTrigger>
                  <TabsTrigger value="preview">儲存前預覽</TabsTrigger>
                </TabsList>
              </Tabs>
              {contentTab === "edit" ? (
                <Textarea
                  value={form.content}
                  maxLength={MAX_CONTENT}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="text-sm min-h-[180px]"
                  placeholder="請用客人看得懂的說法完整回答。"
                />
              ) : (
                <div className="border rounded-md p-3 bg-muted/30 min-h-[180px] whitespace-pre-wrap text-sm">
                  {form.content || "（尚未填寫）"}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {form.content.length}/{MAX_CONTENT}
              </div>
            </div>

            <div className="border-t pt-3">
              <Label className="mb-2 block">測試問答</Label>
              <KnowledgeTestPanel
                accommodationId={currentAccommodationId}
                defaultQuestion={form.title}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="bg-[#F97316] hover:bg-[#F97316]/90 text-white"
            >
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
