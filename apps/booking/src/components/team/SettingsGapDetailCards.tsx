import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Button } from "@lakeze/shared/components/ui/button";
import { ArrowUpRight, Database, Lock, Route as RouteIcon } from "lucide-react";
import type { GlobalCheckRow, VenueCheckRow } from "@lakeze/shared/lib/settingsCompleteness/types";
import { RAGIC_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@lakeze/shared/lib/settingsCompleteness/bonusChecks";
import { GAP_DETAILS, validateGapLink } from "@lakeze/shared/lib/settingsGapDetails";
import type { GapKey } from "@lakeze/shared/lib/settingsGapLinks";

const GLOBAL_KEY_TO_GAP: Record<string, GapKey> = {
  rate_version: "globalBonus",
  shared_sources: "globalBonus",
  kol_sources: "globalBonus",
  role_binding: "globalBonus",
  closer_team_bonus: "globalBonus",
  bonus_multiplier: "globalBonus",
  scout_tier: "scoutTier",
  scout_salary: "scoutSalary",
};

interface Entry {
  id: string;
  gap: GapKey;
  accId?: string;
  scope: string;
  title: string;
  hint: string;
  level: "warn" | "error";
}

interface Props {
  ragicRows: VenueCheckRow[];
  bonusVenueRows: VenueCheckRow[];
  bonusGlobalRows: GlobalCheckRow[];
}

/**
 * 缺口卡片明細：逐項說明「缺哪張表、被哪個權限擋住、該怎麼跳轉」。
 * 連結一律經 validateGapLink() 依當前角色驗證，唯讀時明確標示避免誤導。
 */
export default function SettingsGapDetailCards({ ragicRows, bonusVenueRows, bonusGlobalRows }: Props) {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setRoles((data ?? []).map((r: { role: string }) => r.role));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const row of bonusGlobalRows) {
      const gap = GLOBAL_KEY_TO_GAP[row.key];
      if (!gap || row.result.level === "ok") continue;
      out.push({
        id: `global:${row.key}`,
        gap,
        scope: "全站設定",
        title: row.label,
        hint: row.result.hint ?? row.result.label,
        level: row.result.level,
      });
    }
    for (const { rows, columns } of [
      { rows: ragicRows, columns: RAGIC_COLUMNS },
      { rows: bonusVenueRows, columns: BONUS_VENUE_COLUMNS },
    ]) {
      for (const row of rows) {
        for (const col of columns) {
          const res = row.checks[col.key];
          if (!res || res.level === "ok") continue;
          out.push({
            id: `venue:${row.accId}:${col.key}`,
            gap: col.key as GapKey,
            accId: row.accId,
            scope: row.accName,
            title: col.label,
            hint: res.hint ?? res.label,
            level: res.level,
          });
        }
      }
    }
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  }, [ragicRows, bonusVenueRows, bonusGlobalRows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">缺口明細（缺哪張表 · 權限 · 跳轉）</CardTitle>
        <CardDescription>
          逐項列出缺漏的資料表、能寫入的角色與權限限制，並依你的角色驗證跳轉連結是否可編輯。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">目前沒有缺口，所有設定皆完整。</p>
        )}
        {entries.map((e) => {
          const d = GAP_DETAILS[e.gap];
          if (!d) return null;
          const link = validateGapLink(e.gap, roles, e.accId);
          return (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.level === "error" ? "destructive" : "secondary"}>
                  {e.level === "error" ? "嚴重" : "建議"}
                </Badge>
                <span className="text-sm font-medium">
                  {e.scope}｜{e.title}
                </span>
                {!link.editable && (
                  <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                    <Lock className="h-3 w-3" />
                    唯讀
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{e.hint}</p>

              <div className="mt-2 grid gap-1.5 text-xs leading-relaxed sm:grid-cols-2">
                <p className="flex gap-1.5">
                  <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">資料表：</span>
                    <code className="rounded bg-muted px-1">{d.table}</code>
                    <span className="block text-muted-foreground">欄位：{d.columns}</span>
                  </span>
                </p>
                <p className="flex gap-1.5">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">可寫入角色：</span>
                    {d.writeRoles}
                    <span className="block text-muted-foreground">{d.permissionNote}</span>
                  </span>
                </p>
                <p className="flex gap-1.5 sm:col-span-2">
                  <RouteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">跳轉路徑：</span>
                    {d.howTo}
                    {link.reason && (
                      <span className="block text-amber-700 dark:text-amber-400">{link.reason}</span>
                    )}
                  </span>
                </p>
              </div>

              {link.href && (
                <Button
                  size="sm"
                  variant={link.editable ? "default" : "outline"}
                  className="mt-2"
                  onClick={() => navigate(link.href!)}
                >
                  {link.editable ? "前往設定頁" : "前往查看（唯讀）"}
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
