import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  ROOM_FACILITY_CATEGORIES,
  ROOM_SCOPE_LABELS,
  type RoomFacilityScope,
} from "@/lib/room-facilities-catalog";

interface Props {
  accommodationId: string;
}

type ScopeSelection = Record<string, Set<string>>; // category -> names

const emptySelection = (): ScopeSelection =>
  Object.fromEntries(Object.keys(ROOM_FACILITY_CATEGORIES).map((k) => [k, new Set<string>()]));

export const RoomScopeFacilitiesSection = ({ accommodationId }: Props) => {
  const [scope, setScope] = useState<RoomFacilityScope>("whole");
  const [showScope, setShowScope] = useState<Record<RoomFacilityScope, boolean>>({
    whole: true,
    single: true,
  });
  const [selections, setSelections] = useState<Record<RoomFacilityScope, ScopeSelection>>({
    whole: emptySelection(),
    single: emptySelection(),
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      const [{ data, error }, { data: info }] = await Promise.all([
        supabase
          .from("accommodation_facilities")
          .select("facility_name, category, room_scope, is_available")
          .eq("accommodation_id", accommodationId)
          .in("room_scope", ["whole", "single"]),
        supabase
          .from("accommodation_info")
          .select("show_room_facilities_whole, show_room_facilities_single")
          .eq("id", accommodationId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (info)
        setShowScope({
          whole: (info as any).show_room_facilities_whole !== false,
          single: (info as any).show_room_facilities_single !== false,
        });
      if (error) return;
      const next: Record<RoomFacilityScope, ScopeSelection> = {
        whole: emptySelection(),
        single: emptySelection(),
      };
      (data || []).forEach((row: any) => {
        if (row.is_available === false) return;
        const s = row.room_scope as RoomFacilityScope;
        if (!next[s]) return;
        if (!next[s][row.category]) next[s][row.category] = new Set<string>();
        next[s][row.category].add(row.facility_name);
      });
      setSelections(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const toggleFrontend = async (target: RoomFacilityScope, checked: boolean) => {
    setShowScope((prev) => ({ ...prev, [target]: checked }));
    const column =
      target === "whole" ? "show_room_facilities_whole" : "show_room_facilities_single";
    const { error } = await supabase
      .from("accommodation_info")
      .update({ [column]: checked } as any)
      .eq("id", accommodationId);
    if (error) {
      setShowScope((prev) => ({ ...prev, [target]: !checked }));
      toast.error("更新顯示開關失敗");
      return;
    }
    toast.success(
      `${ROOM_SCOPE_LABELS[target]}客房設施已${checked ? "開啟" : "關閉"}前台顯示`
    );
  };



  const toggle = (category: string, name: string, checked: boolean) => {
    setSelections((prev) => {
      const scoped = { ...prev[scope] };
      const set = new Set(scoped[category] || []);
      if (checked) set.add(name);
      else set.delete(name);
      scoped[category] = set;
      return { ...prev, [scope]: scoped };
    });
  };

  const copyFromOther = () => {
    const from: RoomFacilityScope = scope === "whole" ? "single" : "whole";
    setSelections((prev) => {
      const cloned: ScopeSelection = {};
      Object.entries(prev[from]).forEach(([cat, set]) => {
        cloned[cat] = new Set(set);
      });
      return { ...prev, [scope]: cloned };
    });
    toast.success(`已複製「${ROOM_SCOPE_LABELS[from]}」的勾選，記得儲存`);
  };

  const handleSave = async () => {
    if (!accommodationId) return;
    setIsSaving(true);
    try {
      const rows = Object.entries(selections[scope]).flatMap(([category, set]) =>
        Array.from(set).map((facility_name) => ({
          accommodation_id: accommodationId,
          category,
          facility_name,
          is_available: true,
          room_scope: scope,
        }))
      );

      const { error: delError } = await supabase
        .from("accommodation_facilities")
        .delete()
        .eq("accommodation_id", accommodationId)
        .eq("room_scope", scope);
      if (delError) throw delError;

      if (rows.length > 0) {
        const { error } = await supabase.from("accommodation_facilities").insert(rows);
        if (error) throw error;
      }
      toast.success(`「${ROOM_SCOPE_LABELS[scope]}」客房設施已儲存`);
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      toast.error("儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  };

  const current = selections[scope];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-1.5 bg-primary rounded-full" />
              <div>
                <CardTitle className="text-xl">客房設施（包棟 / 單間）</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  依包棟與單間分別設定客房內的設施項目，可一鍵複製同步
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-room-scope-facilities"
                  checked={showOnFrontend}
                  onCheckedChange={toggleFrontend}
                />
                <Label htmlFor="show-room-scope-facilities" className="text-sm cursor-pointer">
                  前台顯示
                </Label>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={copyFromOther}>
                <Copy className="h-4 w-4" />
                從「{ROOM_SCOPE_LABELS[scope === "whole" ? "single" : "whole"]}」複製勾選
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!showOnFrontend && (
            <p className="text-sm text-muted-foreground mb-3">
              目前已關閉前台顯示，客人在訂房頁不會看到客房設施內容（設定仍會保留）。
            </p>
          )}
          <Tabs value={scope} onValueChange={(v) => setScope(v as RoomFacilityScope)}>
            <TabsList>
              <TabsTrigger value="whole">包棟</TabsTrigger>
              <TabsTrigger value="single">單間</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>

      </Card>

      {Object.entries(ROOM_FACILITY_CATEGORIES).map(([key, { title, description, items }]) => (
        <Card key={key}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-1.5 bg-primary rounded-full" />
              <div>
                <CardTitle className="text-xl">{title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {items.map((item) => (
                <div key={item} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${scope}-${key}-${item}`}
                    checked={current[key]?.has(item) || false}
                    onCheckedChange={(checked) => toggle(key, item, checked as boolean)}
                    className="h-5 w-5 touch-manipulation"
                  />
                  <Label htmlFor={`${scope}-${key}-${item}`} className="text-sm font-normal cursor-pointer">
                    {item}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <SaveButtonContainer
        onSave={handleSave}
        isSaving={isSaving}
        saveText={`儲存「${ROOM_SCOPE_LABELS[scope]}」客房設施`}
      />
    </div>
  );
};

export default RoomScopeFacilitiesSection;
