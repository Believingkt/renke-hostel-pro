import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pencil, Check, X, Search } from "lucide-react";
import ScoutDiscountCodesTab from "@/components/team/ScoutDiscountCodesTab";
import TeamCommissionStatsTab from "@/components/team/TeamCommissionStatsTab";
import CommissionRatesTab from "@/components/team/CommissionRatesTab";

interface Member {
  user_id: string;
  display_name: string;
}

interface Accommodation {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  final_price: number;
  discount_code: string | null;
  order_source: string | null;
  ota_channel: string | null;
  accommodation_id: string;
  order_date: string | null;
  created_at: string;
  accommodation_name: string;
  meta: MetaRow | null;
}


interface MetaRow {
  closer_id: string | null;
  video_creator_id: string | null;
  scout_id: string | null;
  traffic_source: string | null;
  booking_method: string | null;
  ad_id: string | null;
  is_excluded: boolean | null;
  closer_assisted: boolean | null;
  scout_commission_rate: number | null;
  closer_commission_rate: number | null;
  exclusion_note?: string | null;
  franchise_project?: string | null;
  member_number?: string | null;
  inquiry_date?: string | null;
  voucher_used?: boolean | null;
  voucher_count?: number | null;
  addon_note?: string | null;
  addon_amount?: number | null;

}


interface MetaRow {
  closer_id: string | null;
  video_creator_id: string | null;
  scout_id: string | null;
  traffic_source: string | null;
  booking_method: string | null;
  ad_id: string | null;
  is_excluded: boolean | null;
  closer_assisted: boolean | null;
  scout_commission_rate: number | null;
  closer_commission_rate: number | null;
  exclusion_note?: string | null;
  franchise_project?: string | null;
  member_number?: string | null;
}

const PAGE_SIZE = 50;
const META_BATCH_SIZE = 100;

const TRAFFIC_OPTIONS = ["自然流量", "廣告", "KOL", "星探", "其他"];
const BOOKING_OPTIONS = ["官網", "電話", "Line", "現場", "其他"];

const NONE = "__none__";

const ORDER_SOURCE_LABEL: Record<string, string> = {
  'owner_provided': '業主自帶',
  'kol': 'KOL',
  'line': 'Line@',
  'agoda': 'Agoda',
  'booking': 'Booking',
  'trip': 'Trip',
  'travel_agency': '旅行社',
  'kol_exchange': 'KOL互惠',
  'starlink_member': '星鏈會員',
  'official': '官網訂房',
};

