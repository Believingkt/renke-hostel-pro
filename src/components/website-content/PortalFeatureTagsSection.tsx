import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag, Plus, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";
import { toast } from "@/hooks/use-toast";

const PRESET_TAGS = [
  "寵物友善",
  "BBQ 烤肉",
  "獨立廚房",
  "泳池",
  "KTV 歡唱",
  "含早餐",
  "免費停車",
  "免費 WiFi",
  "桌遊娛樂",
  "親子友善",
];

const FEATURE_TAG_RULES: Array<{ test: (name: string) => boolean; label: string }> = [
  { test: (n) => /寵物|pet/i.test(n), label: "寵物友善" },
  { test: (n) => /BBQ|烤肉|戶外用餐/i.test(n), label: "BBQ 烤肉" },
  { test: (n) => /廚房|kitchen/i.test(n), label: "獨立廚房" },
  { test: (n) => /泳池|游泳/i.test(n), label: "泳池" },
  { test: (n) => /KTV|卡拉OK|karaoke/i.test(n), label: "KTV 歡唱" },
  { test: (n) => /早餐|breakfast/i.test(n), label: "含早餐" },
  { test: (n) => /停車|parking/i.test(n), label: "免費停車" },
  { test: (n) => /WIFI|wifi|無線/i.test(n), label: "免費 WiFi" },
  { test: (n) => /桌遊|遊戲|board/i.test(n), label: "桌遊娛樂" },
  { test: (n) => /兒童|嬰兒|kids|baby/i.test(n), label: "親子友善" },
];

interface Props {
  accommodationId: string;
}

export const PortalFeatureTagsSection = ({ accommodationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hasOverride, setHasOverride] = useState(false);
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: acc }, { data: facs }] = await Promise.all([
          supabase
            .from("accommodation_info")
            .select("feature_tags_override")
            .eq("id", accommodationId)
            .maybeSingle(),
          supabase
            .from("accommodation_facilities")
            .select("facility_name")
            .eq("accommodation_id", accommodationId)
            .eq("is_available", true),
        ]);
        if (cancelled) return;

        const override = (acc?.feature_tags_override as string[] | null) || [];
        setHasOverride(override.length > 0);
        setSelectedTags(override);

        const derived = new Set<string>();
        (facs || []).forEach((f) => {
          for (const rule of FEATURE_TAG_RULES) {
            if (rule.test(f.facility_name)) {
              derived.add(rule.label);
              break;
            }
          }
        });
        setAutoTags(Array.from(derived));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustom = () => {
    const v = customInput.trim();
    if (!v) return;
    if (!selectedTags.includes(v)) setSelectedTags([...selectedTags, v]);
    setCustomInput("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = selectedTags.length > 0 ? selectedTags : null;
      const { error } = await supabase
        .from("accommodation_info")
        .update({ feature_tags_override: payload })
        .eq("id", accommodationId);
      if (error) throw error;
      setHasOverride(selectedTags.length > 0);
      toast({ title: "已儲存", description: "搜尋結果特色標籤已更新" });
    } catch (e: any) {
      toast({ title: "儲存失敗", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ feature_tags_override: null })
        .eq("id", accommodationId);
      if (error) throw error;
      setSelectedTags([]);
      setHasOverride(false);
      toast({ title: "已重設", description: "改為自動從設施推導" });
    } catch (e: any) {
      toast({ title: "重設失敗", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const customTags = selectedTags.filter((t) => !PRESET_TAGS.includes(t));

  return (
    <Card className="p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4" />
            搜尋結果特色標籤
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            顯示於 /booking 搜尋結果卡片上的最多 3 個標籤。留空則自動從設施推導。
          </p>
        </div>
        <Badge variant={hasOverride ? "default" : "secondary"} className="shrink-0">
          {hasOverride ? "手動設定" : "自動推導"}
        </Badge>
      </div>

      {loading ? null : (
        <>
          {/* 自動推導預覽 */}
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <Sparkles className="h-3 w-3" />
              目前自動推導結果（依據已啟用設施）
            </p>
            {autoTags.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">尚無可推導的標籤</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {autoTags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 手動勾選 */}
          <div>
            <Label className="text-sm">勾選要顯示的標籤</Label>
            <p className="text-xs text-muted-foreground mb-2">
              勾選後將完全覆蓋自動推導結果。
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((t) => {
                const active = selectedTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 自訂 */}
          <div>
            <Label className="text-sm">自訂標籤</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="例：溫泉、湖景"
                maxLength={10}
              />
              <Button type="button" variant="outline" onClick={addCustom}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {customTags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1"
                  >
                    {t}
                    <button type="button" onClick={() => toggleTag(t)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 動作按鈕 */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存設定"}
            </Button>
            {hasOverride && (
              <Button variant="outline" onClick={handleClear} disabled={saving}>
                重設為自動
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
