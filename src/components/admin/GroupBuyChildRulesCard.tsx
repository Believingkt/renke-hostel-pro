import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Baby, Save } from "lucide-react";
import { toast } from "sonner";
import ChildAgeRulesEditor from "@/components/website-content/ChildAgeRulesEditor";
import {
  initGroupBuyChildRulesFrom,
  parseGroupBuyChildRules,
  type GroupBuyChildRules,
} from "@/lib/groupBuyChildRules";

interface Props {
  campaignId: string | null;
  accommodationId: string | null;
}

/**
 * 團購活動層（Campaign-Level）兒童分齡規則設定。
 * SoT：group_buy_campaigns.child_age_rules；本卡片只寫此欄位，
 * 絕不寫回 accommodation_info.child_age_rules（一般訂房頁完全不受影響）。
 */
const GroupBuyChildRulesCard = ({ campaignId, accommodationId }: Props) => {
  const [rules, setRules] = useState<GroupBuyChildRules | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    (async () => {
      const { data: c } = await supabase
        .from("group_buy_campaigns")
        .select("child_age_rules")
        .eq("id", campaignId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (c as any)?.child_age_rules ?? null;
      if (raw) {
        setRules(parseGroupBuyChildRules(raw));
        setInitialized(true);
        return;
      }
      // 尚未設定：COPY ONCE 由民宿一般規則複製為初始值（僅表單預填，尚未寫入資料庫）
      let accRaw: unknown = null;
      if (accommodationId) {
        const { data: a } = await supabase
          .from("accommodation_info")
          .select("child_age_rules")
          .eq("id", accommodationId)
          .maybeSingle();
        accRaw = (a as any)?.child_age_rules ?? null;
      }
      if (cancelled) return;
      setRules(initGroupBuyChildRulesFrom(accRaw));
      setInitialized(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, accommodationId]);

  const handleSave = async () => {
    if (!campaignId || !rules) return;
    setSaving(true);
    const { error } = await supabase
      .from("group_buy_campaigns")
      .update({ child_age_rules: rules as any })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    setInitialized(true);
    toast.success("已儲存本團購活動的兒童分齡規則");
  };

  if (!campaignId || !rules) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Baby className="h-4 w-4" />
          兒童分齡規則
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          此設定只套用本團購活動，所有方案共用。不會修改一般訂房頁的兒童分齡規則。
          「團購頁顯示」關閉時，團購前台不出現該人數選項，但設定資料完整保留，重新開啟即恢復。
          {!initialized && "（目前尚未儲存，前台仍沿用民宿現行規則；下方為以民宿規則複製的初始值。）"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChildAgeRulesEditor
          value={rules}
          onChange={(next) => setRules({ ...next, tier_visibility: rules.tier_visibility })}
          visibility={{
            value: rules.tier_visibility,
            onChange: (tier_visibility) => setRules({ ...rules, tier_visibility }),
          }}
          noteLabel="備註（顯示於團購頁）"
        />
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "儲存中…" : "儲存規則"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default GroupBuyChildRulesCard;
