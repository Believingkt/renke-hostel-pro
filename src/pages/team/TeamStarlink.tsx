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
  plan_name: string | null;
  plan_price: number;
  sold_by: string;
  level_at_sale: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  sold_at: string | null;
  payment_confirmed: boolean | null;
  payout_status: string | null;
}

const PLAN_OPTIONS = [
  { name: "人氣啟動", price: 19800 },
  { name: "計劃實現", price: 38850 },
];

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
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab canManage={canManage} currentUserId={userId} />
        </TabsContent>
        <TabsContent value="tiers" className="mt-4">
          <TiersTab canManage={canManage} />
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

  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [salesFilter, setSalesFilter] = useState<string>("ALL");

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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    const [o, m, t] = await Promise.all([
      supabase
        .from("starlink_orders")
        .select(
          "id,client_name,plan_name,plan_price,sold_by,level_at_sale,commission_rate,commission_amount,sold_at,payment_confirmed,payout_status",
        )
        .order("sold_at", { ascending: false }),
      supabase
        .from("user_roles")
        .select("user_id, team_member_profiles!inner(user_id, display_name)")
        .eq("role", "starlink")
        .is("accommodation_id", null),
      supabase.from("starlink_tier_settings").select("*").order("min_count"),
    ]);
    if (o.data) setOrders(o.data as StarlinkOrder[]);
    if (m.data) {
      const seen = new Set<string>();
      const list: Member[] = [];
      (m.data as any[]).forEach((row) => {
        const pid = row.team_member_profiles?.user_id;
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          list.push({
            user_id: pid,
            display_name: row.team_member_profiles?.display_name ?? pid,
          });
        }
      });
      setMembers(list);
    }
    if (t.data) setTiers(t.data as Tier[]);
  };

  const memberName = (id: string | null) =>
    !id ? "—" : members.find((m) => m.user_id === id)?.display_name ?? "—";

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (!canManage && o.sold_by !== currentUserId) return false;
      if (o.sold_at) {
        const d = new Date(o.sold_at);
        if (String(d.getFullYear()) !== year) return false;
        if (month !== "ALL" && d.getMonth() + 1 !== Number(month)) return false;
      }
      if (statusFilter !== "ALL" && o.payout_status !== statusFilter) return false;
      if (salesFilter !== "ALL" && o.sold_by !== salesFilter) return false;
      return true;
    });
  }, [orders, year, month, statusFilter, salesFilter, canManage, currentUserId]);

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
    const plan = PLAN_OPTIONS.find((p) => p.name === form.plan_name);
    if (!plan) return;
    setSaving(true);

    // count paid orders for this sales person
    const { count } = await supabase
      .from("starlink_orders")
      .select("id", { count: "exact", head: true })
      .eq("sold_by", form.sold_by)
      .eq("payout_status", "paid");
    const tier = findTierForCount(count ?? 0);
    const rate = Number(tier?.signup_bonus_rate ?? 0);

    const payload = {
      client_name: form.client_name.trim(),
      client_tax_id: form.client_tax_id.trim() || null,
      business_type: form.business_type.trim() || null,
      plan_name: plan.name,
      plan_price: plan.price,
      sold_by: form.sold_by,
      level_at_sale: tier?.level ?? null,
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
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
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
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="paid">paid</SelectItem>
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
                <TableHead>成交時等級</TableHead>
                <TableHead className="text-right">分潤比例</TableHead>
                <TableHead className="text-right">分潤金額</TableHead>
                <TableHead>成交日期</TableHead>
                <TableHead>付款</TableHead>
                <TableHead>結算</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                    尚無訂單資料
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.client_name}</TableCell>
                    <TableCell>{o.plan_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(o.plan_price)}</TableCell>
                    <TableCell>{memberName(o.sold_by)}</TableCell>
                    <TableCell>{o.level_at_sale ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(o.commission_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(o.commission_amount)}</TableCell>
                    <TableCell>{o.sold_at ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.payment_confirmed ? "success" : "secondary"}>
                        {o.payment_confirmed ? "已付款" : "未付款"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.payout_status === "paid" ? "success" : "secondary"}>
                        {o.payout_status ?? "pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
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
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}（{fmtMoney(p.price)}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>銷售人 *</Label>
              <Select
                value={form.sold_by || undefined}
                onValueChange={(v) => setForm({ ...form, sold_by: v })}
              >
                <SelectTrigger><SelectValue placeholder="選擇銷售人" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>
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
