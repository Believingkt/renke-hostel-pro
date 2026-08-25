import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminDateRangeField } from "@/components/admin/AdminDateRangeField";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink } from "lucide-react";
import { useTeam } from "@/components/team/TeamContext";
import {
  PUBLISH_DEADLINE_DAYS,
  PUBLISH_STATUS_CLASS,
  PUBLISH_STATUS_LABEL,
  type KolPublishRecord,
  type PublishStatus,
  expectedRangeToCheckInRange,
  getExpectedPublishDate,
  getPublishStatus,
  groupByExpectedDate,
  hasVal,
  monthRangeYmd,
  taipeiToday,
  weekRangeYmd,
} from "@/lib/kolPublishSchedule";


type Preset = "this_week" | "next_week" | "this_month" | "next_month" | "custom";

const PRESET_RANGE: Record<Exclude<Preset, "custom">, (today: string) => { from: string; to: string }> = {
  this_week: () => weekRangeYmd(0),
  next_week: () => weekRangeYmd(1),
  this_month: (t) => monthRangeYmd(0, t),
  next_month: (t) => monthRangeYmd(1, t),
};

const PRESETS: { key: Exclude<Preset, "custom">; label: string }[] = [
  { key: "this_week", label: "本週" },
  { key: "next_week", label: "下週" },
  { key: "this_month", label: "這個月" },
  { key: "next_month", label: "下個月" },
];


const SELECT_FIELDS =
  "id, name, ig_handle, ig_url, venue_name, venue_id, accommodation_id, check_in_date, publish_date, publish_url, scout_id";

type DrawerFilter = "all" | PublishStatus | "published_in_range" | { date: string };

function fmtDate(ymd: string | null | undefined) {
  if (!hasVal(ymd)) return "—";
  const [, m, d] = (ymd as string).split("-");
  return `${m}/${d}`;
}

const storageKey = (userId: string) => `kol-publish-range:${userId || "anon"}`;

