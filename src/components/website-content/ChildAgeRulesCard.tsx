import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Baby, Save } from "lucide-react";
import { toast } from "sonner";
import ChildAgeRulesEditor from "./ChildAgeRulesEditor";
import {
  DEFAULT_CHILD_AGE_RULES,
  parseChildAgeRules,
  summarizeChildRules,
  type ChildAgeRules,
} from "@/lib/child-rules";

interface Props {
  accommodationId: string | null;
}

const ChildAgeRulesCard = ({ accommodationId }: Props) => {
  const [rules, setRules] = useState<ChildAgeRules>(DEFAULT_CHILD_AGE_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("accommodation_info")
        .select("child_age_rules")
        .eq("id", accommodationId)
        .maybeSingle();
      if (cancelled) return;
      setRules(parseChildAgeRules(data?.child_age_rules));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const handleSave = async () => {
    if (!accommodationId) return;
    setSaving(true);
    const { error } = await supabase
      .from("accommodation_info")
      .update({ child_age_rules: rules as any })
      .eq("id", accommodationId);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      toast.success("已儲存兒童分齡規則");
    }
  };

  if (!accommodationId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Baby className="h-4 w-4 text-primary" />
          兒童分齡規則
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          設定嬰兒 / 幼兒 / 兒童的年齡區間、人數上限與每晚加價。各方案可在「方案管理」中個別覆寫。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : (
          <>
            <ChildAgeRulesEditor value={rules} onChange={setRules} />
            <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              預覽：{summarizeChildRules(rules)}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? "儲存中…" : "儲存規則"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ChildAgeRulesCard;
