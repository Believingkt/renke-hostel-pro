import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

interface Member {
  user_id: string;
  display_name: string;
}

interface Tier {
  id: string;
  level: string;
  tier_name: string;
  min_count: number;
  max_count: number | null;
  signup_bonus_rate: number | null;
  per_order_rate: number | null;
  sort_order: number;
  effective_from: string;
}

interface StarlinkOrder {
  id: string;
  client_name: string;
  client_tax_id: string | null;
  business_type: string | null;
  plan_name: string | null;
  plan_price: number;
  sold_by: string;
  level_at_sale: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  sold_at: string | null;
  payment_confirmed: boolean | null;
  payment_last5: string | null;
  invoice_number: string | null;
  contract_uploaded: boolean | null;
  payout_status: string | null;
  notes: string | null;
}


interface PlanSetting {
  id: string;
  plan_name: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

const fmtMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString()}`;
const fmtRate = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(2)}%`;

export default function TeamStarlink() {
  const { roles, userId } = useTeam();
  const canManage = roles.includes("super_admin") || roles.includes("admin");
  const canView = canManage || roles.includes("starlink");

  if (!canView) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">星鏈</h2>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            您沒有權限訪問此頁面
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">星鏈</h2>
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">訂單列表</TabsTrigger>
          <TabsTrigger value="tiers">等級設定</TabsTrigger>
          <TabsTrigger value="plans">方案設定</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab canManage={canManage} currentUserId={userId} />
        </TabsContent>
        <TabsContent value="tiers" className="mt-4">
          <TiersTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <PlansTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrdersTab({
  canManage,
  currentUserId,
}: {
  canManage: boolean;
  currentUserId: string;
}) {
  const [orders, setOrders] = useState<StarlinkOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [plans, setPlans] = useState<PlanSetting[]>([]);

  const [year, setYear] = useState<string>("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [salesFilter, setSalesFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setPage(1);
  }, [year, month, statusFilter, salesFilter]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    client_tax_id: "",
    business_type: "",
    plan_name: "",
    sold_by: "",
    sold_at: new Date().toISOString().slice(0, 10),
    payment_confirmed: false,
    payment_last5: "",
    invoice_number: "",
    contract_uploaded: false,
    notes: "",
    level_at_sale: "",
    commission_rate: 0,
  });
  const [autoTierInfo, setAutoTierInfo] = useState<{ level: string; rate: number; count: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    client_name: "",
    client_tax_id: "",
    business_type: "",
    plan_name: "",
    sold_by: "",
    sold_at: "",
    payment_confirmed: false,
    payment_last5: "",
    invoice_number: "",
    contract_uploaded: false,
    payout_status: "pending",
    notes: "",
    level_at_sale: "",
    commission_rate: 0,
    plan_price: 0,
  });
  const [editSaving, setEditSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<StarlinkOrder | null>(null);
  const openDetail = (o: StarlinkOrder) => {
    setDetailOrder(o);
    setDetailOpen(true);
  };

  const openEdit = (o: StarlinkOrder) => {
    setEditId(o.id);
    setEditForm({
      client_name: o.client_name ?? "",
      client_tax_id: o.client_tax_id ?? "",
      business_type: o.business_type ?? "",
      plan_name: o.plan_name ?? "",
      sold_by: o.sold_by ?? "",
      sold_at: o.sold_at ?? "",
      payment_confirmed: !!o.payment_confirmed,
      payment_last5: o.payment_last5 ?? "",
      invoice_number: o.invoice_number ?? "",
      contract_uploaded: !!o.contract_uploaded,
      payout_status: o.payout_status ?? "pending",
      notes: o.notes ?? "",
      level_at_sale: o.level_at_sale ?? "",
      commission_rate: Number(o.commission_rate ?? 0) * 100,
      plan_price: Number(o.plan_price ?? 0),
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editId) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("starlink_orders")
      .update({
        client_name: editForm.client_name.trim(),
        client_tax_id: editForm.client_tax_id.trim() || null,
        business_type: editForm.business_type.trim() || null,
        plan_name: editForm.plan_name || null,
        sold_by: editForm.sold_by || null,
        sold_at: editForm.sold_at || null,
        payment_confirmed: editForm.payment_confirmed,
        payment_last5: editForm.payment_last5.trim() || null,
        invoice_number: editForm.invoice_number.trim() || null,
        contract_uploaded: editForm.contract_uploaded,
        payout_status: editForm.payout_status,
        notes: editForm.notes.trim() || null,
        level_at_sale: editForm.level_at_sale.trim() || null,
        commission_rate: editForm.commission_rate ? editForm.commission_rate / 100 : null,
        commission_amount: Math.round(editForm.plan_price * (editForm.commission_rate / 100)),
      })
      .eq("id", editId);
    setEditSaving(false);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    toast.success("已更新");
    setEditOpen(false);
    void loadAll();
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    const [o, r, t, p] = await Promise.all([
      supabase
        .from("starlink_orders")
        .select(
          "id,client_name,client_tax_id,business_type,plan_name,plan_price,sold_by,level_at_sale,commission_rate,commission_amount,sold_at,payment_confirmed,payment_last5,invoice_number,contract_uploaded,payout_status,notes",
        )
        .order("sold_at", { ascending: false }),
      supabase.rpc("get_team_role_members", { p_role: "starlink" }),
      supabase.from("starlink_tier_settings").select("*").order("min_count"),
      supabase
        .from("starlink_plan_settings")
        .select("*")
        .eq("is_active", true)
        .order("created_at"),
    ]);
    if (o.data) setOrders(o.data as StarlinkOrder[]);
    if (r.data) {
      const seen = new Set<string>();
      const list: Member[] = [];
      (r.data as any[]).forEach((row) => {
        const pid = row.user_id;
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          list.push({
            user_id: pid,
            display_name: row.display_name ?? pid,
          });
        }
      });
      setMembers(list);
    }
    if (t.data) setTiers(t.data as Tier[]);
    if (p.data) setPlans(p.data as PlanSetting[]);
  };

  const memberName = (id: string | null) =>
    !id ? "—" : members.find((m) => m.user_id === id)?.display_name ?? "—";

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (!canManage && o.sold_by !== currentUserId) return false;
        if (o.sold_at) {
          const d = new Date(o.sold_at);
          if (year !== "ALL" && String(d.getFullYear()) !== year) return false;
          if (month !== "ALL" && d.getMonth() + 1 !== Number(month)) return false;
        }
        if (statusFilter !== "ALL" && o.payout_status !== statusFilter) return false;
        if (salesFilter !== "ALL" && o.sold_by !== salesFilter) return false;
        return true;
      })
      .sort((a, b) => (b.sold_at ?? "").localeCompare(a.sold_at ?? ""));
  }, [orders, year, month, statusFilter, salesFilter, canManage, currentUserId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const findTierForCount = (count: number): Tier | undefined => {
    return tiers.find(
      (t) => count >= t.min_count && (t.max_count == null || count <= t.max_count),
    );
  };

  const handleSave = async () => {
    if (!form.client_name.trim() || !form.plan_name || !form.sold_by) {
      toast.error("請填寫客戶名稱、方案與銷售人");
      return;
    }
    const plan = plans.find((p) => p.plan_name === form.plan_name);
    if (!plan) return;
    setSaving(true);

    const ratePct = Number(form.commission_rate ?? 0);
    const rate = ratePct / 100;
    const payload = {
      client_name: form.client_name.trim(),
      client_tax_id: form.client_tax_id.trim() || null,
      business_type: form.business_type.trim() || null,
      plan_name: plan.plan_name,
      plan_price: plan.price,
      sold_by: form.sold_by,
      level_at_sale: form.level_at_sale.trim() || null,
      commission_rate: rate || null,
      commission_amount: Math.round(plan.price * rate),
      sold_at: form.sold_at,
      payment_confirmed: form.payment_confirmed,
      payment_last5: form.payment_last5.trim() || null,
      invoice_number: form.invoice_number.trim() || null,
      contract_uploaded: form.contract_uploaded,
      notes: form.notes.trim() || null,
      created_by: currentUserId,
    };
    const { error } = await supabase.from("starlink_orders").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("新增失敗：" + error.message);
      return;
    }
    toast.success("已新增訂單");
    setSheetOpen(false);
    setAutoTierInfo(null);
    setForm({
      client_name: "",
      client_tax_id: "",
      business_type: "",
      plan_name: "",
      sold_by: "",
      sold_at: new Date().toISOString().slice(0, 10),
      payment_confirmed: false,
      payment_last5: "",
      invoice_number: "",
      contract_uploaded: false,
      notes: "",
      level_at_sale: "",
      commission_rate: 0,
    });
    void loadAll();
  };

  const selectSoldBy = async (userIdSel: string) => {
    setForm((f) => ({ ...f, sold_by: userIdSel }));
    const { count } = await supabase
      .from("starlink_orders")
      .select("id", { count: "exact", head: true })
      .eq("sold_by", userIdSel)
      .eq("payout_status", "paid");
    const c = count ?? 0;
    const tier = findTierForCount(c);
    const ratePct = Number(tier?.signup_bonus_rate ?? 0) * 100;
    setAutoTierInfo({ level: tier?.tier_name ?? tier?.level ?? "—", rate: ratePct / 100, count: c });
    setForm((f) => ({
      ...f,
      sold_by: userIdSel,
      level_at_sale: tier?.level ?? "",
      commission_rate: ratePct,
    }));
  };

  const selectLevelForForm = (level: string) => {
    const tier = tiers.find((t) => t.level === level);
    const ratePct = Number(tier?.signup_bonus_rate ?? 0) * 100;
    setForm((f) => ({ ...f, level_at_sale: level, commission_rate: ratePct }));
  };

  const selectLevelForEdit = (level: string) => {
    const tier = tiers.find((t) => t.level === level);
    const ratePct = Number(tier?.signup_bonus_rate ?? 0) * 100;
    setEditForm((f) => ({ ...f, level_at_sale: level, commission_rate: ratePct }));
  };

  const tierByLevel = (level: string) => tiers.find((t) => t.level === level);
  const renderTierHint = (level: string) => {
    const tier = tierByLevel(level);
    if (!tier) return null;
    const maxLabel = tier.max_count == null ? "∞" : tier.max_count;
    const rate = ((tier.signup_bonus_rate ?? 0) * 100).toFixed(2);
    return (
      <p className="text-xs text-muted-foreground mt-1">
        {tier.tier_name}｜累積 {tier.min_count}～{maxLabel} 間｜簽約獎金 {rate}%
      </p>
    );
  };



  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(cur - i));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部年份</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y} 年</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全年</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部狀態</SelectItem>
              <SelectItem value="pending">待結算</SelectItem>
              <SelectItem value="paid">已發放</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部銷售人</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新增訂單
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客戶名稱</TableHead>
                <TableHead>方案</TableHead>
                <TableHead className="text-right">方案金額</TableHead>
                <TableHead>銷售人</TableHead>
                <TableHead>成交日期</TableHead>
                <TableHead>付款</TableHead>
                <TableHead>結算</TableHead>
                <TableHead className="text-right">編輯</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    尚無訂單資料
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((o) => (
                  <TableRow
                    key={o.id}
                    onClick={() => openDetail(o)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>{o.client_name}</TableCell>
                    <TableCell>{o.plan_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(o.plan_price)}</TableCell>
                    <TableCell>{memberName(o.sold_by)}</TableCell>
                    <TableCell>{o.sold_at ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.payment_confirmed ? "success" : "secondary"}>
                        {o.payment_confirmed ? "已付款" : "未付款"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.payout_status === "paid" ? "success" : "secondary"}>
                        {o.payout_status === "paid" ? "已發放" : "待結算"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(o);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              第 {page} 頁，共 {filtered.length} 筆
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一頁
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一頁
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>新增星鏈訂單</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>客戶名稱 *</Label>
              <Input
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>統編</Label>
                <Input
                  value={form.client_tax_id}
                  onChange={(e) => setForm({ ...form, client_tax_id: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>行業類型</Label>
                <Input
                  value={form.business_type}
                  onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>方案 *</Label>
              <Select
                value={form.plan_name || undefined}
                onValueChange={(v) => setForm({ ...form, plan_name: v })}
              >
                <SelectTrigger><SelectValue placeholder="選擇方案" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.plan_name}>
                      {p.plan_name}（{fmtMoney(p.price)}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>銷售人 *</Label>
              <Select
                value={form.sold_by || undefined}
                onValueChange={(v) => void selectSoldBy(v)}
              >
                <SelectTrigger><SelectValue placeholder="選擇銷售人" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoTierInfo && (
                <p className="text-xs text-muted-foreground">
                  目前等級：{autoTierInfo.level}，分潤比例：{(autoTierInfo.rate * 100).toFixed(2)}%（共 {autoTierInfo.count} 筆有效訂單）
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>成交時等級</Label>
                <Select
                  value={form.level_at_sale || undefined}
                  onValueChange={selectLevelForForm}
                >
                  <SelectTrigger><SelectValue placeholder="選擇等級" /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.level}>{t.level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.level_at_sale && renderTierHint(form.level_at_sale)}
              </div>
              <div className="space-y-1">
                <Label>分潤比例</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    className="pr-8"
                    value={form.commission_rate || form.commission_rate === 0 ? form.commission_rate : ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm({ ...form, commission_rate: isNaN(v) ? 0 : v });
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>分潤金額</Label>
              <Input
                readOnly
                className="bg-muted"
                value={(() => {
                  const plan = plans.find((p) => p.plan_name === form.plan_name);
                  const price = plan?.price ?? 0;
                  return fmtMoney(Math.round(price * ((form.commission_rate || 0) / 100)));
                })()}
              />
            </div>

            <div className="space-y-1">
              <Label>成交日期</Label>
              <Input
                type="date"
                value={form.sold_at}
                onChange={(e) => setForm({ ...form, sold_at: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="payment_confirmed_sl"
                checked={form.payment_confirmed}
                onCheckedChange={(v) => setForm({ ...form, payment_confirmed: !!v })}
              />
              <Label htmlFor="payment_confirmed_sl">付款已確認</Label>
            </div>
            <div className="space-y-1">
              <Label>匯款末5碼</Label>
              <Input
                value={form.payment_last5}
                onChange={(e) => setForm({ ...form, payment_last5: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>發票號碼</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="contract_uploaded"
                checked={form.contract_uploaded}
                onCheckedChange={(v) => setForm({ ...form, contract_uploaded: !!v })}
              />
              <Label htmlFor="contract_uploaded">合約已上傳</Label>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>編輯星鏈訂單</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>客戶名稱</Label>
              <Input
                value={editForm.client_name}
                onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>統編</Label>
                <Input
                  value={editForm.client_tax_id}
                  onChange={(e) => setEditForm({ ...editForm, client_tax_id: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>行業類型</Label>
                <Input
                  value={editForm.business_type}
                  onChange={(e) => setEditForm({ ...editForm, business_type: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>方案</Label>
              <Select
                value={editForm.plan_name || undefined}
                onValueChange={(v) => setEditForm({ ...editForm, plan_name: v })}
              >
                <SelectTrigger><SelectValue placeholder="選擇方案" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.plan_name}>
                      {p.plan_name}（{fmtMoney(p.price)}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>銷售人</Label>
              <Select
                value={editForm.sold_by || undefined}
                onValueChange={(v) => setEditForm({ ...editForm, sold_by: v })}
              >
                <SelectTrigger><SelectValue placeholder="選擇銷售人" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>成交時等級</Label>
                <Select
                  value={editForm.level_at_sale || undefined}
                  onValueChange={selectLevelForEdit}
                >
                  <SelectTrigger><SelectValue placeholder="選擇等級" /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.level}>{t.level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.level_at_sale && renderTierHint(editForm.level_at_sale)}
              </div>
              <div className="space-y-1">
                <Label>分潤比例</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    className="pr-8"
                    value={editForm.commission_rate || editForm.commission_rate === 0 ? editForm.commission_rate : ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setEditForm({ ...editForm, commission_rate: isNaN(v) ? 0 : v });
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>分潤金額</Label>
              <Input
                readOnly
                className="bg-muted"
                value={fmtMoney(Math.round(editForm.plan_price * ((editForm.commission_rate || 0) / 100)))}
              />
            </div>

            <div className="space-y-1">
              <Label>成交日期</Label>
              <Input
                type="date"
                value={editForm.sold_at}
                onChange={(e) => setEditForm({ ...editForm, sold_at: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit_payment_confirmed_sl"
                checked={editForm.payment_confirmed}
                onCheckedChange={(v) => setEditForm({ ...editForm, payment_confirmed: !!v })}
              />
              <Label htmlFor="edit_payment_confirmed_sl">付款已確認</Label>
            </div>
            <div className="space-y-1">
              <Label>匯款末5碼</Label>
              <Input
                value={editForm.payment_last5}
                onChange={(e) => setEditForm({ ...editForm, payment_last5: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>發票號碼</Label>
              <Input
                value={editForm.invoice_number}
                onChange={(e) => setEditForm({ ...editForm, invoice_number: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit_contract_uploaded"
                checked={editForm.contract_uploaded}
                onCheckedChange={(v) => setEditForm({ ...editForm, contract_uploaded: !!v })}
              />
              <Label htmlFor="edit_contract_uploaded">合約已上傳</Label>
            </div>
            <div className="space-y-1">
              <Label>結算狀態</Label>
              <Select
                value={editForm.payout_status}
                onValueChange={(v) => setEditForm({ ...editForm, payout_status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待結算</SelectItem>
                  <SelectItem value="paid">已發放</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea
                rows={3}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? "儲存中..." : "儲存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Drawer open={detailOpen} onOpenChange={setDetailOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex flex-row items-center justify-between">
            <DrawerTitle>訂單明細</DrawerTitle>
            {detailOrder && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const o = detailOrder;
                  setDetailOpen(false);
                  openEdit(o);
                }}
              >
                <Pencil className="h-4 w-4 mr-1" /> 編輯
              </Button>
            )}
          </DrawerHeader>
          {detailOrder && (() => {
            const o = detailOrder;
            const renderField = (label: string, value: React.ReactNode) => (
              <div key={label} className="py-2 border-b last:border-b-0 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-foreground">{value}</span>
              </div>
            );
            const left: Array<[string, React.ReactNode]> = [
              ["客戶名稱", o.client_name],
              ["統編", o.client_tax_id ?? "—"],
              ["行業類型", o.business_type ?? "—"],
              ["合約已上傳", (
                <Badge variant={o.contract_uploaded ? "success" : "secondary"}>
                  {o.contract_uploaded ? "已上傳" : "未上傳"}
                </Badge>
              )],
            ];
            const middle: Array<[string, React.ReactNode]> = [
              ["銷售人", memberName(o.sold_by)],
              ["成交時等級", o.level_at_sale ?? "—"],
              ["方案", o.plan_name ?? "—"],
              ["方案金額", fmtMoney(o.plan_price)],
              ["分潤比例", fmtRate(o.commission_rate)],
              ["分潤金額", fmtMoney(o.commission_amount)],
            ];
            const right: Array<[string, React.ReactNode]> = [
              ["成交日期", o.sold_at ?? "—"],
              ["發票號碼", o.invoice_number ?? "—"],
              ["匯款末5碼", o.payment_last5 ?? "—"],
              ["付款狀態", (
                <Badge variant={o.payment_confirmed ? "success" : "secondary"}>
                  {o.payment_confirmed ? "已付款" : "未付款"}
                </Badge>
              )],
              ["結算狀態", (
                <Badge variant={o.payout_status === "paid" ? "success" : "secondary"}>
                  {o.payout_status === "paid" ? "已發放" : "待結算"}
                </Badge>
              )],
            ];
            return (
              <div className="px-4 pb-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  <div className="md:pr-4 md:border-r">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">客戶資訊</div>
                    {left.map(([k, v]) => renderField(k, v))}
                  </div>
                  <div className="md:px-4 md:border-r">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">銷售資訊</div>
                    {middle.map(([k, v]) => renderField(k, v))}
                  </div>
                  <div className="md:pl-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">訂單資訊</div>
                    {right.map(([k, v]) => renderField(k, v))}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground mb-1">備註</div>
                  <div className="text-sm font-medium whitespace-pre-wrap text-foreground">
                    {o.notes ?? "—"}
                  </div>
                </div>
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </Card>
  );
}

function TiersTab({ canManage }: { canManage: boolean }) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [editing, setEditing] = useState<Tier | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("starlink_tier_settings")
      .select("*")
      .order("min_count");
    if (data) setTiers(data as Tier[]);
  };

  const save = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("starlink_tier_settings")
      .update({
        level: editing.level,
        tier_name: editing.tier_name,
        min_count: editing.min_count,
        max_count: editing.max_count,
        signup_bonus_rate: editing.signup_bonus_rate,
        per_order_rate: editing.per_order_rate,
      })
      .eq("id", editing.id);
    if (error) return toast.error("儲存失敗：" + error.message);
    toast.success("已儲存");
    setEditing(null);
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">等級設定</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>等級</TableHead>
              <TableHead>名稱</TableHead>
              <TableHead>累積間數範圍</TableHead>
              <TableHead className="text-right">簽約獎金比例</TableHead>
              <TableHead className="text-right">每單抽成</TableHead>
              {canManage && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.level}</TableCell>
                <TableCell>{t.tier_name}</TableCell>
                <TableCell>
                  {t.min_count} ~ {t.max_count ?? "∞"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtRate(t.signup_bonus_rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtRate(t.per_order_rate)}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>編輯等級</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>等級代碼</Label>
                  <Input
                    value={editing.level}
                    onChange={(e) => setEditing({ ...editing, level: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>名稱</Label>
                  <Input
                    value={editing.tier_name}
                    onChange={(e) => setEditing({ ...editing, tier_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>最少間數</Label>
                  <Input
                    type="number"
                    value={editing.min_count}
                    onChange={(e) => setEditing({ ...editing, min_count: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>最多間數（空=無上限）</Label>
                  <Input
                    type="number"
                    value={editing.max_count ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        max_count: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>簽約獎金比例（0~1）</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={editing.signup_bonus_rate ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      signup_bonus_rate: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>每單抽成（0~1）</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={editing.per_order_rate ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      per_order_rate: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          )}
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save}>儲存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function PlansTab({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PlanSetting[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PlanSetting | null>(null);
  const [form, setForm] = useState({ plan_name: "", price: 0, is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("starlink_plan_settings")
      .select("*")
      .order("created_at");
    if (data) setPlans(data as PlanSetting[]);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ plan_name: "", price: 0, is_active: true });
    setSheetOpen(true);
  };

  const openEdit = (p: PlanSetting) => {
    setEditing(p);
    setForm({ plan_name: p.plan_name, price: p.price, is_active: p.is_active });
    setSheetOpen(true);
  };

  const save = async () => {
    if (!form.plan_name.trim() || !Number.isFinite(form.price)) {
      toast.error("請填寫方案名稱與金額");
      return;
    }
    setSaving(true);
    const payload = {
      plan_name: form.plan_name.trim(),
      price: Number(form.price),
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("starlink_plan_settings").update(payload).eq("id", editing.id)
      : await supabase.from("starlink_plan_settings").insert(payload);
    setSaving(false);
    if (error) return toast.error("儲存失敗：" + error.message);
    toast.success(editing ? "已更新方案" : "已新增方案");
    setSheetOpen(false);
    void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">方案設定</CardTitle>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 新增方案
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>方案名稱</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead>狀態</TableHead>
              {canManage && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-12">
                  尚無方案
                </TableCell>
              </TableRow>
            ) : (
              plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.plan_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(p.price)}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "success" : "secondary"}>
                      {p.is_active ? "啟用" : "停用"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "編輯方案" : "新增方案"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>方案名稱 *</Label>
              <Input
                value={form.plan_name}
                onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>金額 *</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="plan_is_active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
              />
              <Label htmlFor="plan_is_active">啟用</Label>
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
