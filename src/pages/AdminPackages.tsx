import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import {
  useAccommodationPackages,
  type AccommodationPackage,
  type PackageTier,
  type PackageInclude,
} from "@/hooks/use-accommodation-packages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, GripVertical, Check, X, MinusCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/AdminPageHeader";

interface RoomTypeOption {
  id: string;
  name: string;
}

const TIER_OPTIONS: { value: PackageTier; label: string }[] = [
  { value: "weekday", label: "平日" },
  { value: "friday_sunday", label: "旺日（週五/日）" },
  { value: "weekend", label: "假日（週六）" },
];

const TAG_OPTIONS = [
  { value: "best_value", label: "最划算" },
  { value: "early_bird", label: "早鳥優惠" },
  { value: "meal_included", label: "一泊二食" },
  { value: "few_people", label: "少人數包棟" },
];

const NONE = "none";

interface FormState {
  name: string;
  subtitle: string;
  guest_count: number;
  guest_count_max: number | null;
  original_price: number | null;
  sale_price: number;
  room_allocation: string;
  applicable_tiers: PackageTier[];
  tags: string[];
  includes: PackageInclude[];
  primary_room_type_id: string;
  display_order: number;
  enabled: boolean;
}

const emptyForm = (): FormState => ({
  name: "",
  subtitle: "",
  guest_count: 2,
  guest_count_max: null,
  original_price: null,
  sale_price: 0,
  room_allocation: "",
  applicable_tiers: ["weekday", "friday_sunday", "weekend"],
  tags: [],
  includes: [],
  primary_room_type_id: NONE,
  display_order: 0,
  enabled: true,
});

