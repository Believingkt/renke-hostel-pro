import { useEffect, useState } from "react";
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

export function StaffPermissionsDialog({
  open,
  onOpenChange,
  userId,
  accommodationId,
}: StaffPermissionsDialogProps) {
  const [perms, setPerms] = useState<Record<string, ModulePermissionLevel>>({
    ...DEFAULT_STAFF_PERMISSIONS,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("staff_module_permissions")
        .select("module_key, permission_level")
        .eq("user_id", userId)
        .eq("accommodation_id", accommodationId);

      if (error) {
        toast.error("載入權限失敗");
        setIsLoading(false);
        return;
      }
      const map: Record<string, ModulePermissionLevel> = { ...DEFAULT_STAFF_PERMISSIONS };
      (data ?? []).forEach((r: any) => {
        map[r.module_key] = r.permission_level as ModulePermissionLevel;
      });
      setPerms(map);
      setIsLoading(false);
    };
    load();
  }, [open, userId, accommodationId]);

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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>設定模組權限</DialogTitle>
          <DialogDescription>
            針對此現場營運人員逐項設定可見與編輯權限。民宿管理員與總部管理員不受此設定影響。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">載入中…</div>
        ) : (
          <div className="space-y-3 py-2">
            {STAFF_MODULES.map((m) => (
              <div
                key={m.key}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="text-sm font-medium">{m.label}</span>
                <Select
                  value={perms[m.key]}
                  onValueChange={(v: ModulePermissionLevel) =>
                    setPerms((prev) => ({ ...prev, [m.key]: v }))
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
