import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Building2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  room_count: number | null;
  is_exclusive_package: boolean | null;
}

interface BreakdownItem {
  room_type_id: string;
  name: string;
  count: number;
}

interface Props {
  accommodationId: string;
}

const SENSAN_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
const HAKUNA_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const OLIVIA_ID = "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8";
const LOCKED_IDS = new Set([SENSAN_ID, HAKUNA_ID, OLIVIA_ID]);

export const ExclusivePackageSettings = ({ accommodationId }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [dailyCapacity, setDailyCapacity] = useState<number | "">("");
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
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
      setRoomTypes((rtRes.data as RoomType[]) || []);
      const acc: any = accRes.data || {};
      setDailyCapacity(acc.daily_capacity ?? "");
      const items: BreakdownItem[] = Array.isArray(acc.exclusive_room_breakdown)
        ? acc.exclusive_room_breakdown
        : [];
      const map: Record<string, number> = {};
      for (const it of items) {
        if (it?.room_type_id) map[it.room_type_id] = Number(it.count) || 0;
      }
      setBreakdown(map);
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
      const c = breakdown[rt.id] || 0;
      rooms += c;
      people += c * (rt.capacity || 0);
    }
    return { rooms, people };
  }, [breakdown, roomTypes]);

  const handleSave = async () => {
    setSaving(true);
    const items: BreakdownItem[] = roomTypes
      .filter((rt) => (breakdown[rt.id] || 0) > 0)
      .map((rt) => ({ room_type_id: rt.id, name: rt.name, count: breakdown[rt.id] }));
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
                影響：新增訂單時的包棟欄位 · 營運分析的可售房數
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
                const count = breakdown[rt.id] || 0;
                const checked = count > 0;
                return (
                  <div
                    key={rt.id}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      checked ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setBreakdown((prev) => {
                          const next = { ...prev };
                          if (v) next[rt.id] = next[rt.id] || 1;
                          else delete next[rt.id];
                          return next;
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
                        disabled={!checked}
                        value={checked ? count : 0}
                        onChange={(e) => {
                          const n = Math.max(0, Number(e.target.value) || 0);
                          setBreakdown((prev) => {
                            const next = { ...prev };
                            if (n <= 0) delete next[rt.id];
                            else next[rt.id] = n;
                            return next;
                          });
                        }}
                        className="w-16 h-9 text-center"
                      />
                      <span className="text-xs text-muted-foreground">間</span>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 mt-2">
                <span className="text-sm text-muted-foreground">包棟總計</span>
                <span className="text-sm font-semibold tabular-nums">
                  {totals.rooms} 間 / {totals.people} 人
                </span>
              </div>
            </div>
          )}
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
