import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { groupedBonusFormulas } from "@/lib/bonusFormulas";

/**
 * 結算規則說明：由 bonusFormulas registry 自動渲染，
 * 避免說明文字與實際計算脫節。每項附 anchor id 供公式提示跳轉。
 */
export function BonusRulesReference() {
  const groups = groupedBonusFormulas();
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Card key={g.category}>
          <CardHeader>
            <CardTitle className="text-base">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {g.items.map((f) => (
              <div key={f.key} id={f.anchorId} className="scroll-mt-24 border-b pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.name}</span>
                  {f.usesVenueRevenue && (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      受業主自帶雙軌影響
                    </Badge>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs leading-relaxed">{f.formula}</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.basis}</p>
                {f.gates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.gates.map((gate) => (
                      <Badge key={gate} variant="outline" className="text-[11px] font-normal">
                        {gate}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default BonusRulesReference;
