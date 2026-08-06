import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Sparkles, Users, UserCheck, Tags, Clock, Search } from "lucide-react";
import type { TravelerProfile } from "@/types/traveler";
import { identityLabel, formatDateTime } from "@/types/traveler";

export default function TravelerCdp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { withPrefix } = useAliasPrefix();
  const [rows, setRows] = useState<TravelerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const load = async () => {
    const { data, error } = await supabase
      .from("traveler_profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "載入失敗", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as unknown as TravelerProfile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runSync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("traveler-sync", { body: { mode: "full" } });
    setSyncing(false);
    if (error || (data as any)?.error) {
      toast({ title: "同步失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({ title: "同步完成", description: `已整合 ${(data as any)?.upserted ?? 0} 筆旅客檔案` });
    load();
  };

  const runTagging = async () => {
    setTagging(true);
    const { data, error } = await supabase.functions.invoke("traveler-tagging", { body: { limit: 20 } });
    setTagging(false);
    if (error || (data as any)?.error) {
      toast({ title: "標籤解析失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({
      title: "AI 標籤解析完成",
      description: (data as any)?.note ?? `已更新 ${(data as any)?.processed ?? 0} 位旅客標籤`,
    });
    load();
  };

  const stats = useMemo(() => {
    const memberBound = rows.filter((r) =>
      (r.bound_identities ?? []).some((i) => i.type === "member")
    ).length;
    const tagged = rows.filter((r) => (r.interest_tags ?? []).length > 0).length;
    const lastSync = rows
      .map((r) => r.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    return { total: rows.length, memberBound, tagged, lastSync };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.customer_key, r.display_name, r.email, r.phone, ...(r.interest_tags ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const statCards = [
    { title: "旅客檔案總數", value: stats.total, icon: Users },
    { title: "已綁會員數", value: stats.memberBound, icon: UserCheck },
    { title: "有 AI 標籤數", value: stats.tagged, icon: Tags },
    { title: "最後同步時間", value: formatDateTime(stats.lastSync) || "尚未同步", icon: Clock, isText: true },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">旅客資料匯流</h1>
          <p className="text-sm text-muted-foreground">整合會員、客戶、折扣碼、金流與 AI 對話的單一旅客檔案</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同步中…" : "立即同步"}
          </Button>
          <Button variant="outline" onClick={runTagging} disabled={tagging}>
            <Sparkles className={`mr-2 h-4 w-4 ${tagging ? "animate-pulse" : ""}`} />
            {tagging ? "解析中…" : "AI 標籤解析"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <Card key={c.title}>
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 email／手機／姓名／標籤"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? null : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              尚無旅客檔案，請先點擊「立即同步」。
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
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate(withPrefix(`/admin/cdp/${r.id}`))}
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
        </CardContent>
      </Card>
    </div>
  );
}
