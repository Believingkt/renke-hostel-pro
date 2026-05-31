import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right break-all" : "text-right"}>{value}</span>
    </div>
  );
}

interface MetaAd {
  id: string;
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  status: string | null;
  start_date: string | null;
  stop_date: string | null;
  synced_at: string | null;
}

interface MetaAdWeekly {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  date_range: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  msg_started: number | null;
  status: string | null;
  start_date: string | null;
  stop_date: string | null;
}

interface CommonAdId {
  id: string;
  label: string;
  ad_id: string;
  sort_order: number;
}

interface VideoCreatorRule {
  id: string;
  keyword: string;
  video_creator_id: string;
  sort_order: number;
}

interface VideoMember {
  user_id: string;
  display_name: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "success"> = {
  ACTIVE: "success",
  PAUSED: "default",
  ARCHIVED: "secondary",
};

const fmtMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString()}`;
const fmtNum = (n: number | null | undefined) => Number(n ?? 0).toLocaleString();

const fmtDate = (d: string | null | undefined) => (d ? d : "—");

export default function TeamAds() {
  const { roles } = useTeam();
  const canEditSettings =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    roles.includes("scout_manager");

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">廣告追蹤</h2>
      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads">廣告清單</TabsTrigger>
          <TabsTrigger value="weekly">週報表</TabsTrigger>
          <TabsTrigger value="settings">設定</TabsTrigger>
        </TabsList>
        <TabsContent value="ads" className="mt-4">
          <AdsListTab />
        </TabsContent>
        <TabsContent value="weekly" className="mt-4">
          <WeeklyTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab canEdit={canEditSettings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Tab 1 ---------------- */
function AdsListTab() {
  const [rows, setRows] = useState<MetaAd[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("meta_ads")
      .select("id,ad_id,ad_name,campaign_name,status,start_date,stop_date,synced_at")
      .order("synced_at", { ascending: false });
    if (error) return toast.error("載入失敗：" + error.message);
    const list = (data || []) as MetaAd[];
    setRows(list);
    setLastSync(list[0]?.synced_at ?? null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", {
        body: {},
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "同步失敗");
      toast.success(`同步完成（${data?.written ?? 0} 筆）`);
      await load();
    } catch (e: any) {
      toast.error("同步失敗：" + (e?.message || String(e)));
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (search) {
        const k = search.toLowerCase();
        if (
          !(r.ad_name?.toLowerCase().includes(k) || r.ad_id.toLowerCase().includes(k))
        )
          return false;
      }
      return true;
    });
  }, [rows, search, status]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="搜尋廣告名稱或編號"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              <SelectItem value="ACTIVE">ACTIVE</SelectItem>
              <SelectItem value="PAUSED">PAUSED</SelectItem>
              <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            最後同步：{lastSync ? new Date(lastSync).toLocaleString("zh-TW") : "—"}
          </p>
          <Button size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同步中…" : "立即同步"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>廣告編號</TableHead>
              <TableHead>廣告名稱</TableHead>
              <TableHead>行銷活動</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>起始日期</TableHead>
              <TableHead>截止日期</TableHead>
              <TableHead>最後同步</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  尚無廣告資料
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.ad_id}</TableCell>
                  <TableCell>{r.ad_name ?? "—"}</TableCell>
                  <TableCell>{r.campaign_name ?? "—"}</TableCell>
                  <TableCell>
                    {r.status ? (
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {r.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmtDate(r.start_date)}</TableCell>
                  <TableCell>{fmtDate(r.stop_date)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.synced_at ? new Date(r.synced_at).toLocaleString("zh-TW") : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between pt-3">
          <div className="text-sm text-muted-foreground">
            共 {filtered.length} 筆，第 {page} / {totalPages} 頁
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一頁
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一頁
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Tab 2 ---------------- */
type QuickRangeKey = "7d" | "30d" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "all" | null;

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function WeeklyTab() {
  const [rows, setRows] = useState<MetaAdWeekly[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return toISO(d);
  });
  const [toDate, setToDate] = useState<string>(() => toISO(new Date()));
  const [quickRange, setQuickRange] = useState<QuickRangeKey>(null);
  const [detail, setDetail] = useState<MetaAdWeekly | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("meta_ad_weekly")
      .select(
        "id,campaign_id,campaign_name,date_range,spend,impressions,reach,msg_started,status,start_date,stop_date",
      )
      .order("date_range", { ascending: false });
    if (error) return toast.error("載入失敗：" + error.message);
    setRows((data || []) as MetaAdWeekly[]);
  };

  const applyQuickRange = (key: QuickRangeKey) => {
    setQuickRange(key);
    const now = new Date();
    if (key === "all") {
      setFromDate("");
      setToDate("");
      return;
    }
    if (key === "7d") {
      const f = new Date(); f.setDate(now.getDate() - 7);
      setFromDate(toISO(f)); setToDate(toISO(now)); return;
    }
    if (key === "30d") {
      const f = new Date(); f.setDate(now.getDate() - 30);
      setFromDate(toISO(f)); setToDate(toISO(now)); return;
    }
    if (key === "thisMonth") {
      setFromDate(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(toISO(now)); return;
    }
    if (key === "lastMonth") {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      setFromDate(toISO(f)); setToDate(toISO(t)); return;
    }
    if (key === "thisYear") {
      setFromDate(toISO(new Date(now.getFullYear(), 0, 1)));
      setToDate(toISO(now)); return;
    }
    if (key === "lastYear") {
      setFromDate(toISO(new Date(now.getFullYear() - 1, 0, 1)));
      setToDate(toISO(new Date(now.getFullYear() - 1, 11, 31))); return;
    }
  };

  const quickRanges: { key: Exclude<QuickRangeKey, null>; label: string }[] = [
    { key: "7d", label: "近7天" },
    { key: "30d", label: "近30天" },
    { key: "thisMonth", label: "本月" },
    { key: "lastMonth", label: "上個月" },
    { key: "thisYear", label: "今年" },
    { key: "lastYear", label: "去年" },
    { key: "all", label: "迄今" },
  ];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !(r.campaign_name?.toLowerCase().includes(search.toLowerCase())))
        return false;
      if (!fromDate && !toDate) return true;
      const m = r.date_range.match(/(\d{4}-\d{2}-\d{2})/g);
      if (m && m.length >= 1) {
        const start = m[0];
        const end = m[1] ?? m[0];
        if (toDate && start > toDate) return false;
        if (fromDate && end < fromDate) return false;
      }
      return true;
    });
  }, [rows, search, fromDate, toDate]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, fromDate, toDate]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {quickRanges.map((q) => (
            <Button
              key={q.key}
              size="sm"
              variant={quickRange === q.key ? "default" : "outline"}
              onClick={() => applyQuickRange(q.key)}
            >
              {q.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">起始日</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setQuickRange(null); }}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">結束日</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setQuickRange(null); }}
              className="w-40"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">行銷活動搜尋</Label>
            <Input
              placeholder="輸入活動名稱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>行銷活動</TableHead>
              <TableHead>日期區間</TableHead>
              <TableHead className="text-right">週花費</TableHead>
              <TableHead className="text-right">曝光次數</TableHead>
              <TableHead className="text-right">觸及人數</TableHead>
              <TableHead className="text-right">訊息對話</TableHead>
              <TableHead>狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  尚無週報資料
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetail(r)}
                >
                  <TableCell>{r.campaign_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.date_range}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.reach)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.msg_started)}</TableCell>
                  <TableCell>
                    {r.status ? (
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {r.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between pt-3">
          <div className="text-sm text-muted-foreground">
            共 {filtered.length} 筆，第 {page} / {totalPages} 頁
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一頁
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一頁
            </Button>
          </div>
        </div>
      </CardContent>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <SheetTitle>週報明細</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label="行銷活動ID" value={detail.campaign_id ?? "—"} mono />
              <DetailRow label="行銷活動名稱" value={detail.campaign_name ?? "—"} />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">廣告狀態</span>
                {detail.status ? (
                  <Badge variant={STATUS_VARIANT[detail.status] ?? "outline"}>
                    {detail.status}
                  </Badge>
                ) : (
                  <span>—</span>
                )}
              </div>
              <DetailRow label="活動建立日期" value={fmtDate(detail.start_date)} />
              <DetailRow label="截止日期" value={fmtDate(detail.stop_date)} />
              <DetailRow label="日期區間" value={detail.date_range} />
              <DetailRow label="週花費" value={fmtMoney(detail.spend)} />
              <DetailRow label="曝光次數" value={fmtNum(detail.impressions)} />
              <DetailRow label="觸及人數" value={fmtNum(detail.reach)} />
              <DetailRow label="訊息對話數" value={fmtNum(detail.msg_started)} />
            </div>
          )}
        </SheetContent>
      </Sheet>

    </Card>
  );
}

/* ---------------- Tab 3 ---------------- */
function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const [commonAds, setCommonAds] = useState<CommonAdId[]>([]);
  const [rules, setRules] = useState<VideoCreatorRule[]>([]);
  const [videoMembers, setVideoMembers] = useState<VideoMember[]>([]);

  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [adForm, setAdForm] = useState({ label: "", ad_id: "" });

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({
    keyword: "",
    video_creator_id: "",
    sort_order: 0,
  });

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    const [c, r, v] = await Promise.all([
      supabase
        .from("common_ad_ids")
        .select("id,label,ad_id,sort_order")
        .order("sort_order"),
      supabase
        .from("ad_video_creator_rules")
        .select("id,keyword,video_creator_id,sort_order")
        .order("sort_order"),
      supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "video")
        .is("accommodation_id", null),
    ]);
    if (!c.error) setCommonAds((c.data || []) as CommonAdId[]);
    if (!r.error) setRules((r.data || []) as VideoCreatorRule[]);
    if (!v.error) {
      const userIds = Array.from(
        new Set(((v.data || []) as any[]).map((row) => row.user_id).filter(Boolean)),
      );
      if (userIds.length === 0) {
        setVideoMembers([]);
      } else {
        const { data: profiles } = await supabase
          .from("team_member_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        setVideoMembers(
          (profiles || []).map((p: any) => ({
            user_id: p.user_id,
            display_name: p.display_name,
          })),
        );
      }
    }
  };

  const memberName = (id: string) =>
    videoMembers.find((m) => m.user_id === id)?.display_name ?? "—";

  const saveAd = async () => {
    if (!adForm.label.trim() || !adForm.ad_id.trim())
      return toast.error("請填寫標籤與廣告編號");
    let error;
    if (editingAdId) {
      ({ error } = await supabase
        .from("common_ad_ids")
        .update({ label: adForm.label.trim(), ad_id: adForm.ad_id.trim() })
        .eq("id", editingAdId));
    } else {
      const nextSort =
        commonAds.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0) + 1;
      ({ error } = await supabase.from("common_ad_ids").insert({
        label: adForm.label.trim(),
        ad_id: adForm.ad_id.trim(),
        sort_order: nextSort,
      }));
    }
    if (error) return toast.error((editingAdId ? "更新" : "新增") + "失敗：" + error.message);
    toast.success(editingAdId ? "已更新" : "已新增");
    setAdDialogOpen(false);
    setEditingAdId(null);
    setAdForm({ label: "", ad_id: "" });
    void loadAll();
  };

  const openEditAd = (a: CommonAdId) => {
    setEditingAdId(a.id);
    setAdForm({ label: a.label, ad_id: a.ad_id });
    setAdDialogOpen(true);
  };

  const openNewAd = () => {
    setEditingAdId(null);
    setAdForm({ label: "", ad_id: "" });
    setAdDialogOpen(true);
  };

  const deleteAd = async (id: string) => {
    if (!confirm("確定刪除此項？")) return;
    const { error } = await supabase.from("common_ad_ids").delete().eq("id", id);
    if (error) return toast.error("刪除失敗：" + error.message);
    void loadAll();
  };

  const saveRule = async () => {
    if (!ruleForm.keyword.trim() || !ruleForm.video_creator_id)
      return toast.error("請填寫關鍵字並選擇影音組成員");
    const basePayload = {
      keyword: ruleForm.keyword.trim(),
      video_creator_id: ruleForm.video_creator_id,
    };
    const { error } = editingRuleId
      ? await supabase
          .from("ad_video_creator_rules")
          .update(basePayload)
          .eq("id", editingRuleId)
      : await supabase.from("ad_video_creator_rules").insert({
          ...basePayload,
          sort_order:
            rules.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 1,
        });
    if (error) return toast.error((editingRuleId ? "更新" : "新增") + "失敗：" + error.message);
    toast.success(editingRuleId ? "已更新" : "已新增");
    setRuleDialogOpen(false);
    setEditingRuleId(null);
    setRuleForm({ keyword: "", video_creator_id: "", sort_order: 0 });
    void loadAll();
  };

  const openEditRule = (r: VideoCreatorRule) => {
    setEditingRuleId(r.id);
    setRuleForm({
      keyword: r.keyword,
      video_creator_id: r.video_creator_id,
      sort_order: r.sort_order ?? 0,
    });
    setRuleDialogOpen(true);
  };

  const openNewRule = () => {
    setEditingRuleId(null);
    setRuleForm({ keyword: "", video_creator_id: "", sort_order: 0 });
    setRuleDialogOpen(true);
  };

  const deleteRule = async (id: string) => {
    if (!confirm("確定刪除此規則？")) return;
    const { error } = await supabase
      .from("ad_video_creator_rules")
      .delete()
      .eq("id", id);
    if (error) return toast.error("刪除失敗：" + error.message);
    void loadAll();
  };

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          您沒有權限編輯此區塊
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Common Ad IDs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">常用廣告編號</CardTitle>
          <Button size="sm" onClick={openNewAd}>
            <Plus className="h-4 w-4 mr-1" /> 新增
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標籤</TableHead>
                <TableHead>廣告編號</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commonAds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    尚無常用廣告編號
                  </TableCell>
                </TableRow>
              ) : (
                commonAds.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.label}</TableCell>
                    <TableCell className="font-mono text-xs">{a.ad_id}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditAd(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteAd(a.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Video creator rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">廣告名稱 → 影音組對照規則</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              填寫廣告編號時，系統會根據廣告名稱自動比對關鍵字並帶入影音組成員
            </p>
          </div>
          <Button size="sm" onClick={openNewRule}>
            <Plus className="h-4 w-4 mr-1" /> 新增規則
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>關鍵字</TableHead>
                <TableHead>影音組成員</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    尚無規則
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.keyword}</TableCell>
                    <TableCell>{memberName(r.video_creator_id)}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditRule(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteRule(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: common ad id */}
      <Dialog
        open={adDialogOpen}
        onOpenChange={(o) => {
          setAdDialogOpen(o);
          if (!o) setEditingAdId(null);
        }}
      >
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingAdId ? "編輯常用廣告編號" : "新增常用廣告編號"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>標籤（顯示名稱）</Label>
              <Input
                value={adForm.label}
                onChange={(e) => setAdForm({ ...adForm, label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>廣告編號</Label>
              <Input
                value={adForm.ad_id}
                onChange={(e) => setAdForm({ ...adForm, ad_id: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveAd}>{editingAdId ? "更新" : "新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: rule */}
      <Dialog
        open={ruleDialogOpen}
        onOpenChange={(o) => {
          setRuleDialogOpen(o);
          if (!o) setEditingRuleId(null);
        }}
      >
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? "編輯對照規則" : "新增對照規則"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>關鍵字（廣告名稱包含此文字）</Label>
              <Input
                value={ruleForm.keyword}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, keyword: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>影音組成員</Label>
              <Select
                value={ruleForm.video_creator_id || undefined}
                onValueChange={(v) =>
                  setRuleForm({ ...ruleForm, video_creator_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇成員" />
                </SelectTrigger>
                <SelectContent>
                  {videoMembers.length === 0 ? (
                    <SelectItem value="none" disabled>
                      無影音組成員
                    </SelectItem>
                  ) : (
                    videoMembers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name ?? m.user_id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveRule}>{editingRuleId ? "更新" : "新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
