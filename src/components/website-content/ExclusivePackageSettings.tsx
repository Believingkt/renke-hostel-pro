import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, Plus, Trash2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  room_count: number | null;
  is_exclusive_package: boolean | null;
  package_contents?: PackageRoomRow[] | null;
}

// 包棟方案內的房間（自訂行：房名 + 間數 + 是否顯示在預訂管理）
interface PackageRoomRow {
  id: string;
  name: string;
  count: number;
  visible_in_booking_grid?: boolean;
}

// 不屬於任何包棟方案的自訂房型（仍存在 accommodation_info.exclusive_room_breakdown）
interface CustomBreakdownItem {
  custom_id: string;
  custom_name: string;
  capacity: number;
  count: number;
  visible_in_booking_grid?: boolean;
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

  // 每個包棟方案的房間清單，key = room_type_id
  const [packageRows, setPackageRows] = useState<Record<string, PackageRoomRow[]>>({});
  // 不屬於任何包棟方案的自訂房型
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
          .select("daily_capacity, exclusive_room_breakdown")
          .eq("id", accommodationId)
          .maybeSingle(),
        supabase
          .from("room_types")
          .select("id, name, capacity, room_count, is_exclusive_package, package_contents")
          .eq("accommodation_id", accommodationId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const rts = ((rtRes.data as any[]) || []) as RoomType[];
      setRoomTypes(rts);

      const acc: any = accRes.data || {};
      setDailyCapacity(acc.daily_capacity ?? "");

      // 包棟方案 rows ← room_types.package_contents
      const rowsMap: Record<string, PackageRoomRow[]> = {};
      for (const rt of rts) {
        if (!rt.is_exclusive_package) continue;
        const raw = Array.isArray(rt.package_contents) ? rt.package_contents : [];
        rowsMap[rt.id] = raw
          .filter((r: any) => r && (r.name || r.id))
          .map((r: any) => ({
            id: String(r.id || makeId()),
            name: String(r.name || ""),
            count: Math.max(0, Number(r.count) || 0),
            visible_in_booking_grid: r.visible_in_booking_grid !== false,
          }));
      }
      setPackageRows(rowsMap);

      // 其他自訂房型 ← accommodation_info.exclusive_room_breakdown 內 custom_id 項目
      const items: any[] = Array.isArray(acc.exclusive_room_breakdown)
        ? acc.exclusive_room_breakdown
        : [];
      const customs: CustomBreakdownItem[] = items
        .filter((it) => it && it.custom_id)
        .map((it) => ({
          custom_id: String(it.custom_id),
          custom_name: String(it.custom_name || it.name || ""),
          capacity: Number(it.capacity) || 0,
          count: Number(it.count) || 0,
          visible_in_booking_grid: it.visible_in_booking_grid !== false,
        }));
      setCustomItems(customs);

      setHasInitialSetting(
        items.length > 0 ||
          acc.daily_capacity != null ||
          Object.values(rowsMap).some((v) => v.length > 0),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const exclusivePackages = useMemo(
    () => roomTypes.filter((rt) => rt.is_exclusive_package),
    [roomTypes],
  );

  const totals = useMemo(() => {
    let rooms = 0;
    let people = 0;
    // 包棟方案總計：以「包棟方案數量」計算棟數；房間總計可參考各方案內的 rows
    for (const rt of exclusivePackages) {
      const rows = packageRows[rt.id] || [];
      const sum = rows.reduce((s, r) => s + (r.count || 0), 0);
      rooms += sum;
      people += sum > 0 ? (rt.capacity || 0) : 0;
    }
    for (const c of customItems) {
      rooms += c.count;
      people += c.count * (c.capacity || 0);
    }
    return { rooms, people };
  }, [exclusivePackages, packageRows, customItems]);

  const updatePackageRow = (pkgId: string, rowId: string, patch: Partial<PackageRoomRow>) => {
    setPackageRows((prev) => ({
      ...prev,
      [pkgId]: (prev[pkgId] || []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  };
  const addPackageRow = (pkgId: string) => {
    setPackageRows((prev) => ({
      ...prev,
      [pkgId]: [
        ...(prev[pkgId] || []),
        { id: makeId(), name: "", count: 1, visible_in_booking_grid: false },
      ],
    }));
  };
  const removePackageRow = (pkgId: string, rowId: string) => {
    setPackageRows((prev) => ({
      ...prev,
      [pkgId]: (prev[pkgId] || []).filter((r) => r.id !== rowId),
    }));
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
    try {
      // 1) 每個包棟方案 → room_types.package_contents
      const updates = exclusivePackages.map((rt) => {
        const rows = (packageRows[rt.id] || [])
          .filter((r) => r.name.trim() && r.count > 0)
          .map((r) => ({
            id: r.id,
            name: r.name.trim(),
            count: r.count,
            visible_in_booking_grid: r.visible_in_booking_grid !== false,
          }));
        return supabase
          .from("room_types")
          .update({ package_contents: rows.length > 0 ? rows : null } as any)
          .eq("id", rt.id);
      });

      // 2) 其他自訂房型 → accommodation_info.exclusive_room_breakdown
      const customPayload = customItems
        .filter((c) => c.custom_name.trim() && c.count > 0)
        .map((c) => ({
          custom_id: c.custom_id,
          custom_name: c.custom_name.trim(),
          capacity: c.capacity || 0,
          count: c.count,
          visible_in_booking_grid: c.visible_in_booking_grid !== false,
        }));

      const accUpdate = supabase
        .from("accommodation_info")
        .update({
          daily_capacity: dailyCapacity === "" ? null : Number(dailyCapacity),
          exclusive_room_breakdown: customPayload.length > 0 ? customPayload : null,
          exclusive_total_rooms: totals.rooms > 0 ? totals.rooms : null,
        } as any)
        .eq("id", accommodationId);

      const results = await Promise.all([...updates, accUpdate]);
      const firstError = results.find((r) => (r as any).error)?.["error" as any];
      if (firstError) throw firstError;

      toast({ title: "已儲存房型與包棟設定" });
      setHasInitialSetting(true);
    } catch (e: any) {
      toast({
        title: "儲存失敗",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
              每個包棟方案各自設定內含房間。房間清單會用於新增/編輯訂單的選擇欄位與備註氣泡。
              <span className="block mt-0.5 text-xs">
                右側「顯示在預訂管理」開關可控制該房間是否額外列為預訂管理頁上的虛擬列。
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

        {/* 包棟內房間組成（per package） */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">包棟內房間組成</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              每個包棟方案各自填寫內含的房間名稱與間數（例如：雙人房 ×2、四人房 ×1）。
              這些資料會出現在新增訂單、編輯訂單的房間配置欄位，以及訂單備註氣泡。
            </p>
          </div>

          {exclusivePackages.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              尚未建立任何「包棟房型」。請先到「房型管理」新增包棟房型，再回來設定組成。
            </div>
          ) : (
            <div className="space-y-3">
              {exclusivePackages.map((rt) => {
                const rows = packageRows[rt.id] || [];
                return (
                  <div
                    key={rt.id}
                    className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{rt.name}</div>
                          <div className="text-xs text-muted-foreground">
                            可容納 {rt.capacity} 人
                            {rows.length > 0
                              ? ` · 共 ${rows.reduce((s, r) => s + r.count, 0)} 間`
                              : " · 尚未設定內含房間"}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addPackageRow(rt.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> 新增房間
                      </Button>
                    </div>

                    {rows.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic px-1">
                        尚未新增任何房間。
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {rows.map((r) => (
                          <div
                            key={r.id}
                            className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2"
                          >
                            <div className="flex-1 min-w-[160px]">
                              <Input
                                value={r.name}
                                onChange={(e) =>
                                  updatePackageRow(rt.id, r.id, { name: e.target.value })
                                }
                                placeholder="例如：雙人房 / 三人房 / 四人房"
                                className="h-9"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">間數</Label>
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                value={r.count}
                                onChange={(e) =>
                                  updatePackageRow(rt.id, r.id, {
                                    count: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-16 h-9 text-center"
                              />
                              <span className="text-xs text-muted-foreground">間</span>
                            </div>
                            <div className="flex items-center gap-2 pl-2 border-l">
                              <Switch
                                checked={r.visible_in_booking_grid === true}
                                onCheckedChange={(v) =>
                                  updatePackageRow(rt.id, r.id, { visible_in_booking_grid: !!v })
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
                              onClick={() => removePackageRow(rt.id, r.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 其他自訂房型 */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <Label className="text-sm font-medium">其他自訂房型</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                不屬於任何包棟方案、但希望在預訂管理頁顯示的房型（例如散客房）。
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
          <span className="text-sm text-muted-foreground">合計</span>
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