export default function TeamOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [closers, setClosers] = useState<Member[]>([]);
  const [videos, setVideos] = useState<Member[]>([]);
  const [scouts, setScouts] = useState<Member[]>([]);

  const [loading, setLoading] = useState(false);
  const [accFilter, setAccFilter] = useState<string>("ALL");
  const [year, setYear] = useState<string>("ALL");
  const [month, setMonth] = useState<string>("ALL");
  const [franchiseFilter, setFranchiseFilter] = useState<string>("ALL");
  const [franchiseProjects, setFranchiseProjects] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<MetaRow>(emptyMeta());
  const [saving, setSaving] = useState(false);

  // Tab + Settings
  const [tab, setTab] = useState<string>("orders");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isScout, setIsScout] = useState(false);
  const [isCloser, setIsCloser] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const [trafficSources, setTrafficSources] = useState<
    { id: string; name: string; is_active: boolean; sort_order: number | null }[]
  >([]);
  const [bookingMethods, setBookingMethods] = useState<
    { id: string; name: string; is_active: boolean; sort_order: number | null }[]
  >([]);
  const [newTraffic, setNewTraffic] = useState("");
  const [newBooking, setNewBooking] = useState("");
  const [editingTrafficId, setEditingTrafficId] = useState<string | null>(null);
  const [editingTrafficName, setEditingTrafficName] = useState("");
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editingBookingName, setEditingBookingName] = useState("");

  function emptyMeta(): MetaRow {
    return {
      closer_id: null,
      video_creator_id: null,
      scout_id: null,
      traffic_source: null,
      booking_method: null,
      ad_id: null,
      is_excluded: false,
      closer_assisted: false,
      scout_commission_rate: 0.05,
      closer_commission_rate: 0,
      exclusion_note: null,
      franchise_project: null,
      member_number: null,
      inquiry_date: null,
      voucher_used: false,
      voucher_count: 0,
      addon_note: null,
      addon_amount: 0,

    };
  }

  useEffect(() => {
    loadAccommodations();
    loadMembers();
  }, []);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [accFilter, year, month, franchiseFilter]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("franchise_projects")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      setFranchiseProjects((data ?? []) as { id: string; name: string }[]);
    })();
  }, []);


  // Load admin role + options for settings tab
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (uid) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const roleList = (roles ?? []).map((r: any) => r.role);
        const admin = roleList.some(
          (r: string) => r === "hotel_admin" || r === "super_admin",
        );
        const scout = roleList.some(
          (r: string) => r === "scout" || r === "scout_manager",
        );
        const closer = roleList.some((r: string) => r === "closer");
        const video = roleList.some((r: string) => r === "video");
        setIsAdmin(admin);
        setIsScout(scout && !admin);
        setIsCloser(closer);
        setIsVideo(video);
        if (scout && !admin) setTab("scout-codes");
      }
      loadOptions();
    })();
  }, []);

  async function loadOptions() {
    const [{ data: ts }, { data: bm }] = await Promise.all([
      supabase
        .from("traffic_sources")
        .select("id, name, is_active, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("booking_methods")
        .select("id, name, is_active, sort_order")
        .order("sort_order", { ascending: true }),
    ]);
    setTrafficSources((ts ?? []) as any);
    setBookingMethods((bm ?? []) as any);
  }

  async function handleAddOption(table: "traffic_sources" | "booking_methods") {
    const name = (table === "traffic_sources" ? newTraffic : newBooking).trim();
    if (!name) return;
    const list = table === "traffic_sources" ? trafficSources : bookingMethods;
    if (list.some((o) => o.name === name)) {
      toast.error("已有相同選項");
      return;
    }
    const maxOrder = list.reduce(
      (m, o) => Math.max(m, o.sort_order ?? 0),
      0,
    );
    const { error } = await supabase
      .from(table)
      .insert({ name, sort_order: maxOrder + 1 });
    if (error) {
      toast.error(error.message.includes("unique") ? "已有相同選項" : error.message);
      return;
    }
    toast.success("已新增");
    if (table === "traffic_sources") setNewTraffic("");
    else setNewBooking("");
    await loadOptions();
  }

  async function handleToggleActive(
    table: "traffic_sources" | "booking_methods",
    id: string,
    next: boolean,
  ) {
    const { error, count } = await supabase
      .from(table)
      .update({ is_active: next }, { count: "exact" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!count) {
      toast.error("無權限或更新失敗");
      return;
    }
    await loadOptions();
  }

  async function handleRenameOption(
    table: "traffic_sources" | "booking_methods",
    id: string,
    name: string,
  ) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = table === "traffic_sources" ? trafficSources : bookingMethods;
    if (list.some((o) => o.id !== id && o.name === trimmed)) {
      toast.error("已有相同選項");
      return;
    }
    const { error, count } = await supabase
      .from(table)
      .update({ name: trimmed }, { count: "exact" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!count) {
      toast.error("無權限或更新失敗");
      return;
    }
    if (table === "traffic_sources") {
      setEditingTrafficId(null);
      setEditingTrafficName("");
    } else {
      setEditingBookingId(null);
      setEditingBookingName("");
    }
    toast.success("已更新");
    await loadOptions();
  }



  async function loadAccommodations() {
    const { data } = await supabase
      .from("accommodation_info")
      .select("id, name")
      .order("name");
    setAccommodations(data || []);
  }

  async function loadMembers() {
    const [c, v, s] = await Promise.all([
      supabase.rpc("get_team_role_members", { p_role: "closer" as any }),
      supabase.rpc("get_team_role_members", { p_role: "video" as any }),
      supabase.rpc("get_team_role_members", { p_role: "scout" as any }),
    ]);
    setClosers((c.data as Member[]) || []);
    setVideos((v.data as Member[]) || []);
    setScouts((s.data as Member[]) || []);
  }

  async function loadOrders() {
    setLoading(true);
    try {
      const [ordersRes, accRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            `id, order_number, guest_name, check_in_date, check_out_date,
             final_price, discount_code, order_source, ota_channel, accommodation_id, order_date, created_at`
          )
          .neq("guest_name", "保留單")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("accommodation_info").select("id, name"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (accRes.error) throw accRes.error;

      const orderIds = (ordersRes.data || []).map((o: any) => o.id);
      let metaMap = new Map<string, MetaRow>();
      if (orderIds.length > 0) {
        const metaRows: any[] = [];
        for (let i = 0; i < orderIds.length; i += META_BATCH_SIZE) {
          const batchIds = orderIds.slice(i, i + META_BATCH_SIZE);
          const { data: metaData, error: metaErr } = await supabase
            .from("order_meta")
            .select(
              `order_id, closer_id, video_creator_id, scout_id, traffic_source,
               booking_method, ad_id, is_excluded, closer_assisted,
               scout_commission_rate, closer_commission_rate, exclusion_note,
               franchise_project, member_number, inquiry_date, voucher_used, voucher_count, addon_note, addon_amount`
            )
            .in("order_id", batchIds);
          if (metaErr) throw metaErr;
          metaRows.push(...(metaData || []));
        }
        metaRows.forEach((m: any) => metaMap.set(m.order_id, m));
      }

      const accMap = new Map<string, string>();
      (accRes.data || []).forEach((a: any) => accMap.set(a.id, a.name));

      const rows: OrderRow[] = (ordersRes.data || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        guest_name: o.guest_name,
        check_in_date: o.check_in_date,
        check_out_date: o.check_out_date,
        final_price: o.final_price,
        discount_code: o.discount_code,
        order_source: o.order_source,
        ota_channel: o.ota_channel,
        accommodation_id: o.accommodation_id,
        order_date: o.order_date ?? null,
        created_at: o.created_at,
        accommodation_name: accMap.get(o.accommodation_id) || "-",
        meta: metaMap.get(o.id) || null,
      }));
      setOrders(rows);
    } catch (e: any) {
      toast.error("載入訂單失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  const years = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) =>
      set.add(String(new Date(o.check_in_date).getFullYear()))
    );
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (accFilter !== "ALL" && o.accommodation_id !== accFilter) return false;
      const d = new Date(o.check_in_date);
      if (year !== "ALL" && String(d.getFullYear()) !== year) return false;
      if (month !== "ALL" && String(d.getMonth() + 1) !== month) return false;
      if (franchiseFilter !== "ALL" && (o.meta?.franchise_project ?? "") !== franchiseFilter) return false;
      if (q) {
        const closerName = closers.find((m) => m.user_id === o.meta?.closer_id)?.display_name ?? "";
        const videoName = videos.find((m) => m.user_id === o.meta?.video_creator_id)?.display_name ?? "";
        const hay = [
          o.order_number,
          o.guest_name,
          o.discount_code ?? "",
          closerName,
          videoName,
          o.meta?.member_number ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, accFilter, year, month, franchiseFilter, search, closers, videos]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openEdit(o: OrderRow) {
    setEditOrder(o);
    setForm({
      closer_id: o.meta?.closer_id ?? null,
      video_creator_id: o.meta?.video_creator_id ?? null,
      scout_id: o.meta?.scout_id ?? null,
      traffic_source: o.meta?.traffic_source ?? null,
      booking_method: o.meta?.booking_method ?? null,
      ad_id: o.meta?.ad_id ?? null,
      is_excluded: o.meta?.is_excluded ?? false,
      closer_assisted: o.meta?.closer_assisted ?? false,
      scout_commission_rate: o.meta?.scout_commission_rate ?? 0.05,
      closer_commission_rate: o.meta?.closer_commission_rate ?? 0,
      exclusion_note: o.meta?.exclusion_note ?? null,
      franchise_project: o.meta?.franchise_project ?? null,
      member_number: o.meta?.member_number ?? null,
      inquiry_date: o.meta?.inquiry_date ?? null,
      voucher_used: o.meta?.voucher_used ?? false,
      voucher_count: o.meta?.voucher_count ?? 0,
      addon_note: o.meta?.addon_note ?? null,
      addon_amount: o.meta?.addon_amount ?? 0,

    });
    setIsEditing(false);
    setEditOpen(true);
  }

  function toggleCloserAssisted(checked: boolean) {
    setForm((f) => ({
      ...f,
      closer_assisted: checked,
      scout_commission_rate: checked ? 0.02 : 0.05,
      closer_commission_rate: checked ? 0.03 : 0,
    }));
  }

  async function handleSave() {
    if (!editOrder) return;
    setSaving(true);
    try {
      const payload = {
        order_id: editOrder.id,
        accommodation_id: editOrder.accommodation_id,
        closer_id: form.closer_id,
        video_creator_id: form.video_creator_id,
        scout_id: form.scout_id,
        traffic_source: form.traffic_source,
        booking_method: form.booking_method,
        ad_id: form.ad_id,

        is_excluded: !!form.is_excluded,
        closer_assisted: !!form.closer_assisted,
        scout_commission_rate: form.scout_commission_rate,
        closer_commission_rate: form.closer_commission_rate,
        exclusion_note: form.exclusion_note,
        franchise_project: form.franchise_project,
        member_number: form.member_number,
        inquiry_date: form.inquiry_date,
        voucher_used: !!form.voucher_used,
        voucher_count: Number.isFinite(form.voucher_count as number)
          ? Math.max(0, Math.trunc(form.voucher_count as number))
          : 0,
        addon_note: form.addon_note,
        addon_amount: form.addon_amount ?? 0,

      };

      const exists = !!editOrder.meta;
      if (exists) {
        const { error } = await supabase
          .from("order_meta")
          .update(payload)
          .eq("order_id", editOrder.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("order_meta").insert(payload);
        if (error) throw error;
      }
      toast.success("已儲存");
      setIsEditing(false);
      await loadOrders();
    } catch (e: any) {
      toast.error("儲存失敗：" + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  const trafficMap = new Map(trafficSources.map((t) => [t.id, t.name]));
  const bookingMap = new Map(bookingMethods.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成交大師</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          {!isScout && <TabsTrigger value="orders">訂單列表</TabsTrigger>}
          <TabsTrigger value="scout-codes">星探專屬折扣碼</TabsTrigger>
          <TabsTrigger value="stats">成交統計</TabsTrigger>
          {(isAdmin || isCloser || isVideo) && <TabsTrigger value="commission-rates">民宿分潤比例</TabsTrigger>}
          {!isScout && <TabsTrigger value="settings">設定</TabsTrigger>}
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="搜尋訂單編號、房客姓名、折扣碼、成交人、影音組、會員編號"
              className="pl-10 md:pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={accFilter} onValueChange={setAccFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="館別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部館別</SelectItem>
                {accommodations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部年份</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="月份" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部月份</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m} 月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={franchiseFilter} onValueChange={setFranchiseFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="加盟專案" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部加盟專案</SelectItem>
                {franchiseProjects.map((p) => (
                  <SelectItem key={p.id} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                  <TableHead className="whitespace-nowrap">訂購時間</TableHead>
                  <TableHead className="whitespace-nowrap">館別</TableHead>
                  <TableHead className="whitespace-nowrap">房客姓名</TableHead>
                  <TableHead className="whitespace-nowrap">入住日</TableHead>
                  <TableHead className="whitespace-nowrap">退房日</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    訂單金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                  <TableHead className="whitespace-nowrap">來源</TableHead>
                  <TableHead className="whitespace-nowrap">來源管道</TableHead>
                  <TableHead className="whitespace-nowrap">訂房方式</TableHead>
                  <TableHead className="whitespace-nowrap">補充資料</TableHead>
                  <TableHead className="whitespace-nowrap w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      載入中...
                    </TableCell>
                  </TableRow>
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openEdit(o)}
                    >
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-xs">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleString("zh-TW", {
                              timeZone: "Asia/Taipei",
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{o.accommodation_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.guest_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_in_date}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_out_date}</TableCell>
                      <TableCell className="tabular-nums">${o.final_price?.toLocaleString()}</TableCell>
                      <TableCell>{o.discount_code || "-"}</TableCell>
                      <TableCell>{ORDER_SOURCE_LABEL[o.order_source ?? ''] ?? o.order_source ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{trafficMap.get(o.meta?.traffic_source ?? "") ?? o.meta?.traffic_source ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{bookingMap.get(o.meta?.booking_method ?? "") ?? o.meta?.booking_method ?? "-"}</TableCell>
                      <TableCell>
                        {o.meta ? (
                          <Badge variant="default">已填</Badge>
                        ) : (
                          <Badge variant="outline">未填</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
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

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              共 {filtered.length} 筆，第 {page} / {totalPages} 頁
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一頁
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一頁
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="scout-codes" className="space-y-4">
          <ScoutDiscountCodesTab />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <TeamCommissionStatsTab />
        </TabsContent>

        {(isAdmin || isCloser || isVideo) && (
          <TabsContent value="commission-rates" className="space-y-4">
            <CommissionRatesTab readOnly={!isAdmin && !isCloser} />
          </TabsContent>
        )}





        <TabsContent value="settings" className="space-y-4">
          <OptionsCard
            title="來源管道"
            items={trafficSources}
            isAdmin={isAdmin}
            newValue={newTraffic}
            setNewValue={setNewTraffic}
            onAdd={() => handleAddOption("traffic_sources")}
            onToggle={(id, next) => handleToggleActive("traffic_sources", id, next)}
            editingId={editingTrafficId}
            editingName={editingTrafficName}
            onStartEdit={(id, name) => {
              setEditingTrafficId(id);
              setEditingTrafficName(name);
            }}
            onCancelEdit={() => {
              setEditingTrafficId(null);
              setEditingTrafficName("");
            }}
            onChangeEditName={setEditingTrafficName}
            onSaveEdit={(id) => handleRenameOption("traffic_sources", id, editingTrafficName)}
          />
          <OptionsCard
            title="訂房方式"
            items={bookingMethods}
            isAdmin={isAdmin}
            newValue={newBooking}
            setNewValue={setNewBooking}
            onAdd={() => handleAddOption("booking_methods")}
            onToggle={(id, next) => handleToggleActive("booking_methods", id, next)}
            editingId={editingBookingId}
            editingName={editingBookingName}
            onStartEdit={(id, name) => {
              setEditingBookingId(id);
              setEditingBookingName(name);
            }}
            onCancelEdit={() => {
              setEditingBookingId(null);
              setEditingBookingName("");
            }}
            onChangeEditName={setEditingBookingName}
            onSaveEdit={(id) => handleRenameOption("booking_methods", id, editingBookingName)}
          />
        </TabsContent>
      </Tabs>

      <Sheet
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setIsEditing(false);
            setEditOrder(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto overflow-x-hidden">
          <SheetHeader>
            <div className="flex items-center justify-between pr-8">
              <SheetTitle>補充行銷資訊</SheetTitle>
              {!isEditing && (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  編輯
                </Button>
              )}
            </div>
          </SheetHeader>

          {editOrder && (
            <div className="overflow-y-auto px-4 pb-4 space-y-4">
              {/* 訂單基本資訊 */}
              <div className="p-3 rounded-md bg-muted/40 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <ReadField label="訂單編號" value={editOrder.order_number} />
                  <ReadField label="館別" value={editOrder.accommodation_name} />
                  <ReadField label="房客姓名" value={editOrder.guest_name} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ReadField
                    label="入住區間"
                    value={`${editOrder.check_in_date} ~ ${editOrder.check_out_date}`}
                  />
                  <ReadField
                    label="金額"
                    value={`$${editOrder.final_price?.toLocaleString()}`}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <ReadField
                    label="來源"
                    value={ORDER_SOURCE_LABEL[editOrder.order_source ?? ''] ?? editOrder.order_source ?? '-'}
                  />
                  <ReadField
                    label="訂房方式"
                    value={bookingMap.get(editOrder.meta?.booking_method ?? '') ?? editOrder.meta?.booking_method ?? '-'}
                  />
                  <ReadField
                    label="來源管道"
                    value={trafficMap.get(editOrder.meta?.traffic_source ?? '') ?? editOrder.meta?.traffic_source ?? '-'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ReadField label="折扣碼" value={editOrder.discount_code || "-"} />
                  <ReadField label="下單日" value={editOrder.order_date ? editOrder.order_date.slice(0, 10) : "-"} />
                </div>
              </div>

              {!isEditing ? (
                /* 唯讀模式：補充行銷資訊摘要 */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <ReadField
                      label="成交人"
                      value={closers.find((m) => m.user_id === form.closer_id)?.display_name || "-"}
                    />
                    <ReadField label="詢問日期" value={form.inquiry_date || "-"} />
                    <ReadField label="廣告編號" value={form.ad_id || "-"} />
                    <ReadField
                      label="影音組"
                      value={videos.find((v) => v.user_id === form.video_creator_id)?.display_name || "-"}
                    />
                    <ReadField
                      label="訂房方式"
                      value={bookingMap.get(form.booking_method ?? '') ?? form.booking_method ?? '-'}
                    />
                    <ReadField
                      label="來源管道"
                      value={trafficMap.get(form.traffic_source ?? '') ?? form.traffic_source ?? '-'}
                    />
                    <ReadField label="加盟專案" value={form.franchise_project || "-"} />
                    <ReadField label="會員編號" value={form.member_number || "-"} />
                    <ReadField label="加購備註" value={form.addon_note || "-"} />
                    <ReadField
                      label="加購金額"
                      value={form.addon_amount ? `$${Number(form.addon_amount).toLocaleString()}` : "-"}
                    />
                    <ReadField label="使用住宿券張數" value={String(form.voucher_count ?? 0)} />
                    <ReadField label="不分潤" value={form.is_excluded ? "是" : "否"} />
                  </div>
                  <ReadField label="備註" value={form.exclusion_note || "-"} />
                </div>
              ) : (
                <>
                  {/* 編輯欄位 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 成交人 */}

                    <div className="space-y-2">
                      <Label className="text-sm">成交人</Label>
                      <Select
                        value={form.closer_id ?? NONE}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, closer_id: v === NONE ? null : v }))
                        }
                      >
                        <SelectTrigger className="text-base">
                          <SelectValue placeholder="選擇成交人" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>未指定</SelectItem>
                          {closers.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 詢問日期 */}
                    <div className="space-y-2">
                      <Label className="text-sm">詢問日期</Label>
                      <Input
                        type="date"
                        className="text-base"
                        value={form.inquiry_date ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, inquiry_date: e.target.value || null }))
                        }
                      />
                    </div>

                    {/* 廣告編號 */}
                    <div className="space-y-2">
                      <Label className="text-sm">廣告編號</Label>
                      <Input
                        className="text-base"
                        value={form.ad_id ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ad_id: e.target.value || null }))
                        }
                      />
                    </div>

                    {/* 影音組(唯讀) */}
                    <div className="space-y-2">
                      <Label className="text-sm">影音組</Label>
                      <div className="min-h-[48px] md:h-10 flex items-center px-4 md:px-3 py-3 md:py-2 rounded-lg border border-input bg-muted/40 text-base md:text-sm">
                        {videos.find((v) => v.user_id === form.video_creator_id)?.display_name || "-"}
                      </div>
                    </div>

                    {/* 訂房方式 */}
                    <div className="space-y-2">
                      <Label className="text-sm">訂房方式</Label>
                      <Select
                        value={form.booking_method ?? NONE}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, booking_method: v === NONE ? null : v }))
                        }
                      >
                        <SelectTrigger className="text-base">
                          <SelectValue placeholder="選擇訂房方式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>未指定</SelectItem>
                          {bookingMethods.filter((o) => o.is_active).map((o) => (
                            <SelectItem key={o.id} value={o.name}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 來源管道 */}
                    <div className="space-y-2">
                      <Label className="text-sm">來源管道</Label>
                      <Select
                        value={form.traffic_source ?? NONE}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, traffic_source: v === NONE ? null : v }))
                        }
                      >
                        <SelectTrigger className="text-base">
                          <SelectValue placeholder="選擇來源管道" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>未指定</SelectItem>
                          {trafficSources.filter((o) => o.is_active).map((o) => (
                            <SelectItem key={o.id} value={o.name}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 加盟專案 */}
                    <div className="space-y-2">
                      <Label className="text-sm">加盟專案</Label>
                      <Select
                        value={form.franchise_project ?? NONE}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            franchise_project: v === NONE ? null : v,
                          }))
                        }
                      >
                        <SelectTrigger className="text-base">
                          <SelectValue placeholder="選擇加盟專案" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>未指定</SelectItem>
                          {franchiseProjects.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 會員編號 */}
                    <div className="space-y-2">
                      <Label className="text-sm">會員編號</Label>
                      <Input
                        className="text-base"
                        value={form.member_number ?? ""}
                        placeholder="輸入會員編號"
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            member_number: e.target.value || null,
                          }))
                        }
                      />
                    </div>

                    {/* 加購備註 */}
                    <div className="space-y-2">
                      <Label className="text-sm">加購備註</Label>
                      <Input
                        className="text-base"
                        value={form.addon_note ?? ""}
                        placeholder="輸入加購備註"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, addon_note: e.target.value || null }))
                        }
                      />
                    </div>

                    {/* 加購金額 */}
                    <div className="space-y-2">
                      <Label className="text-sm">加購金額</Label>
                      <Input
                        type="number"
                        className="text-base"
                        value={form.addon_amount ?? 0}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            addon_amount: e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* 使用住宿券張數 */}
                  <div className="space-y-2">
                    <Label htmlFor="voucher_count" className="text-sm">使用住宿券張數</Label>
                    <Input
                      id="voucher_count"
                      type="number"
                      min={0}
                      step={1}
                      className="text-base"
                      value={form.voucher_count ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          voucher_count:
                            e.target.value === ""
                              ? 0
                              : Math.max(0, Math.trunc(Number(e.target.value))),
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_excluded"
                      checked={!!form.is_excluded}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, is_excluded: !!v }))
                      }
                    />
                    <Label htmlFor="is_excluded" className="cursor-pointer text-sm">
                      不分潤
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">備註</Label>
                    <Textarea
                      rows={3}
                      value={form.exclusion_note ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          exclusion_note: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {isEditing && (
            <SheetFooter className="flex-row justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (editOrder) {
                    // 重置 form 為原始值
                    setForm({
                      closer_id: editOrder.meta?.closer_id ?? null,
                      video_creator_id: editOrder.meta?.video_creator_id ?? null,
                      scout_id: editOrder.meta?.scout_id ?? null,
                      traffic_source: editOrder.meta?.traffic_source ?? null,
                      booking_method: editOrder.meta?.booking_method ?? null,
                      ad_id: editOrder.meta?.ad_id ?? null,
                      is_excluded: editOrder.meta?.is_excluded ?? false,
                      closer_assisted: editOrder.meta?.closer_assisted ?? false,
                      scout_commission_rate: editOrder.meta?.scout_commission_rate ?? 0.05,
                      closer_commission_rate: editOrder.meta?.closer_commission_rate ?? 0,
                      exclusion_note: editOrder.meta?.exclusion_note ?? null,
                      franchise_project: editOrder.meta?.franchise_project ?? null,
                      member_number: editOrder.meta?.member_number ?? null,
                      inquiry_date: editOrder.meta?.inquiry_date ?? null,
                      voucher_used: editOrder.meta?.voucher_used ?? false,
                      voucher_count: editOrder.meta?.voucher_count ?? 0,
                      addon_note: editOrder.meta?.addon_note ?? null,
                      addon_amount: editOrder.meta?.addon_amount ?? 0,
                    });
                  }
                  setIsEditing(false);
                }}
              >
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-medium">{value}</div>
    </div>
  );
}


