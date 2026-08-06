import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil, Users, MousePointerClick, CheckCircle2, Gift } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABEL, rewardTypeLabel, type RewardTier } from "@/lib/referral";
import { useAccommodation } from "@/contexts/AccommodationContext";

interface CampaignForm {
  id?: string;
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  reward_tiers: RewardTier[];
}

const emptyForm = (): CampaignForm => ({
  name: "",
  description: "",
  starts_at: new Date().toISOString().slice(0, 10),
  ends_at: "",
  is_active: true,
  reward_tiers: [{ tier: 1, condition: "受邀好友完成首筆訂單", reward_type: "points", reward_value: 500 }],
});

const ReferralAdmin = () => {
  const { currentAccommodationId } = useAccommodation() as any;
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(emptyForm());

  const load = async () => {
    const { data: cs } = await (supabase as any)
      .from("referral_campaigns")
      .select("*")
      .eq("accommodation_id", currentAccommodationId)
      .order("created_at", { ascending: false });
    setCampaigns(cs || []);
    const ids = (cs || []).map((c: any) => c.id);
    if (ids.length === 0) {
      setRecords([]);
      return;
    }
    const { data: rs } = await (supabase as any)
      .from("referral_records")
      .select("*")
      .in("campaign_id", ids)
      .order("created_at", { ascending: false });
    setRecords(rs || []);
    const memberIds = Array.from(
      new Set([...(rs || []).map((r: any) => r.inviter_id), ...(rs || []).map((r: any) => r.invitee_id)].filter(Boolean)),
    );
    if (memberIds.length) {
      const { data: ms } = await supabase
        .from("platform_members")
        .select("id, name")
        .in("id", memberIds as string[]);
      const map: Record<string, string> = {};
      (ms || []).forEach((m: any) => (map[m.id] = m.name || "會員"));
      setMemberNames(map);
    }
  };

  useEffect(() => {
    if (currentAccommodationId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId]);

  const stats = useMemo(() => {
    const invites = records.filter((r) => r.invitee_id);
    return {
      links: records.filter((r) => !r.invitee_id).length,
      clicks: records.reduce((s, r) => s + Number(r.click_count || 0), 0),
      registered: invites.length,
      qualified: invites.filter((r) => r.status === "qualified" || r.status === "rewarded").length,
      rewardTotal: invites
        .filter((r) => r.status === "rewarded")
        .reduce((s, r) => s + Number(r.reward_value || 0), 0),
    };
  }, [records]);

  const tree = useMemo(() => {
    const roots = records.filter((r) => !r.parent_record_id);
    const byParent: Record<string, any[]> = {};
    records.forEach((r) => {
      if (r.parent_record_id) (byParent[r.parent_record_id] ||= []).push(r);
    });
    return { roots, byParent };
  }, [records]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("請輸入活動名稱");
    const payload: any = {
      accommodation_id: currentAccommodationId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(`${form.ends_at}T23:59:59`).toISOString() : null,
      is_active: form.is_active,
      reward_tiers: form.reward_tiers,
    };
    const q = form.id
      ? (supabase as any).from("referral_campaigns").update(payload).eq("id", form.id)
      : (supabase as any).from("referral_campaigns").insert(payload);
    const { error } = await q;
    if (error) return toast.error(`儲存失敗：${error.message}`);
    toast.success("已儲存活動");
    setDialogOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("referral_campaigns").delete().eq("id", id);
    if (error) return toast.error(`刪除失敗：${error.message}`);
    toast.success("已刪除活動");
    load();
  };

  const memberLabel = (id?: string | null) => (id ? memberNames[id] || id.slice(0, 8) : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">社群裂變推廣</h1>
          <p className="text-sm text-muted-foreground">邀請活動管理與擴散績效追蹤</p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm());
            setDialogOpen(true);
          }}
          className="gap-1"
        >
          <Plus className="h-4 w-4" /> 新增活動
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Gift} label="邀請連結" value={stats.links} />
        <StatCard icon={MousePointerClick} label="點擊次數" value={stats.clicks} />
        <StatCard icon={Users} label="受邀註冊" value={stats.registered} />
        <StatCard icon={CheckCircle2} label="成單歸因" value={stats.qualified} />
        <StatCard icon={Gift} label="已發放獎勵" value={stats.rewardTotal} />
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">活動管理</TabsTrigger>
          <TabsTrigger value="funnel">擴散績效</TabsTrigger>
          <TabsTrigger value="payouts">發放清單</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-3">
          <Card className="overflow-x-auto p-0">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>活動名稱</TableHead>
                  <TableHead className="whitespace-nowrap">期間</TableHead>
                  <TableHead className="whitespace-nowrap">獎勵層級</TableHead>
                  <TableHead className="whitespace-nowrap">狀態</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      尚未建立邀請活動
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(c.starts_at).toLocaleDateString("zh-TW")} ~{" "}
                        {c.ends_at ? new Date(c.ends_at).toLocaleDateString("zh-TW") : "不限"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(c.reward_tiers || [])
                          .map(
                            (t: RewardTier) =>
                              `T${t.tier} ${rewardTypeLabel(t.reward_type)} ${Number(t.reward_value || 0)}`,
                          )
                          .join("、") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? "default" : "secondary"}>
                          {c.is_active ? "啟用中" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setForm({
                              id: c.id,
                              name: c.name,
                              description: c.description || "",
                              starts_at: String(c.starts_at).slice(0, 10),
                              ends_at: c.ends_at ? String(c.ends_at).slice(0, 10) : "",
                              is_active: c.is_active,
                              reward_tiers: Array.isArray(c.reward_tiers) ? c.reward_tiers : [],
                            });
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="funnel" className="mt-3 space-y-3">
          <Card className="p-4">
            <div className="text-sm font-medium mb-3">邀請漏斗</div>
            <div className="space-y-2">
              <FunnelBar label="連結點擊" value={stats.clicks} max={stats.clicks || 1} />
              <FunnelBar label="受邀註冊" value={stats.registered} max={stats.clicks || 1} />
              <FunnelBar label="成單歸因" value={stats.qualified} max={stats.clicks || 1} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">擴散樹狀圖（深度 ≥ 2）</div>
            {tree.roots.length === 0 ? (
              <div className="text-sm text-muted-foreground">尚無資料</div>
            ) : (
              <div className="space-y-2 text-sm">
                {tree.roots.map((r) => (
                  <TreeNode key={r.id} node={r} byParent={tree.byParent} depth={0} label={memberLabel} />
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="mt-3">
          <Card className="overflow-x-auto p-0">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">邀請人</TableHead>
                  <TableHead className="whitespace-nowrap">受邀人</TableHead>
                  <TableHead className="whitespace-nowrap">層級</TableHead>
                  <TableHead className="whitespace-nowrap">獎勵</TableHead>
                  <TableHead className="whitespace-nowrap">狀態</TableHead>
                  <TableHead className="whitespace-nowrap">發放時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.filter((r) => r.invitee_id).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      尚無邀請紀錄
                    </TableCell>
                  </TableRow>
                ) : (
                  records
                    .filter((r) => r.invitee_id)
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{memberLabel(r.inviter_id)}</TableCell>
                        <TableCell>{memberLabel(r.invitee_id)}</TableCell>
                        <TableCell>第 {r.tier} 層</TableCell>
                        <TableCell className="tabular-nums">
                          {rewardTypeLabel(r.reward_type)} {Number(r.reward_value || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "rewarded" ? "default" : "secondary"}>
                            {STATUS_LABEL[r.status] || r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {r.rewarded_at ? new Date(r.rewarded_at).toLocaleString("zh-TW") : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "編輯裂變活動" : "新增裂變活動"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>活動名稱</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>活動說明</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>開始日期</Label>
                <Input
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div>
                <Label>結束日期（可留空）</Label>
                <Input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="mb-0">啟用活動</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="mb-0">獎勵規則</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      ...form,
                      reward_tiers: [
                        ...form.reward_tiers,
                        {
                          tier: form.reward_tiers.length + 1,
                          condition: "",
                          reward_type: "points",
                          reward_value: 100,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> 新增層級
                </Button>
              </div>
              {form.reward_tiers.map((t, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">第 {t.tier} 層</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setForm({ ...form, reward_tiers: form.reward_tiers.filter((_, x) => x !== i) })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    placeholder="達成條件說明"
                    value={t.condition || ""}
                    onChange={(e) => {
                      const next = [...form.reward_tiers];
                      next[i] = { ...t, condition: e.target.value };
                      setForm({ ...form, reward_tiers: next });
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={t.reward_type || "points"}
                      onValueChange={(v) => {
                        const next = [...form.reward_tiers];
                        next[i] = { ...t, reward_type: v as "points" | "coupon" };
                        setForm({ ...form, reward_tiers: next });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="points">紅利點數</SelectItem>
                        <SelectItem value="coupon">折價券</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={t.reward_value ?? 0}
                      onChange={(e) => {
                        const next = [...form.reward_tiers];
                        next[i] = { ...t, reward_value: Number(e.target.value) };
                        setForm({ ...form, reward_tiers: next });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={save}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) => (
  <Card className="p-3">
    <Icon className="h-4 w-4 text-primary mb-1" />
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-xl font-bold tabular-nums leading-tight">{value.toLocaleString()}</div>
  </Card>
);

const FunnelBar = ({ label, value, max }: { label: string; value: number; max: number }) => (
  <div>
    <div className="flex items-center justify-between text-sm mb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value.toLocaleString()}</span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }}
      />
    </div>
  </div>
);

const TreeNode = ({
  node,
  byParent,
  depth,
  label,
}: {
  node: any;
  byParent: Record<string, any[]>;
  depth: number;
  label: (id?: string | null) => string;
}) => {
  const children = byParent[node.id] || [];
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1">
        <span className="text-muted-foreground">{depth > 0 ? "└" : "●"}</span>
        <span className="font-medium">{label(node.inviter_id)}</span>
        {node.invitee_id && (
          <>
            <span className="text-muted-foreground">→</span>
            <span>{label(node.invitee_id)}</span>
          </>
        )}
        <Badge variant="secondary" className="text-[11px]">
          {STATUS_LABEL[node.status] || node.status}
        </Badge>
      </div>
      {children.map((c) => (
        <TreeNode key={c.id} node={c} byParent={byParent} depth={depth + 1} label={label} />
      ))}
    </div>
  );
};

export default ReferralAdmin;
