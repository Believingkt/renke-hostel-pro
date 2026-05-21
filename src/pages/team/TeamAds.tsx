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
import { Plus, Trash2 } from "lucide-react";

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
  campaign_name: string | null;
  date_range: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  msg_started: number | null;
  status: string | null;
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
        <p className="text-xs text-muted-foreground">
          最後同步：{lastSync ? new Date(lastSync).toLocaleString("zh-TW") : "—"}
        </p>
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
              filtered.map((r) => (
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
      </CardContent>
    </Card>
  );
}

/* ---------------- Tab 2 ---------------- */
function WeeklyTab() {
  const [rows, setRows] = useState<MetaAdWeekly[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("meta_ad_weekly")
      .select("id,campaign_name,date_range,spend,impressions,reach,msg_started,status")
      .order("date_range", { ascending: false });
    if (error) return toast.error("載入失敗：" + error.message);
    setRows((data || []) as MetaAdWeekly[]);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !(r.campaign_name?.toLowerCase().includes(search.toLowerCase())))
        return false;
      // date_range stored as text e.g. "2025-05-01 ~ 2025-05-07"; do best-effort filtering
      const m = r.date_range.match(/(\d{4}-\d{2}-\d{2})/g);
      if (m && m.length >= 1) {
        const start = m[0];
        const end = m[1] ?? m[0];
        if (end < fromDate || start > toDate) return false;
      }
      return true;
    });
  }, [rows, search, fromDate, toDate]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">起始日</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">結束日</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
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
              filtered.map((r) => (
                <TableRow key={r.id}>
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
      </CardContent>
    </Card>
  );
}

/* ---------------- Tab 3 ---------------- */
function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const [commonAds, setCommonAds] = useState<CommonAdId[]>([]);
  const [rules, setRules] = useState<VideoCreatorRule[]>([]);
  const [videoMembers, setVideoMembers] = useState<VideoMember[]>([]);

  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [adForm, setAdForm] = useState({ label: "", ad_id: "", sort_order: 0 });

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
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
        .select("user_id, team_member_profiles!inner(user_id,display_name)")
        .eq("role", "video")
        .is("accommodation_id", null),
    ]);
    if (!c.error) setCommonAds((c.data || []) as CommonAdId[]);
    if (!r.error) setRules((r.data || []) as VideoCreatorRule[]);
    if (!v.error) {
      const members: VideoMember[] = ((v.data || []) as any[]).map((row) => ({
        user_id: row.team_member_profiles.user_id,
        display_name: row.team_member_profiles.display_name,
      }));
      // dedup
      const seen = new Set<string>();
      setVideoMembers(
        members.filter((m) => {
          if (seen.has(m.user_id)) return false;
          seen.add(m.user_id);
          return true;
        }),
      );
    }
  };

  const memberName = (id: string) =>
    videoMembers.find((m) => m.user_id === id)?.display_name ?? "—";

  const saveAd = async () => {
    if (!adForm.label.trim() || !adForm.ad_id.trim())
      return toast.error("請填寫標籤與廣告編號");
    const { error } = await supabase.from("common_ad_ids").insert({
      label: adForm.label.trim(),
      ad_id: adForm.ad_id.trim(),
      sort_order: Number(adForm.sort_order) || 0,
    });
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增");
    setAdDialogOpen(false);
    setAdForm({ label: "", ad_id: "", sort_order: 0 });
    void loadAll();
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
    const { error } = await supabase.from("ad_video_creator_rules").insert({
      keyword: ruleForm.keyword.trim(),
      video_creator_id: ruleForm.video_creator_id,
      sort_order: Number(ruleForm.sort_order) || 0,
    });
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增");
    setRuleDialogOpen(false);
    setRuleForm({ keyword: "", video_creator_id: "", sort_order: 0 });
    void loadAll();
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
          <Button size="sm" onClick={() => setAdDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標籤</TableHead>
                <TableHead>廣告編號</TableHead>
                <TableHead className="w-20">排序</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commonAds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    尚無常用廣告編號
                  </TableCell>
                </TableRow>
              ) : (
                commonAds.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.label}</TableCell>
                    <TableCell className="font-mono text-xs">{a.ad_id}</TableCell>
                    <TableCell>{a.sort_order}</TableCell>
                    <TableCell>
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
          <Button size="sm" onClick={() => setRuleDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增規則
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>關鍵字</TableHead>
                <TableHead>影音組成員</TableHead>
                <TableHead className="w-20">排序</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    尚無規則
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.keyword}</TableCell>
                    <TableCell>{memberName(r.video_creator_id)}</TableCell>
                    <TableCell>{r.sort_order}</TableCell>
                    <TableCell>
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
      <Dialog open={adDialogOpen} onOpenChange={setAdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增常用廣告編號</DialogTitle>
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
            <div className="space-y-1">
              <Label>排序</Label>
              <Input
                type="number"
                value={adForm.sort_order}
                onChange={(e) =>
                  setAdForm({ ...adForm, sort_order: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveAd}>新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: rule */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增對照規則</DialogTitle>
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
            <div className="space-y-1">
              <Label>排序</Label>
              <Input
                type="number"
                value={ruleForm.sort_order}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, sort_order: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={saveRule}>新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
