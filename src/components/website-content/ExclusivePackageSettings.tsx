import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  room_count: number | null;
  is_exclusive_package: boolean | null;
}

// 既有的「房型」行（room_type_id 對應 DB）
interface RoomBreakdownItem {
  room_type_id: string;
  name: string;
  count: number;
  visible_in_booking_grid?: boolean; // 預設 true
}

// 新的「自訂行」（不對應 room_types，純粹用於人數/間數合計與顯示）
interface CustomBreakdownItem {
  custom_id: string; // 識別用
  custom_name: string;
  capacity: number;
  count: number;
  visible_in_booking_grid?: boolean;
}

type AnyBreakdownItem = RoomBreakdownItem | CustomBreakdownItem;

function isCustomItem(it: AnyBreakdownItem): it is CustomBreakdownItem {
  return (it as CustomBreakdownItem).custom_id !== undefined;
}

interface Props {
  accommodationId: string;
}

const SENSAN_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
const HAKUNA_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const OLIVIA_ID = "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8";
const LOCKED_IDS = new Set([SENSAN_ID, HAKUNA_ID, OLIVIA_ID]);

const makeId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

export const ExclusivePackageSettings = ({ accommodationId }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [dailyCapacity, setDailyCapacity] = useState<number | "">("");

  // 每個房型一筆設定：count + 可見性
  const [roomState, setRoomState] = useState<
    Record<string, { count: number; visible: boolean; checked: boolean }>
  >({});

  // 自訂行
  const [customItems, setCustomItems] = useState<CustomBreakdownItem[]>([]);

  const [hasInitialSetting, setHasInitialSetting] = useState(false);

  const isLocked = LOCKED_IDS.has(accommodationId);

  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [accRes, rtRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("daily_capacity, exclusive_room_breakdown, exclusive_total_rooms")
          .eq("id", accommodationId)
          .maybeSingle(),
        supabase
          .from("room_types")
          .select("id, name, capacity, room_count, is_exclusive_package")
          .eq("accommodation_id", accommodationId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const rts = (rtRes.data as RoomType[]) || [];
      setRoomTypes(rts);

      const acc: any = accRes.data || {};
      setDailyCapacity(acc.daily_capacity ?? "");

      const items: AnyBreakdownItem[] = Array.isArray(acc.exclusive_room_breakdown)
        ? acc.exclusive_room_breakdown
        : [];

      // 初始化每個房型的狀態
      const rs: Record<string, { count: number; visible: boolean; checked: boolean }> = {};
      for (const rt of rts) {
        rs[rt.id] = { count: 0, visible: true, checked: false };
      }
      const customs: CustomBreakdownItem[] = [];
      for (const it of items) {
        if (isCustomItem(it)) {
          customs.push({
            custom_id: it.custom_id || makeId(),
            custom_name: it.custom_name || "",
            capacity: Number(it.capacity) || 0,
            count: Number(it.count) || 0,
            visible_in_booking_grid: it.visible_in_booking_grid !== false,
          });
        } else if (it.room_type_id && rs[it.room_type_id]) {
          rs[it.room_type_id] = {
            count: Number(it.count) || 0,
            visible: it.visible_in_booking_grid !== false,
            checked: (Number(it.count) || 0) > 0,
          };
        }
      }
      setRoomState(rs);
      setCustomItems(customs);
      setHasInitialSetting(items.length > 0 || acc.daily_capacity != null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const totals = useMemo(() => {
    let rooms = 0;
    let people = 0;
    for (const rt of roomTypes) {
      const s = roomState[rt.id];
      if (!s || !s.checked) continue;
      rooms += s.count;
      people += s.count * (rt.capacity || 0);
    }
    for (const c of customItems) {
      rooms += c.count;
      people += c.count * (c.capacity || 0);
    }
    return { rooms, people };
  }, [roomState, customItems, roomTypes]);

  const updateRoom = (
    id: string,
    patch: Partial<{ count: number; visible: boolean; checked: boolean }>,
  ) => {
    setRoomState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const addCustom = () => {
    setCustomItems((prev) => [
      ...prev,
      {
        custom_id: makeId(),
        custom_name: "",
        capacity: 2,
        count: 1,
        visible_in_booking_grid: true,
      },
    ]);
  };

  const updateCustom = (id: string, patch: Partial<CustomBreakdownItem>) => {
    setCustomItems((prev) => prev.map((c) => (c.custom_id === id ? { ...c, ...patch } : c)));
  };

  const removeCustom = (id: string) => {
    setCustomItems((prev) => prev.filter((c) => c.custom_id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    const items: AnyBreakdownItem[] = [];
    for (const rt of roomTypes) {
      const s = roomState[rt.id];
      if (!s || !s.checked || s.count <= 0) continue;
      items.push({
        room_type_id: rt.id,
        name: rt.name,
        count: s.count,
        visible_in_booking_grid: s.visible,
      });
    }
    for (const c of customItems) {
      if (!c.custom_name.trim() || c.count <= 0) continue;
      items.push({
        custom_id: c.custom_id,
        custom_name: c.custom_name.trim(),
        capacity: c.capacity || 0,
        count: c.count,
        visible_in_booking_grid: c.visible_in_booking_grid !== false,
      } as any);
    }
    const payload: any = {
      daily_capacity: dailyCapacity === "" ? null : Number(dailyCapacity),
      exclusive_room_breakdown: items.length > 0 ? items : null,
      exclusive_total_rooms: items.length > 0 ? totals.rooms : null,
    };
    const { error } = await supabase
      .from("accommodation_info")
      .update(payload)
      .eq("id", accommodationId);
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "已儲存房型與包棟設定" });
      setHasInitialSetting(true);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div className="flex-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              房型與包棟設定
            </CardTitle>
            <CardDescription className="mt-1">
              設定每日總可售房數，以及包棟方案包含哪些房型、各幾間。
              <span className="block mt-0.5 text-xs">
                影響：新增訂單時的包棟欄位 · 營運分析的可售房數 · 預訂管理頁顯示
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLocked && !hasInitialSetting && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            這是已上線的民宿（森山 / 哈庫納 / 奧莉維亞），目前使用預設值。若儲存設定將覆寫預設行為，請確認後再儲存。
          </div>
        )}

        {/* 每日總可售房數 */}
        <div className="space-y-2 max-w-xs">
          <Label className="text-sm font-medium">每日總可售房數</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              value={dailyCapacity}
              onChange={(e) => setDailyCapacity(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="預設 6"
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">房</span>
          </div>
          <p className="text-xs text-muted-foreground">用於營運分析計算住房率。留空 = 6。</p>
        </div>

        <div className="border-t" />

        {/* 包棟組成 */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <Label className="text-sm font-medium">包棟內房間組成</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                勾選包棟內包含的房型，並填寫各房型間數。沒勾的房型不會出現在新增訂單及編輯的包棟選擇欄位。
                每一列右側的「顯示在預訂管理」開關可控制該房型是否出現在預訂管理頁面。
              </p>
            </div>
          </div>

          {roomTypes.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              尚未建立房型。請先到「房型管理」新增房型，再回來設定包棟組成。
            </div>
          ) : (
            <div className="space-y-2">
              {roomTypes.map((rt) => {
                const s = roomState[rt.id] || { count: 0, visible: true, checked: false };
                return (
                  <div
                    key={rt.id}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      s.checked ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <Checkbox
                      checked={s.checked}
                      onCheckedChange={(v) => {
                        const checked = !!v;
                        updateRoom(rt.id, {
                          checked,
                          count: checked ? Math.max(s.count, 1) : 0,
                        });
                      }}
                    />
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm font-medium">{rt.name}</div>
                      <div className="text-xs text-muted-foreground">
                        可容納 {rt.capacity} 人
                        {rt.is_exclusive_package ? " · 房型已標記為包區房型" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">包含</Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        disabled={!s.checked}
                        value={s.checked ? s.count : 0}
                        onChange={(e) => {
                          const n = Math.max(0, Number(e.target.value) || 0);
                          updateRoom(rt.id, {
                            count: n,
                            checked: n > 0,
                          });
                        }}
                        className="w-16 h-9 text-center"
                      />
                      <span className="text-xs text-muted-foreground">間</span>
                    </div>
                    <div className="flex items-center gap-2 pl-2 border-l">
                      <Switch
                        checked={s.visible}
                        onCheckedChange={(v) => updateRoom(rt.id, { visible: !!v })}
                      />
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">
                        顯示在預訂管理
                      </Label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 自訂房型 */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <Label className="text-sm font-medium">其他自訂房型</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                自由新增不屬於上方房型表的項目（例如：雙人房、三人房、四人房等），會一併計入「包棟總計」。
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCustom}>
              <Plus className="h-4 w-4 mr-1" /> 新增自訂房型
            </Button>
          </div>

          {customItems.length > 0 && (
            <div className="space-y-2">
              {customItems.map((c) => (
                <div
                  key={c.custom_id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <Input
                      value={c.custom_name}
                      onChange={(e) => updateCustom(c.custom_id, { custom_name: e.target.value })}
                      placeholder="例如：雙人房 / 三人房 / 四人房"
                      className="h-9"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">可容納</Label>
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      value={c.capacity}
                      onChange={(e) =>
                        updateCustom(c.custom_id, {
                          capacity: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-16 h-9 text-center"
                    />
                    <span className="text-xs text-muted-foreground">人</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">間數</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={c.count}
                      onChange={(e) =>
                        updateCustom(c.custom_id, {
                          count: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-16 h-9 text-center"
                    />
                    <span className="text-xs text-muted-foreground">間</span>
                  </div>
                  <div className="flex items-center gap-2 pl-2 border-l">
                    <Switch
                      checked={c.visible_in_booking_grid !== false}
                      onCheckedChange={(v) =>
                        updateCustom(c.custom_id, { visible_in_booking_grid: !!v })
                      }
                    />
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      顯示在預訂管理
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeCustom(c.custom_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">包棟總計</span>
          <span className="text-sm font-semibold tabular-nums">
            {totals.rooms} 間 / {totals.people} 人
          </span>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            儲存房型與包棟設定
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
