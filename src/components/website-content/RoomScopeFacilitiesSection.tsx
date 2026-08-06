import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";
import { ROOM_SCOPE_LABELS, type RoomScope } from "@/lib/roomScopeFacilities";

export interface ScopeFacilityItem {
  id: string;
  name: string;
  hasPrice: boolean;
}

interface Props {
  accommodationId: string | null;
  /** 分類 -> 項目清單（與整館分頁相同的來源） */
  itemsByCategory: Record<string, ScopeFacilityItem[]>;
  categoryLabels: Record<string, string>;
  /** 整館目前勾選的設施名稱，用於「複製整館勾選」 */
  wholeHouseSelectedNames: string[];
}

const SCOPES: RoomScope[] = ["whole", "single"];

const RoomScopeFacilitiesSection = ({
  accommodationId,
  itemsByCategory,
  categoryLabels,
  wholeHouseSelectedNames,
}: Props) => {
  const [scope, setScope] = useState<RoomScope>("whole");
  const [selected, setSelected] = useState<Record<RoomScope, Record<string, boolean>>>({
    whole: {},
    single: {},
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("accommodation_facilities")
      .select("facility_name, room_scope, is_available")
      .eq("accommodation_id", accommodationId)
      .not("room_scope", "is", null);

    if (!error && data) {
      const next: Record<RoomScope, Record<string, boolean>> = { whole: {}, single: {} };
      for (const row of data as Array<{ facility_name: string; room_scope: string | null; is_available: boolean | null }>) {
        const s = row.room_scope as RoomScope;
        if (s !== "whole" && s !== "single") continue;
        if (row.is_available) next[s][row.facility_name] = true;
      }
      setSelected(next);
    }
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (name: string, checked: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], [name]: checked },
    }));
  };

  const copyFromWholeHouse = () => {
    const next: Record<string, boolean> = {};
    for (const name of wholeHouseSelectedNames) next[name] = true;
    setSelected((prev) => ({ ...prev, [scope]: next }));
    toast.success(`已複製整館勾選到「${ROOM_SCOPE_LABELS[scope]}」，確認後請儲存`);
  };

  const copyFromOtherScope = () => {
    const other: RoomScope = scope === "whole" ? "single" : "whole";
    setSelected((prev) => ({ ...prev, [scope]: { ...prev[other] } }));
    toast.success(`已複製「${ROOM_SCOPE_LABELS[other]}」的勾選，確認後請儲存`);
  };

  const handleSave = async () => {
    if (!accommodationId) {
      toast.error("找不到旅宿資訊");
      return;
    }
    setSaving(true);
    try {
      const rows: Array<{
        accommodation_id: string;
        facility_name: string;
        category: string;
        room_scope: RoomScope;
        pricing_type: string | null;
        is_available: boolean;
      }> = [];

      for (const [category, items] of Object.entries(itemsByCategory)) {
        for (const item of items) {
          if (!selected[scope][item.name]) continue;
          rows.push({
            accommodation_id: accommodationId,
            facility_name: item.name,
            category,
            room_scope: scope,
            pricing_type: null,
            is_available: true,
          });
        }
      }

      // 先清掉此範圍舊資料，再寫入新的（避免 partial unique index 造成 upsert 42P10）
      const { error: delErr } = await supabase
        .from("accommodation_facilities")
        .delete()
        .eq("accommodation_id", accommodationId)
        .eq("room_scope", scope);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("accommodation_facilities").insert(rows);
        if (insErr) throw insErr;
      }

      invalidateAccommodationCache(accommodationId);
      toast.success(`「${ROOM_SCOPE_LABELS[scope]}」設施已儲存`);
      await load();
    } catch (e) {
      toast.error("儲存失敗：" + ((e as any)?.message || "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  if (!accommodationId) return null;

  const currentCount = Object.values(selected[scope]).filter(Boolean).length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">房型專屬設施（包棟／單間）</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              只需分「包棟」與「單間」兩種，不用每個房型各設一次。前台房型卡片會顯示這裡的勾選項目。
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={scope} onValueChange={(v) => setScope(v as RoomScope)}>
          <TabsList>
            {SCOPES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {ROOM_SCOPE_LABELS[s]}
              </TabsTrigger>
            ))}
          </TabsList>

          {SCOPES.map((s) => (
            <TabsContent key={s} value={s} className="space-y-4 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyFromWholeHouse}>
                  <Copy className="h-4 w-4 mr-1" />
                  複製整館勾選
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={copyFromOtherScope}>
                  <Copy className="h-4 w-4 mr-1" />
                  複製「{ROOM_SCOPE_LABELS[s === "whole" ? "single" : "whole"]}」勾選
                </Button>
                <span className="text-sm text-muted-foreground">已選 {currentCount} 項</span>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(itemsByCategory).map(([category, items]) => (
                    <div key={category} className="space-y-3">
                      <p className="font-medium">{categoryLabels[category] || category}</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((item) => (
                          <div key={`${s}-${item.id}`} className="flex items-center space-x-2">
                            <Checkbox
                              id={`scope-${s}-${item.id}`}
                              checked={selected[s][item.name] || false}
                              onCheckedChange={(checked) => toggle(item.name, checked as boolean)}
                              className="h-5 w-5 touch-manipulation"
                            />
                            <Label htmlFor={`scope-${s}-${item.id}`}>{item.name}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  儲存「{ROOM_SCOPE_LABELS[s]}」設施
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RoomScopeFacilitiesSection;