export function KolPublishProgressCard() {
  const today = useMemo(() => taipeiToday(), []);
  const { userId } = useTeam();

  // 讀取上次使用的區間偏好（依登入者），preset 以當下日期重算
  const initial = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const saved = JSON.parse(raw) as { preset?: Preset; from?: string; to?: string };
        if (saved.preset === "custom" && saved.from && saved.to) {
          return { preset: "custom" as Preset, from: saved.from, to: saved.to };
        }
        if (saved.preset && saved.preset !== "custom" && PRESET_RANGE[saved.preset]) {
          return { preset: saved.preset, ...PRESET_RANGE[saved.preset](today) };
        }
      }
    } catch {
      /* ignore */
    }
    return { preset: "this_week" as Preset, ...PRESET_RANGE.this_week(today) };
  }, [userId, today]);

  const [preset, setPreset] = useState<Preset>(initial.preset);
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);

  const range = useMemo(() => ({ from: customFrom, to: customTo }), [customFrom, customTo]);

  const applyPreset = (key: Exclude<Preset, "custom">) => {
    const r = PRESET_RANGE[key](today);
    setPreset(key);
    setCustomFrom(r.from);
    setCustomTo(r.to);
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify({ preset, from: customFrom, to: customTo }),
      );
    } catch {
      /* ignore */
    }
  }, [userId, preset, customFrom, customTo]);


  const [expectedRows, setExpectedRows] = useState<KolPublishRecord[]>([]);
  const [publishedRows, setPublishedRows] = useState<KolPublishRecord[]>([]);
  const [scoutMap, setScoutMap] = useState<Record<string, string>>({});
  const [venueMap, setVenueMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  useEffect(() => {
    if (!range.from || !range.to) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ci = expectedRangeToCheckInRange(range.from, range.to);
      const [expectedRes, publishedRes] = await Promise.all([
        supabase
          .from("kol_profiles")
          .select(SELECT_FIELDS)
          .eq("booking_status", "成功訂房")
          .eq("is_error", false)
          .gte("check_in_date", ci.from)
          .lte("check_in_date", ci.to)
          .order("check_in_date", { ascending: true }),
        supabase
          .from("kol_profiles")
          .select(SELECT_FIELDS)
          .eq("booking_status", "成功訂房")
          .eq("is_error", false)
          .gte("publish_date", range.from)
          .lte("publish_date", range.to)
          .order("publish_date", { ascending: true }),
      ]);
      if (cancelled) return;
      const exp = (expectedRes.data ?? []) as unknown as KolPublishRecord[];
      const pub = ((publishedRes.data ?? []) as unknown as KolPublishRecord[]).filter((r) => hasVal(r.publish_url));
      setExpectedRows(exp);
      setPublishedRows(pub);
      setLoading(false);

      const all = [...exp, ...pub];
      const scoutIds = Array.from(new Set(all.map((r) => r.scout_id).filter(Boolean))) as string[];
      const venueIds = Array.from(new Set(all.map((r) => r.venue_id).filter(Boolean))) as string[];
      const accIds = Array.from(new Set(all.map((r) => r.accommodation_id).filter(Boolean))) as string[];

      const [scouts, venues, accs] = await Promise.all([
        scoutIds.length
          ? supabase.from("team_member_profiles").select("user_id, display_name").in("user_id", scoutIds)
          : Promise.resolve({ data: [] as any[] }),
        venueIds.length
          ? supabase.from("kol_venues").select("id, name").in("id", venueIds)
          : Promise.resolve({ data: [] as any[] }),
        accIds.length
          ? supabase.from("accommodation_info").select("id, name").in("id", accIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      const sm: Record<string, string> = {};
      (scouts.data ?? []).forEach((s: any) => (sm[s.user_id] = s.display_name));
      const vm: Record<string, string> = {};
      (venues.data ?? []).forEach((v: any) => (vm[v.id] = v.name));
      (accs.data ?? []).forEach((a: any) => (vm[a.id] = a.name));
      setScoutMap(sm);
      setVenueMap(vm);
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const venueOf = (r: KolPublishRecord) =>
    (hasVal(r.venue_name) && r.venue_name) ||
    (r.venue_id && venueMap[r.venue_id]) ||
    (r.accommodation_id && venueMap[r.accommodation_id]) ||
    "—";

  const stats = useMemo(() => {
    let completed = 0;
    let overdue = 0;
    let pending = 0;
    for (const r of expectedRows) {
      const st = getPublishStatus(r, today);
      if (st === "completed") completed += 1;
      else if (st === "overdue") overdue += 1;
      else pending += 1;
    }
    return { total: expectedRows.length, completed, overdue, pending, published: publishedRows.length };
  }, [expectedRows, publishedRows, today]);

  const daily = useMemo(() => groupByExpectedDate(expectedRows, today), [expectedRows, today]);
  const maxDaily = Math.max(1, ...daily.map((d) => d.total));

  const drawerRows = useMemo(() => {
    if (!drawer) return [];
    if (drawer === "published_in_range") return publishedRows;
    if (typeof drawer === "object") return expectedRows.filter((r) => getExpectedPublishDate(r) === drawer.date);
    if (drawer === "all") return expectedRows;
    if (drawer === "upcoming") return expectedRows.filter((r) => ["upcoming", "due_soon"].includes(getPublishStatus(r, today)));
    return expectedRows.filter((r) => getPublishStatus(r, today) === drawer);
  }, [drawer, expectedRows, publishedRows, today]);

  const drawerTitle = useMemo(() => {
    if (!drawer) return "";
    if (drawer === "published_in_range") return "此區間實際發佈";
    if (typeof drawer === "object") return `預計上片 · ${drawer.date}`;
    if (drawer === "all") return "預計上片（全部）";
    return PUBLISH_STATUS_LABEL[drawer as PublishStatus];
  }, [drawer]);

  const tiles = [
    { key: "all" as DrawerFilter, label: "預計上片", value: stats.total, cls: "" },
    { key: "completed" as DrawerFilter, label: "已完成", value: stats.completed, cls: "text-green-600" },
    { key: "upcoming" as DrawerFilter, label: "待上片", value: stats.pending, cls: "text-amber-600" },
    { key: "overdue" as DrawerFilter, label: "逾期", value: stats.overdue, cls: "text-red-600" },
    { key: "published_in_range" as DrawerFilter, label: "此區間實際發佈", value: stats.published, cls: "text-sky-600" },
  ];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            上片進度總覽
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="font-normal">
                    預計上片日 = 入住日 + {PUBLISH_DEADLINE_DAYS} 天
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom">與 LINE「KOL 上片期限提醒」推播同一口徑</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {range.from && range.to ? `${range.from} ~ ${range.to}` : "請選擇查詢區間"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-md border p-0.5">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "ghost"}
                className="h-8"
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <AdminDateRangeField
            editable
            from={customFrom}
            to={customTo}
            fromPlaceholder="開始日期"
            toPlaceholder="結束日期"
            onChange={(f, t) => {
              setCustomFrom(f);
              setCustomTo(t);
              setPreset("custom");
            }}
          />
        </div>

      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="text-sm text-muted-foreground">載入中…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {tiles.map((t) => (
                <button
                  key={String(t.key)}
                  type="button"
                  onClick={() => setDrawer(t.key)}
                  className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="text-sm text-muted-foreground">{t.label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${t.cls}`}>{t.value}</div>
                </button>
              ))}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">每日預計上片量 + 已發布數量</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />已完成
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" />待上片
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" />逾期
                </span>
              </div>
              {daily.length === 0 ? (
                <div className="text-sm text-muted-foreground">此區間沒有預計上片的邀約</div>
              ) : (
                <div className="flex items-end gap-1 overflow-x-auto pb-1">
                  {daily.map((d) => {
                    const h = (n: number) => (n > 0 ? Math.max(4, (n / maxDaily) * 56) : 0);
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setDrawer({ date: d.date })}
                        className="flex min-w-[38px] flex-col items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/50"
                        title={`${d.date}｜共 ${d.total}（已完成 ${d.completed}／待上片 ${d.pending}／逾期 ${d.overdue}）`}
                      >
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {d.total}
                          {d.completed > 0 && <span className="text-green-600">／{d.completed}</span>}
                        </span>
                        <span className="flex w-6 flex-col justify-end overflow-hidden rounded-sm">
                          {d.pending > 0 && (
                            <span className="w-full bg-primary/70" style={{ height: `${h(d.pending)}px` }} />
                          )}
                          {d.overdue > 0 && (
                            <span className="w-full bg-red-400" style={{ height: `${h(d.overdue)}px` }} />
                          )}
                          {d.completed > 0 && (
                            <span className="w-full bg-green-500" style={{ height: `${h(d.completed)}px` }} />
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtDate(d.date)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}
      </CardContent>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {drawerTitle}
              <span className="ml-2 text-sm font-normal text-muted-foreground">共 {drawerRows.length} 筆</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {drawerRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">沒有符合的資料</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>網紅</TableHead>
                    <TableHead>館別</TableHead>
                    <TableHead className="whitespace-nowrap">入住日</TableHead>
                    <TableHead className="whitespace-nowrap">預計上片</TableHead>
                    <TableHead className="whitespace-nowrap">實際發布</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>星探</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drawerRows.map((r) => {
                    const st = getPublishStatus(r, today);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.name || "—"}
                          {hasVal(r.ig_handle) && (
                            <div className="text-xs text-muted-foreground">{r.ig_handle}</div>
                          )}
                        </TableCell>
                        <TableCell>{venueOf(r)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{r.check_in_date || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {getExpectedPublishDate(r) || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {hasVal(r.publish_date) ? (
                            hasVal(r.publish_url) ? (
                              <a
                                href={r.publish_url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {r.publish_date}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              r.publish_date
                            )
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PUBLISH_STATUS_CLASS[st]}>
                            {PUBLISH_STATUS_LABEL[st]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.scout_id ? scoutMap[r.scout_id] || "未指定" : "未指定"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

export default KolPublishProgressCard;
