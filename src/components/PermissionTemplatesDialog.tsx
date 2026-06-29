import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import {
  STAFF_MODULES,
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSION_LEVEL_LABEL,
  ModulePermissionLevel,
} from "@/constants/staffPermissions";

interface Template {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, ModulePermissionLevel>;
  is_system: boolean;
  display_order: number;
}

interface PermissionTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  accommodationName?: string;
  onChanged?: () => void;
}

const emptyTemplate = (): Template => ({
  id: "",
  name: "",
  description: "",
  permissions: { ...DEFAULT_STAFF_PERMISSIONS },
  is_system: false,
  display_order: 0,
});

export function PermissionTemplatesDialog({
  open,
  onOpenChange,
  accommodationId,
  accommodationName,
  onChanged,
}: PermissionTemplatesDialogProps) {
  const [items, setItems] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open && accommodationId) load();
    if (!open) setEditing(null);
  }, [open, accommodationId]);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("permission_templates")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("載入範本失敗");
      setIsLoading(false);
      return;
    }
    setItems(((data ?? []) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: (r.permissions as any) ?? {},
      is_system: r.is_system,
      display_order: r.display_order,
    })));
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("請輸入範本名稱");
      return;
    }
    const payload = {
      accommodation_id: accommodationId,
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      permissions: editing.permissions,
      display_order: editing.display_order,
    };
    const { error } = editing.id
      ? await supabase.from("permission_templates").update(payload).eq("id", editing.id)
      : await supabase.from("permission_templates").insert(payload);
    if (error) {
      toast.error(`儲存失敗：${error.message}`);
      return;
    }
    toast.success(editing.id ? "已更新範本" : "已新增範本");
    setEditing(null);
    await load();
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("permission_templates").delete().eq("id", deleteId);
    if (error) {
      toast.error(`刪除失敗：${error.message}`);
      return;
    }
    toast.success("已刪除範本");
    setDeleteId(null);
    await load();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {editing ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>{editing.id ? "編輯範本" : "新增範本"}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">職位名稱</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="例：清潔組長"
                  disabled={editing.is_system}
                />
                {editing.is_system && (
                  <p className="text-xs text-muted-foreground">系統預設範本不可改名</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">說明</label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="此職位的權限重點"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模組權限</label>
                {STAFF_MODULES.map((m) => (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <span className="text-sm">{m.label}</span>
                    <Select
                      value={editing.permissions[m.key] ?? "hidden"}
                      onValueChange={(v: ModulePermissionLevel) =>
                        setEditing({
                          ...editing,
                          permissions: { ...editing.permissions, [m.key]: v },
                        })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hidden">{PERMISSION_LEVEL_LABEL.hidden}</SelectItem>
                        <SelectItem value="readonly">{PERMISSION_LEVEL_LABEL.readonly}</SelectItem>
                        <SelectItem value="editable">{PERMISSION_LEVEL_LABEL.editable}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button onClick={handleSave}>儲存</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>職位範本管理</DialogTitle>
              <DialogDescription>
                {accommodationName ? `民宿：${accommodationName}` : "為此民宿建立可重複套用的職位範本"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setEditing(emptyTemplate())}>
                  <Plus className="h-4 w-4 mr-1" /> 新增範本
                </Button>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">載入中…</div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">尚無範本，點上方按鈕新增</div>
              ) : (
                <div className="space-y-3">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{t.name}</h3>
                            {t.is_system && <Badge variant="secondary" className="text-[10px]">系統預設</Badge>}
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(t.id)}
                            disabled={t.is_system}
                            title={t.is_system ? "系統預設範本不可刪除" : "刪除"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                        {STAFF_MODULES.map((m) => {
                          const lvl = (t.permissions[m.key] ?? "hidden") as ModulePermissionLevel;
                          const tone =
                            lvl === "editable"
                              ? "bg-primary/10 text-primary"
                              : lvl === "readonly"
                              ? "bg-muted text-foreground"
                              : "bg-muted/40 text-muted-foreground";
                          return (
                            <div key={m.key} className={`flex items-center justify-between rounded px-2 py-1 ${tone}`}>
                              <span>{m.label}</span>
                              <span className="font-medium">{PERMISSION_LEVEL_LABEL[lvl]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除範本</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後，已套用此範本的帳號權限不會自動變動，但範本下拉將不再顯示。確定要刪除嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
