import { useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, ArrowLeft, Globe, Copy, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  accommodation_id: string | null;
}

interface AccommodationOption {
  id: string;
  name: string;
}

interface PermissionTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  accommodationName?: string;
  accommodations?: AccommodationOption[];
  onChanged?: () => void;
}

const emptyTemplate = (): Template => ({
  id: "",
  name: "",
  description: "",
  permissions: { ...DEFAULT_STAFF_PERMISSIONS },
  is_system: false,
  display_order: 0,
  accommodation_id: null,
});

const toneFor = (lvl: ModulePermissionLevel) =>
  lvl === "editable"
    ? "bg-primary/10 text-primary"
    : lvl === "readonly"
    ? "bg-muted text-foreground"
    : "bg-muted/40 text-muted-foreground";

export function PermissionTemplatesDialog({
  open,
  onOpenChange,
  accommodationId,
  accommodationName,
  accommodations = [],
  onChanged,
}: PermissionTemplatesDialogProps) {
  const [items, setItems] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Batch apply state
  const [batchSource, setBatchSource] = useState<Template | null>(null);
  const [batchTargets, setBatchTargets] = useState<Set<string>>(new Set());
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  useEffect(() => {
    if (open && accommodationId) load();
    if (!open) {
      setEditing(null);
      setBatchSource(null);
    }
  }, [open, accommodationId]);


  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("permission_templates")
      .select("*")
      .or(`accommodation_id.eq.${accommodationId},accommodation_id.is.null`)
      .order("accommodation_id", { ascending: true, nullsFirst: true })
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
      accommodation_id: r.accommodation_id,
    })));
    setIsLoading(false);
  };

  // Names that exist both globally and property-specific → property overrides global
  const shadowedNames = useMemo(() => {
    const globalNames = new Set(items.filter((t) => t.accommodation_id === null).map((t) => t.name));
    const localNames = new Set(items.filter((t) => t.accommodation_id !== null).map((t) => t.name));
    return new Set([...globalNames].filter((n) => localNames.has(n)));
  }, [items]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("請輸入範本名稱");
      return;
    }
    const isGlobal = editing.accommodation_id === null;
    const payload = {
      accommodation_id: isGlobal ? null : accommodationId,
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


  const openBatchApply = (t: Template) => {
    setBatchSource(t);
    // Default: pre-select everything except the source's own accommodation
    const targets = new Set<string>();
    accommodations.forEach((a) => {
      if (t.accommodation_id !== a.id) targets.add(a.id);
    });
    setBatchTargets(targets);
  };

  const submitBatchApply = async () => {
    if (!batchSource) return;
    if (batchTargets.size === 0) {
      toast.error("請至少選擇一間民宿");
      return;
    }
    setBatchSubmitting(true);
    try {
      // Load existing property-specific templates with the same name across targets
      const { data: existing, error: exErr } = await supabase
        .from("permission_templates")
        .select("id, accommodation_id, name")
        .in("accommodation_id", Array.from(batchTargets))
        .eq("name", batchSource.name);
      if (exErr) throw exErr;

      const existingMap = new Map<string, string>();
      (existing ?? []).forEach((r: any) => existingMap.set(r.accommodation_id, r.id));

      const updates: Promise<any>[] = [];
      const inserts: any[] = [];
      Array.from(batchTargets).forEach((accId) => {
        const payload = {
          accommodation_id: accId,
          name: batchSource.name,
          description: batchSource.description,
          permissions: batchSource.permissions,
          display_order: batchSource.display_order,
        };
        const existId = existingMap.get(accId);
        if (existId) {
          updates.push(
            (async () =>
              await supabase.from("permission_templates").update(payload).eq("id", existId))()
          );
        } else {
          inserts.push(payload);
        }
      });

      if (inserts.length > 0) {
        const { error } = await supabase.from("permission_templates").insert(inserts);
        if (error) throw error;
      }
      const upResults = await Promise.all(updates);
      const upErr = upResults.find((r: any) => r?.error);
      if (upErr?.error) throw upErr.error;

      toast.success(
        `已套用至 ${batchTargets.size} 間民宿（新增 ${inserts.length}、更新 ${updates.length}）`
      );
      setBatchSource(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(`批次套用失敗：${e.message ?? "未知錯誤"}`);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const toggleBatchTarget = (id: string) => {
    setBatchTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
                <Checkbox
                  id="template-global"
                  checked={editing.accommodation_id === null}
                  disabled={editing.is_system}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, accommodation_id: v ? null : accommodationId })
                  }
                />
                <div className="space-y-0.5 leading-tight">
                  <label htmlFor="template-global" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> 套用至全館（所有民宿共用）
                  </label>
                  <p className="text-xs text-muted-foreground">
                    勾選後，此範本會出現在所有民宿的權限設定中，僅總部管理員可管理。
                  </p>
                </div>
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

            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <div className="font-medium text-foreground">套用優先順序</div>
                <div className="text-muted-foreground">
                  同名時：<span className="font-medium text-foreground">民宿自訂範本</span> ＞ <span className="font-medium text-foreground">全館通用範本</span>。
                  套用權限時，若該民宿存在同名自訂版本，會自動改用自訂版本。
                </div>
              </div>
            </div>

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
                  {items.map((t) => {
                    const isGlobal = t.accommodation_id === null;
                    const isShadowedGlobal = isGlobal && shadowedNames.has(t.name);
                    return (
                      <div key={t.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm">{t.name}</h3>
                              {t.is_system && <Badge variant="secondary" className="text-[10px]">系統預設</Badge>}
                              {isGlobal && (
                                <Badge variant="outline" className="text-[10px] gap-0.5">
                                  <Globe className="h-3 w-3" /> 全館通用
                                </Badge>
                              )}
                              {isShadowedGlobal && (
                                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                                  已被民宿自訂覆蓋
                                </Badge>
                              )}
                              {!isGlobal && shadowedNames.has(t.name) && (
                                <Badge variant="outline" className="text-[10px] border-primary text-primary">
                                  覆蓋全館同名範本
                                </Badge>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground">{t.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {accommodations.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="批次套用到多間民宿"
                                onClick={() => openBatchApply(t)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
                            return (
                              <div key={m.key} className={`flex items-center justify-between rounded px-2 py-1 ${toneFor(lvl)}`}>
                                <span>{m.label}</span>
                                <span className="font-medium">{PERMISSION_LEVEL_LABEL[lvl]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>


      {/* Batch apply dialog */}
      <Dialog open={!!batchSource} onOpenChange={(o) => !o && !batchSubmitting && setBatchSource(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4" /> 批次套用範本
            </DialogTitle>
            <DialogDescription>
              將「{batchSource?.name}」的權限內容套用到以下民宿。同名的自訂範本會被覆蓋更新，沒有的則新增。
            </DialogDescription>
          </DialogHeader>
          {batchSource && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>已選 {batchTargets.size} / {accommodations.length}</span>
                <div className="flex gap-2">
                  <button
                    className="hover:underline"
                    onClick={() => setBatchTargets(new Set(accommodations.map((a) => a.id)))}
                  >全選</button>
                  <button
                    className="hover:underline"
                    onClick={() => setBatchTargets(new Set())}
                  >清除</button>
                </div>
              </div>
              <div className="rounded-md border divide-y max-h-[45vh] overflow-y-auto">
                {accommodations.map((a) => {
                  const checked = batchTargets.has(a.id);
                  const isSource = batchSource.accommodation_id === a.id;
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleBatchTarget(a.id)} />
                      <span className="flex-1">{a.name}</span>
                      {isSource && (
                        <span className="text-[10px] text-muted-foreground">來源民宿</span>
                      )}
                    </label>
                  );
                })}
                {accommodations.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">無其他民宿</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={batchSubmitting} onClick={() => setBatchSource(null)}>
              取消
            </Button>
            <Button onClick={submitBatchApply} disabled={batchSubmitting}>
              {batchSubmitting ? "套用中…" : `套用到 ${batchTargets.size} 間民宿`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
