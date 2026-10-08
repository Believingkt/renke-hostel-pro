import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@lakeze/shared/components/ui/sheet";
import { toast } from "@lakeze/shared/hooks/use-toast";
import { RefreshCw, Sparkles, Users, UserCheck, Tags, Clock, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { TravelerProfile } from "@/types/traveler";
import { identityLabel, formatDateTime } from "@/types/traveler";
import TravelerDetailBody from "@/components/traveler/TravelerDetailBody";

const PAGE_SIZE = 50;

interface Stats {
  total: number | null;
  memberBound: number | null;
  tagged: number | null;
  lastSync: string | null;
  lastSyncFailed: boolean;
}

export default function TravelerCdp() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<TravelerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tagProgress, setTagProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ total: null, memberBound: null, tagged: null, lastSync: null, lastSyncFailed: false });
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 四張統計卡：一律用資料庫 count 查詢，不受列表分頁筆數限制。查詢失敗顯示「—」並記 console，不顯示成 0。
  const loadStats = useCallback(async () => {
    const results = await Promise.allSettled([
      supabase.from("traveler_profiles").select("id", { count: "exact", head: true }),
      supabase.from("traveler_profiles").select("id", { count: "exact", head: true })
        .contains("bound_identities", JSON.stringify([{ type: "member" }])),
      supabase.from("traveler_profiles").select("id", { count: "exact", head: true })
        .filter("interest_tags", "neq", "{}"),
      supabase.from("traveler_profiles").select("last_synced_at")
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const [tot, mem, tag, sync] = results;
    const countOf = (r: PromiseSettledResult<{ count: number | null; error: unknown }>, label: string): number | null => {
      if (r.status !== "fulfilled" || r.value.error) {
        console.error(`[cdp stats] ${label} 查詢失敗`, r.status === "fulfilled" ? r.value.error : r.reason);
        return null;
      }
      return r.value.count ?? 0;
    };
    const syncFailed = sync.status !== "fulfilled" || !!sync.value.error;
    if (syncFailed) console.error("[cdp stats] 最後同步時間查詢失敗", sync.status === "fulfilled" ? sync.value.error : sync.reason);
    setStats({
      total: countOf(tot as PromiseSettledResult<any>, "總數"),
      memberBound: countOf(mem as PromiseSettledResult<any>, "已綁會員數"),
      tagged: countOf(tag as PromiseSettledResult<any>, "有 AI 標籤數"),
      lastSync: !syncFailed
        ? ((sync as PromiseFulfilledResult<any>).value.data as { last_synced_at?: string } | null)?.last_synced_at ?? null
        : null,
      lastSyncFailed: syncFailed,
    });
  }, []);

  // 列表：伺服器端搜尋 + 分頁
  const loadRows = useCallback(async (opts?: { page?: number; term?: string }) => {
    const pg = opts?.page ?? page;
    const term = (opts?.term ?? search).trim();
    setLoading(true);
    let q = supabase
      .from("traveler_profiles")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });
    if (term) {
      const esc = term.replace(/[%,()]/g, " ").trim();
      q = q.or(
        `display_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,customer_key.ilike.%${esc}%`,
      );
    }
    const { data, count, error } = await q.range(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      toast({ title: "載入失敗", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as unknown as TravelerProfile[]);
      setTotalRows(count ?? 0);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    loadStats();
    loadRows({ page: 0, term: search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜尋輸入 debounce → 重置到第 1 頁、伺服器端查詢
  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      loadRows({ page: 0, term: value });
    }, 400);
  };

  const goPage = (next: number) => {
    setPage(next);
    loadRows({ page: next });
  };

  const runSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("traveler-sync", { body: { mode: "full" } });
    setSyncing(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast({ title: "同步失敗", description: error?.message ?? (data as { error?: string })?.error, variant: "destructive" });
      return;
    }
    toast({ title: "同步完成", description: `已整合 ${(data as { upserted?: number })?.upserted ?? 0} 筆旅客檔案` });
    loadStats();
    loadRows({ page: 0 });
    setPage(0);
  };

  // AI 標籤解析：以 offset 分批迴圈，直到 done=true（不再每次只跑固定筆）
  const runTagging = async () => {
    setTagging(true);
    setTagProgress({ done: 0, total: 0 });
    let offset = 0;
    let processed = 0;
    let guard = 0;
    try {
      while (guard++ < 500) {
        const { data, error } = await supabase.functions.invoke("traveler-tagging", { body: { limit: 25, offset } });
        const d = data as { processed?: number; total?: number; next_offset?: number; done?: boolean; error?: string } | null;
        if (error || d?.error) {
          toast({ title: "標籤解析失敗", description: error?.message ?? d?.error, variant: "destructive" });
          break;
        }
        processed += d?.processed ?? 0;
        const total = d?.total ?? 0;
        setTagProgress({ done: Math.min(offset + 25, total), total });
        if (d?.done || !total) break;
        offset = d?.next_offset ?? offset + 25;
      }
      toast({ title: "AI 標籤解析完成", description: `已更新 ${processed} 位旅客標籤` });
    } finally {
      setTagging(false);
      setTagProgress(null);
      loadStats();
      loadRows();
    }
  };

  const statCards = [
    { title: "旅客檔案總數", value: stats.total === null ? "—" : stats.total, icon: Users },
    { title: "已綁會員數", value: stats.memberBound === null ? "—" : stats.memberBound, icon: UserCheck },
    { title: "有 AI 標籤數", value: stats.tagged === null ? "—" : stats.tagged, icon: Tags },
    { title: "最後同步時間", value: stats.lastSyncFailed ? "—" : (formatDateTime(stats.lastSync) || "尚未同步"), icon: Clock, isText: true },
  ];

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">旅客資料匯流</h1>
          <p className="text-sm text-muted-foreground">整合會員、客戶、折扣碼、金流與 AI 對話的單一旅客檔案</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runSync} disabled={syncing} data-testid="traveler-sync-button">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同步中…" : "立即同步"}
          </Button>
          <Button variant="outline" onClick={runTagging} disabled={tagging} data-testid="traveler-tagging-button">
            <Sparkles className={`mr-2 h-4 w-4 ${tagging ? "animate-pulse" : ""}`} />
            {tagging
              ? tagProgress && tagProgress.total
                ? `解析中… ${tagProgress.done}/${tagProgress.total}`
                : "解析中…"
              : "AI 標籤解析"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <Card key={c.title} data-testid={`traveler-stat-${c.title}`}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{c.title}</p>
                <p className={c.isText ? "text-sm font-medium truncate" : "text-xl font-bold tabular-nums"}>
                  {c.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">旅客列表</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜尋 email／手機／姓名／合併鍵"
              className="pl-9"
              data-testid="traveler-search-input"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search.trim() ? "找不到符合的旅客。" : "尚無旅客檔案，請先點擊「立即同步」。"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">合併鍵</TableHead>
                    <TableHead className="w-[200px]">綁定身分</TableHead>
                    <TableHead className="w-[240px]">興趣標籤</TableHead>
                    <TableHead className="w-[110px] text-right">消費總額</TableHead>
                    <TableHead className="w-[80px] text-right">次數</TableHead>
                    <TableHead className="w-[120px]">最近消費</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      data-testid={`traveler-row-${r.id}`}
                      onClick={() => setDetailId(r.id)}
                    >
                      <TableCell className="truncate">
                        <div className="font-medium truncate">{r.display_name || "－"}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.customer_key}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.bound_identities ?? []).slice(0, 4).map((i, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {identityLabel(i.type)}
                            </Badge>
                          ))}
                          {(r.bound_identities ?? []).length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{(r.bound_identities ?? []).length - 4}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.interest_tags ?? []).slice(0, 5).map((t) => (
                            <Badge key={t} className="text-xs">{t}</Badge>
                          ))}
                          {(r.interest_tags ?? []).length === 0 && (
                            <span className="text-xs text-muted-foreground">－</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        NT$ {(r.consumption?.total_amount ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.consumption?.order_count ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.consumption?.last_order_at?.slice(0, 10) ?? "－"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalRows > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="traveler-pagination-info">
                第 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} 筆，共 {totalRows} 筆
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 0 || loading}
                  data-testid="traveler-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums">{page + 1} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goPage(page + 1)}
                  disabled={page + 1 >= totalPages || loading}
                  data-testid="traveler-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl md:max-w-2xl" data-testid="traveler-detail-drawer">
          <SheetHeader>
            <SheetTitle>旅客詳情</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {detailId && <TravelerDetailBody travelerId={detailId} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
