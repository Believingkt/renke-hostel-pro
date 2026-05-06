import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoomUnit {
  id: string;
  room_type_id: string;
  accommodation_id: string;
  unit_number: string;
  nickname: string | null;
  display_order: number;
  is_active: boolean;
  notes: string | null;
}

interface RoomUnitsManagerProps {
  roomTypeId: string;
  accommodationId: string;
  roomCount: number;
}

export function RoomUnitsManager({ roomTypeId, accommodationId, roomCount }: RoomUnitsManagerProps) {
  const [units, setUnits] = useState<RoomUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("room_units" as any)
      .select("*")
      .eq("room_type_id", roomTypeId)
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("讀取房間單位失敗");
    } else {
      setUnits((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (roomTypeId) load();
  }, [roomTypeId]);

  const addUnit = () => {
    const nextNum = (units.length + 1).toString();
    setUnits([
      ...units,
      {
        id: `new-${Date.now()}`,
        room_type_id: roomTypeId,
        accommodation_id: accommodationId,
        unit_number: nextNum,
        nickname: "",
        display_order: units.length,
        is_active: true,
        notes: null,
      },
    ]);
  };

  const autoFill = () => {
    if (units.length > 0) {
      toast.error("請先清空現有房間後再自動建立");
      return;
    }
    const generated: RoomUnit[] = Array.from({ length: roomCount }).map((_, i) => ({
      id: `new-${Date.now()}-${i}`,
      room_type_id: roomTypeId,
      accommodation_id: accommodationId,
      unit_number: (i + 1).toString(),
      nickname: "",
      display_order: i,
      is_active: true,
      notes: null,
    }));
    setUnits(generated);
  };

  const updateUnit = (id: string, field: keyof RoomUnit, value: any) => {
    setUnits(units.map((u) => (u.id === id ? { ...u, [field]: value } : u)));
  };

  const removeUnit = (id: string) => {
    setUnits(units.filter((u) => u.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      // 取得原始資料庫狀態
      const { data: existing } = await supabase
        .from("room_units" as any)
        .select("id")
        .eq("room_type_id", roomTypeId);
      const existingIds = new Set(((existing as any) || []).map((e: any) => e.id));
      const currentIds = new Set(units.filter((u) => !u.id.startsWith("new-")).map((u) => u.id));

      // 刪除不在當前列表的
      const toDelete = [...existingIds].filter((id) => !currentIds.has(id as string));
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("room_units" as any)
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      // 檢查 unit_number 重複
      const numbers = units.map((u) => u.unit_number.trim());
      if (new Set(numbers).size !== numbers.length) {
        toast.error("房間編號不可重複");
        setSaving(false);
        return;
      }
      if (numbers.some((n) => !n)) {
        toast.error("房間編號不可空白");
        setSaving(false);
        return;
      }

      // upsert
      const payload = units.map((u, idx) => ({
        ...(u.id.startsWith("new-") ? {} : { id: u.id }),
        room_type_id: roomTypeId,
        accommodation_id: accommodationId,
        unit_number: u.unit_number.trim(),
        nickname: u.nickname?.trim() || null,
        display_order: idx,
        is_active: u.is_active,
        notes: u.notes,
      }));

      const { error } = await supabase
        .from("room_units" as any)
        .upsert(payload as any);
      if (error) throw error;

      toast.success("已儲存房間設定");
      await load();
    } catch (e: any) {
      toast.error("儲存失敗：" + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>房間單位管理</CardTitle>
            <CardDescription>
              為此房型底下的每一間房獨立命名（例：1、201、面海第一間）。設定後，新增訂單時可指定客人入住的房間。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {units.length === 0 && roomCount > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={autoFill}>
                <RefreshCw className="h-4 w-4 mr-1" />
                依房型數量自動建立 {roomCount} 間
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addUnit}>
              <Plus className="h-4 w-4 mr-1" />
              新增房間
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">載入中…</div>
        ) : units.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            尚未建立任何房間單位。可點選右上方按鈕快速建立。
          </div>
        ) : (
          <div className="space-y-2">
            {units.map((u, idx) => (
              <div
                key={u.id}
                className="grid grid-cols-12 gap-2 items-center border rounded-md p-2"
              >
                <div className="col-span-1 text-xs text-muted-foreground text-center">
                  #{idx + 1}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">編號</Label>
                  <Input
                    value={u.unit_number}
                    onChange={(e) => updateUnit(u.id, "unit_number", e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div className="col-span-5">
                  <Label className="text-xs text-muted-foreground">暱稱／備註</Label>
                  <Input
                    value={u.nickname || ""}
                    onChange={(e) => updateUnit(u.id, "nickname", e.target.value)}
                    placeholder="例：面海第一間、靠樓梯"
                  />
                </div>
                <div className="col-span-3 flex items-center gap-2 pt-4">
                  <Switch
                    checked={u.is_active}
                    onCheckedChange={(v) => updateUnit(u.id, "is_active", v)}
                  />
                  <span className="text-xs">{u.is_active ? "啟用" : "停用"}</span>
                </div>
                <div className="col-span-1 pt-4">
                  <Button
                    type="button"
                    variant="ghost-destructive"
                    size="icon"
                    onClick={() => removeUnit(u.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {units.length !== roomCount && roomCount > 0 && !loading && (
          <div className="text-xs text-amber-600">
            提醒：目前房間單位數（{units.length}）與房型數量（{roomCount}）不一致。
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={save} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "儲存中…" : "儲存房間設定"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
