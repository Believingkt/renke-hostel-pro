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
  Search,
  ChevronsUpDown,
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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "@/hooks/use-notification-prefs";
import { useNotificationReadState } from "@/hooks/use-notification-read-state";
import { useKolNotifications } from "@/hooks/use-kol-notifications";
import { RAGIC_COLUMNS } from "@/lib/settingsCompleteness/ragicChecks";
import { BONUS_VENUE_COLUMNS } from "@/lib/settingsCompleteness/bonusChecks";
import { shouldNotify, type GapKey } from "@/lib/settingsGapLinks";
import { GAP_DETAILS, validateGapLink } from "@/lib/settingsGapDetails";
import {
  CATEGORY_LABEL,
  type NotificationCategory,
  type Severity,
  type TeamNotification,
} from "@/lib/notifications/types";
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

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string; desc: string }> = [
  { value: "error", label: "只看嚴重", desc: "只提醒紅色（會導致算不出金額）的事件" },
  { value: "warn", label: "嚴重＋建議", desc: "紅色與橘色事件都提醒（預設）" },
  { value: "info", label: "全部通知", desc: "含未來新增的提示型通知" },
];

/**
 * 團隊後台小鈴鐺：多事件類型的衍生式通知中心（不建表）。
 * - 目前來源：設定缺口（useSettingsCompleteness）、KOL 進度（useKolNotifications）
 * - 新增事件只要產生 TeamNotification[] 並註冊 kind／category 即可
 * - 連結經權限驗證，唯讀角色會標示「唯讀」不誤導
 */
