import { useEffect, useMemo, useState, type ReactNode } from "react";
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


interface TeamSetting {
  member_id: string;
  direct_leader_id: string | null;
  title: string | null;
  sub_leader_id: string | null;
  top_leader_id: string | null;
}

interface FranchiseOrder {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  plan_name: string | null;
  plan_price: number;
  sold_by: string;
  sold_by_name: string | null;
  team_leader: string | null;
  commission_rate: number | null;
  leader_rate: number | null;
  company_rate: number | null;
  commission_amount: number | null;
  leader_amount: number | null;
  company_amount: number | null;
  sold_at: string | null;
  payment_confirmed: boolean | null;
  payment_at: string | null;
  payout_status: string | null;
  invoice_number: string | null;
  notes: string | null;
}

const fmtMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString()}`;
const fmtRate = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <Label className="text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

export default function TeamFranchise() {
  const { roles, userId } = useTeam();
  const canManage = roles.includes("super_admin") || roles.includes("admin");
  const canView = canManage || roles.includes("franchise");

  if (!canView) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">特許加盟</h2>
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
      <h2 className="text-2xl font-bold">特許加盟</h2>
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">訂單列表（內部）</TabsTrigger>
          <TabsTrigger value="external">外部銷售</TabsTrigger>
          <TabsTrigger value="stats">業績統計</TabsTrigger>
          <TabsTrigger value="settings">分潤設定</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab canManage={canManage} currentUserId={userId} />
        </TabsContent>
        <TabsContent value="external" className="mt-4">
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              外部銷售功能開發中
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              業績統計功能開發中
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab canManage={canManage} />
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
  const [orders, setOrders] = useState<FranchiseOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamSettings, setTeamSettings] = useState<Record<string, TeamSetting>>({});
  

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
    customer_name: "",
    customer_phone: "",
    plan_name: "",
    unit_price: 0,
    unit_qty: 1,
    sold_by: "",
    sold_at: new Date().toISOString().slice(0, 10),
    payment_confirmed: false,
    invoice_number: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const [detailOrder, setDetailOrder] = useState<FranchiseOrder | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailForm, setDetailForm] = useState<Partial<FranchiseOrder> & { customer_phone?: string | null; invoice_number?: string | null; notes?: string | null }>({});
  const [detailSaving, setDetailSaving] = useState(false);

  useEffect(() => {
    if (detailOrder) {
      setDetailForm({
        customer_name: detailOrder.customer_name,
        plan_name: detailOrder.plan_name,
        plan_price: detailOrder.plan_price,
        sold_at: detailOrder.sold_at,
        payment_confirmed: detailOrder.payment_confirmed,
      } as any);
    }
  }, [detailOrder]);


  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    const [o, ftsRes] = await Promise.all([
      supabase
        .from("franchise_orders")
        .select(
          "id,customer_name,customer_phone,plan_name,plan_price,sold_by,sold_by_name,team_leader,commission_rate,leader_rate,company_rate,commission_amount,leader_amount,company_amount,sold_at,payment_confirmed,payment_at,payout_status,invoice_number,notes",
        )
        .order("sold_at", { ascending: false }),
      supabase.from("franchise_team_settings").select("*"),
    ]);
    if (o.data) setOrders(o.data as FranchiseOrder[]);

    const ftsRows = (ftsRes.data ?? []) as any[];
    if (ftsRows.length > 0) {
      const ids = Array.from(
        new Set(ftsRows.map((r) => r.member_id).filter(Boolean)),
      );
      if (ids.length > 0) {
        const { data: pd } = await supabase
          .from("team_member_profiles")
          .select("user_id, display_name")
          .in("user_id", ids);
        if (pd) {
          setMembers(
            (pd as any[]).map((p) => ({
              user_id: p.user_id,
              display_name: p.display_name ?? p.user_id,
            })),
          );
        }
      } else {
        setMembers([]);
      }
      const map: Record<string, TeamSetting> = {};
      ftsRows.forEach((row) => (map[row.member_id] = row));
      setTeamSettings(map);
    } else {
      setMembers([]);
      setTeamSettings({});
    }
  };

  const memberName = (id: string | null, name?: string | null) =>
    id
      ? members.find((m) => m.user_id === id)?.display_name ?? "—"
      : name ?? "—";

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

  const computeRates = (soldBy: string) => {
    const setting = teamSettings[soldBy];
    const directLeader = setting?.direct_leader_id ?? null;
    const topLeader = setting?.top_leader_id ?? null;
    const downlineCount = Object.values(teamSettings).filter(
      (t) => t.direct_leader_id === soldBy,
    ).length;
    let commission_rate = 0.1;
    if (downlineCount === 1) commission_rate = 0.11;
    else if (downlineCount >= 2) commission_rate = 0.13;
    const leader_rate = directLeader ? Math.max(0.13 - commission_rate, 0) : 0;
    const company_rate = topLeader ? 0.035 : 0;
    return { commission_rate, leader_rate, company_rate, directLeader };
  };

  const handleSave = async () => {
    if (!form.customer_name.trim() || !form.plan_name.trim() || !form.sold_by || form.unit_price <= 0) {
      toast.error("請填寫客戶姓名、方案名稱、單位金額與銷售人");
      return;
    }
    const planPrice = form.unit_price * form.unit_qty;
    setSaving(true);
    const { commission_rate, leader_rate, company_rate, directLeader } =
      computeRates(form.sold_by);
    const payload = {
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      plan_name: form.plan_name.trim(),
      plan_price: planPrice,
      sold_by: form.sold_by,
      team_leader: directLeader,
      commission_rate,
      leader_rate,
      company_rate,
      commission_amount: Math.round(planPrice * commission_rate),
      leader_amount: Math.round(planPrice * leader_rate),
      company_amount: Math.round(planPrice * company_rate),
      sold_at: form.sold_at,
      payment_confirmed: form.payment_confirmed,
      payment_at: form.payment_confirmed ? form.sold_at : null,
      invoice_number: form.invoice_number.trim() || null,
      notes: form.notes.trim() || null,
      created_by: currentUserId,
    };
    const { error } = await supabase.from("franchise_orders").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("新增失敗：" + error.message);
      return;
    }
    toast.success("已新增訂單");
    setSheetOpen(false);
    setForm({
      customer_name: "",
      customer_phone: "",
      plan_name: "",
      unit_price: 0,
      unit_qty: 1,
      sold_by: "",
      sold_at: new Date().toISOString().slice(0, 10),
      payment_confirmed: false,
      invoice_number: "",
      notes: "",
    });
    void loadAll();
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
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部年份</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全年</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} 月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部狀態</SelectItem>
              <SelectItem value="pending">待結算</SelectItem>
              <SelectItem value="paid">已發放</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部銷售人</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </SelectItem>
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
                <TableHead>客戶</TableHead>
                <TableHead>方案</TableHead>
                <TableHead className="text-right">方案金額</TableHead>
                <TableHead>銷售人</TableHead>
                <TableHead>成交日期</TableHead>
                <TableHead>付款</TableHead>
                <TableHead>結算</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    尚無訂單資料
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setDetailOrder(o);
                      setDetailEditing(false);
                    }}
                  >
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell>{o.plan_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(o.plan_price)}</TableCell>
                    <TableCell>{memberName(o.sold_by, o.sold_by_name)}</TableCell>
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
            <SheetTitle>新增特許加盟訂單</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>客戶姓名 *</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>客戶電話</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>方案名稱 *</Label>
              <Input
                placeholder="例如：森山第一期"
                value={form.plan_name}
                onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>單位金額 *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>單位數量</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.unit_qty}
                  onChange={(e) => setForm({ ...form, unit_qty: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-1">
                <Label>方案金額</Label>
                <Input readOnly className="bg-muted" value={fmtMoney(form.unit_price * form.unit_qty)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>銷售人 *</Label>
              <Select
                value={form.sold_by || undefined}
                onValueChange={(v) => setForm({ ...form, sold_by: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇銷售人" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                id="payment_confirmed"
                checked={form.payment_confirmed}
                onCheckedChange={(v) => setForm({ ...form, payment_confirmed: !!v })}
              />
              <Label htmlFor="payment_confirmed">付款已確認</Label>
            </div>
            <div className="space-y-1">
              <Label>發票號碼</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {form.sold_by && (
              <div className="text-xs text-muted-foreground rounded-md border p-2 space-y-0.5">
                <p>系統試算分潤比例（依目前小隊設定）：</p>
                {(() => {
                  const r = computeRates(form.sold_by);
                  return (
                    <p>
                      個人 {fmtRate(r.commission_rate)} ／ 隊長補差額 {fmtRate(r.leader_rate)} ／ 公司 {fmtRate(r.company_rate)}
                    </p>
                  );
                })()}
              </div>
            )}
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

      <Sheet open={!!detailOrder} onOpenChange={(o) => { if (!o) { setDetailOrder(null); setDetailEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between pr-8">
              <SheetTitle>訂單明細</SheetTitle>
              {detailOrder && (canManage || detailOrder.sold_by === currentUserId) && !detailEditing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" /> 編輯
                </Button>
              )}
            </div>
          </SheetHeader>
          {detailOrder && (
            <div className="space-y-3 mt-4 text-sm">
              <DetailRow label="客戶姓名">
                {detailEditing ? (
                  <Input
                    value={(detailForm.customer_name as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, customer_name: e.target.value })}
                  />
                ) : (
                  detailOrder.customer_name
                )}
              </DetailRow>
              <DetailRow label="客戶電話">
                {detailEditing ? (
                  <Input
                    value={(detailForm.customer_phone as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, customer_phone: e.target.value })}
                  />
                ) : (
                  detailOrder.customer_phone ?? "—"
                )}
              </DetailRow>
              <DetailRow label="方案">
                {detailEditing ? (
                  <Input
                    value={(detailForm.plan_name as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, plan_name: e.target.value })}
                  />
                ) : (
                  detailOrder.plan_name ?? "—"
                )}
              </DetailRow>
              <DetailRow label="方案金額">
                {detailEditing ? (
                  <Input
                    type="number"
                    value={(detailForm.plan_price as number) ?? 0}
                    onChange={(e) => setDetailForm({ ...detailForm, plan_price: Number(e.target.value) || 0 })}
                  />
                ) : (
                  fmtMoney(detailOrder.plan_price)
                )}
              </DetailRow>
              <DetailRow label="銷售人">{memberName(detailOrder.sold_by, detailOrder.sold_by_name)}</DetailRow>
              <DetailRow label="直屬隊長">{memberName(detailOrder.team_leader)}</DetailRow>
              <DetailRow label="個人分潤">
                {fmtMoney(detailOrder.commission_amount)}
                <span className="text-xs text-muted-foreground ml-1">({fmtRate(detailOrder.commission_rate)})</span>
              </DetailRow>
              <DetailRow label="隊長補差額">
                {fmtMoney(detailOrder.leader_amount)}
                <span className="text-xs text-muted-foreground ml-1">({fmtRate(detailOrder.leader_rate)})</span>
              </DetailRow>
              <DetailRow label="公司提撥">
                {fmtMoney(detailOrder.company_amount)}
                <span className="text-xs text-muted-foreground ml-1">({fmtRate(detailOrder.company_rate)})</span>
              </DetailRow>
              <DetailRow label="成交日期">
                {detailEditing ? (
                  <Input
                    type="date"
                    value={(detailForm.sold_at as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, sold_at: e.target.value })}
                  />
                ) : (
                  detailOrder.sold_at ?? "—"
                )}
              </DetailRow>
              <DetailRow label="付款狀態">
                {detailEditing ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="detail_payment"
                      checked={!!detailForm.payment_confirmed}
                      onCheckedChange={(v) => setDetailForm({ ...detailForm, payment_confirmed: !!v })}
                    />
                    <Label htmlFor="detail_payment">已付款</Label>
                  </div>
                ) : (
                  <Badge variant={detailOrder.payment_confirmed ? "success" : "secondary"}>
                    {detailOrder.payment_confirmed ? "已付款" : "未付款"}
                  </Badge>
                )}
              </DetailRow>
              <DetailRow label="發票號碼">
                {detailEditing ? (
                  <Input
                    value={(detailForm.invoice_number as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, invoice_number: e.target.value })}
                  />
                ) : (
                  detailOrder.invoice_number ?? "—"
                )}
              </DetailRow>
              <DetailRow label="備註">
                {detailEditing ? (
                  <Textarea
                    rows={3}
                    value={(detailForm.notes as string) ?? ""}
                    onChange={(e) => setDetailForm({ ...detailForm, notes: e.target.value })}
                  />
                ) : (
                  <span className="whitespace-pre-wrap">{detailOrder.notes ?? "—"}</span>
                )}
              </DetailRow>
            </div>
          )}
          {detailEditing && (
            <SheetFooter className="mt-4">
              <Button variant="outline" onClick={() => setDetailEditing(false)}>取消</Button>
              <Button
                disabled={detailSaving}
                onClick={async () => {
                  if (!detailOrder) return;
                  setDetailSaving(true);
                  const payload: Record<string, unknown> = {
                    customer_name: (detailForm.customer_name as string)?.trim() || detailOrder.customer_name,
                    customer_phone: (detailForm.customer_phone as string)?.trim() || null,
                    plan_name: (detailForm.plan_name as string)?.trim() || null,
                    plan_price: Number(detailForm.plan_price ?? detailOrder.plan_price) || 0,
                    sold_at: (detailForm.sold_at as string) || null,
                    payment_confirmed: !!detailForm.payment_confirmed,
                    payment_at: detailForm.payment_confirmed ? ((detailForm.sold_at as string) || detailOrder.sold_at) : null,
                    invoice_number: (detailForm.invoice_number as string)?.trim() || null,
                    notes: (detailForm.notes as string)?.trim() || null,
                  };
                  const { error } = await supabase.from("franchise_orders").update(payload).eq("id", detailOrder.id);
                  setDetailSaving(false);
                  if (error) {
                    toast.error("儲存失敗：" + error.message);
                    return;
                  }
                  toast.success("已更新");
                  setDetailEditing(false);
                  setDetailOrder(null);
                  void loadAll();
                }}
              >
                {detailSaving ? "儲存中..." : "儲存"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function SettingsTab({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<TeamSetting[]>([]);
  const [editing, setEditing] = useState<TeamSetting | null>(null);
  const [form, setForm] = useState<TeamSetting>({
    member_id: "",
    direct_leader_id: null,
    title: "",
    sub_leader_id: null,
    top_leader_id: null,
  });

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    // 步驟一：撈所有 franchise_team_settings
    const { data: ftsData } = await supabase
      .from("franchise_team_settings")
      .select("*");
    const rows = (ftsData ?? []) as any[];

    const settingsData: TeamSetting[] = rows.map((r) => ({
      member_id: r.member_id,
      direct_leader_id: r.direct_leader_id ?? null,
      title: r.title ?? null,
      sub_leader_id: r.sub_leader_id ?? null,
      top_leader_id: r.top_leader_id ?? null,
    }));
    setSettings(settingsData);

    // 步驟二：收集所有 user_id (member + leaders) 後查 profiles
    const allIds = new Set<string>();
    rows.forEach((row) => {
      if (row.member_id) allIds.add(row.member_id);
      if (row.direct_leader_id) allIds.add(row.direct_leader_id);
      if (row.sub_leader_id) allIds.add(row.sub_leader_id);
      if (row.top_leader_id) allIds.add(row.top_leader_id);
    });

    if (allIds.size === 0) {
      setMembers([]);
      return;
    }

    const { data: profilesData } = await supabase
      .from("team_member_profiles")
      .select("user_id, display_name")
      .in("user_id", Array.from(allIds));

    const list: Member[] = (profilesData ?? [])
      .map((p: any) => ({
        user_id: p.user_id,
        display_name: p.display_name ?? p.user_id,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    setMembers(list);
  };


  const memberName = (id: string | null) =>
    !id ? "—" : members.find((m) => m.user_id === id)?.display_name ?? "—";

  const settingsByMember = useMemo(() => {
    const map: Record<string, TeamSetting> = {};
    settings.forEach((s) => (map[s.member_id] = s));
    return map;
  }, [settings]);

  // 前端即時計算：稱號
  const computeTitle = (memberId: string): string => {
    const count = settings.filter(
      (s) => s.direct_leader_id === memberId,
    ).length;
    if (count >= 2) return "總監";
    if (count === 1) return "隊長";
    return "";
  };

  // 前端即時計算:最上層隊長
  // 從此人的 direct_leader_id 往上追溯,
  // 直到 direct_leader_id = 自己 或 為 null 為止
  const computeTopLeader = (memberId: string): string | null => {
    const start = settingsByMember[memberId];
    let currentId = start?.direct_leader_id ?? null;
    if (!currentId) return null;
    const visited = new Set<string>([memberId]);
    while (currentId) {
      if (visited.has(currentId)) return currentId;
      visited.add(currentId);
      const next = settingsByMember[currentId];
      const nextLeader = next?.direct_leader_id ?? null;
      if (!nextLeader || nextLeader === currentId) return currentId;
      currentId = nextLeader;
    }
    return null;
  };

  const openEdit = (row: TeamSetting | null, memberId?: string) => {
    if (row) {
      setForm(row);
      setEditing(row);
    } else {
      const next: TeamSetting = {
        member_id: memberId ?? "",
        direct_leader_id: null,
        title: null,
        sub_leader_id: null,
        top_leader_id: null,
      };
      setForm(next);
      setEditing(next);
    }
  };

  const save = async () => {
    if (!form.member_id) return toast.error("請選擇成員");
    const payload = {
      member_id: form.member_id,
      direct_leader_id: form.direct_leader_id || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("franchise_team_settings")
      .upsert(payload, { onConflict: "member_id" });
    if (error) return toast.error("儲存失敗：" + error.message);
    toast.success("已儲存");
    setEditing(null);
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">小隊分潤設定</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>隊員</TableHead>
              <TableHead>直屬隊長</TableHead>
              <TableHead>稱號</TableHead>
              <TableHead>小組隊長</TableHead>
              <TableHead>最上層隊長</TableHead>
              {canManage && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">
                  尚無成員
                </TableCell>
              </TableRow>
            ) : (
              members.filter((m) => settingsByMember[m.user_id]).map((m) => {
                const s = settingsByMember[m.user_id];
                const directLeaderId = s?.direct_leader_id ?? null;
                const title = computeTitle(m.user_id);
                const topLeaderId = computeTopLeader(m.user_id);
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>{m.display_name}</TableCell>
                    <TableCell>{memberName(directLeaderId)}</TableCell>
                    <TableCell>{title || "—"}</TableCell>
                    <TableCell>{memberName(directLeaderId)}</TableCell>
                    <TableCell>{memberName(topLeaderId)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s ?? null, m.user_id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>編輯小隊設定</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>隊員</Label>
              <Input value={memberName(form.member_id)} disabled />
            </div>
            <div className="space-y-1">
              <Label>直屬隊長</Label>
              <Select
                value={form.direct_leader_id || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, direct_leader_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {members
                    .filter((m) => m.user_id !== form.member_id)
                    .map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={save}>儲存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
