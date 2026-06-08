import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, Home } from "lucide-react";
import {
  TRUST_BADGE_ICON_OPTIONS,
  TRUST_BADGE_ICONS,
} from "@/pages/BookingVilla";

interface TrustBadge {
  icon: string;
  label: string;
}

interface OverviewLabels {
  rooms?: string;
  capacity?: string;
  size?: string;
  region?: string;
}

interface Props {
  accommodationId: string;
}

const DEFAULT_LABELS: Required<OverviewLabels> = {
  rooms: "三代同堂剛剛好",
  capacity: "人都住得下",
  size: "坪・烤肉派對 ok",
  region: "景觀環繞",
};

export function VillaPageContentSettings({ accommodationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [badges, setBadges] = useState<TrustBadge[]>([]);
  const [labels, setLabels] = useState<OverviewLabels>({});

  useEffect(() => {
    if (!accommodationId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("accommodation_info")
        .select("villa_trust_badges, villa_overview_labels")
        .eq("id", accommodationId)
        .maybeSingle();
      const b = data?.villa_trust_badges as unknown as TrustBadge[] | null;
      const l = data?.villa_overview_labels as unknown as OverviewLabels | null;
      setBadges(Array.isArray(b) ? b : []);
      setLabels(l && typeof l === "object" ? l : {});
      setLoading(false);
    })();
  }, [accommodationId]);

  const addBadge = () =>
    setBadges([...badges, { icon: "shield-check", label: "" }]);
  const removeBadge = (i: number) =>
    setBadges(badges.filter((_, idx) => idx !== i));
  const updateBadge = (i: number, patch: Partial<TrustBadge>) =>
    setBadges(badges.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const handleSave = async () => {
    setSaving(true);
    const cleanBadges = badges
      .map((b) => ({ icon: b.icon, label: b.label.trim() }))
      .filter((b) => b.label);
    const cleanLabels: OverviewLabels = {};
    (Object.keys(DEFAULT_LABELS) as (keyof OverviewLabels)[]).forEach((k) => {
      const v = (labels[k] || "").trim();
      if (v) cleanLabels[k] = v;
    });
    const { error } = await supabase
      .from("accommodation_info")
      .update({
        villa_trust_badges: cleanBadges.length > 0 ? (cleanBadges as any) : null,
        villa_overview_labels:
          Object.keys(cleanLabels).length > 0 ? (cleanLabels as any) : null,
      })
      .eq("id", accommodationId);
    setSaving(false);
    if (error) {
      toast({
        title: "儲存失敗",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "已儲存包棟頁文案" });
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Home className="h-4 w-4" />
          包棟頁文案 (BookingVilla)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          只影響「包棟訂房頁」上方的標籤與信任徽章；未填則隱藏該區或使用預設文案。
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overview labels */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">總覽四格標籤</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                ["rooms", "房數標籤", DEFAULT_LABELS.rooms],
                ["capacity", "人數標籤", DEFAULT_LABELS.capacity],
                ["size", "坪數標籤", DEFAULT_LABELS.size],
                ["region", "地區標籤", DEFAULT_LABELS.region],
              ] as const
            ).map(([key, lab, ph]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{lab}</Label>
                <Input
                  value={labels[key] || ""}
                  placeholder={`預設：${ph}`}
                  onChange={(e) =>
                    setLabels({ ...labels, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">信任徽章（一排顯示）</h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addBadge}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              新增
            </Button>
          </div>
          {badges.length === 0 && (
            <p className="text-xs text-muted-foreground">
              未新增任何徽章 → 該區塊不會顯示。範例：7 天可取消 / 24h
              管家 / 免費停車
            </p>
          )}
          <div className="space-y-2">
            {badges.map((b, i) => {
              const Icon = TRUST_BADGE_ICONS[b.icon] || TRUST_BADGE_ICONS["shield-check"];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                >
                  <Select
                    value={b.icon}
                    onValueChange={(v) => updateBadge(i, { icon: v })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {b.icon}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TRUST_BADGE_ICON_OPTIONS.map((opt) => {
                        const I = TRUST_BADGE_ICONS[opt];
                        return (
                          <SelectItem key={opt} value={opt}>
                            <span className="flex items-center gap-1.5">
                              <I className="h-3.5 w-3.5" />
                              {opt}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Input
                    value={b.label}
                    placeholder="例：免費停車"
                    onChange={(e) => updateBadge(i, { label: e.target.value })}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeBadge(i)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