interface OptionItem {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number | null;
}

interface OptionsCardProps {
  title: string;
  items: OptionItem[];
  isAdmin: boolean;
  newValue: string;
  setNewValue: (v: string) => void;
  onAdd: () => void;
  onToggle: (id: string, next: boolean) => void;
  editingId: string | null;
  editingName: string;
  onStartEdit: (id: string, name: string) => void;
  onCancelEdit: () => void;
  onChangeEditName: (v: string) => void;
  onSaveEdit: (id: string) => void;
}

function OptionsCard({
  title,
  items,
  isAdmin,
  newValue,
  setNewValue,
  onAdd,
  onToggle,
  editingId,
  editingName,
  onStartEdit,
  onCancelEdit,
  onChangeEditName,
  onSaveEdit,
}: OptionsCardProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">
            共 {items.length} 個選項
          </span>
        </div>

        <Table className="fixed-table">
          <TableHeader>
            <TableRow>
              <TableHead>名稱</TableHead>
              <TableHead className="w-28">狀態</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                  尚無選項
                </TableCell>
              </TableRow>
            ) : (
              items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    {editingId === o.id ? (
                      <Input
                        value={editingName}
                        onChange={(e) => onChangeEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSaveEdit(o.id);
                          if (e.key === "Escape") onCancelEdit();
                        }}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className={!o.is_active ? "text-muted-foreground line-through" : ""}>
                        {o.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={o.is_active}
                          onCheckedChange={(v) => onToggle(o.id, !!v)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {o.is_active ? "啟用" : "停用"}
                        </span>
                      </div>
                    ) : (
                      <Badge variant={o.is_active ? "default" : "outline"}>
                        {o.is_active ? "啟用" : "停用"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      editingId === o.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onSaveEdit(o.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={onCancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onStartEdit(o.id, o.name)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isAdmin && (
          <div className="flex gap-2 border-t pt-4">
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
              placeholder={`新增${title}`}
              className="h-9"
            />
            <Button onClick={onAdd} disabled={!newValue.trim()}>
              新增
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
