import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { groupedBonusFormulas, type BonusFormula } from "@/lib/bonusFormulas";
import { BONUS_RATE_META, canViewBonusRate, isRateAdmin } from "@/lib/bonusRateMeta";
import { useCurrentBonusRates, type VenueRate } from "@/hooks/use-current-bonus-rates";
import { useTeam } from "@/components/team/TeamContext";

function fmtRate(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function fmtAmount(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return `NT$${Number(v).toLocaleString("zh-TW")}`;
}

/** 逐館費率一覽：預設收合、固定高度可捲動、可搜尋 */
function VenueRateTable({
  rows,
  field,
  label,
}: {
  rows: VenueRate[];
  field: "closer_rate" | "video_rate";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim();
    const base = rows.filter((r) => r[field] !== null && r[field] !== undefined);
    return kw ? base.filter((r) => r.name.includes(kw)) : base;
  }, [rows, field, q]);

  if (rows.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        各館費率一覽（{filtered.length}）
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border">
        <div className="p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋館別"
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">館別</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{label}</th>
                <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">生效日</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.accommodation_id} className="border-t">
                  <td className="px-2 py-1.5">{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtRate(r[field]) ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.effective_from}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                    無符合的館別
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 公式行：把費率片語替換成「當前設定值」徽章 */
function FormulaLine({
  formula,
  token,
  badge,
}: {
  formula: string;
  token?: string;
  badge?: string | null;
}) {
  if (!token || !badge || !formula.includes(token)) {
    return <div className="font-mono text-xs leading-relaxed">{formula}</div>;
  }
  const [before, ...rest] = formula.split(token);
  return (
    <div className="font-mono text-xs leading-relaxed">
      {before}
      <Badge variant="secondary" className="mx-0.5 font-normal align-middle">
        {token}｜{badge}
      </Badge>
      {rest.join(token)}
    </div>
  );
}

/**
 * 結算規則說明：由 bonusFormulas registry 自動渲染，
 * 每個項目卡片同時顯示公式（含當前設定值）、口徑、發放日／結算區間與 gates。
 */
export function BonusRulesReference() {
  const groups = groupedBonusFormulas();
  const { roles, userId } = useTeam();
  const { globalRates, venueRates } = useCurrentBonusRates(roles, userId);
  const admin = isRateAdmin(roles);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  const renderItem = (f: BonusFormula) => {
    const meta = BONUS_RATE_META[f.key];
    const canSee = canViewBonusRate(f.key, roles);

    let badge: string | null = null;
    if (canSee && meta?.rateKind === "global" && meta.rateBonusType) {
      const g = globalRates[meta.rateBonusType];
      if (g) {
        const value = fmtRate(g.rate) ?? fmtAmount(g.fixed_amount);
        if (value) badge = `${value}，自 ${g.effective_from}`;
      }
    } else if (canSee && meta?.rateKind === "per_venue") {
      badge = "逐館設定，見下方一覽";
    } else if (canSee && meta?.rateKind === "per_member") {
      badge = meta.rateHint ?? null;
    }

    return (
      <div key={f.key} id={f.anchorId} className="scroll-mt-24 border-b pb-4 last:border-0 last:pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{f.name}</span>
        </div>

        <div className="mt-1">
          <FormulaLine formula={f.formula} token={meta?.rateToken} badge={badge} />
        </div>

        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.basis}</p>

        {meta && (
          <div className="mt-1.5 space-y-0.5 text-xs">
            <div>
              <span className="text-muted-foreground">發放日：</span>
              {meta.payoutSchedule}
            </div>
            <div>
              <span className="text-muted-foreground">結算區間：</span>
              {meta.settlementWindow}
            </div>
          </div>
        )}

        {f.gates.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {f.gates.map((gate) => (
              <Badge key={gate} variant="outline" className="text-[11px] font-normal">
                {gate}
              </Badge>
            ))}
          </div>
        )}

        {canSee && meta?.rateKind === "per_venue" && meta.venueRateField && (
          <VenueRateTable
            rows={venueRates}
            field={meta.venueRateField}
            label={meta.rateToken ?? "費率"}
          />
        )}

        {admin && meta?.settingsPath && (
          <Link
            to={meta.settingsPath}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            前往設定 <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        公式中的「當前設定值」為<strong className="text-foreground">目前系統最新生效版本</strong>，
        不一定等於某個資料月（獎金發放月份）實際採用的版本；已凍結的快照仍以快照當時的費率為準。
        此處僅供快速釐清公式的計算邏輯。除特別註明外，各項獎金皆為每月 10 日發放。
      </div>
      {groups.map((g) => (
        <Card key={g.category}>
          <CardHeader>
            <CardTitle className="text-base">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">{g.items.map(renderItem)}</CardContent>
        </Card>
      ))}
    </div>
  );
}

export default BonusRulesReference;