export function TeamSettingsBell() {
  const navigate = useNavigate();
  const { roles, userId } = useTeam();
  const { ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, loading, reload } =
    useSettingsCompleteness();
  const { items: kolItems, loading: kolLoading, reload: reloadKol } = useKolNotifications(roles);
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | Severity>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | NotificationCategory>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const listRef = useRef<HTMLUListElement | null>(null);
  const [renderedCount, setRenderedCount] = useState(0);


  const { prefs, update } = useNotificationPrefs(userId, roles);

  const settingsItems = useMemo<TeamNotification[]>(() => {
    const blocked = new Set(blockedChecks);
    const out: TeamNotification[] = [];

    const push = (
      base: {
        id: string;
        gap: GapKey;
        scope: string;
        title: string;
        detail: string;
        level: string;
        target?: string;
      },
      accId?: string,
    ) => {
      const link = validateGapLink(base.gap, roles, accId);
      const d = GAP_DETAILS[base.gap];
      out.push({
        id: base.id,
        kind: "settings-gap",
        category: "settings",
        severity: base.level === "error" ? "error" : "warn",
        scope: base.scope,
        title: base.title,
        detail: base.detail,
        href: link.href,
        editable: link.editable,
        reason: link.reason,
        meta: [
          { label: "缺哪張表", value: d.table },
          { label: "要補的欄位", value: d.columns },
          { label: "誰能編輯", value: d.writeRoles },
          { label: "權限限制", value: d.permissionNote },
          { label: "怎麼跳轉", value: d.howTo },
        ],
      });
    };

    for (const row of bonusGlobalRows) {
      const gap = GLOBAL_KEY_TO_GAP[row.key];
      if (!gap || row.result.level === "ok") continue;
      if (blocked.has(row.key) || !shouldNotify(gap, roles)) continue;
      push({
        id: `global:${row.key}`,
        gap,
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
              gap,
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

    return out;
  }, [ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, roles]);

  const allItems = useMemo<TeamNotification[]>(() => {
    const merged = [...settingsItems, ...kolItems];
    const weight = (i: TeamNotification) => (i.severity === "error" ? 0 : 1);
    return merged.sort((a, b) => weight(a) - weight(b));
  }, [settingsItems, kolItems]);

  const items = useMemo(
    () =>
      allItems.filter((i) =>
        passesPrefs(prefs, { severity: i.severity, kind: i.kind, actionable: i.editable }),
      ),
    [allItems, prefs],
  );

  const activeIds = useMemo(() => items.map((i) => i.id), [items]);
  const { isRead, markRead, markManyRead, markAllRead, undoMarkAllRead, canUndoMarkAllRead } =
    useNotificationReadState(userId, activeIds);

  const [confirmAllRead, setConfirmAllRead] = useState(false);
  /** 分組「本組已讀」二次確認（避免誤按整組消失） */
  const [confirmGroup, setConfirmGroup] = useState<{
    kind: string;
    label: string;
    ids: string[];
  } | null>(null);
  /** 點擊通知後開啟的完整明細視窗 */
  const [detailItem, setDetailItem] = useState<TeamNotification | null>(null);
  /** 全部已讀後的短暫復原提示（10 秒） */
  const [undoLeft, setUndoLeft] = useState(0);

  useEffect(() => {
    if (undoLeft <= 0) return;
    const t = window.setTimeout(() => setUndoLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [undoLeft]);


  const unread = items.filter((i) => !isRead(i.id));
  const unreadErrors = unread.filter((i) => i.severity === "error").length;
  const count = items.length;
  const badge = unread.length;
  const busy = loading || kolLoading;

  const categoryCounts = useMemo(() => {
    const map = new Map<NotificationCategory, number>();
    items.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + 1));
    return map;
  }, [items]);

  // 事件類型選單（依目前可見範圍動態產生）
  const kindOptions = useMemo(() => {
    const map = new Map<string, string>();
    items
      .filter((i) => categoryFilter === "all" || i.category === categoryFilter)
      .forEach((i) => {
        const known = NOTIFICATION_KINDS.find((k) => k.kind === i.kind);
        map.set(i.kind, known?.label ?? i.kind);
      });
    return Array.from(map, ([kind, label]) => ({ kind, label }));
  }, [items, categoryFilter]);

  /** 先套用分類／事件類型／搜尋（不含嚴重度），作為嚴重度篩選鈕的計數基準 */
  const scopedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (kindFilter !== "all" && i.kind !== kindFilter) return false;
      if (!q) return true;
      return `${i.scope} ${i.title} ${i.detail}`.toLowerCase().includes(q);
    });
  }, [items, query, categoryFilter, kindFilter]);

  const scopedCounts = useMemo(() => {
    const c = { all: scopedItems.length, error: 0, warn: 0, info: 0 };
    scopedItems.forEach((i) => {
      c[i.severity] += 1;
    });
    return c;
  }, [scopedItems]);

  const visibleItems = useMemo(
    () => scopedItems.filter((i) => levelFilter === "all" || i.severity === levelFilter),
    [scopedItems, levelFilter],
  );

  const allExpanded = visibleItems.length > 0 && expandedIds.length >= visibleItems.length;

  /** 依「事件類型」分組，數量多時可折疊，避免管理員一次看到上百則 */
  const groups = useMemo(() => {
    const map = new Map<string, { kind: string; label: string; items: TeamNotification[] }>();
    for (const i of visibleItems) {
      const known = NOTIFICATION_KINDS.find((k) => k.kind === i.kind);
      const label = known?.label ?? i.kind;
      if (!map.has(i.kind)) map.set(i.kind, { kind: i.kind, label, items: [] });
      map.get(i.kind)!.items.push(i);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [visibleItems]);

  const GROUP_PAGE = 20;
  /** 分組預設全部收合；只記住「使用者主動展開」的分類（localStorage） */
  const expandedGroupsKey = `team:notif-expanded-groups:${userId}`;
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`team:notif-expanded-groups:${userId}`);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  });
  const persistExpandedGroups = (next: string[]) => {
    setExpandedGroups(next);
    try {
      localStorage.setItem(expandedGroupsKey, JSON.stringify(next));
    } catch {
      /* 私密瀏覽模式忽略 */
    }
  };
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const groupCollapsed = (kind: string) => !expandedGroups.includes(kind);
  const toggleGroup = (kind: string) =>
    persistExpandedGroups(
      expandedGroups.includes(kind)
        ? expandedGroups.filter((k) => k !== kind)
        : [...expandedGroups, kind],
    );

  useEffect(() => {
    if (!open) {
      setExpandedIds([]);
      setQuery("");
      // 關閉時回到「預設檢視」，而不是硬性重設為全部
      setLevelFilter(defaultView.level);
      setCategoryFilter(defaultView.category);
      setKindFilter(defaultView.kind);
      setGroupLimits({});
      setViewSaved(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 分類切換時清掉不再適用的事件類型篩選（初次載入沿用預設檢視）
  const categoryFirstRun = useRef(true);
  useEffect(() => {
    if (categoryFirstRun.current) {
      categoryFirstRun.current = false;
      return;
    }
    setKindFilter("all");
  }, [categoryFilter]);


  const shownCount = useMemo(
    () =>
      groups.reduce(
        (n, g) =>
          n +
          (groupCollapsed(g.kind)
            ? 0
            : Math.min(g.items.length, groupLimits[g.kind] ?? GROUP_PAGE)),
        0,
      ),
    [groups, expandedGroups, groupLimits], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 一致性檢查：實際渲染的通知列數量必須等於目前應顯示的數量
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      setRenderedCount(listRef.current?.querySelectorAll("[data-notif-item]").length ?? 0);
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, visibleItems, expandedIds, expandedGroups, groupLimits]);

  const renderMismatch =
    open && shownCount > 0 && renderedCount > 0 && renderedCount !== shownCount;



  useEffect(() => {
    if (renderMismatch) {
      console.warn(
        `[TeamSettingsBell] 通知渲染不一致：應顯示 ${shownCount} 則，實際渲染 ${renderedCount} 則`,
      );
    }
  }, [renderMismatch, shownCount, renderedCount]);

  const go = (item: TeamNotification) => {
    if (!item.href) return;
    markRead(item.id);
    setOpen(false);
    navigate(item.href);
  };

  if (busy && count === 0) return null;

  const errorCount = items.filter((i) => i.severity === "error").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="admin-icon-btn relative h-9 w-9 md:h-10 md:w-10"
          aria-label={`團隊通知${badge ? `（未讀 ${badge}）` : ""}`}
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
            <p className="text-sm font-semibold">團隊通知</p>
            <p className="text-xs text-muted-foreground">
              {count > 0
                ? `未讀 ${badge}／共 ${count} 項（嚴重 ${errorCount}）`
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reload();
                reloadKol();
              }}
              disabled={busy}
              title="重新檢查"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
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
                    <span className="mr-1.5 text-[10px] text-muted-foreground">
                      {CATEGORY_LABEL[k.category]}
                    </span>
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

        {/* 分類 / 搜尋 / 篩選 */}
        {count > 0 && (
          <div className="space-y-2 border-b px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {([["all", `全部 ${count}`]] as Array<[string, string]>)
                .concat(
                  (Object.keys(CATEGORY_LABEL) as NotificationCategory[])
                    .filter((c) => (categoryCounts.get(c) ?? 0) > 0)
                    .map((c) => [c, `${CATEGORY_LABEL[c]} ${categoryCounts.get(c)}`]),
                )
                .map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCategoryFilter(v as "all" | NotificationCategory)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                      categoryFilter === v
                        ? "border-primary bg-primary/10 font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋館別、KOL、項目或說明"
                className="h-8 text-xs"
                style={{ paddingLeft: "2rem" }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 計數以目前分類／事件類型／搜尋範圍為準，確保與下方清單一致 */}
              {[
                { v: "all" as const, label: `全部嚴重度 ${scopedCounts.all}`, dot: "" },
                { v: "error" as const, label: `嚴重 ${scopedCounts.error}`, dot: "bg-destructive" },
                { v: "warn" as const, label: `建議 ${scopedCounts.warn}`, dot: "bg-amber-500" },
                { v: "info" as const, label: `提示 ${scopedCounts.info}`, dot: "bg-emerald-500" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLevelFilter(o.v)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    levelFilter === o.v ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
                  }`}
                >
                  {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />}
                  {o.label}
                </button>
              ))}

              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="ml-auto h-7 rounded-md border bg-background px-1.5 text-[11px]"
                aria-label="依事件類型篩選"
              >
                <option value="all">所有事件類型</option>
                {kindOptions.map((o) => (
                  <option key={o.kind} value={o.kind}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {renderMismatch && (
          <div className="border-b bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            通知渲染不一致：應顯示 {shownCount} 則，實際只列出 {renderedCount} 則，請按重新檢查。
          </div>
        )}

        {visibleItems.length === 0 ? (
          <div className="space-y-2 px-3 py-6 text-sm text-muted-foreground">
            {count === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                你負責範圍內目前沒有待處理事件。
              </div>
            ) : (
              <>
                <p>沒有符合條件的通知（共 {count} 則被搜尋或篩選隱藏）。</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setLevelFilter("all");
                    setCategoryFilter("all");
                    setKindFilter("all");
                  }}
                >
                  清除搜尋與篩選
                </Button>
              </>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[min(60vh,420px)]">
            <ul ref={listRef} className="divide-y">
              {groups.map((group) => {
                const collapsed = groupCollapsed(group.kind);
                const limit = groupLimits[group.kind] ?? GROUP_PAGE;
                const shown = collapsed ? [] : group.items.slice(0, limit);
                const groupErrors = group.items.filter((i) => i.severity === "error").length;
                const groupUnread = group.items.filter((i) => !isRead(i.id));
                return (
                  <li key={group.kind}>
                    <div className="flex items-center gap-1 bg-muted/40 pr-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.kind)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                        aria-expanded={!collapsed}
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                            collapsed ? "-rotate-90" : ""
                          }`}
                        />
                        <span className="truncate text-xs font-semibold">{group.label}</span>
                        {groupErrors > 0 && (
                          <Badge variant="destructive" className="text-[10px] font-normal">
                            嚴重 {groupErrors}
                          </Badge>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {group.items.length} 則
                        </span>
                      </button>
                      {groupUnread.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px]"
                          title={`將本組 ${groupUnread.length} 則標為已讀`}
                          onClick={() =>
                            setConfirmGroup({
                              kind: group.kind,
                              label: group.label,
                              ids: groupUnread.map((i) => i.id),
                            })
                          }

                        >
                          <CheckCheck className="mr-1 h-3.5 w-3.5" />
                          本組已讀
                        </Button>
                      )}
                    </div>


                    {!collapsed && (
                      <ul className="divide-y">
                        {shown.map((item) => {
                          const read = isRead(item.id);
                          const isOpen = expandedIds.includes(item.id);
                          return (
                            <li key={item.id} data-notif-item className={read ? "opacity-70" : ""}>
                              <div className="px-3 py-2.5">
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // 點擊通知 → 開啟完整明細視窗（可直接跳轉）
                                      markRead(item.id);
                                      setDetailItem(item);
                                    }}

                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      {!read && (
                                        <span
                                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                            item.severity === "error"
                                              ? "bg-destructive"
                                              : "bg-amber-500"
                                          }`}
                                        />
                                      )}
                                      <Badge
                                        variant={
                                          item.severity === "error" ? "destructive" : "secondary"
                                        }
                                        className="text-[11px] font-normal"
                                      >
                                        {item.severity === "error" ? "嚴重" : "建議"}
                                      </Badge>
                                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {CATEGORY_LABEL[item.category]}
                                      </span>
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
                                  {item.href && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0"
                                      title={item.editable ? "前往設定頁" : "前往查看（唯讀）"}
                                      aria-label={item.editable ? "前往設定頁" : "前往查看（唯讀）"}
                                      onClick={() => go(item)}
                                    >
                                      <ArrowUpRight className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>

                                {isOpen && (
                                  <div className="mt-2 space-y-1.5 rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed">
                                    {(item.meta ?? []).map((m) => (
                                      <p key={m.label}>
                                        <span className="text-muted-foreground">{m.label}：</span>
                                        {m.value}
                                      </p>
                                    ))}
                                    {item.reason && (
                                      <p className="text-amber-700 dark:text-amber-400">
                                        {item.reason}
                                      </p>
                                    )}
                                    {item.href ? (
                                      <Button
                                        size="sm"
                                        variant={item.editable ? "default" : "outline"}
                                        className="mt-1 w-full"
                                        onClick={() => go(item)}
                                      >
                                        {item.editable ? "前往設定頁" : "前往查看（唯讀）"}
                                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                                      </Button>
                                    ) : (
                                      <p className="text-muted-foreground">
                                        此帳號無法直接編輯，請聯絡可編輯的負責角色。
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}

                        {group.items.length > shown.length && (
                          <li className="px-3 py-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() =>
                                setGroupLimits((prev) => ({
                                  ...prev,
                                  [group.kind]: limit + GROUP_PAGE,
                                }))
                              }
                            >
                              顯示更多（還有 {group.items.length - shown.length} 則）
                            </Button>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>

        )}

        {undoLeft > 0 && canUndoMarkAllRead && (
          <div className="flex items-center gap-2 border-t bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="min-w-0 flex-1">已將全部通知標為已讀，可在 {undoLeft} 秒內復原。</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[11px]"
              onClick={() => {
                undoMarkAllRead();
                setUndoLeft(0);
              }}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" />
              復原
            </Button>
          </div>
        )}

        {visibleItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-t px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={() =>
                persistExpandedGroups(
                  expandedGroups.length > 0 ? [] : groups.map((g) => g.kind),
                )
              }
            >
              <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
              {expandedGroups.length > 0
                ? `收合全部分類（${groups.length}）`
                : `展開全部分類（${groups.length}）`}
            </Button>
            {/* 只有在有展開中的分類（清單真的列出明細列）時才顯示 */}
            {shownCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setExpandedIds(allExpanded ? [] : visibleItems.map((i) => i.id))}
              >
                {allExpanded ? "收合所有明細" : "展開所有明細"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              title="把目前的嚴重度／分類／事件類型篩選設為下次開啟的預設"
              onClick={() => {
                const next = {
                  level: levelFilter,
                  category: categoryFilter,
                  kind: kindFilter,
                };
                setDefaultView(next);
                try {
                  localStorage.setItem(defaultViewKey, JSON.stringify(next));
                } catch {
                  /* 私密瀏覽模式忽略 */
                }
                setViewSaved(true);
                window.setTimeout(() => setViewSaved(false), 2000);
              }}
            >
              {viewSaved ? "已設為預設檢視" : "設為預設檢視"}
            </Button>
          </div>
        )}
      </PopoverContent>

      {/* 通知完整明細 */}
      <Dialog open={!!detailItem} onOpenChange={(v) => !v && setDetailItem(null)}>
        <DialogContent className="max-w-md">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {detailItem.scope}｜{detailItem.title}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {detailItem.detail}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={detailItem.severity === "error" ? "destructive" : "secondary"}
                  className="text-[11px] font-normal"
                >
                  {detailItem.severity === "error"
                    ? "嚴重"
                    : detailItem.severity === "warn"
                      ? "建議"
                      : "提示"}
                </Badge>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {CATEGORY_LABEL[detailItem.category]}
                </span>
                {!detailItem.editable && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    唯讀
                  </span>
                )}
              </div>
              <div className="space-y-1.5 rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed">
                {(detailItem.meta ?? []).map((m) => (
                  <p key={m.label}>
                    <span className="text-muted-foreground">{m.label}：</span>
                    {m.value}
                  </p>
                ))}
                {detailItem.reason && (
                  <p className="text-amber-700 dark:text-amber-400">{detailItem.reason}</p>
                )}
              </div>
              {detailItem.href ? (
                <Button
                  className="w-full"
                  variant={detailItem.editable ? "default" : "outline"}
                  onClick={() => {
                    const target = detailItem;
                    setDetailItem(null);
                    go(target);
                  }}
                >
                  {detailItem.editable ? "前往設定頁" : "前往查看（唯讀）"}
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  此帳號無法直接編輯，請聯絡可編輯的負責角色。
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmAllRead} onOpenChange={setConfirmAllRead}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>將全部通知標為已讀？</AlertDialogTitle>
            <AlertDialogDescription>
              目前有 {badge} 則未讀通知會一次標為已讀，紅點會消失（事件本身不會被處理）。
              標記後 10 秒內可在鈴鐺內按「復原」還原未讀狀態。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                markAllRead();
                setUndoLeft(10);
              }}
            >
              確認全部已讀
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmGroup} onOpenChange={(v) => !v && setConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>將「{confirmGroup?.label}」整組標為已讀？</AlertDialogTitle>
            <AlertDialogDescription>
              這組有 {confirmGroup?.ids.length ?? 0} 則未讀通知會一次標為已讀（事件本身不會被處理）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGroup) markManyRead(confirmGroup.ids);
                setConfirmGroup(null);
              }}
            >
              確認本組已讀
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Popover>
  );
}
