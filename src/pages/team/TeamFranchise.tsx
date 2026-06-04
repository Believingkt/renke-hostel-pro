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
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface InternalRates {
  base_rate: number;
  tier1_rate: number;
  tier2_rate: number;
  leader_supplement_rate: number;
  company_rate: number;
  payout_day: string | null;
}
interface ExternalRates {
  sales_rate: number;
  co_sales1_rate: number;
  co_sales2_rate: number;
  payout_day: string | null;
}
interface CommissionSettingRow {
  id: string;
  type: "internal" | "external";
  project_name: string;
  base_rate: number | null;
  tier1_rate: number | null;
  tier2_rate: number | null;
  leader_supplement_rate: number | null;
  company_rate: number | null;
  sales_rate: number | null;
  co_sales1_rate: number | null;
  co_sales2_rate: number | null;
  payout_day: string | null;
  effective_from: string;
  created_at: string;
}

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
  member_number: string | null;
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

// Compute next sequential member_number with a given prefix from existing records.
// Returns e.g. "S1006" given existing max "S1005". Falls back to "{prefix}1001".
const nextMemberNumber = (existing: (string | null | undefined)[], prefix: string) => {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 1000;
  for (const v of existing) {
    if (!v) continue;
    const m = re.exec(v.trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
};

// Compute next member_number for a specific project order index.
// Format: {prefix}{projectOrder}{NNN}  (NNN is 3-digit, starting at 001 per project)
// e.g. ("T", 2) with max "T2003" -> "T2004". If no match found, returns "{prefix}{projectOrder}001".
const nextMemberNumberForProject = (
  existing: (string | null | undefined)[],
  prefix: string,
  projectOrder: number,
) => {
  if (!projectOrder || projectOrder < 1) return "";
  const re = new RegExp(`^${prefix}${projectOrder}(\\d{3})$`);
  let max = 0;
  for (const v of existing) {
    if (!v) continue;
    const m = re.exec(v.trim());
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${projectOrder}${String(max + 1).padStart(3, "0")}`;
};

// Detect whether a value looks like an auto-generated project-prefixed member_number
// matching `{prefix}{anyDigits}{3-digit}` so we can safely overwrite it when user changes project.
const isAutoMemberNumber = (val: string | null | undefined, prefix: string) => {
  if (!val) return false;
  return new RegExp(`^${prefix}\\d+$`).test(val.trim());
};


const fmtMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString()}`;
const fmtRate = (n: number | null | undefined) =>
  n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

interface FranchiseProject {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string | null;
}

// 全域刷新計數器 — 任何元件呼叫 bumpFranchiseProjects() 都會觸發所有 hook 重新載入
let franchiseProjectsVersion = 0;
const franchiseProjectsListeners = new Set<() => void>();
function bumpFranchiseProjects() {
  franchiseProjectsVersion += 1;
  franchiseProjectsListeners.forEach((fn) => fn());
}

function useFranchiseProjects(includeInactive = false) {
  const [projects, setProjects] = useState<FranchiseProject[]>([]);
  const [version, setVersion] = useState(franchiseProjectsVersion);

  useEffect(() => {
    const listener = () => setVersion(franchiseProjectsVersion);
    franchiseProjectsListeners.add(listener);
    return () => {
      franchiseProjectsListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const q = (supabase as any)
        .from("franchise_projects")
        .select("id,name,is_active,created_at")
        .order("created_at", { ascending: true });
      const { data } = await q;
      if (!active) return;
      setProjects((data ?? []) as FranchiseProject[]);
    })();
    return () => {
      active = false;
    };
  }, [version]);

  return includeInactive ? projects : projects.filter((p) => p.is_active);
}

// Build a map of project name -> 1-based order index based on created_at asc.
// Includes inactive projects so the ordering remains stable.
function useProjectOrderMap(): Record<string, number> {
  const all = useFranchiseProjects(true);
  return useMemo(() => {
    const map: Record<string, number> = {};
    all.forEach((p, idx) => {
      if (p?.name) map[p.name] = idx + 1;
    });
    return map;
  }, [all]);
}


function ProjectSelect({
  value,
  onChange,
  placeholder = "選擇專案",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const projects = useFranchiseProjects();
  // 若目前值不在啟用清單中（例如歷史專案或已停用），仍保留顯示
  const valueExists = !value || projects.some((p) => p.name === value);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {!valueExists && value && (
          <SelectItem value={value}>{value}（已停用）</SelectItem>
        )}
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.name}>
            {p.name}
          </SelectItem>
        ))}
        {projects.length === 0 && valueExists && (
          <div className="px-3 py-2 text-xs text-muted-foreground">尚無啟用中的專案</div>
        )}
      </SelectContent>
    </Select>
  );
}

