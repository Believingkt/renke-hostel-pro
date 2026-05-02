import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  accommodationId: string;
}

export const GoogleReviewsSettings = ({ accommodationId }: Props) => {
  const [placeId, setPlaceId] = useState("");
  const [originalPlaceId, setOriginalPlaceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("accommodation_info")
      .select("google_place_id")
      .eq("id", accommodationId)
      .maybeSingle();
    if (data) {
      const pid = data.google_place_id || "";
      setPlaceId(pid);
      setOriginalPlaceId(pid);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = placeId.trim();
    const { error } = await supabase
      .from("accommodation_info")
      .update({ google_place_id: trimmed || null })
      .eq("id", accommodationId);
    if (error) {
      toast.error("儲存失敗:" + error.message);
    } else {
      toast.success("已儲存 Google Place ID");
      setOriginalPlaceId(trimmed);
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">Google 評論串接</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              填入 Google 地點 ID,系統自動抓取最新 5 則評論顯示於前台「旅客評價」區
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="google-place-id" className="text-base font-medium">
            Google Place ID
          </Label>
          <Input
            id="google-place-id"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="例:ChIJN1t_tDeuEmsRUsoyG83frY4"
            className="h-11 text-base font-mono"
          />
          <p className="text-xs text-muted-foreground">
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id?hl=zh-tw"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              如何找到 Place ID
              <ExternalLink className="h-3 w-3" />
            </a>
            {" "}· 留空會關閉 Google 評論,改顯示原本手動評論
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || placeId.trim() === originalPlaceId}
          >
            {saving ? "儲存中..." : "儲存 Place ID"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
