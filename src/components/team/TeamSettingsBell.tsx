import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ArrowUpRight,
  RefreshCw,
  CheckCircle2,
  Settings2,
  Lock,
  ChevronDown,
  CheckCheck,
  Undo2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettingsCompleteness } from "@/hooks/use-settings-completeness";
import {
  useNotificationPrefs,
  passesPrefs,
  NOTIFICATION_KINDS,
  type Severity,
} from "@/hooks/use-notification-prefs";
import { useNotificationReadState } from "@/hooks/use-notification-read-state";
import { RAGIC_COLUMNS } from "@/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@/lib/settingsCompleteness/bonusChecks";
import type { CheckLevel } from "@/lib/settingsCompleteness/types";
import { shouldNotify, isHqRole, type GapKey } from "@/lib/settingsGapLinks";
import { GAP_DETAILS, validateGapLink } from "@/lib/settingsGapDetails";
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
  kind: string;
  gap: GapKey;
  tier: "global" | "venue";
  scope: string;
  title: string;
  detail: string;
  level: CheckLevel;
  severity: Severity;
  href: string | null;
  editable: boolean;
  reason: string | null;
  target?: string;
}

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string; desc: string }> = [
  { value: "error", label: "只看嚴重", desc: "只提醒紅色（會導致算不出金額）的缺口" },
  { value: "warn", label: "嚴重＋建議", desc: "紅色與橘色缺口都提醒（預設）" },
  { value: "info", label: "全部通知", desc: "含未來新增的提示型通知" },
];

/**
 * 團隊後台小鈴鐺：衍生式設定缺口通知（不建表）。
 * - 資料來自 useSettingsCompleteness()，設定補齊後通知自動消失並清掉已讀紀錄
 * - 連結經 validateGapLink() 驗證，唯讀角色會標示「唯讀」不誤導
 * - 每位使用者 × 角色可各自設定通知偏好（嚴重性門檻 / 事件類型 / 只看可處理）
 */