function FilterProjectSelect({
  value,
  onChange,
  className = "w-48",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const projects = useFranchiseProjects();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">全部</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.name}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <Label className="text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, value, breakAll }: { label: string; value: ReactNode; breakAll?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm ${breakAll ? "break-all" : ""}`}>{value == null || value === "" ? "—" : value}</div>
    </div>
  );
}

export default function TeamFranchise() {
  const { roles, userId } = useTeam();

  const isSuperOrAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isFranchiseManager = roles.includes("franchise_manager");
  const isFinance = roles.includes("finance");
  const isInternal =
    roles.includes("franchise_internal" as any) ||
    roles.includes("franchise" as any); // 舊 'franchise' 角色視同 franchise_internal
  const isExternal = roles.includes("franchise_external" as any);

  // 全開（新增/編輯/刪除）僅 super_admin、admin、franchise_manager
  const canManage = isSuperOrAdmin || isFranchiseManager;
  const canView = canManage || isFinance || isInternal || isExternal;

  // Tab 可見性
  const showOrders = canManage || isFinance || isInternal;
  const showExternal = canManage || isFinance || isExternal;
  const showStats = canManage || isFinance;
  const showDistributions = canManage || isFinance;
  const showVouchers = canManage || isFinance || isExternal;

  // Tab 內細部權限
  const ordersCanManage = canManage; // 內部銷售：僅 canManage 可新增/編輯
  const ordersViewAll = canManage || isFinance || isInternal;
  const externalCanManage = canManage || isExternal;
  const distCanManage = canManage || isFinance;
  const distCanDelete = canManage; // finance 不能刪除
  const voucherCanEdit = canManage || isFinance || isExternal;
  const voucherForceExternal = !canManage && !isFinance && isExternal;

  // SettingsTab 各 Card 可見性
  const settingsCards = canManage || isFinance
    ? { projects: true, internal: true, external: true, teamSettings: true }
    : isInternal
      ? { projects: true, internal: true, external: false, teamSettings: true }
      : isExternal
        ? { projects: true, internal: false, external: true, teamSettings: false }
        : { projects: false, internal: false, external: false, teamSettings: false };
  const settingsCanManage = canManage; // 設定頁也只有 canManage 可改

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

  const defaultTab = showOrders
    ? "orders"
    : showExternal
      ? "external"
      : showStats
        ? "stats"
        : showDistributions
          ? "distributions"
          : showVouchers
            ? "vouchers"
            : "settings";

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">特許加盟</h2>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {showOrders && <TabsTrigger value="orders">內部銷售</TabsTrigger>}
          {showExternal && <TabsTrigger value="external">外部銷售</TabsTrigger>}
          {showStats && <TabsTrigger value="stats">業績統計</TabsTrigger>}
          {showDistributions && <TabsTrigger value="distributions">會員分潤</TabsTrigger>}
          {showVouchers && <TabsTrigger value="vouchers">住宿券進度</TabsTrigger>}
          <TabsTrigger value="settings">分潤設定</TabsTrigger>
        </TabsList>
        {showOrders && (
          <TabsContent value="orders" className="mt-4">
            <OrdersTab canManage={ordersCanManage} viewAll={ordersViewAll} currentUserId={userId} />
          </TabsContent>
        )}
        {showExternal && (
          <TabsContent value="external" className="mt-4">
            <ExternalSalesTab canManage={externalCanManage} />
          </TabsContent>
        )}
        {showStats && (
          <TabsContent value="stats" className="mt-4">
            <StatsTab />
          </TabsContent>
        )}
        {showDistributions && (
          <TabsContent value="distributions" className="mt-4">
            <MemberDistributionTab currentUserId={userId} canManage={distCanManage} canDelete={distCanDelete} />
          </TabsContent>
        )}
        {showVouchers && (
          <TabsContent value="vouchers" className="mt-4">
            <VoucherProgressTab canEdit={voucherCanEdit} forcedSource={voucherForceExternal ? "external" : undefined} hideSourceFilter={voucherForceExternal} />
          </TabsContent>
        )}
        <TabsContent value="settings" className="mt-4">
          <SettingsTab canManage={settingsCanManage} visibleCards={settingsCards} />
        </TabsContent>

      </Tabs>
    </div>
  );
}

function OrdersTab({
  canManage,
  viewAll = false,
  currentUserId,
}: {
  canManage: boolean;
  viewAll?: boolean;
  currentUserId: string;
}) {
  const [orders, setOrders] = useState<FranchiseOrder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamSettings, setTeamSettings] = useState<Record<string, TeamSetting>>({});
  const [internalRates, setInternalRates] = useState<InternalRates | null>(null);
  const projectOrderMap = useProjectOrderMap();

  

  const [year, setYear] = useState<string>("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [salesFilter, setSalesFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setPage(1);
  }, [year, month, projectFilter, statusFilter, salesFilter]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({
    member_number: "",
    customer_name: "",
    customer_phone: "",
    plan_name: "",
    unit_price: 0,
    unit_qty: 1,
    sold_by: "",
    sold_at: new Date().toISOString().slice(0, 10),
    payment_confirmed: false,
    payment_at: "",
    invoice_number: "",
    notes: "",
  });
  const [memberNumberError, setMemberNumberError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [detailOrder, setDetailOrder] = useState<FranchiseOrder | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailForm, setDetailForm] = useState<Partial<FranchiseOrder> & { customer_phone?: string | null; invoice_number?: string | null; notes?: string | null }>({});
  const [detailSaving, setDetailSaving] = useState(false);

  const [detailMemberNumberError, setDetailMemberNumberError] = useState<string>("");

  useEffect(() => {
    if (detailOrder) {
      setDetailForm({
        member_number: detailOrder.member_number,
        customer_name: detailOrder.customer_name,
        plan_name: detailOrder.plan_name,
        plan_price: detailOrder.plan_price,
        sold_at: detailOrder.sold_at,
        payment_confirmed: detailOrder.payment_confirmed,
        payment_at: detailOrder.payment_at,
      } as any);
      setDetailMemberNumberError("");
    }
  }, [detailOrder]);

  const checkDetailMemberNumberDup = async (val: string) => {
    const v = val.trim();
    setDetailMemberNumberError("");
    if (!v || !detailOrder) return;
    const { data } = await supabase
      .from("franchise_orders")
      .select("id")
      .eq("member_number", v)
      .neq("id", detailOrder.id)
      .limit(1);
    if ((data ?? []).length > 0) setDetailMemberNumberError("此編號已使用");
  };



  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto recompute member_number when project (plan_name) changes in the new-order sheet,
  // only if the field is empty or still holds an auto-generated value.
  useEffect(() => {
    if (!sheetOpen) return;
    const planName = form.plan_name?.trim() || "";
    if (!planName) return;
    const order = projectOrderMap[planName];
    if (!order) return;
    const current = (form.member_number ?? "").trim();
    if (current && !isAutoMemberNumber(current, "S")) return;
    const auto = nextMemberNumberForProject(
      orders.filter((o) => (o.plan_name ?? "") === planName).map((o) => o.member_number),
      "S",
      order,
    );
    if (auto && auto !== current) {
      setForm((prev) => ({ ...prev, member_number: auto }));
      setMemberNumberError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.plan_name, sheetOpen, projectOrderMap, orders]);


  const loadAll = async () => {
    const [o, ftsRes, ratesRes] = await Promise.all([
      supabase
        .from("franchise_orders")
        .select(
          "id,member_number,customer_name,customer_phone,plan_name,plan_price,sold_by,sold_by_name,team_leader,commission_rate,leader_rate,company_rate,commission_amount,leader_amount,company_amount,sold_at,payment_confirmed,payment_at,payout_status,invoice_number,notes",
        )
        .order("sold_at", { ascending: false }),
      supabase.from("franchise_team_settings").select("*"),
      (supabase as any)
        .from("franchise_commission_settings")
        .select("*")
        .eq("type", "internal")
        .order("effective_from", { ascending: false })
        .limit(1),
    ]);
    const r = (ratesRes.data ?? [])[0];
    if (r) {
      setInternalRates({
        base_rate: Number(r.base_rate ?? 0.1),
        tier1_rate: Number(r.tier1_rate ?? 0.11),
        tier2_rate: Number(r.tier2_rate ?? 0.13),
        leader_supplement_rate: Number(r.leader_supplement_rate ?? 0),
        company_rate: Number(r.company_rate ?? 0.035),
        payout_day: r.payout_day ?? null,
      });
    }
    if (o.data) setOrders(o.data as FranchiseOrder[]);

    const ftsRows = (ftsRes.data ?? []) as any[];
    // 銷售人下拉：合併 franchise_team_settings 成員 + 擁有 franchise / franchise_manager role 的使用者
    const memberIdSet = new Set<string>(
      ftsRows.map((r) => r.member_id).filter(Boolean) as string[],
    );
    const { data: roleRows } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .in("role", ["franchise", "franchise_manager"]);
    for (const r of (roleRows ?? []) as { user_id: string }[]) {
      if (r.user_id) memberIdSet.add(r.user_id);
    }
    const allIds = Array.from(memberIdSet);
    if (allIds.length > 0) {
      const { data: pd } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", allIds);
      const seen = new Set<string>();
      const list: Member[] = [];
      for (const p of ((pd ?? []) as any[])) {
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        list.push({ user_id: p.user_id, display_name: p.display_name ?? p.user_id });
      }
      list.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setMembers(list);
    } else {
      setMembers([]);
    }
    const map: Record<string, TeamSetting> = {};
    ftsRows.forEach((row) => (map[row.member_id] = row));
    setTeamSettings(map);
  };

  const memberName = (id: string | null, name?: string | null) =>
    id
      ? members.find((m) => m.user_id === id)?.display_name ?? "—"
      : name ?? "—";

  const projectOptions = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => o.plan_name && s.add(o.plan_name));
    return Array.from(s).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (!canManage && !viewAll && o.sold_by !== currentUserId) return false;
        if (o.sold_at) {
          const d = new Date(o.sold_at);
          if (year !== "ALL" && String(d.getFullYear()) !== year) return false;
          if (month !== "ALL" && d.getMonth() + 1 !== Number(month)) return false;
        }
        if (projectFilter !== "ALL" && o.plan_name !== projectFilter) return false;
        if (statusFilter !== "ALL" && o.payout_status !== statusFilter) return false;
        if (salesFilter !== "ALL" && o.sold_by !== salesFilter) return false;
        return true;
      })
      .sort((a, b) => (b.sold_at ?? "").localeCompare(a.sold_at ?? ""));
  }, [orders, year, month, projectFilter, statusFilter, salesFilter, canManage, currentUserId]);

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
    const base = internalRates?.base_rate ?? 0.1;
    const tier1 = internalRates?.tier1_rate ?? 0.11;
    const tier2 = internalRates?.tier2_rate ?? 0.13;
    const companyR = internalRates?.company_rate ?? 0.035;
    let commission_rate = base;
    if (downlineCount === 1) commission_rate = tier1;
    else if (downlineCount >= 2) commission_rate = tier2;
    const leader_rate = directLeader ? Math.max(tier2 - commission_rate, 0) : 0;
    const company_rate = topLeader ? companyR : 0;
    return { commission_rate, leader_rate, company_rate, directLeader };
  };

  const checkMemberNumberDup = async (val: string) => {
    const v = val.trim();
    if (!v) { setMemberNumberError(""); return; }
    const { data } = await supabase
      .from("franchise_orders")
      .select("id")
      .eq("member_number", v)
      .limit(1);
    if ((data ?? []).length > 0) setMemberNumberError("此編號已使用");
    else setMemberNumberError("");
  };

  const handleSave = async () => {
    if (!form.customer_name.trim() || !form.plan_name.trim() || !form.sold_by || form.unit_price <= 0) {
      toast.error("請填寫客戶姓名、專案名稱、單位金額與銷售人");
      return;
    }
    if (memberNumberError) {
      toast.error(memberNumberError);
      return;
    }
    // Final dup re-check at submit
    if (form.member_number.trim()) {
      const { data } = await supabase
        .from("franchise_orders")
        .select("id")
        .eq("member_number", form.member_number.trim())
        .limit(1);
      if ((data ?? []).length > 0) {
        setMemberNumberError("此編號已使用");
        toast.error("此編號已使用");
        return;
      }
    }
    const planPrice = form.unit_price * form.unit_qty;
    setSaving(true);
    const { commission_rate, leader_rate, company_rate, directLeader } =
      computeRates(form.sold_by);
    const payload = {
      member_number: form.member_number.trim() || null,
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
      payment_at: form.payment_at || null,
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
      member_number: "",
      customer_name: "",
      customer_phone: "",
      plan_name: "",
      unit_price: 0,
      unit_qty: 1,
      sold_by: "",
      sold_at: new Date().toISOString().slice(0, 10),
      payment_confirmed: false,
      payment_at: "",
      invoice_number: "",
      notes: "",
    });
    setMemberNumberError("");
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
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部專案</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <Button
          onClick={() => {
            const planName = form.plan_name?.trim() || "";
            const order = planName ? projectOrderMap[planName] : 0;
            const auto = order
              ? nextMemberNumberForProject(
                  orders.filter((o) => (o.plan_name ?? "") === planName).map((o) => o.member_number),
                  "S",
                  order,
                )
              : "";
            setForm((prev) => ({ ...prev, member_number: auto }));
            setMemberNumberError("");
            setSheetOpen(true);
          }}
        >

          <Plus className="h-4 w-4 mr-1" /> 新增
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員編號</TableHead>
                <TableHead>會員姓名</TableHead>
                <TableHead>銷售人</TableHead>
                <TableHead>專案名稱</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>簽約日期</TableHead>
                <TableHead>付款</TableHead>
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
                    <TableCell>{o.member_number ?? "—"}</TableCell>
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell>{memberName(o.sold_by, o.sold_by_name)}</TableCell>
                    <TableCell>{o.plan_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(o.plan_price)}</TableCell>
                    <TableCell>{o.sold_at ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.payment_confirmed ? "success" : "secondary"}>
                        {o.payment_confirmed ? "已付款" : "未付款"}
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <SheetTitle>新增特許加盟訂單</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>會員編號</Label>
              <Input
                value={form.member_number}
                onChange={(e) => { setForm({ ...form, member_number: e.target.value }); setMemberNumberError(""); }}
                onBlur={(e) => void checkMemberNumberDup(e.target.value)}
              />
              {memberNumberError && (
                <p className="text-xs text-destructive">{memberNumberError}</p>
              )}
            </div>
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
              <Label>專案名稱 *</Label>
              <ProjectSelect
                value={form.plan_name}
                onChange={(v) => setForm({ ...form, plan_name: v })}
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
                onCheckedChange={(v) => {
                  const confirmed = !!v;
                  setForm({
                    ...form,
                    payment_confirmed: confirmed,
                    payment_at: confirmed ? form.payment_at : "",
                  });
                }}
              />
              <Label htmlFor="payment_confirmed">付款已確認</Label>
            </div>
            <div className="space-y-1">
              <Label>匯款日期</Label>
              <Input
                type="date"
                value={form.payment_at}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm({
                    ...form,
                    payment_at: v,
                    payment_confirmed: v ? true : false,
                  });
                }}
              />
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
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto overflow-x-hidden">
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
              <DetailRow label="會員編號">
                {detailEditing ? (
                  <div className="space-y-1">
                    <Input
                      value={(detailForm.member_number as string) ?? ""}
                      onChange={(e) => {
                        setDetailForm({ ...detailForm, member_number: e.target.value });
                        setDetailMemberNumberError("");
                      }}
                      onBlur={(e) => void checkDetailMemberNumberDup(e.target.value)}
                    />
                    {detailMemberNumberError && (
                      <p className="text-xs text-destructive">{detailMemberNumberError}</p>
                    )}
                  </div>
                ) : (
                  detailOrder.member_number ?? "—"
                )}
              </DetailRow>
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
              <DetailRow label="專案">
                {detailEditing ? (
                  <ProjectSelect
                    value={(detailForm.plan_name as string) ?? ""}
                    onChange={(v) => setDetailForm({ ...detailForm, plan_name: v })}
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
                      onCheckedChange={(v) => {
                        const confirmed = !!v;
                        setDetailForm({
                          ...detailForm,
                          payment_confirmed: confirmed,
                          payment_at: confirmed ? (detailForm.payment_at ?? null) : null,
                        });
                      }}
                    />
                    <Label htmlFor="detail_payment">已付款</Label>
                  </div>
                ) : (
                  <Badge variant={detailOrder.payment_confirmed ? "success" : "secondary"}>
                    {detailOrder.payment_confirmed ? "已付款" : "未付款"}
                  </Badge>
                )}
              </DetailRow>
              <DetailRow label="匯款日期">
                {detailEditing ? (
                  <Input
                    type="date"
                    value={(detailForm.payment_at as string) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDetailForm({
                        ...detailForm,
                        payment_at: v || null,
                        payment_confirmed: v ? true : false,
                      });
                    }}
                  />
                ) : (
                  detailOrder.payment_at ?? "—"
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
                  const mn = (detailForm.member_number as string)?.trim() || "";
                  if (mn) {
                    const { data: dupRows } = await supabase
                      .from("franchise_orders")
                      .select("id")
                      .eq("member_number", mn)
                      .neq("id", detailOrder.id)
                      .limit(1);
                    if ((dupRows ?? []).length > 0) {
                      setDetailMemberNumberError("此編號已使用");
                      toast.error("此編號已使用");
                      return;
                    }
                  }
                  setDetailSaving(true);
                  const payload: Record<string, unknown> = {
                    member_number: mn || null,
                    customer_name: (detailForm.customer_name as string)?.trim() || detailOrder.customer_name,
                    customer_phone: (detailForm.customer_phone as string)?.trim() || null,
                    plan_name: (detailForm.plan_name as string)?.trim() || null,
                    plan_price: Number(detailForm.plan_price ?? detailOrder.plan_price) || 0,
                    sold_at: (detailForm.sold_at as string) || null,
                    payment_confirmed: !!detailForm.payment_confirmed,
                    payment_at: (detailForm.payment_at as string) || null,
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

interface SettingsCardsVisible {
  projects: boolean;
  internal: boolean;
  external: boolean;
  teamSettings: boolean;
}
function SettingsTab({ canManage, visibleCards }: { canManage: boolean; visibleCards: SettingsCardsVisible }) {
  const canManageProjects = canManage && visibleCards.projects;
  const [rows, setRows] = useState<CommissionSettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [internalForm, setInternalForm] = useState({
    base_rate: 10,
    tier1_rate: 11,
    tier2_rate: 13,
    company_rate: 3.5,
    payout_day: "10",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [externalForm, setExternalForm] = useState({
    project_name: "",
    sales_rate: 20,
    co_sales1_rate: 10,
    co_sales2_rate: 15,
    payout_day: "10",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("franchise_commission_settings")
      .select("*")
      .order("effective_from", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("讀取失敗：" + error.message);
      return;
    }
    setRows((data ?? []) as CommissionSettingRow[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const internalRows = useMemo(() => rows.filter((r) => r.type === "internal"), [rows]);
  const externalRows = useMemo(() => rows.filter((r) => r.type === "external"), [rows]);
  const externalByProject = useMemo(() => {
    const map: Record<string, CommissionSettingRow[]> = {};
    externalRows.forEach((r) => {
      (map[r.project_name] ||= []).push(r);
    });
    return map;
  }, [externalRows]);

  const latestInternal = internalRows[0];

  const saveInternal = async () => {
    const payload = {
      type: "internal",
      project_name: "森山第一期",
      base_rate: internalForm.base_rate / 100,
      tier1_rate: internalForm.tier1_rate / 100,
      tier2_rate: internalForm.tier2_rate / 100,
      leader_supplement_rate: 0,
      company_rate: internalForm.company_rate / 100,
      payout_day: internalForm.payout_day,
      effective_from: internalForm.effective_from,
    };
    const { error } = await (supabase as any).from("franchise_commission_settings").insert(payload);
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增版本");
    setInternalDialogOpen(false);
    void load();
  };

  const saveExternal = async (projectName?: string) => {
    const project = (projectName ?? externalForm.project_name).trim();
    if (!project) return toast.error("請填寫專案名稱");
    const payload = {
      type: "external",
      project_name: project,
      sales_rate: externalForm.sales_rate / 100,
      co_sales1_rate: externalForm.co_sales1_rate / 100,
      co_sales2_rate: externalForm.co_sales2_rate / 100,
      payout_day: externalForm.payout_day,
      effective_from: externalForm.effective_from,
    };
    const { error } = await (supabase as any).from("franchise_commission_settings").insert(payload);
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增版本");
    setExternalDialogOpen(false);
    void load();
  };

  const openInternalDialog = () => {
    if (latestInternal) {
      setInternalForm({
        base_rate: parseFloat((Number(latestInternal.base_rate ?? 0.1) * 100).toFixed(4)),
        tier1_rate: parseFloat((Number(latestInternal.tier1_rate ?? 0.11) * 100).toFixed(4)),
        tier2_rate: parseFloat((Number(latestInternal.tier2_rate ?? 0.13) * 100).toFixed(4)),
        company_rate: parseFloat((Number(latestInternal.company_rate ?? 0.035) * 100).toFixed(4)),
        payout_day: latestInternal.payout_day ?? "10",
        effective_from: new Date().toISOString().slice(0, 10),
      });
    }
    setInternalDialogOpen(true);
  };

  const openExternalDialog = (projectName?: string) => {
    const latest = projectName ? externalByProject[projectName]?.[0] : null;
    if (latest) {
      setExternalForm({
        project_name: latest.project_name,
        sales_rate: parseFloat((Number(latest.sales_rate ?? 0.2) * 100).toFixed(4)),
        co_sales1_rate: parseFloat((Number(latest.co_sales1_rate ?? 0.1) * 100).toFixed(4)),
        co_sales2_rate: parseFloat((Number(latest.co_sales2_rate ?? 0.15) * 100).toFixed(4)),
        payout_day: latest.payout_day ?? "10",
        effective_from: new Date().toISOString().slice(0, 10),
      });
    } else {
      setExternalForm({
        project_name: projectName ?? "",
        sales_rate: 20,
        co_sales1_rate: 10,
        co_sales2_rate: 15,
        payout_day: "10",
        effective_from: new Date().toISOString().slice(0, 10),
      });
    }
    setExternalDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {canManageProjects && <ProjectsManagementCard />}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">內部分潤設定</CardTitle>
          {canManage && (
            <Button size="sm" onClick={openInternalDialog}>
              <Plus className="h-4 w-4 mr-1" /> 新增版本
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? null : !latestInternal ? (
            <div className="text-center text-muted-foreground py-6">尚無設定</div>
          ) : (
            <>
              <div className="rounded-md border p-3 bg-muted/30 mb-4">
                <div className="text-xs text-muted-foreground mb-2">
                  目前版本（生效日：{latestInternal.effective_from}）
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div><span className="text-muted-foreground">個人基本比例：</span>{fmtRate(latestInternal.base_rate)}</div>
                  <div><span className="text-muted-foreground">帶 1 人比例：</span>{fmtRate(latestInternal.tier1_rate)}</div>
                  <div><span className="text-muted-foreground">帶 2 人以上：</span>{fmtRate(latestInternal.tier2_rate)}</div>
                  <div><span className="text-muted-foreground">公司提撥：</span>{fmtRate(latestInternal.company_rate)}</div>
                  <div><span className="text-muted-foreground">發放日：</span>{latestInternal.payout_day ?? "—"}</div>
                </div>
              </div>
              {internalRows.length > 1 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">歷史版本</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>生效日</TableHead>
                        <TableHead className="text-right">個人</TableHead>
                        <TableHead className="text-right">帶1人</TableHead>
                        <TableHead className="text-right">帶2人+</TableHead>
                        <TableHead className="text-right">公司</TableHead>
                        <TableHead>發放日</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalRows.slice(1).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.effective_from}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtRate(r.base_rate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtRate(r.tier1_rate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtRate(r.tier2_rate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtRate(r.company_rate)}</TableCell>
                          <TableCell>{r.payout_day ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">外部分潤設定</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => openExternalDialog()}>
              <Plus className="h-4 w-4 mr-1" /> 新增專案
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? null : Object.keys(externalByProject).length === 0 ? (
            <div className="text-center text-muted-foreground py-6">尚無設定</div>
          ) : (
            Object.entries(externalByProject).map(([project, list]) => {
              const latest = list[0];
              return (
                <div key={project} className="rounded-md border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{project}</div>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => openExternalDialog(project)}>
                        <Plus className="h-4 w-4 mr-1" /> 新增版本
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    目前版本（生效日：{latest.effective_from}）
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-muted-foreground">開發業務：</span>{fmtRate(latest.sales_rate)}</div>
                    <div><span className="text-muted-foreground">協同業務1：</span>{fmtRate(latest.co_sales1_rate)}</div>
                    <div><span className="text-muted-foreground">協同業務2：</span>{fmtRate(latest.co_sales2_rate)}</div>
                    <div><span className="text-muted-foreground">發放日：</span>{latest.payout_day ?? "—"}</div>
                  </div>
                  {list.length > 1 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">歷史版本</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>生效日</TableHead>
                            <TableHead className="text-right">開發業務</TableHead>
                            <TableHead className="text-right">協同1</TableHead>
                            <TableHead className="text-right">協同2</TableHead>
                            <TableHead>發放日</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {list.slice(1).map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>{r.effective_from}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtRate(r.sales_rate)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtRate(r.co_sales1_rate)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtRate(r.co_sales2_rate)}</TableCell>
                              <TableCell>{r.payout_day ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <TeamSettingsCard canManage={canManage} />



      <Dialog open={internalDialogOpen} onOpenChange={setInternalDialogOpen}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增內部分潤版本</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>個人基本比例 (%)</Label>
                <Input type="number" step="0.1" value={internalForm.base_rate}
                  onChange={(e) => setInternalForm({ ...internalForm, base_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>帶 1 人比例 (%)</Label>
                <Input type="number" step="0.1" value={internalForm.tier1_rate}
                  onChange={(e) => setInternalForm({ ...internalForm, tier1_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>帶 2 人以上 (%)</Label>
                <Input type="number" step="0.1" value={internalForm.tier2_rate}
                  onChange={(e) => setInternalForm({ ...internalForm, tier2_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>公司提撥比例 (%)</Label>
                <Input type="number" step="0.1" value={internalForm.company_rate}
                  onChange={(e) => setInternalForm({ ...internalForm, company_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>發放日</Label>
                <Input value={internalForm.payout_day}
                  placeholder="例：10 或 10,25"
                  onChange={(e) => setInternalForm({ ...internalForm, payout_day: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>生效日期</Label>
                <Input type="date" value={internalForm.effective_from}
                  onChange={(e) => setInternalForm({ ...internalForm, effective_from: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInternalDialogOpen(false)}>取消</Button>
            <Button onClick={saveInternal}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={externalDialogOpen} onOpenChange={setExternalDialogOpen}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增外部分潤版本</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>專案名稱 *</Label>
              <Input value={externalForm.project_name}
                onChange={(e) => setExternalForm({ ...externalForm, project_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>開發業務比例 (%)</Label>
                <Input type="number" step="0.1" value={externalForm.sales_rate}
                  onChange={(e) => setExternalForm({ ...externalForm, sales_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>協同業務1 比例 (%)</Label>
                <Input type="number" step="0.1" value={externalForm.co_sales1_rate}
                  onChange={(e) => setExternalForm({ ...externalForm, co_sales1_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>協同業務2 比例 (%)</Label>
                <Input type="number" step="0.1" value={externalForm.co_sales2_rate}
                  onChange={(e) => setExternalForm({ ...externalForm, co_sales2_rate: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>發放日</Label>
                <Input value={externalForm.payout_day}
                  onChange={(e) => setExternalForm({ ...externalForm, payout_day: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>生效日期</Label>
                <Input type="date" value={externalForm.effective_from}
                  onChange={(e) => setExternalForm({ ...externalForm, effective_from: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExternalDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveExternal()}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TeamMemberProfile {
  id: string;
  user_id: string | null;
  display_name: string;
  commission_rate: number | null;
  scout_tier: string | null;
  is_active: boolean | null;
}

function TeamSettingsCard({ canManage }: { canManage: boolean }) {
  const [profiles, setProfiles] = useState<TeamMemberProfile[]>([]);
  const [settings, setSettings] = useState<TeamSetting[]>([]);
  const [editing, setEditing] = useState<TeamSetting | null>(null);
  const [form, setForm] = useState<TeamSetting>({
    member_id: "",
    direct_leader_id: null,
    title: "",
    sub_leader_id: null,
    top_leader_id: null,
  });

  // 新增無帳號成員
  const [addOpen, setAddOpen] = useState(false);
  const [newMember, setNewMember] = useState({ display_name: "", commission_rate: "" });
  const [addSaving, setAddSaving] = useState(false);

  // 綁定帳號
  const [bindingFor, setBindingFor] = useState<TeamMemberProfile | null>(null);
  const [availableUsers, setAvailableUsers] = useState<{ id: string; email: string | null; name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [bindSaving, setBindSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const [profRes, setRes, roleRes] = await Promise.all([
      (supabase as any)
        .from("team_member_profiles")
        .select("id,user_id,display_name,commission_rate,scout_tier,is_active")
        .or("is_active.is.null,is_active.eq.true")
        .order("display_name"),
      supabase.from("franchise_team_settings").select("*"),
      (supabase as any).from("user_roles").select("user_id").in("role", ["franchise", "franchise_manager"]),
    ]);
    const franchiseUserIds = new Set(
      ((roleRes?.data ?? []) as { user_id: string }[]).map((r) => r.user_id)
    );
    const all = (profRes.data ?? []) as TeamMemberProfile[];
    // 只保留：無帳號成員（這個 Tab 專屬新增）或有 franchise 角色的成員
    const filtered = all.filter((p) => !p.user_id || franchiseUserIds.has(p.user_id));
    setProfiles(filtered);
    if (setRes.data) setSettings(setRes.data as TeamSetting[]);
  };


  // 用於下拉選單（隊長）：只有有帳號的成員
  const accountedMembers: Member[] = useMemo(
    () =>
      profiles
        .filter((p) => p.user_id)
        .map((p) => ({ user_id: p.user_id as string, display_name: p.display_name })),
    [profiles]
  );

  const memberName = (id: string | null) =>
    !id ? "—" : accountedMembers.find((m) => m.user_id === id)?.display_name ?? "—";

  const openEdit = (row: TeamSetting | null, memberId: string) => {
    if (row) {
      setForm(row);
      setEditing(row);
    } else {
      const next: TeamSetting = {
        member_id: memberId,
        direct_leader_id: null,
        title: "",
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
      title: null,
      sub_leader_id: null,
      top_leader_id: null,
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

  const handleAddMember = async () => {
    const name = newMember.display_name.trim();
    if (!name) return toast.error("請輸入姓名");
    setAddSaving(true);
    const payload: Record<string, unknown> = {
      display_name: name,
      user_id: null,
      commission_rate: newMember.commission_rate === "" ? null : Number(newMember.commission_rate),
      is_active: true,
    };
    const { error } = await (supabase as any).from("team_member_profiles").insert(payload);
    setAddSaving(false);
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增成員");
    setAddOpen(false);
    setNewMember({ display_name: "", commission_rate: "" });

    void load();
  };

  const openBind = async (p: TeamMemberProfile) => {
    setBindingFor(p);
    setSelectedUserId("");
    // 撈所有 profiles（系統帳號），排除已被 team_member_profiles.user_id 綁定的
    const boundIds = new Set(profiles.map((x) => x.user_id).filter(Boolean) as string[]);
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id,email,name")
      .order("email");
    const list = ((data ?? []) as { id: string; email: string | null; name: string | null }[]).filter(
      (u) => !boundIds.has(u.id)
    );
    setAvailableUsers(list);
  };

  const handleBind = async () => {
    if (!bindingFor || !selectedUserId) return toast.error("請選擇要綁定的帳號");
    setBindSaving(true);
    const { error } = await (supabase as any)
      .from("team_member_profiles")
      .update({ user_id: selectedUserId })
      .eq("id", bindingFor.id);
    setBindSaving(false);
    if (error) return toast.error("綁定失敗：" + error.message);
    toast.success("已綁定帳號");
    setBindingFor(null);
    void load();
  };

  const settingsByMember = useMemo(() => {
    const map: Record<string, TeamSetting> = {};
    settings.forEach((s) => (map[s.member_id] = s));
    return map;
  }, [settings]);

  // user_id -> profile (for traversing leader chains; direct_leader_id 仍以 user_id 儲存)
  const profileByUserId = useMemo(() => {
    const map: Record<string, TeamMemberProfile> = {};
    profiles.forEach((p) => {
      if (p.user_id) map[p.user_id] = p;
    });
    return map;
  }, [profiles]);

  // 此人 user_id 被多少筆設定當作 direct_leader_id
  const directReportCount = useMemo(() => {
    const counts: Record<string, number> = {};
    settings.forEach((s) => {
      if (s.direct_leader_id) counts[s.direct_leader_id] = (counts[s.direct_leader_id] ?? 0) + 1;
    });
    return counts;
  }, [settings]);

  const computeTitle = (p: TeamMemberProfile) => {
    if (!p.user_id) return "";
    const c = directReportCount[p.user_id] ?? 0;
    if (c >= 2) return "總監";
    if (c === 1) return "隊長";
    return "";
  };

  // 沿著 direct_leader_id 向上追溯，找最上層
  const computeTopLeaderName = (p: TeamMemberProfile): string => {
    const visited = new Set<string>();
    let currentProfileId = p.id;
    let lastLeaderUserId: string | null = null;
    while (currentProfileId && !visited.has(currentProfileId)) {
      visited.add(currentProfileId);
      const s = settingsByMember[currentProfileId];
      const leaderUserId = s?.direct_leader_id ?? null;
      if (!leaderUserId) break;
      // 自己指向自己 → 停止
      const leaderProfile = profileByUserId[leaderUserId];
      if (!leaderProfile || leaderProfile.id === currentProfileId) {
        lastLeaderUserId = leaderUserId;
        break;
      }
      lastLeaderUserId = leaderUserId;
      currentProfileId = leaderProfile.id;
    }
    return lastLeaderUserId ? memberName(lastLeaderUserId) : "—";
  };



  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">內部小隊分潤設定</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增無帳號成員
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>隊員</TableHead>
              <TableHead>帳號</TableHead>
              <TableHead>直屬隊長</TableHead>
              <TableHead>稱號</TableHead>
              <TableHead>小組隊長</TableHead>
              <TableHead>最上層隊長</TableHead>
              {canManage && <TableHead className="w-32 text-right">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">
                  尚無成員
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((p) => {
                const s = settingsByMember[p.id];
                const title = computeTitle(p);
                const subLeaderName = memberName(s?.direct_leader_id ?? null);
                const topLeaderName = computeTopLeaderName(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.display_name}</TableCell>
                    <TableCell>
                      {p.user_id ? (
                        <Badge variant="success">已綁定</Badge>
                      ) : (
                        <Badge variant="secondary">無帳號</Badge>
                      )}
                    </TableCell>
                    <TableCell>{memberName(s?.direct_leader_id ?? null)}</TableCell>
                    <TableCell>{title || "—"}</TableCell>
                    <TableCell>{subLeaderName}</TableCell>
                    <TableCell>{topLeaderName}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s ?? null, p.id)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!p.user_id && (
                            <Button size="sm" variant="outline" onClick={() => openBind(p)}>
                              綁定帳號
                            </Button>
                          )}
                        </div>
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <SheetTitle>編輯小隊設定</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label>隊員</Label>
              <Input
                value={profiles.find((p) => p.id === form.member_id)?.display_name ?? ""}
                disabled
              />
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
                  {accountedMembers
                    .filter((m) => {
                      // 不能選自己
                      const self = profiles.find((p) => p.id === form.member_id);
                      return m.user_id !== self?.user_id;
                    })
                    .map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                稱號、小組隊長、最上層隊長將依直屬隊長自動計算。
              </p>
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


      {/* 新增無帳號成員 Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增無帳號成員</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>姓名 *</Label>
              <Input
                value={newMember.display_name}
                onChange={(e) => setNewMember({ ...newMember, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>個人分潤比例</Label>
              <Input
                type="number"
                step="0.01"
                value={newMember.commission_rate}
                onChange={(e) => setNewMember({ ...newMember, commission_rate: e.target.value })}
                placeholder="例：0.1"
              />
              <p className="text-xs text-muted-foreground">輸入 0~1 之間的小數，例如 0.1 代表 10%</p>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
            <Button onClick={handleAddMember} disabled={addSaving}>
              {addSaving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 綁定帳號 Dialog */}
      <Dialog open={!!bindingFor} onOpenChange={(o) => !o && setBindingFor(null)}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>綁定帳號：{bindingFor?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>選擇帳號</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇要綁定的使用者" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">無可綁定的帳號</div>
                  ) : (
                    availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.email ?? u.name ?? u.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindingFor(null)}>取消</Button>
            <Button onClick={handleBind} disabled={bindSaving || !selectedUserId}>
              {bindSaving ? "綁定中..." : "綁定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


interface ExternalOrder {
  id: string;
  project_name: string;
  signed_at: string | null;
  sales_name: string | null;
  sales_email: string | null;
  sales_phone: string | null;
  member_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  unit_count: number | null;
  plan_price: number;
  total_amount: number | null;
  payment_at: string | null;
  contract_progress: string | null;
  tax_id: string | null;
  invoice_progress: string | null;
  invoice_number: string | null;
  invoice_carrier: boolean | null;
  invoice_address: string | null;
  sales_bonus: number | null;
  co_sales_name: string | null;
  co_sales_bonus: number | null;
  co_sales_name2: string | null;
  co_sales_bonus2: number | null;
  notes: string | null;
}

const CONTRACT_PROGRESS_OPTIONS = ["進行中", "已完成", "取消"];

const emptyExternalForm = (): Partial<ExternalOrder> => ({
  project_name: "森山第一期",
  signed_at: new Date().toISOString().slice(0, 10),
  sales_name: "",
  sales_email: "",
  sales_phone: "",
  member_number: "",
  customer_name: "",
  customer_phone: "",
  unit_count: 1,
  plan_price: 100000,
  payment_at: null,
  contract_progress: "進行中",
  tax_id: "",
  invoice_progress: "",
  invoice_number: "",
  invoice_carrier: true,
  invoice_address: "",
  sales_bonus: null,
  co_sales_name: "",
  co_sales_bonus: null,
  co_sales_name2: "",
  co_sales_bonus2: null,
  notes: "",
});

function ExternalSalesTab({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<ExternalOrder[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [salesFilter, setSalesFilter] = useState<string>("ALL");
  const [progressFilter, setProgressFilter] = useState<string>("ALL");
  const [year, setYear] = useState<string>("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [memberNumberError, setMemberNumberError] = useState<string>("");
  const projectOrderMap = useProjectOrderMap();


  const [detail, setDetail] = useState<ExternalOrder | null>(null);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<Partial<ExternalOrder>>(emptyExternalForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [externalRates, setExternalRates] = useState<Record<string, ExternalRates>>({});

  const load = async () => {
    const [ordersRes, ratesRes] = await Promise.all([
      supabase
        .from("franchise_external_orders")
        .select("*")
        .order("signed_at", { ascending: false, nullsFirst: false }),
      (supabase as any)
        .from("franchise_commission_settings")
        .select("*")
        .eq("type", "external")
        .order("effective_from", { ascending: false }),
    ]);
    if (ordersRes.error) {
      toast.error("讀取失敗：" + ordersRes.error.message);
      return;
    }
    setRows((ordersRes.data ?? []) as ExternalOrder[]);

    const rateMap: Record<string, ExternalRates> = {};
    ((ratesRes.data ?? []) as any[]).forEach((r) => {
      if (!rateMap[r.project_name]) {
        rateMap[r.project_name] = {
          sales_rate: Number(r.sales_rate ?? 0.2),
          co_sales1_rate: Number(r.co_sales1_rate ?? 0.1),
          co_sales2_rate: Number(r.co_sales2_rate ?? 0.15),
          payout_day: r.payout_day ?? null,
        };
      }
    });
    setExternalRates(rateMap);
  };

  useEffect(() => {
    void load();
  }, []);

  // Auto-fill bonuses when project / unit / price / co-sales names change (only for new order, not edit)
  useEffect(() => {
    if (editingId) return;
    const project = (form.project_name ?? "").trim();
    if (!project) return;
    const r = externalRates[project];
    if (!r) return;
    const total = (Number(form.unit_count) || 0) * (Number(form.plan_price) || 0);
    setForm((prev) => ({
      ...prev,
      sales_bonus: Math.round(total * r.sales_rate),
      co_sales_bonus: (prev.co_sales_name ?? "").trim() ? Math.round(total * r.co_sales1_rate) : null,
      co_sales_bonus2: (prev.co_sales_name2 ?? "").trim() ? Math.round(total * r.co_sales2_rate) : null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_name, form.unit_count, form.plan_price, form.co_sales_name, form.co_sales_name2, externalRates, editingId, sheetOpen]);

  const currentRates = externalRates[(form.project_name ?? "").trim()] ?? null;
  const pct = (n: number | null | undefined) => n == null ? "" : `${parseFloat((n * 100).toFixed(2))}%`;

  const projects = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.project_name && set.add(r.project_name));
    return Array.from(set);
  }, [rows]);

  const salesOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.sales_name && set.add(r.sales_name));
    return Array.from(set).sort();
  }, [rows]);

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(cur - i));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (projectFilter !== "ALL" && r.project_name !== projectFilter) return false;
      if (salesFilter !== "ALL" && (r.sales_name ?? "") !== salesFilter) return false;
      if (progressFilter !== "ALL" && (r.contract_progress ?? "") !== progressFilter) return false;
      if (r.signed_at) {
        const d = new Date(r.signed_at);
        if (year !== "ALL" && String(d.getFullYear()) !== year) return false;
        if (month !== "ALL" && d.getMonth() + 1 !== Number(month)) return false;
      } else if (year !== "ALL" || month !== "ALL") {
        return false;
      }
      return true;
    });
  }, [rows, projectFilter, salesFilter, progressFilter, year, month]);

  const checkExtMemberNumberDup = async (val: string) => {
    const v = val.trim();
    if (!v) { setMemberNumberError(""); return; }
    const q = supabase.from("franchise_external_orders").select("id").eq("member_number", v).limit(1);
    const { data } = editingId ? await q.neq("id", editingId) : await q;
    if ((data ?? []).length > 0) setMemberNumberError("此編號已使用");
    else setMemberNumberError("");
  };

  const openCreate = () => {
    setEditingId(null);
    const empty = emptyExternalForm();
    const projectName = (empty.project_name ?? "").trim();
    const order = projectName ? projectOrderMap[projectName] : 0;
    const auto = order
      ? nextMemberNumberForProject(
          rows.filter((r) => (r.project_name ?? "") === projectName).map((r) => r.member_number),
          "T",
          order,
        )
      : "";
    setForm({ ...empty, member_number: auto });
    setMemberNumberError("");
    setSheetOpen(true);
  };

  // Auto recompute member_number when project_name changes in the new-order sheet,
  // only if the field is empty or still holds an auto-generated value.
  useEffect(() => {
    if (!sheetOpen || editingId) return;
    const projectName = (form.project_name ?? "").trim();
    if (!projectName) return;
    const order = projectOrderMap[projectName];
    if (!order) return;
    const current = (form.member_number ?? "").trim();
    if (current && !isAutoMemberNumber(current, "T")) return;
    const auto = nextMemberNumberForProject(
      rows.filter((r) => (r.project_name ?? "") === projectName).map((r) => r.member_number),
      "T",
      order,
    );
    if (auto && auto !== current) {
      setForm((prev) => ({ ...prev, member_number: auto }));
      setMemberNumberError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_name, sheetOpen, editingId, projectOrderMap, rows]);


  const openEdit = (row: ExternalOrder) => {
    setEditingId(row.id);
    setForm({ ...row });
    setMemberNumberError("");
    setDetail(null);
    setEditing(false);
    setSheetOpen(true);
  };

  const onChange = (k: keyof ExternalOrder, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v as never }));

  const handleSave = async () => {
    if (!form.customer_name?.trim()) {
      toast.error("請填寫會員姓名");
      return;
    }
    if (memberNumberError) {
      toast.error(memberNumberError);
      return;
    }
    const mn = (form.member_number ?? "").trim();
    if (mn) {
      const q = supabase.from("franchise_external_orders").select("id").eq("member_number", mn).limit(1);
      const { data } = editingId ? await q.neq("id", editingId) : await q;
      if ((data ?? []).length > 0) {
        setMemberNumberError("此編號已使用");
        toast.error("此編號已使用");
        return;
      }
    }
    const payload = {
      project_name: form.project_name?.trim() || "森山第一期",
      signed_at: form.signed_at || null,
      sales_name: form.sales_name?.trim() || null,
      sales_email: form.sales_email?.trim() || null,
      sales_phone: form.sales_phone?.trim() || null,
      member_number: form.member_number?.trim() || null,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone?.trim() || null,
      unit_count: Number(form.unit_count ?? 1) || 1,
      plan_price: Number(form.plan_price ?? 0) || 0,
      payment_at: form.payment_at || null,
      contract_progress: form.contract_progress || "進行中",
      tax_id: form.tax_id?.trim() || null,
      invoice_progress: form.invoice_progress?.trim() || null,
      invoice_number: form.invoice_number?.trim() || null,
      invoice_carrier: !!form.invoice_carrier,
      invoice_address: form.invoice_address?.trim() || null,
      sales_bonus: form.sales_bonus == null || form.sales_bonus === ("" as never) ? null : Number(form.sales_bonus),
      co_sales_name: form.co_sales_name?.trim() || null,
      co_sales_bonus: form.co_sales_bonus == null || form.co_sales_bonus === ("" as never) ? null : Number(form.co_sales_bonus),
      co_sales_name2: form.co_sales_name2?.trim() || null,
      co_sales_bonus2: form.co_sales_bonus2 == null || form.co_sales_bonus2 === ("" as never) ? null : Number(form.co_sales_bonus2),
      notes: form.notes?.trim() || null,
    };
    setSaving(true);
    let error;
    if (editingId) {
      ({ error } = await supabase.from("franchise_external_orders").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("franchise_external_orders").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success(editingId ? "已更新" : "已新增");
    setSheetOpen(false);
    setEditingId(null);
    void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部專案</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部年份</SelectItem>
                {years.map((y) => (<SelectItem key={y} value={y}>{y} 年</SelectItem>))}
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
            <Select value={salesFilter} onValueChange={setSalesFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部開發業務</SelectItem>
                {salesOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> 新增
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">會員編號</TableHead>
                <TableHead className="whitespace-nowrap">會員姓名</TableHead>
                <TableHead className="whitespace-nowrap">開發業務</TableHead>
                <TableHead className="whitespace-nowrap">專案名稱</TableHead>
                <TableHead className="whitespace-nowrap text-right">金額</TableHead>
                <TableHead className="whitespace-nowrap">簽約日期</TableHead>
                <TableHead className="whitespace-nowrap">合約進度</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setDetail(r); setEditing(false); }}
                  >
                    <TableCell className="whitespace-nowrap">{r.member_number ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.customer_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.sales_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.project_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(r.total_amount ?? (r.unit_count ?? 0) * r.plan_price)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.signed_at ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={r.contract_progress === "已完成" ? "success" : r.contract_progress === "取消" ? "destructive" : "secondary"}>
                        {r.contract_progress ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Detail Drawer */}
      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <div className="flex items-center justify-between pr-8">
              <SheetTitle>外部銷售明細</SheetTitle>
              {detail && canManage && !editing && (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(detail); }}>
                  <Pencil className="h-4 w-4 mr-1" /> 編輯
                </Button>
              )}
            </div>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4">
              {/* 基本資訊：兩欄 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                <Field label="會員編號" value={detail.member_number} />
                <Field label="簽約日期" value={detail.signed_at} />
                <Field label="會員姓名" value={detail.customer_name} />
                <Field label="匯款日期" value={detail.payment_at} />
                <Field label="會員電話" value={detail.customer_phone} />
                <Field label="合約進度" value={detail.contract_progress} />
              </div>

              {/* 業務資訊 Card */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                  <Field label="開發業務" value={detail.sales_name} />
                  <Field label="業務 Email" value={detail.sales_email} breakAll />
                  <Field label="業務電話" value={detail.sales_phone} />
                </div>
              </div>

              {/* 詳細資訊：兩欄 */}
              <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                <Field label="專案名稱" value={detail.project_name} />
                <Field label="發票進度" value={detail.invoice_progress} />
                <Field label="購買單位數" value={String(detail.unit_count ?? 0)} />
                <Field label="發票號碼" value={detail.invoice_number} />
                <Field label="金額" value={fmtMoney(detail.total_amount ?? (detail.unit_count ?? 0) * detail.plan_price)} />
                <Field label="發票載具" value={detail.invoice_carrier ? "是" : "否"} />
                <Field label="統編" value={detail.tax_id} />
                <Field label="寄送地址/Email" value={detail.invoice_address} breakAll />
              </div>

              {/* 獎金資訊 */}
              <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                <Field label="銷售獎金（開發業務）" value={detail.sales_bonus == null ? null : fmtMoney(detail.sales_bonus)} />
                <Field
                  label="協同業務1"
                  value={detail.co_sales_name ? `${detail.co_sales_name}${detail.co_sales_bonus != null ? ` / ${fmtMoney(detail.co_sales_bonus)}` : ""}` : null}
                />
                <Field
                  label="協同業務2"
                  value={detail.co_sales_name2 ? `${detail.co_sales_name2}${detail.co_sales_bonus2 != null ? ` / ${fmtMoney(detail.co_sales_bonus2)}` : ""}` : null}
                />
              </div>

              {/* 備註 */}
              <div className="border-t pt-3">
                <div className="text-xs text-muted-foreground mb-1">備註</div>
                <div className="text-sm whitespace-pre-wrap break-all">{detail.notes ?? "—"}</div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) setEditingId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <SheetTitle>{editingId ? "編輯外部銷售訂單" : "新增外部銷售訂單"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>專案名稱</Label>
                <ProjectSelect value={form.project_name ?? ""} onChange={(v) => onChange("project_name", v)} />
              </div>
              <div className="space-y-1">
                <Label>簽約日期</Label>
                <Input type="date" value={form.signed_at ?? ""} onChange={(e) => onChange("signed_at", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>開發業務姓名</Label>
                <Input value={form.sales_name ?? ""} onChange={(e) => onChange("sales_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>業務 Email</Label>
                <Input value={form.sales_email ?? ""} onChange={(e) => onChange("sales_email", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>業務電話</Label>
                <Input value={form.sales_phone ?? ""} onChange={(e) => onChange("sales_phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>會員編號</Label>
                <Input
                  value={form.member_number ?? ""}
                  onChange={(e) => { onChange("member_number", e.target.value); setMemberNumberError(""); }}
                  onBlur={(e) => void checkExtMemberNumberDup(e.target.value)}
                />
                {memberNumberError && (
                  <p className="text-xs text-destructive">{memberNumberError}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>會員姓名 *</Label>
                <Input value={form.customer_name ?? ""} onChange={(e) => onChange("customer_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>會員電話</Label>
                <Input value={form.customer_phone ?? ""} onChange={(e) => onChange("customer_phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>購買單位數</Label>
                <Input type="number" min={1} value={form.unit_count ?? 1} onChange={(e) => onChange("unit_count", Number(e.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label>單位金額</Label>
                <Input type="number" min={0} value={form.plan_price ?? 0} onChange={(e) => onChange("plan_price", Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>總金額</Label>
                <Input readOnly className="bg-muted" value={fmtMoney((Number(form.unit_count) || 0) * (Number(form.plan_price) || 0))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>匯款日期</Label>
                <Input type="date" value={form.payment_at ?? ""} onChange={(e) => onChange("payment_at", e.target.value || null)} />
              </div>
              <div className="space-y-1">
                <Label>合約進度</Label>
                <Select value={form.contract_progress ?? "進行中"} onValueChange={(v) => onChange("contract_progress", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_PROGRESS_OPTIONS.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>統編</Label>
                <Input value={form.tax_id ?? ""} onChange={(e) => onChange("tax_id", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>發票進度</Label>
                <Input value={form.invoice_progress ?? ""} onChange={(e) => onChange("invoice_progress", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>發票號碼</Label>
              <Input value={form.invoice_number ?? ""} onChange={(e) => onChange("invoice_number", e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ext_invoice_carrier"
                checked={!!form.invoice_carrier}
                onCheckedChange={(v) => onChange("invoice_carrier", !!v)}
              />
              <Label htmlFor="ext_invoice_carrier">發票使用載具</Label>
            </div>
            <div className="space-y-1">
              <Label>發票寄送地址 / Email</Label>
              <Input value={form.invoice_address ?? ""} onChange={(e) => onChange("invoice_address", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>銷售獎金（開發業務）{currentRates ? `（${pct(currentRates.sales_rate)}）` : ""}</Label>
              <Input type="number" value={form.sales_bonus ?? ""} onChange={(e) => onChange("sales_bonus", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>協同業務1 姓名</Label>
                <Input value={form.co_sales_name ?? ""} onChange={(e) => onChange("co_sales_name", e.target.value)} />
              </div>
              {(form.co_sales_name ?? "").trim() && (
                <div className="space-y-1">
                  <Label>協同業務1 獎金{currentRates ? `（${pct(currentRates.co_sales1_rate)}）` : ""}</Label>
                  <Input type="number" value={form.co_sales_bonus ?? ""} onChange={(e) => onChange("co_sales_bonus", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>協同業務2 姓名</Label>
                <Input value={form.co_sales_name2 ?? ""} onChange={(e) => onChange("co_sales_name2", e.target.value)} />
              </div>
              {(form.co_sales_name2 ?? "").trim() && (
                <div className="space-y-1">
                  <Label>協同業務2 獎金{currentRates ? `（${pct(currentRates.co_sales2_rate)}）` : ""}</Label>
                  <Input type="number" value={form.co_sales_bonus2 ?? ""} onChange={(e) => onChange("co_sales_bonus2", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => onChange("notes", e.target.value)} />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// =================== Stats Tab ===================
interface InternalStatRow { sold_at: string | null; plan_name: string | null; plan_price: number | null; sold_by: string | null; sold_by_name: string | null; commission_amount: number | null; leader_amount: number | null; company_amount: number | null; }
interface ExternalStatRow { signed_at: string | null; project_name: string | null; unit_count: number | null; plan_price: number | null; sales_name: string | null; sales_bonus: number | null; co_sales_name: string | null; co_sales_bonus: number | null; co_sales_name2: string | null; co_sales_bonus2: number | null; }

function StatsTab() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [internal, setInternal] = useState<InternalStatRow[]>([]);
  const [external, setExternal] = useState<ExternalStatRow[]>([]);
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [intRes, extRes, profRes] = await Promise.all([
        supabase.from("franchise_orders").select("sold_at, plan_name, plan_price, sold_by, sold_by_name, commission_amount, leader_amount, company_amount"),
        supabase.from("franchise_external_orders").select("signed_at, project_name, unit_count, plan_price, sales_name, sales_bonus, co_sales_name, co_sales_bonus, co_sales_name2, co_sales_bonus2"),
        supabase.from("team_member_profiles").select("user_id, display_name"),
      ]);
      if (cancelled) return;
      setInternal((intRes.data ?? []) as InternalStatRow[]);
      setExternal((extRes.data ?? []) as ExternalStatRow[]);
      const m: Record<string, string> = {};
      (profRes.data ?? []).forEach((p: { user_id: string; display_name: string | null }) => {
        if (p.display_name) m[p.user_id] = p.display_name;
      });
      setMemberMap(m);
      setLoading(false);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const years = useMemo(() => {
    const s = new Set<string>();
    internal.forEach((r) => r.sold_at && s.add(r.sold_at.slice(0, 4)));
    external.forEach((r) => r.signed_at && s.add(r.signed_at.slice(0, 4)));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [internal, external]);

  const matchDate = (d: string | null) => {
    if (!d) return year === "all" && month === "all";
    const y = d.slice(0, 4);
    const m = String(parseInt(d.slice(5, 7), 10));
    if (year !== "all" && y !== year) return false;
    if (month !== "all" && m !== month) return false;
    return true;
  };

  const filteredInt = useMemo(() => internal.filter((r) => matchDate(r.sold_at)), [internal, year, month]);
  const filteredExt = useMemo(() => external.filter((r) => matchDate(r.signed_at)), [external, year, month]);

  const chartData = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({ month: `${i + 1}月`, internal: 0, external: 0 }));
    filteredInt.forEach((r) => {
      if (!r.sold_at) return;
      const m = parseInt(r.sold_at.slice(5, 7), 10) - 1;
      arr[m].internal += Number(r.plan_price ?? 0);
    });
    filteredExt.forEach((r) => {
      if (!r.signed_at) return;
      const m = parseInt(r.signed_at.slice(5, 7), 10) - 1;
      arr[m].external += Number(r.unit_count ?? 0) * Number(r.plan_price ?? 0);
    });
    return arr;
  }, [filteredInt, filteredExt]);

  const salesRanking = useMemo(() => {
    const map = new Map<string, { name: string; intCount: number; intAmount: number; extCount: number; extAmount: number }>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, intCount: 0, intAmount: 0, extCount: 0, extAmount: 0 });
      return map.get(name)!;
    };
    filteredInt.forEach((r) => {
      const name = (r.sold_by_name?.trim()) || (r.sold_by ? memberMap[r.sold_by] : null) || "未指定";
      const row = ensure(name);
      row.intCount++;
      row.intAmount += Number(r.plan_price ?? 0);
    });
    filteredExt.forEach((r) => {
      const name = r.sales_name?.trim() || "未指定";
      const row = ensure(name);
      row.extCount++;
      row.extAmount += Number(r.unit_count ?? 0) * Number(r.plan_price ?? 0);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, total: r.intAmount + r.extAmount }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInt, filteredExt, memberMap]);

  const projectStats = useMemo(() => {
    const map = new Map<string, { name: string; intCount: number; intAmount: number; extCount: number; extAmount: number }>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, intCount: 0, intAmount: 0, extCount: 0, extAmount: 0 });
      return map.get(name)!;
    };
    filteredInt.forEach((r) => {
      const row = ensure(r.plan_name?.trim() || "未指定");
      row.intCount++;
      row.intAmount += Number(r.plan_price ?? 0);
    });
    filteredExt.forEach((r) => {
      const row = ensure(r.project_name?.trim() || "未指定");
      row.extCount++;
      row.extAmount += Number(r.unit_count ?? 0) * Number(r.plan_price ?? 0);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, total: r.intAmount + r.extAmount }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInt, filteredExt]);

  const salesCommission = useMemo(() => {
    const map = new Map<string, { name: string; intCommission: number; extCommission: number }>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, intCommission: 0, extCommission: 0 });
      return map.get(name)!;
    };
    filteredInt.forEach((r) => {
      const name = (r.sold_by_name?.trim()) || (r.sold_by ? memberMap[r.sold_by] : null) || "未指定";
      ensure(name).intCommission += Number(r.commission_amount ?? 0);
    });
    filteredExt.forEach((r) => {
      const main = r.sales_name?.trim() || "未指定";
      ensure(main).extCommission += Number(r.sales_bonus ?? 0);
      const co1 = r.co_sales_name?.trim();
      if (co1) ensure(co1).extCommission += Number(r.co_sales_bonus ?? 0);
      const co2 = r.co_sales_name2?.trim();
      if (co2) ensure(co2).extCommission += Number(r.co_sales_bonus2 ?? 0);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, total: r.intCommission + r.extCommission }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filteredInt, filteredExt, memberMap]);

  const projectCommission = useMemo(() => {
    const map = new Map<string, { name: string; intCommission: number; extCommission: number }>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, { name, intCommission: 0, extCommission: 0 });
      return map.get(name)!;
    };
    filteredInt.forEach((r) => {
      const row = ensure(r.plan_name?.trim() || "未指定");
      row.intCommission += Number(r.commission_amount ?? 0) + Number(r.leader_amount ?? 0) + Number(r.company_amount ?? 0);
    });
    filteredExt.forEach((r) => {
      const row = ensure(r.project_name?.trim() || "未指定");
      row.extCommission += Number(r.sales_bonus ?? 0) + Number(r.co_sales_bonus ?? 0) + Number(r.co_sales_bonus2 ?? 0);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, total: r.intCommission + r.extCommission }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filteredInt, filteredExt]);

  if (!loaded && loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部年份</SelectItem>
            {years.map((y) => (<SelectItem key={y} value={y}>{y} 年</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全年</SelectItem>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>月度銷售趨勢</CardTitle></CardHeader>
        <CardContent>
          <StatsChart data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>銷售人業績排行</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>銷售人</TableHead>
                <TableHead className="text-right">內部筆數</TableHead>
                <TableHead className="text-right">內部金額</TableHead>
                <TableHead className="text-right">外部筆數</TableHead>
                <TableHead className="text-right">外部金額</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesRanking.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">無資料</TableCell></TableRow>
              ) : salesRanking.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.intCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.intAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.extCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.extAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>銷售人分潤統計</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>銷售人</TableHead>
                <TableHead className="text-right">內部分潤</TableHead>
                <TableHead className="text-right">外部分潤</TableHead>
                <TableHead className="text-right">合計分潤</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesCommission.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">無資料</TableCell></TableRow>
              ) : salesCommission.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.intCommission)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.extCommission)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>專案業績統計</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>專案名稱</TableHead>
                <TableHead className="text-right">內部筆數</TableHead>
                <TableHead className="text-right">內部金額</TableHead>
                <TableHead className="text-right">外部筆數</TableHead>
                <TableHead className="text-right">外部金額</TableHead>
                <TableHead className="text-right">合計金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectStats.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">無資料</TableCell></TableRow>
              ) : projectStats.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.intCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.intAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.extCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.extAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>專案分潤統計</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>專案名稱</TableHead>
                <TableHead className="text-right">內部分潤總額</TableHead>
                <TableHead className="text-right">外部分潤總額</TableHead>
                <TableHead className="text-right">分潤合計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectCommission.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">無資料</TableCell></TableRow>
              ) : projectCommission.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.intCommission)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.extCommission)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsChart({ data }: { data: Array<{ month: string; internal: number; external: number }> }) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
          <Tooltip formatter={(v: number) => fmtMoney(v)} />
          <Legend />
          <Bar dataKey="internal" name="內部銷售" fill="hsl(var(--primary))" />
          <Bar dataKey="external" name="外部銷售" fill="hsl(217 91% 60%)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============== 會員分潤 Tab ==============
interface MonthlyDistribution {
  id: string;
  year: number;
  month: number;
  project_name: string;
  unit_price: number;
  payment_date: string;
}

function MemberDistributionTab({ currentUserId, canManage = true, canDelete = true }: { currentUserId: string; canManage?: boolean; canDelete?: boolean }) {
  const [distributions, setDistributions] = useState<MonthlyDistribution[]>([]);
  const [externalOrders, setExternalOrders] = useState<ExternalOrder[]>([]);
  const [internalOrders, setInternalOrders] = useState<Array<{
    id: string;
    member_number: string | null;
    customer_name: string;
    customer_phone: string | null;
    plan_name: string | null;
    sold_at: string | null;
    sold_by_name: string | null;
    notes: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth() + 1;
  const [form, setForm] = useState({
    year: nowY,
    month: nowM,
    project_name: "",
    unit_price: 0,
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);

  // 篩選器
  const [filterYear, setFilterYear] = useState<string>("ALL");
  const [filterMonth, setFilterMonth] = useState<string>("ALL");
  const [filterProject, setFilterProject] = useState<string>("ALL");
  const [filterSource, setFilterSource] = useState<"ALL" | "internal" | "external">("ALL");

  const load = async () => {
    setLoading(true);
    const [distRes, extRes, intRes] = await Promise.all([
      (supabase as any)
        .from("franchise_monthly_distributions")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      supabase
        .from("franchise_external_orders")
        .select("id,project_name,member_number,customer_name,customer_phone,unit_count,signed_at,sales_name,notes")
        .order("unit_count", { ascending: false, nullsFirst: false }),
      supabase
        .from("franchise_orders")
        .select("id,member_number,customer_name,customer_phone,plan_name,sold_at,sold_by_name,notes"),
    ]);
    if (distRes.error) {
      toast.error("讀取失敗：" + distRes.error.message);
    } else {
      setDistributions((distRes.data ?? []) as MonthlyDistribution[]);
    }
    if (!extRes.error) {
      setExternalOrders((extRes.data ?? []) as ExternalOrder[]);
    }
    if (!intRes.error) {
      setInternalOrders((intRes.data ?? []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.project_name.trim() || form.unit_price <= 0 || form.year < 2000 || form.month < 1 || form.month > 12) {
      toast.error("請完整填寫表單");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("franchise_monthly_distributions")
      .insert({
        year: Number(form.year),
        month: Number(form.month),
        project_name: form.project_name.trim(),
        unit_price: Number(form.unit_price),
        created_by: currentUserId || null,
      });
    setSaving(false);
    if (error) {
      toast.error("新增失敗：" + error.message);
      return;
    }
    toast.success("已新增");
    setForm({ year: nowY, month: nowM, project_name: "", unit_price: 0 });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除這筆分潤設定？")) return;
    const { error } = await (supabase as any)
      .from("franchise_monthly_distributions")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("刪除失敗：" + error.message);
      return;
    }
    toast.success("已刪除");
    load();
  };

  const startEdit = (d: MonthlyDistribution) => {
    setEditingId(d.id);
    setEditPrice(Number(d.unit_price));
  };

  const saveEdit = async (id: string) => {
    if (editPrice <= 0) {
      toast.error("每單位金額需大於 0");
      return;
    }
    const { error } = await (supabase as any)
      .from("franchise_monthly_distributions")
      .update({ unit_price: Number(editPrice) })
      .eq("id", id);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    toast.success("已更新");
    setEditingId(null);
    load();
  };

  // 動態選項
  const yearOptions = useMemo(
    () => Array.from(new Set(distributions.map((d) => d.year))).sort((a, b) => b - a),
    [distributions]
  );
  const monthOptions = useMemo(
    () => Array.from(new Set(distributions.map((d) => d.month))).sort((a, b) => a - b),
    [distributions]
  );
  const projectOptions = useMemo(
    () => Array.from(new Set(distributions.map((d) => d.project_name))),
    [distributions]
  );

  // 找到符合篩選條件的「分潤設定」
  const matchedDist = useMemo(() => {
    return distributions.find(
      (d) =>
        (filterYear === "ALL" || String(d.year) === filterYear) &&
        (filterMonth === "ALL" || String(d.month) === filterMonth) &&
        (filterProject === "ALL" || d.project_name === filterProject)
    );
  }, [distributions, filterYear, filterMonth, filterProject]);

  type UnifiedMemberRow = {
    id: string;
    source: "internal" | "external";
    member_number: string | null;
    customer_name: string;
    customer_phone: string | null;
    project_name: string | null;
    signed_at: string | null;
    sales_or_sold_by_name: string | null;
    unit_count: number;
    unit_price: number;
    bonus: number;
    payment_date: string | null;
    notes: string | null;
  };

  // 會員明細：依篩選 project_name 對應 franchise_external_orders / franchise_orders
  const memberRows = useMemo<UnifiedMemberRow[]>(() => {
    if (!matchedDist) return [];
    const price = Number(matchedDist.unit_price);
    const rows: UnifiedMemberRow[] = [];
    if (filterSource === "ALL" || filterSource === "external") {
      for (const o of externalOrders) {
        if (o.project_name !== matchedDist.project_name) continue;
        const uc = Number(o.unit_count ?? 0);
        rows.push({
          id: `ext-${o.id}`,
          source: "external",
          member_number: o.member_number ?? null,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone ?? null,
          project_name: o.project_name,
          signed_at: o.signed_at ?? null,
          sales_or_sold_by_name: o.sales_name ?? null,
          unit_count: uc,
          unit_price: price,
          bonus: uc * price,
          payment_date: matchedDist.payment_date,
          notes: (o as any).notes ?? null,
        });
      }
    }
    if (filterSource === "ALL" || filterSource === "internal") {
      for (const o of internalOrders) {
        if ((o.plan_name ?? "") !== matchedDist.project_name) continue;
        rows.push({
          id: `int-${o.id}`,
          source: "internal",
          member_number: o.member_number ?? null,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone ?? null,
          project_name: o.plan_name,
          signed_at: o.sold_at ?? null,
          sales_or_sold_by_name: o.sold_by_name ?? null,
          unit_count: 1,
          unit_price: price,
          bonus: 1 * price,
          payment_date: matchedDist.payment_date,
          notes: o.notes ?? null,
        });
      }
    }
    return rows.sort((a, b) => b.unit_count - a.unit_count);
  }, [externalOrders, internalOrders, matchedDist, filterSource]);

  const [memberDetail, setMemberDetail] = useState<UnifiedMemberRow | null>(null);




  return (
    <div className="space-y-6">
      {/* 上半部：每月分潤設定 */}
      <Card>
        <CardHeader>
          <CardTitle>每月分潤設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label>年份</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>月份</Label>
              <Select
                value={String(form.month)}
                onValueChange={(v) => setForm({ ...form, month: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} 月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>專案名稱</Label>
              <ProjectSelect
                value={form.project_name}
                onChange={(v) => setForm({ ...form, project_name: v })}
              />
            </div>
            <div className="space-y-1">
              <Label>每單位金額 (NT$)</Label>
              <Input
                type="number"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
              />
            </div>
            <Button onClick={handleSubmit} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" /> 新增
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>年份</TableHead>
                  <TableHead>月份</TableHead>
                  <TableHead>專案名稱</TableHead>
                  <TableHead className="text-right">每單位金額</TableHead>
                  <TableHead>預計匯款日</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? null : distributions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      尚無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  distributions.map((d) => {
                    const isEditing = editingId === d.id;
                    return (
                    <TableRow key={d.id}>
                      <TableCell>{d.year}</TableCell>
                      <TableCell>{d.month} 月</TableCell>
                      <TableCell>{d.project_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="h-8 text-right"
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                          />
                        ) : (
                          fmtMoney(d.unit_price)
                        )}
                      </TableCell>
                      <TableCell>{d.payment_date}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => saveEdit(d.id)}>
                                儲存
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                取消
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(d)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 下半部：會員分潤明細 */}
      <Card>
        <CardHeader>
          <CardTitle>會員分潤明細</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">年份</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">月份</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">專案名稱</Label>
              <FilterProjectSelect value={filterProject} onChange={setFilterProject} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">來源</Label>
              <Select value={filterSource} onValueChange={(v) => setFilterSource(v as typeof filterSource)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部</SelectItem>
                  <SelectItem value="internal">內部銷售</SelectItem>
                  <SelectItem value="external">外部銷售</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>會員編號</TableHead>
                  <TableHead>會員姓名</TableHead>
                  <TableHead className="text-right">購買單位數</TableHead>
                  <TableHead className="text-right">每單位金額</TableHead>
                  <TableHead className="text-right">分潤金額</TableHead>
                  <TableHead>預計匯款日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!matchedDist ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      請選擇對應的年份、月份、專案
                    </TableCell>
                  </TableRow>
                ) : memberRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      此專案尚無會員資料
                    </TableCell>
                  </TableRow>
                ) : (
                  memberRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setMemberDetail(r)}
                    >
                      <TableCell>{r.member_number ?? "—"}</TableCell>
                      <TableCell>{r.customer_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.unit_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(r.unit_price)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.bonus)}</TableCell>
                      <TableCell>{r.payment_date}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Sheet open={!!memberDetail} onOpenChange={(o) => { if (!o) setMemberDetail(null); }}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
              <SheetHeader>
                <SheetTitle>會員分潤明細</SheetTitle>
              </SheetHeader>
              {memberDetail && (
                <div className="mt-4 space-y-4 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    <Field label="會員編號" value={memberDetail.member_number} />
                    <Field label="會員姓名" value={memberDetail.customer_name} />
                    <Field label="聯絡電話" value={memberDetail.customer_phone} />
                    <Field
                      label={memberDetail.source === "internal" ? "專案名稱" : "專案"}
                      value={memberDetail.project_name}
                    />
                    <Field label="簽約日期" value={memberDetail.signed_at} />
                    <Field
                      label={memberDetail.source === "internal" ? "銷售人" : "開發業務"}
                      value={memberDetail.sales_or_sold_by_name}
                    />
                  </div>
                  <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    <Field label="購買單位數" value={String(memberDetail.unit_count)} />
                    <Field label="每單位金額" value={fmtMoney(memberDetail.unit_price)} />
                    <Field label="分潤金額" value={fmtMoney(memberDetail.bonus)} />
                    <Field label="預計匯款日" value={memberDetail.payment_date} />
                  </div>
                  {memberDetail.notes && (
                    <div className="border-t pt-3">
                      <div className="text-xs text-muted-foreground mb-1">備註</div>
                      <div className="whitespace-pre-wrap break-all">{memberDetail.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>

        </CardContent>
      </Card>
    </div>
  );
}

// ============== 專案管理 Card ==============
function ProjectsManagementCard() {
  const projects = useFranchiseProjects(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("請輸入專案名稱");
    setSaving(true);
    const { error } = await (supabase as any)
      .from("franchise_projects")
      .insert({ name: trimmed });
    setSaving(false);
    if (error) return toast.error("新增失敗：" + error.message);
    toast.success("已新增專案");
    setName("");
    bumpFranchiseProjects();
  };

  const handleToggle = async (p: FranchiseProject) => {
    const { error } = await (supabase as any)
      .from("franchise_projects")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) return toast.error("更新失敗：" + error.message);
    toast.success(p.is_active ? "已停用" : "已啟用");
    bumpFranchiseProjects();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">專案管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="新增專案名稱"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            className="max-w-sm"
          />
          <Button onClick={handleAdd} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> 新增
          </Button>
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>專案名稱</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    尚無專案
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "success" : "secondary"}>
                        {p.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleToggle(p)}>
                        {p.is_active ? "停用" : "啟用"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface VoucherRow {
  id: string;
  source: "internal" | "external";
  signed_at: string | null;
  member_number: string | null;
  customer_name: string;
  project_name: string | null;
  sales_name: string | null;
  card_status: string | null;
  voucher_count: number | null;
  voucher_batch: string | null;
  voucher_serial_start: number | null;
  voucher_serial_end: number | null;
  voucher_status: string | null;
  voucher_handler: string | null;
  voucher_start_date: string | null;
  voucher_note: string | null;
  voucher_address: string | null;
}

function formatSerialRange(start: number | null, end: number | null): string {
  if (start == null || end == null) return "";
  const pad = (n: number) => String(n).padStart(4, "0");
  return `${pad(start)}-${pad(end)}`;
}

const VOUCHER_FIELDS = "id,member_number,customer_name,card_status,voucher_count,voucher_batch,voucher_serial_start,voucher_serial_end,voucher_status,voucher_handler,voucher_start_date,voucher_note,voucher_address";

function VoucherProgressTab({ canEdit = true, forcedSource, hideSourceFilter = false }: { canEdit?: boolean; forcedSource?: "internal" | "external"; hideSourceFilter?: boolean }) {
  const [rows, setRows] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCard, setFilterCard] = useState("ALL");
  const [filterSource, setFilterSource] = useState<"ALL" | "internal" | "external">("ALL");
  const [detail, setDetail] = useState<VoucherRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<VoucherRow>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [extRes, intRes] = await Promise.all([
      supabase
        .from("franchise_external_orders")
        .select(`${VOUCHER_FIELDS},signed_at,project_name,sales_name`),
      supabase
        .from("franchise_orders")
        .select(`${VOUCHER_FIELDS},sold_at,plan_name,sold_by_name`),
    ]);
    if (extRes.error || intRes.error) {
      toast.error("讀取失敗");
      setLoading(false);
      return;
    }
    const ext: VoucherRow[] = (extRes.data ?? []).map((r: any) => ({
      id: r.id,
      source: "external",
      signed_at: r.signed_at ?? null,
      member_number: r.member_number ?? null,
      customer_name: r.customer_name,
      project_name: r.project_name ?? null,
      sales_name: r.sales_name ?? null,
      card_status: r.card_status ?? null,
      voucher_count: r.voucher_count ?? null,
      voucher_batch: r.voucher_batch ?? null,
      voucher_serial_start: r.voucher_serial_start ?? null,
      voucher_serial_end: r.voucher_serial_end ?? null,
      voucher_status: r.voucher_status ?? null,
      voucher_handler: r.voucher_handler ?? null,
      voucher_start_date: r.voucher_start_date ?? null,
      voucher_note: r.voucher_note ?? null,
      voucher_address: r.voucher_address ?? null,
    }));
    const intl: VoucherRow[] = (intRes.data ?? []).map((r: any) => ({
      id: r.id,
      source: "internal",
      signed_at: r.sold_at ?? null,
      member_number: r.member_number ?? null,
      customer_name: r.customer_name,
      project_name: r.plan_name ?? null,
      sales_name: r.sold_by_name ?? null,
      card_status: r.card_status ?? null,
      voucher_count: r.voucher_count ?? null,
      voucher_batch: r.voucher_batch ?? null,
      voucher_serial_start: r.voucher_serial_start ?? null,
      voucher_serial_end: r.voucher_serial_end ?? null,
      voucher_status: r.voucher_status ?? null,
      voucher_handler: r.voucher_handler ?? null,
      voucher_start_date: r.voucher_start_date ?? null,
      voucher_note: r.voucher_note ?? null,
      voucher_address: r.voucher_address ?? null,
    }));
    const merged = [...ext, ...intl].sort((a, b) => {
      const av = a.signed_at ?? "";
      const bv = b.signed_at ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    });
    setRows(merged);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const effectiveSource = forcedSource ?? filterSource;
  const filtered = useMemo(() => rows.filter((r) => {
    if (effectiveSource !== "ALL" && r.source !== effectiveSource) return false;
    if (filterProject !== "ALL" && r.project_name !== filterProject) return false;
    if (filterStatus !== "ALL" && (r.voucher_status ?? "未寄出") !== filterStatus) return false;
    if (filterCard !== "ALL" && (r.card_status ?? "未完成") !== filterCard) return false;
    return true;
  }), [rows, effectiveSource, filterProject, filterStatus, filterCard]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { const n = r.project_name?.trim(); if (n) set.add(n); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const handlerOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { const n = r.sales_name?.trim(); if (n) set.add(n); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const nextSerialStart = useMemo(() => {
    let max = 0;
    rows.forEach((r) => { if (r.voucher_serial_end != null && r.voucher_serial_end > max) max = r.voucher_serial_end; });
    return max + 1;
  }, [rows]);

  const openDetail = (row: VoucherRow) => {
    setDetail(row);
    setEditing(false);
  };

  const startEdit = () => {
    if (!detail) return;
    const start = detail.voucher_serial_start ?? nextSerialStart;
    const count = detail.voucher_count ?? null;
    const end = count != null ? start + count - 1 : detail.voucher_serial_end ?? null;
    setForm({
      card_status: detail.card_status ?? "未完成",
      voucher_count: count,
      voucher_batch: detail.voucher_batch ?? "",
      voucher_serial_start: start,
      voucher_serial_end: end,
      voucher_status: detail.voucher_status ?? "未寄出",
      voucher_handler: detail.voucher_handler ?? "",
      voucher_start_date: detail.voucher_start_date ?? "",
      voucher_note: detail.voucher_note ?? "",
      voucher_address: detail.voucher_address ?? "",
    });
    setEditing(true);
  };

  const recalcEnd = (start: number | null | undefined, count: number | null | undefined) => {
    if (start == null || count == null) return null;
    return start + count - 1;
  };

  const updateField = (patch: Partial<VoucherRow>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if ("voucher_count" in patch || "voucher_serial_start" in patch) {
        next.voucher_serial_end = recalcEnd(next.voucher_serial_start ?? null, next.voucher_count ?? null);
      }
      return next;
    });
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    const payload = {
      card_status: form.card_status || null,
      voucher_count: form.voucher_count ?? null,
      voucher_batch: form.voucher_batch?.toString().trim() || null,
      voucher_serial_start: form.voucher_serial_start ?? null,
      voucher_serial_end: form.voucher_serial_end ?? null,
      voucher_status: form.voucher_status || null,
      voucher_handler: form.voucher_handler?.toString().trim() || null,
      voucher_start_date: form.voucher_start_date || null,
      voucher_note: form.voucher_note?.toString().trim() || null,
      voucher_address: form.voucher_address?.toString().trim() || null,
    };
    const table = detail.source === "internal" ? "franchise_orders" : "franchise_external_orders";
    const { error } = await supabase.from(table).update(payload).eq("id", detail.id);
    setSaving(false);
    if (error) { toast.error("儲存失敗"); return; }
    toast.success("已儲存");
    setEditing(false);
    setDetail(null);
    load();
  };

  const cardBadge = (s: string | null) => {
    const v = s ?? "未完成";
    return <Badge variant={v === "完成" ? "success" : "secondary"}>{v}</Badge>;
  };
  const statusBadge = (s: string | null) => {
    const v = s ?? "未寄出";
    return <Badge variant={v === "已寄出" ? "success" : "outline"}>{v}</Badge>;
  };

  return (
    <Card>
      <CardHeader><CardTitle>住宿券進度</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部專案</SelectItem>
              {projectOptions.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
            </SelectContent>
          </Select>
          {!hideSourceFilter && (
            <Select value={filterSource} onValueChange={(v) => setFilterSource(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部來源</SelectItem>
                <SelectItem value="internal">內部銷售</SelectItem>
                <SelectItem value="external">外部銷售</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={filterCard} onValueChange={setFilterCard}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部名片製作</SelectItem>
              <SelectItem value="完成">完成</SelectItem>
              <SelectItem value="未完成">未完成</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部狀態</SelectItem>
              <SelectItem value="未寄出">未寄出</SelectItem>
              <SelectItem value="已寄出">已寄出</SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">簽約日期</TableHead>
                <TableHead className="whitespace-nowrap">會員編號</TableHead>
                <TableHead className="whitespace-nowrap">會員姓名</TableHead>
                <TableHead className="whitespace-nowrap">名片製作</TableHead>
                <TableHead className="whitespace-nowrap">發放張數</TableHead>
                <TableHead className="whitespace-nowrap">狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">無資料</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow
                  key={`${r.source}-${r.id}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDetail(r)}
                >
                  <TableCell className="whitespace-nowrap">{r.signed_at ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.member_number ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.customer_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{cardBadge(r.card_status)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{r.voucher_count ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{statusBadge(r.voucher_status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Sheet open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setEditing(false); } }}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto overflow-x-hidden">
            <SheetHeader>
              <div className="flex items-center justify-between pr-8">
                <SheetTitle>{editing ? "編輯住宿券進度" : "住宿券進度明細"}</SheetTitle>
                {detail && !editing && canEdit && (
                  <Button size="sm" variant="outline" onClick={startEdit}>
                    <Pencil className="h-4 w-4 mr-1" /> 編輯
                  </Button>
                )}
              </div>
            </SheetHeader>
            {detail && !editing && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <Field label="簽約日期" value={detail.signed_at} />
                  <Field label="會員編號" value={detail.member_number} />
                  <Field label="會員姓名" value={detail.customer_name} />
                </div>

                <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">名片製作</div>
                    <div>{cardBadge(detail.card_status)}</div>
                  </div>
                  <Field label="發放張數" value={detail.voucher_count == null ? null : String(detail.voucher_count)} />
                  <Field label="編號（批號）" value={detail.voucher_batch} />
                  <Field label="序號範圍" value={formatSerialRange(detail.voucher_serial_start, detail.voucher_serial_end) || null} />
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">狀態</div>
                    <div>{statusBadge(detail.voucher_status)}</div>
                  </div>
                  <Field label="起始日" value={detail.voucher_start_date} />
                </div>

                <div className="border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <Field label="負責人" value={detail.voucher_handler} />
                  <Field label="更改寄件地址" value={detail.voucher_address} breakAll />
                  <div className="md:col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">備註</div>
                    <div className="text-sm whitespace-pre-wrap break-all">{detail.voucher_note ?? "—"}</div>
                  </div>
                </div>
              </div>
            )}
            {detail && editing && (
              <div className="space-y-3 py-4">
                <DetailRow label="簽約日期"><span>{detail.signed_at ?? "—"}</span></DetailRow>
                <DetailRow label="會員編號"><span>{detail.member_number ?? "—"}</span></DetailRow>
                <DetailRow label="會員姓名"><span>{detail.customer_name}</span></DetailRow>
                <DetailRow label="名片製作">
                  <Select value={(form.card_status as string) ?? "未完成"} onValueChange={(v) => updateField({ card_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="完成">完成</SelectItem>
                      <SelectItem value="未完成">未完成</SelectItem>
                    </SelectContent>
                  </Select>
                </DetailRow>
                <DetailRow label="發放張數">
                  <Input type="number" min={0} value={form.voucher_count ?? ""} onChange={(e) => updateField({ voucher_count: e.target.value === "" ? null : Number(e.target.value) })} />
                </DetailRow>
                <DetailRow label="編號(批號)">
                  <Input value={(form.voucher_batch as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, voucher_batch: e.target.value }))} />
                </DetailRow>
                <DetailRow label="序號起始">
                  <Input type="number" min={1} value={form.voucher_serial_start ?? ""} onChange={(e) => updateField({ voucher_serial_start: e.target.value === "" ? null : Number(e.target.value) })} />
                </DetailRow>
                <DetailRow label="序號範圍">
                  <span className="tabular-nums">{formatSerialRange(form.voucher_serial_start ?? null, form.voucher_serial_end ?? null) || "—"}</span>
                </DetailRow>
                <DetailRow label="狀態">
                  <Select value={(form.voucher_status as string) ?? "未寄出"} onValueChange={(v) => setForm((p) => ({ ...p, voucher_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未寄出">未寄出</SelectItem>
                      <SelectItem value="已寄出">已寄出</SelectItem>
                    </SelectContent>
                  </Select>
                </DetailRow>
                <DetailRow label="負責人">
                  <Select value={(form.voucher_handler as string) || "none"} onValueChange={(v) => setForm((p) => ({ ...p, voucher_handler: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="選擇負責人" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未指定</SelectItem>
                      {handlerOptions.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </DetailRow>
                <DetailRow label="起始日">
                  <Input type="date" value={(form.voucher_start_date as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, voucher_start_date: e.target.value }))} />
                </DetailRow>
                <DetailRow label="備註">
                  <Input value={(form.voucher_note as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, voucher_note: e.target.value }))} />
                </DetailRow>
                <DetailRow label="更改寄件地址">
                  <Input value={(form.voucher_address as string) ?? ""} onChange={(e) => setForm((p) => ({ ...p, voucher_address: e.target.value }))} />
                </DetailRow>
              </div>
            )}
            {detail && editing && (
              <SheetFooter>
                <Button variant="outline" onClick={() => setEditing(false)}>取消</Button>
                <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
              </SheetFooter>
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
