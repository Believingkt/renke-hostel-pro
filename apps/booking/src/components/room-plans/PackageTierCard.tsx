import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { toast } from "sonner";
import {
  PACKAGE_TIERS, toTierDraft, validateTierDraft, tierDiscountLabel, type TierDraft,
} from "@lakeze/shared/utils/packageTierEditor";

export interface RoomPlanPackage {
  id: string;
  name: string;
  enabled: boolean;
  sale_price: number;
  original_price: number | null;
  tier_prices: Record<string, { sale?: number; original?: number }> | null;
}

interface Props {
  pkg: RoomPlanPackage;
  syncTemplateNames: string[];
  syncEnabled: boolean;
  canEdit: boolean;
  packagesLink: string;
  onSaved: () => void;
}

export function PackageTierCard({ pkg, syncTemplateNames, syncEnabled, canEdit, packagesLink, onSaved }: Props) {
  const [draft, setDraft] = useState<TierDraft>(() => toTierDraft(pkg));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(toTierDraft(pkg)); setErrors([]); }, [pkg]);

  const setCell = (tier: keyof TierDraft, field: "sale" | "original", value: string) =>
    setDraft((d) => ({ ...d, [tier]: { ...d[tier], [field]: value } }));

  const save = async () => {
    const v = validateTierDraft(draft);
    if ("errors" in v) return setErrors(v.errors);
    setErrors([]);
    setSaving(true);
    const { error } = await (supabase.rpc as any)("save_package_tier_prices", {
      p_package_id: pkg.id,
      p_tier_prices: v.payload,
    });
    setSaving(false);
    if (error) return toast.error("儲存失敗", { description: error.message });
    toast.success(`已儲存「${pkg.name}」價格`);
    onSaved();
  };

  return (
    <Card data-testid={`room-plan-card-${pkg.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            {pkg.name}
            <Badge variant={pkg.enabled ? "default" : "secondary"}>{pkg.enabled ? "啟用中" : "已停用"}</Badge>
          </CardTitle>
          <Link to={packagesLink} className="text-xs text-primary underline" data-testid={`room-plan-toggle-link-${pkg.id}`}>
            啟用／停用請至「訂房入住方案」
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PACKAGE_TIERS.map(({ key, label, hint }) => (
            <div key={key} className="rounded-md border p-3 space-y-2" data-testid={`room-plan-tier-${pkg.id}-${key}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </div>
              <Input inputMode="numeric" placeholder="原價（留空＝售價）" value={draft[key].original} disabled={!canEdit}
                onChange={(e) => setCell(key, "original", e.target.value)} data-testid={`room-plan-original-${pkg.id}-${key}`} />
              <Input inputMode="numeric" placeholder={key === "weekday" ? "官網售價（必填）" : "官網售價（留空＝不販售此日型）"}
                value={draft[key].sale} disabled={!canEdit}
                onChange={(e) => setCell(key, "sale", e.target.value)} data-testid={`room-plan-sale-${pkg.id}-${key}`} />
              <p className="text-xs text-muted-foreground" data-testid={`room-plan-discount-${pkg.id}-${key}`}>
                {tierDiscountLabel(draft[key].sale, draft[key].original) ?? "—"}
              </p>
            </div>
          ))}
        </div>
        {syncEnabled && syncTemplateNames.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid={`room-plan-sync-${pkg.id}`}>
            此方案原價會同步到專案：{syncTemplateNames.join("、")}
          </p>
        )}
        {errors.length > 0 && (
          <ul className="text-sm text-destructive list-disc pl-4" data-testid={`room-plan-errors-${pkg.id}`}>
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {canEdit && (
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving} data-testid={`room-plan-save-${pkg.id}`}>
              {saving ? "儲存中…" : "儲存價格"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