export function TeamSettingsBell() {
  const navigate = useNavigate();
  const { roles, userId } = useTeam();
  const { ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, loading, reload } =
    useSettingsCompleteness();
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "error" | "warn">("all");
  const [gapFilter, setGapFilter] = useState<string>("all");
  const listRef = useRef<HTMLUListElement | null>(null);
  const [renderedCount, setRenderedCount] = useState(0);

  const { prefs, update } = useNotificationPrefs(userId, roles);

  const allItems = useMemo<Item[]>(() => {
    const blocked = new Set(blockedChecks);
    const out: Item[] = [];

    const push = (base: Omit<Item, "href" | "editable" | "reason" | "severity">, accId?: string) => {
      const link = validateGapLink(base.gap, roles, accId);
      out.push({
        ...base,
        severity: base.level === "error" ? "error" : "warn",
        href: link.href,
        editable: link.editable,
        reason: link.reason,
      });
    };

    for (const row of bonusGlobalRows) {
      const gap = GLOBAL_KEY_TO_GAP[row.key];
      if (!gap || row.result.level === "ok") continue;
      if (blocked.has(row.key) || !shouldNotify(gap, roles)) continue;
      push({
        id: `global:${row.key}`,
        kind: "settings-gap",
        gap,
        tier: "global",
        scope: "全站設定",
        title: row.label,
        detail: row.result.hint ?? row.result.label,
        level: row.result.level,
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
          push(
            {
              id: `venue:${row.accId}:${col.key}`,
              kind: "settings-gap",
              gap,
              tier: "venue",
              scope: row.accName,
              title: col.label,
              detail: res.hint ?? res.label,
              level: res.level,
              target: res.target,
            },
            row.accId,
          );
        }
      }
    }

    const weight = (i: Item) =>
      (i.level === "error" ? 0 : 1) * 10 + (i.tier === "global" ? 0 : 1);
    return out.sort((a, b) => weight(a) - weight(b));
  }, [ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, roles]);

  const items = useMemo(
    () =>
      allItems.filter((i) =>
        passesPrefs(prefs, { severity: i.severity, kind: i.kind, actionable: i.editable }),
      ),
    [allItems, prefs],
  );

  const activeIds = useMemo(() => items.map((i) => i.id), [items]);
  const { isRead, markRead, markAllRead, undoMarkAllRead, canUndoMarkAllRead } =
    useNotificationReadState(userId, activeIds);
  const [confirmAllRead, setConfirmAllRead] = useState(false);


  const unread = items.filter((i) => !isRead(i.id));
  const unreadErrors = unread.filter((i) => i.level === "error").length;
  const count = items.length;
  const badge = unread.length;

  useEffect(() => {
    if (!open) setExpanded(null);
  }, [open]);

  if (loading && count === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="admin-icon-btn relative h-9 w-9 md:h-10 md:w-10"
          aria-label={`設定缺口通知${badge ? `（未讀 ${badge}）` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {badge > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] text-white ${
                unreadErrors > 0 ? "bg-destructive" : "bg-amber-500"
              }`}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(94vw,460px)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">設定缺口通知</p>
            <p className="text-xs text-muted-foreground">
              {count > 0
                ? `未讀 ${badge}／共 ${count} 項（嚴重 ${items.filter((i) => i.level === "error").length}）`
                : "目前沒有待處理項目"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {badge > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmAllRead(true)}
                title="全部標為已讀"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
            )}
            {canUndoMarkAllRead && (
              <Button variant="ghost" size="sm" onClick={undoMarkAllRead} title="復原全部已讀">
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPrefs((v) => !v)}
              title="通知偏好"
            >

              <Settings2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={reload} disabled={loading} title="重新檢查">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {showPrefs && (
          <div className="space-y-3 border-b bg-muted/30 px-3 py-3">
            <div>
              <p className="text-xs font-medium">通知嚴重性門檻</p>
              <div className="mt-2 grid gap-1.5">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update({ minSeverity: opt.value })}
                    className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      prefs.minSeverity === opt.value
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-2 text-muted-foreground">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="notif-actionable" className="text-xs leading-relaxed">
                只顯示我能編輯的項目
                <span className="block text-[11px] text-muted-foreground">
                  隱藏唯讀提醒，避免點過去卻不能改。
                </span>
              </Label>
              <Switch
                id="notif-actionable"
                checked={prefs.actionableOnly}
                onCheckedChange={(v) => update({ actionableOnly: v })}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium">通知事件類型</p>
              {NOTIFICATION_KINDS.map((k) => (
                <div key={k.kind} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`kind-${k.kind}`} className="text-xs">
                    {k.label}
                  </Label>
                  <Switch
                    id={`kind-${k.kind}`}
                    checked={!prefs.mutedKinds.includes(k.kind)}
                    onCheckedChange={(v) =>
                      update({
                        mutedKinds: v
                          ? prefs.mutedKinds.filter((m) => m !== k.kind)
                          : [...prefs.mutedKinds, k.kind],
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {count === 0 ? (
          <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            你負責範圍內的設定都已完成。
          </div>
        ) : (
          <ScrollArea className="h-[min(60vh,420px)]">
            <ul className="divide-y">
              {items.map((item) => {
                const detail = GAP_DETAILS[item.gap];
                const read = isRead(item.id);
                const isOpen = expanded === item.id;
                return (
                  <li key={item.id} className={read ? "opacity-70" : ""}>
                    <div className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          markRead(item.id);
                          setExpanded(isOpen ? null : item.id);
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          {!read && (
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                item.level === "error" ? "bg-destructive" : "bg-amber-500"
                              }`}
                            />
                          )}
                          <Badge
                            variant={item.level === "error" ? "destructive" : "secondary"}
                            className="text-[11px] font-normal"
                          >
                            {item.level === "error" ? "嚴重" : "建議"}
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {item.scope}｜{item.title}
                          </span>
                          {!item.editable && (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <ChevronDown
                            className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.detail}
                        </p>
                      </button>

                      {isOpen && (
                        <div className="mt-2 space-y-1.5 rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed">
                          <p>
                            <span className="text-muted-foreground">缺哪張表：</span>
                            <code className="rounded bg-background px-1">{detail.table}</code>
                          </p>
                          <p>
                            <span className="text-muted-foreground">要補的欄位：</span>
                            {detail.columns}
                          </p>
                          <p>
                            <span className="text-muted-foreground">誰能編輯：</span>
                            {detail.writeRoles}
                          </p>
                          <p>
                            <span className="text-muted-foreground">權限限制：</span>
                            {detail.permissionNote}
                          </p>
                          <p>
                            <span className="text-muted-foreground">怎麼跳轉：</span>
                            {detail.howTo}
                          </p>
                          {item.reason && (
                            <p className="text-amber-700 dark:text-amber-400">{item.reason}</p>
                          )}
                          {item.href ? (
                            <Button
                              size="sm"
                              variant={item.editable ? "default" : "outline"}
                              className="mt-1 w-full"
                              onClick={() => {
                                markRead(item.id);
                                setOpen(false);
                                navigate(item.href!);
                              }}
                            >
                              {item.editable ? "前往設定頁" : "前往查看（唯讀）"}
                              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <p className="text-muted-foreground">
                              請至：{item.target ?? detail.label}（此帳號無法直接編輯）
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
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

      <AlertDialog open={confirmAllRead} onOpenChange={setConfirmAllRead}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>將全部通知標為已讀？</AlertDialogTitle>
            <AlertDialogDescription>
              目前有 {badge} 則未讀通知會一次標為已讀，紅點會消失（設定缺口本身不會被修正）。
              標記後可按鈴鐺內的「復原」按鈕還原未讀狀態。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={markAllRead}>確認全部已讀</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );

}
