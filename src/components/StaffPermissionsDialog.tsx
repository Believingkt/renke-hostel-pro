import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STAFF_MODULES,
  DEFAULT_STAFF_PERMISSIONS,
  PERMISSION_LEVEL_LABEL,
  ModulePermissionLevel,
} from "@/constants/staffPermissions";

interface StaffPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  accommodationId: string;
}

interface TemplateRow {
  id: string;
  name: string;
  permissions: Record<string, ModulePermissionLevel>;
}

export function StaffPermissionsDialog({
  open,
  onOpenChange,
  userId,
  accommodationId,
}: StaffPermissionsDialogProps) {
  const [perms, setPerms] = useState<Record<string, ModulePermissionLevel>>({
    ...DEFAULT_STAFF_PERMISSIONS,
  });
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("custom");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);

      const [permsRes, tplRes, roleRes] = await Promise.all([
        supabase
          .from("staff_module_permissions")
          .select("module_key, permission_level")
          .eq("user_id", userId)
          .eq("accommodation_id", accommodationId),
        supabase
          .from("permission_templates")
          .select("id, name, permissions")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true }),
        supabase
          .from("user_roles")
          .select("template_id")
          .eq("user_id", userId)
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
      ]);

      if (permsRes.error) {
        toast.error("載入權限失敗");
        setIsLoading(false);
        return;
      }
      const map: Record<string, ModulePermissionLevel> = { ...DEFAULT_STAFF_PERMISSIONS };
      (permsRes.data ?? []).forEach((r: any) => {
        map[r.module_key] = r.permission_level as ModulePermissionLevel;
      });
      setPerms(map);
      setTemplates(((tplRes.data ?? []) as any[]).map((t) => ({
        id: t.id,
        name: t.name,
        permissions: t.permissions as Record<string, ModulePermissionLevel>,
      })));
      setSelectedTemplateId((roleRes.data as any)?.template_id ?? "custom");
      setIsLoading(false);
    };
    load();
  }, [open, userId, accommodationId]);

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === "custom") return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const next: Record<string, ModulePermissionLevel> = { ...DEFAULT_STAFF_PERMISSIONS };
    STAFF_MODULES.forEach((m) => {
      next[m.key] = (tpl.permissions[m.key] as ModulePermissionLevel) ?? "hidden";
    });
    setPerms(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rows = STAFF_MODULES.map((m) => ({
        user_id: userId,
        accommodation_id: accommodationId,
        module_key: m.key,
        permission_level: perms[m.key] ?? DEFAULT_STAFF_PERMISSIONS[m.key],
      }));
      const { error } = await supabase
        .from("staff_module_permissions")
        .upsert(rows, { onConflict: "user_id,accommodation_id,module_key" });
      if (error) throw error;

      // 更新套用的範本標記
      await supabase
        .from("user_roles")
        .update({ template_id: selectedTemplateId === "custom" ? null : selectedTemplateId })
        .eq("user_id", userId)
        .eq("accommodation_id", accommodationId);

      toast.success("已更新權限設定");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`儲存失敗：${e.message ?? "未知錯誤"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = () => {
    setPerms({ ...DEFAULT_STAFF_PERMISSIONS });
    setSelectedTemplateId("custom");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>設定模組權限</DialogTitle>
          <DialogDescription>
            可選擇職位範本一鍵套用，或逐項微調。民宿管理員與總部不受此設定影響。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">載入中…</div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">職位範本</span>
                <Select value={selectedTemplateId} onValueChange={handleApplyTemplate}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="選擇範本" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">自訂（不套用範本）</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Link
                to="/admin/permission-templates"
                className="text-xs text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                管理權限範本 →
              </Link>
            </div>

            <div className="space-y-3">
              {STAFF_MODULES.map((m) => (
                <div
                  key={m.key}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <Select
                    value={perms[m.key]}
                    onValueChange={(v: ModulePermissionLevel) => {
                      setPerms((prev) => ({ ...prev, [m.key]: v }));
                      setSelectedTemplateId("custom");
                    }}
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
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleResetDefault} disabled={isSaving}>
            還原預設
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
