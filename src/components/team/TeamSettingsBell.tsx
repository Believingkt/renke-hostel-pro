import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ArrowUpRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsCompleteness } from "@/hooks/use-settings-completeness";
import { RAGIC_COLUMNS } from "@/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@/lib/settingsCompleteness/bonusChecks";
import type { CheckLevel } from "@/lib/settingsCompleteness/types";
import {
  resolveGapHref,
  shouldNotify,
  isHqRole,
  type GapKey,
} from "@/lib/settingsGapLinks";
import { useTeam } from "./TeamContext";

/** 全站設定列 key → GapKey（通知對象與跳轉位置的依據） */
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

interface Item {
  id: string;
  /** 通知層級：全站 → 館別 */
  tier: "global" | "venue";
  scope: string;
  title: string;
  detail: string;
  level: CheckLevel;
  href: string | null;
  target?: string;
}

/**
 * 團隊後台小鈴鐺：衍生式設定缺口通知（不建表）。
 * 資料來自 useSettingsCompleteness()，設定補齊後通知自動消失。
 * 連結依角色解析：HQ 角色進 HQ 設定頁，其他角色導到自己真正能編輯的團隊頁。
 */
export function TeamSettingsBell() {
  const navigate = useNavigate();
  const { roles } = useTeam();
  const { ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, loading, reload } =
    useSettingsCompleteness();
  const [open, setOpen] = useState(false);

  const items = useMemo<Item[]>(() => {
    const blocked = new Set(blockedChecks);
    const out: Item[] = [];

    for (const row of bonusGlobalRows) {
      const gap = GLOBAL_KEY_TO_GAP[row.key];
      if (!gap || row.result.level === "ok") continue;
      if (blocked.has(row.key) || !shouldNotify(gap, roles)) continue;
      out.push({
        id: `global:${row.key}`,
        tier: "global",
        scope: "全站設定",
        title: row.label,
        detail: row.result.hint ?? row.result.label,
        level: row.result.level,
        href: resolveGapHref(gap, roles),
        target: row.result.target,
      });
    }

    const venueGroups = [
      { rows: ragicRows, columns: RAGIC_COLUMNS },
      { rows: bonusVenueRows, columns: BONUS_VENUE_COLUMNS },
    ];
    for (const { rows, columns } of venueGroups) {
      for (const row of rows) {
        for (const col of columns) {
          const res = row.checks[col.key];
          if (!res || res.level === "ok") continue;
          const gap = col.key as GapKey;
          if (blocked.has(col.key) || !shouldNotify(gap, roles)) continue;
          out.push({
            id: `${row.accId}:${col.key}`,
            tier: "venue",
            scope: row.accName,
            title: col.label,
            detail: res.hint ?? res.label,
            level: res.level,
            href: resolveGapHref(gap, roles, row.accId),
            target: res.target,
          });
        }
      }
    }

    const weight = (i: Item) =>
      (i.level === "error" ? 0 : 1) * 10 + (i.tier === "global" ? 0 : 1);
    return out.sort((a, b) => weight(a) - weight(b));
  }, [ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, roles]);

  const errorCount = items.filter((i) => i.level === "error").length;
  const count = items.length;

  if (loading && count === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="admin-icon-btn relative h-9 w-9 md:h-10 md:w-10"
          aria-label={`設定缺口通知${count ? `（${count}）` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] text-white ${
                errorCount > 0 ? "bg-destructive" : "bg-amber-500"
              }`}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,420px)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-semibold">設定缺口通知</p>
            <p className="text-xs text-muted-foreground">
              {count > 0 ? `${errorCount} 項嚴重、${count - errorCount} 項建議補齊` : "目前沒有待處理項目"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {count === 0 ? (
          <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            你負責範圍內的設定都已完成。
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!item.href}
                    onClick={() => {
                      if (!item.href) return;
                      setOpen(false);
                      navigate(item.href);
                    }}
                    className="w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-90"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={item.level === "error" ? "destructive" : "secondary"}
                        className="text-[11px] font-normal"
                      >
                        {item.level === "error" ? "嚴重" : "建議"}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {item.scope}｜{item.title}
                      </span>
                      {item.href && <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                    {!item.href && item.target && (
                      <p className="mt-1 text-xs text-muted-foreground">請至：{item.target}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        {isHqRole(roles) && (
          <div className="border-t px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                navigate("/hq/bonus-settings?tab=rate-check");
              }}
            >
              查看設定完整性檢查
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
