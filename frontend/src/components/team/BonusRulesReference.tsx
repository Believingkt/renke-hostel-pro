import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { groupedBonusFormulas, type BonusFormula } from "@/lib/bonusFormulas";
import { BONUS_RATE_META, canViewBonusRate, isBonusItemInScope, isRateAdmin } from "@/lib/bonusRateMeta";
import { useCurrentBonusRates, type VenueRate } from "@/hooks/use-current-bonus-rates";
import { useTeam } from "@/components/team/TeamContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeamRole } from "@/components/team/teamConfig";

/** 管理員預覽模式可切換的角色（僅列有獎金項目的角色） */
const PREVIEW_ROLES: { value: TeamRole; label: string }[] = [
  { value: "am", label: "AM" },
  { value: "am_manager", label: "AM總管" },
  { value: "closer", label: "成交組" },
  { value: "closer_manager", label: "成交組主管" },
  { value: "scout", label: "星探" },
  { value: "scout_manager", label: "星探主管" },
  { value: "franchise_internal", label: "特許加盟內部" },
  { value: "franchise_external", label: "特許加盟外部" },
  { value: "franchise_manager", label: "特許加盟主管" },
  { value: "starlink", label: "星鏈" },
  { value: "venue_manager", label: "業主" },
];

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
export function BonusRulesReference({ scopedOnly = false }: { scopedOnly?: boolean } = {}) {
  const allGroups = groupedBonusFormulas();
  const { roles: myRoles, userId } = useTeam();
  const isAdmin = isRateAdmin(myRoles);
  // 管理員預覽模式：以指定角色的視角檢視隱藏結果
  const [previewRole, setPreviewRole] = useState<TeamRole | "off">("off");
  const preview = isAdmin && previewRole !== "off";
  const roles = preview ? ([previewRole] as TeamRole[]) : myRoles;
  const scoped = scopedOnly || preview;
  // 一般成員：只保留自己（含主管所轄）角色的獎金項目
  const groups = scoped
    ? allGroups
        .map((g) => ({ ...g, items: g.items.filter((f) => isBonusItemInScope(f.key, roles)) }))
        .filter((g) => g.items.length > 0)
    : allGroups;
  const { globalRates, venueRates } = useCurrentBonusRates(myRoles, userId);
  const admin = isAdmin && !preview;

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
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <span className="text-xs text-muted-foreground">管理員預覽視角：</span>
          <Select value={previewRole} onValueChange={(v) => setPreviewRole(v as TeamRole | "off")}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">管理員（全部可見）</SelectItem>
              {PREVIEW_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preview && (
            <Badge variant="secondary" className="font-normal">
              預覽中：{PREVIEW_ROLES.find((r) => r.value === previewRole)?.label} 可見{" "}
              {groups.reduce((n, g) => n + g.items.length, 0)} 項
            </Badge>
          )}
        </div>
      )}
      {preview && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          目前以該角色視角檢視：未列出的獎金項目（含公式、口徑、發放日）該角色看不到；
          「當前設定值」徽章亦依該角色的可見範圍顯示，「前往設定」連結在預覽模式下隱藏。
        </div>
      )}
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        公式中的「當前設定值」為<strong className="text-foreground">目前系統最新生效版本</strong>，
        不一定等於某個資料月（獎金發放月份）實際採用的版本；已凍結的快照仍以快照當時的費率為準。
        此處僅供快速釐清公式的計算邏輯。除特別註明外，各項獎金皆為每月 10 日發放。
      </div>
      {groups.length === 0 && (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          目前沒有與您角色相關的獎金項目說明
        </div>
      )}
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