const AdminPackages = () => {
  const { currentAccommodationId } = useAccommodation();
  const { packages, refetch } = useAccommodationPackages(currentAccommodationId, {
    onlyEnabled: false,
  });
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [editing, setEditing] = useState<AccommodationPackage | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentAccommodationId) return;
    supabase
      .from("room_types")
      .select("id, name")
      .eq("accommodation_id", currentAccommodationId)
      .order("display_order", { ascending: true })
      .then(({ data }) => setRoomTypes((data || []) as RoomTypeOption[]));
  }, [currentAccommodationId]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      display_order: (packages[packages.length - 1]?.display_order ?? 0) + 1,
    });
    setOpen(true);
  }, [packages]);

  const openEdit = (pkg: AccommodationPackage) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      subtitle: pkg.subtitle ?? "",
      guest_count: pkg.guest_count,
      guest_count_max: pkg.guest_count_max,
      original_price: pkg.original_price,
      sale_price: pkg.sale_price,
      room_allocation: pkg.room_allocation ?? "",
      applicable_tiers: pkg.applicable_tiers,
      tags: pkg.tags,
      includes: pkg.includes ?? [],
      primary_room_type_id: pkg.primary_room_type_id ?? NONE,
      display_order: pkg.display_order,
      enabled: pkg.enabled,
    });
    setOpen(true);
  };

  const toggleEnabled = async (pkg: AccommodationPackage) => {
    const { error } = await supabase
      .from("accommodation_packages")
      .update({ enabled: !pkg.enabled })
      .eq("id", pkg.id);
    if (error) toast({ title: "更新失敗", description: error.message, variant: "destructive" });
    else refetch();
  };

  const handleSave = async () => {
    if (!currentAccommodationId) return;
    if (!form.name.trim()) {
      toast({ title: "請輸入方案名稱", variant: "destructive" });
      return;
    }
    if (form.applicable_tiers.length === 0) {
      toast({ title: "請至少勾選一個適用日", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      accommodation_id: currentAccommodationId,
      name: form.name.trim(),
      subtitle: form.subtitle.trim() || null,
      guest_count: form.guest_count,
      guest_count_max: form.guest_count_max,
      original_price: form.original_price,
      sale_price: form.sale_price,
      room_allocation: form.room_allocation.trim() || null,
      applicable_tiers: form.applicable_tiers,
      tags: form.tags,
      includes: form.includes as any,
      primary_room_type_id: form.primary_room_type_id === NONE ? null : form.primary_room_type_id,
      display_order: form.display_order,
      enabled: form.enabled,
    };
    const { error } = editing
      ? await supabase.from("accommodation_packages").update(payload).eq("id", editing.id)
      : await supabase.from("accommodation_packages").insert([payload]);
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "已更新" : "已新增" });
    setOpen(false);
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("accommodation_packages").delete().eq("id", deleteId);
    if (error) toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
    else {
      toast({ title: "已刪除" });
      refetch();
    }
    setDeleteId(null);
  };

  const updateInclude = (i: number, patch: Partial<PackageInclude>) => {
    setForm((f) => ({
      ...f,
      includes: f.includes.map((inc, idx) => (idx === i ? { ...inc, ...patch } : inc)),
    }));
  };

  const addInclude = () =>
    setForm((f) => ({
      ...f,
      includes: [...f.includes, { text: "", available: "yes" }],
    }));

  const removeInclude = (i: number) =>
    setForm((f) => ({ ...f, includes: f.includes.filter((_, idx) => idx !== i) }));

  if (!currentAccommodationId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">請先選擇民宿</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <AdminPageHeader
        title="銷售方案"
        description="設定民宿首頁訂房區顯示的銷售方案。啟用後，前台會以方案卡取代房型列表。"
        action={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新增方案
          </Button>
        }
      />

      {packages.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          尚未建立任何銷售方案。點右上角「新增方案」開始。
        </div>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:shadow-sm transition-shadow"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold truncate">{pkg.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {pkg.guest_count} 人
                    {pkg.guest_count_max && pkg.guest_count_max !== pkg.guest_count
                      ? `~${pkg.guest_count_max}`
                      : ""}
                  </span>
                  {pkg.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(25,70%,90%)] text-[hsl(25,70%,40%)]"
                    >
                      {TAG_OPTIONS.find((o) => o.value === t)?.label || t}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  <span>
                    NT$ {pkg.sale_price.toLocaleString()}
                    {pkg.original_price && pkg.original_price > pkg.sale_price && (
                      <span className="line-through ml-1.5">
                        {pkg.original_price.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span>
                    適用：
                    {pkg.applicable_tiers
                      .map((t) => TIER_OPTIONS.find((o) => o.value === t)?.label)
                      .join(" / ")}
                  </span>
                </div>
              </div>
              <Switch checked={pkg.enabled} onCheckedChange={() => toggleEnabled(pkg)} />
              <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteId(pkg.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯方案" : "新增方案"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>方案名稱 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例：悠活銷售方案"
              />
            </div>

            <div>
              <Label>副標（選填）</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="例：含早鳥優惠"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>建議人數 *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guest_count}
                  onChange={(e) =>
                    setForm({ ...form, guest_count: parseInt(e.target.value, 10) || 1 })
                  }
                />
              </div>
              <div>
                <Label>人數上限（選填）</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guest_count_max ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      guest_count_max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  placeholder="例：10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>原價（選填，劃掉用）</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.original_price ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      original_price: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label>售價 *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div>
              <Label>房型分配（用逗號分隔）</Label>
              <Input
                value={form.room_allocation}
                onChange={(e) => setForm({ ...form, room_allocation: e.target.value })}
                placeholder="例：豪華雙人房 x 2、溫馨四人房 x 1"
              />
            </div>

            <div>
              <Label>綁定主房型（用於庫存）</Label>
              <Select
                value={form.primary_room_type_id}
                onValueChange={(v) => setForm({ ...form, primary_room_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未綁定</SelectItem>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>適用日 *</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {TIER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.applicable_tiers.includes(opt.value)}
                      onCheckedChange={(c) => {
                        setForm((f) => ({
                          ...f,
                          applicable_tiers: c
                            ? [...f.applicable_tiers, opt.value]
                            : f.applicable_tiers.filter((t) => t !== opt.value),
                        }));
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>標籤</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {TAG_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.tags.includes(opt.value)}
                      onCheckedChange={(c) => {
                        setForm((f) => ({
                          ...f,
                          tags: c
                            ? [...f.tags, opt.value]
                            : f.tags.filter((t) => t !== opt.value),
                        }));
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>附加說明</Label>
                <Button type="button" size="sm" variant="outline" onClick={addInclude}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  新增
                </Button>
              </div>
              <div className="space-y-2">
                {form.includes.map((inc, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Select
                      value={inc.available}
                      onValueChange={(v: any) => updateInclude(i, { available: v })}
                    >
                      <SelectTrigger className="w-[100px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">
                          <span className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 text-emerald-500" />包含
                          </span>
                        </SelectItem>
                        <SelectItem value="optional">
                          <span className="flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5 text-[hsl(25,70%,50%)]" />可選
                          </span>
                        </SelectItem>
                        <SelectItem value="no">
                          <span className="flex items-center gap-1.5">
                            <X className="h-3.5 w-3.5 text-rose-400" />不含
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={inc.text}
                      onChange={(e) => updateInclude(i, { text: e.target.value })}
                      placeholder="例：包含田園精緻早餐"
                    />
                    <Input
                      value={inc.price_note ?? ""}
                      onChange={(e) => updateInclude(i, { price_note: e.target.value })}
                      placeholder="備註（選填）"
                      className="w-[140px] shrink-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInclude(i)}
                    >
                      <MinusCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <label className="flex items-center gap-2 pb-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(c) => setForm({ ...form, enabled: c })}
                />
                <span className="text-sm">啟用此方案</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除方案？</AlertDialogTitle>
            <AlertDialogDescription>
              此動作無法復原。確定要刪除此銷售方案嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPackages;
