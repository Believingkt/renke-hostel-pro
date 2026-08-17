import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { fetchAmenityItems, type AmenityItem } from "@/lib/amenityAllocation";

interface Props {
  accommodationId: string;
}

const emptyForm = {
  name: "",
  unit: "",
  total_quantity: 1,
  notes: "",
  is_active: true,
};

/** 未來 14 天的每日使用概況 */
function useUsageOverview(accommodationId: string, refreshKey: number) {
  const [usage, setUsage] = useState<Record<string, Record<string, number>>>({});
  const [days, setDays] = useState<string[]>([]);

  useEffect(() => {
    if (!accommodationId) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const list: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      list.push(d.toISOString().slice(0, 10));
    }
    setDays(list);
    supabase
      .rpc("get_amenity_daily_usage", {
        p_accommodation_id: accommodationId,
        p_start: list[0],
        p_end: list[list.length - 1],
        p_exclude_order_id: null,
      })
      .then(({ data }) => {
        const map: Record<string, Record<string, number>> = {};
        (data || []).forEach((row: any) => {
          const item = row.amenity_item_id as string;
          map[item] = map[item] || {};
          map[item][String(row.usage_date).slice(0, 10)] = Number(row.used_qty) || 0;
        });
        setUsage(map);
      });
  }, [accommodationId, refreshKey]);

  return { usage, days };
}

export function AmenityItemsSection({ accommodationId }: Props) {
  const [items, setItems] = useState<AmenityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AmenityItem | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AmenityItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { usage, days } = useUsageOverview(accommodationId, refreshKey);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    try {
      setItems(await fetchAmenityItems(accommodationId));
    } catch (e: any) {
      toast.error("載入備品失敗", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: AmenityItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      unit: item.unit || "",
      total_quantity: item.total_quantity,
      notes: item.notes || "",
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("請輸入備品名稱");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        accommodation_id: accommodationId,
        name: form.name.trim(),
        unit: form.unit.trim() || null,
        total_quantity: Math.max(0, Number(form.total_quantity) || 0),
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("amenity_items").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("amenity_items")
          .insert({ ...payload, display_order: items.length });
        if (error) throw error;
      }
      toast.success("已儲存");
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
      load();
    } catch (e: any) {
      toast.error("儲存失敗", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const { error } = await supabase.from("amenity_items").delete().eq("id", deleting.id);
      if (error) throw error;
      toast.success("已刪除");
      setDeleting(null);
      setRefreshKey((k) => k + 1);
      load();
    } catch (e: any) {
      toast.error("刪除失敗", { description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>備品清單</CardTitle>
            <CardDescription>
              設定每項備品的總數量，訂單分配時會依住宿夜次（入住日～退房前一日）佔用數量。
            </CardDescription>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            新增備品
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? null : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未建立備品，例如：嬰兒床、嬰兒澡盆、電暖器。</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        總數 {item.total_quantity}
                        {item.unit ? ` ${item.unit}` : ""}
                      </Badge>
                      {!item.is_active && (
                        <Badge variant="outline" className="text-xs">
                          停用
                        </Badge>
                      )}
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>未來 14 天剩餘概況</CardTitle>
            <CardDescription>數字為當日剩餘可分配數量（已扣除未取消訂單的佔用）。</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full fixed-table text-sm tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="whitespace-nowrap px-2 py-1 text-left">備品</th>
                  {days.map((d) => (
                    <th key={d} className="whitespace-nowrap px-2 py-1 text-center">
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.is_active)
                  .map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="whitespace-nowrap px-2 py-1">{item.name}</td>
                      {days.map((d) => {
                        const used = usage[item.id]?.[d] ?? 0;
                        const left = Math.max(0, item.total_quantity - used);
                        return (
                          <td
                            key={d}
                            className={`px-2 py-1 text-center ${
                              left === 0 ? "text-destructive font-medium" : ""
                            }`}
                          >
                            {left}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "編輯備品" : "新增備品"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>備品名稱</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：嬰兒床"
                className="text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>總數量</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.total_quantity}
                  onChange={(e) =>
                    setForm({ ...form, total_quantity: parseInt(e.target.value, 10) || 0 })
                  }
                  className="text-base"
                />
              </div>
              <div className="space-y-2">
                <Label>單位（選填）</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="張／組"
                  className="text-base"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>備註（選填）</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="text-base"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>啟用</Label>
                <p className="text-xs text-muted-foreground">停用後訂單將無法再分配此備品</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              刪除備品「{deleting?.name}」會一併移除所有訂單上的分配紀錄，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AmenityItemsSection;
