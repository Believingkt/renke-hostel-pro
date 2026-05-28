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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
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
import { Pencil, Check, X } from "lucide-react";
import ScoutDiscountCodesTab from "@/components/team/ScoutDiscountCodesTab";

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
}

const PAGE_SIZE = 50;
const META_BATCH_SIZE = 100;

const TRAFFIC_OPTIONS = ["自然流量", "廣告", "KOL", "星探", "其他"];
const BOOKING_OPTIONS = ["官網", "電話", "Line", "現場", "其他"];

const NONE = "__none__";

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
  const [page, setPage] = useState(1);

  const [editOpen, setEditOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [form, setForm] = useState<MetaRow>(emptyMeta());
  const [saving, setSaving] = useState(false);

  // Tab + Settings
  const [tab, setTab] = useState<string>("orders");
  const [isAdmin, setIsAdmin] = useState(false);
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
        const admin = (roles ?? []).some(
          (r: any) => r.role === "hotel_admin" || r.role === "super_admin",
        );
        setIsAdmin(admin);
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
             final_price, discount_code, order_source, ota_channel, accommodation_id, created_at`
          )

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
               franchise_project, member_number`
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
    return orders.filter((o) => {
      if (accFilter !== "ALL" && o.accommodation_id !== accFilter) return false;
      const d = new Date(o.check_in_date);
      if (year !== "ALL" && String(d.getFullYear()) !== year) return false;
      if (month !== "ALL" && String(d.getMonth() + 1) !== month) return false;
      if (franchiseFilter !== "ALL" && (o.meta?.franchise_project ?? "") !== franchiseFilter) return false;
      return true;
    });
  }, [orders, accFilter, year, month, franchiseFilter]);

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
    });
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
        ad_id: form.ad_id,

        is_excluded: !!form.is_excluded,
        closer_assisted: !!form.closer_assisted,
        scout_commission_rate: form.scout_commission_rate,
        closer_commission_rate: form.closer_commission_rate,
        exclusion_note: form.exclusion_note,
        franchise_project: form.franchise_project,
        member_number: form.member_number,
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
      setEditOpen(false);
      setEditOrder(null);
      await loadOrders();
    } catch (e: any) {
      toast.error("儲存失敗：" + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成交大師</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">訂單列表</TabsTrigger>
          <TabsTrigger value="scout-codes">星探專屬折扣碼</TabsTrigger>
          <TabsTrigger value="settings">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
        <CardContent className="p-4 space-y-4">
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
                  <TableHead className="whitespace-nowrap">館別</TableHead>
                  <TableHead className="whitespace-nowrap">房客姓名</TableHead>
                  <TableHead className="whitespace-nowrap">入住日</TableHead>
                  <TableHead className="whitespace-nowrap">退房日</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    訂單金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                  <TableHead className="whitespace-nowrap">來源</TableHead>
                  <TableHead className="whitespace-nowrap">補充資料</TableHead>
                  <TableHead className="whitespace-nowrap w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      載入中...
                    </TableCell>
                  </TableRow>
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="whitespace-nowrap">{o.accommodation_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.guest_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_in_date}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_out_date}</TableCell>
                      <TableCell className="tabular-nums">${o.final_price?.toLocaleString()}</TableCell>
                      <TableCell>{o.discount_code || "-"}</TableCell>
                      <TableCell>{o.order_source || "-"}</TableCell>
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

      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>補充行銷資訊</DrawerTitle>
          </DrawerHeader>

          {editOrder && (
            <div className="overflow-y-auto px-4 pb-4 space-y-4">
              {/* 訂單基本資訊 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-md bg-muted/40">
                <ReadField label="訂單編號" value={editOrder.order_number} />
                <ReadField label="館別" value={editOrder.accommodation_name} />
                <ReadField label="房客姓名" value={editOrder.guest_name} />
                <ReadField
                  label="入住區間"
                  value={`${editOrder.check_in_date} ~ ${editOrder.check_out_date}`}
                />
                <ReadField
                  label="金額"
                  value={`$${editOrder.final_price?.toLocaleString()}`}
                />
                <ReadField label="折扣碼" value={editOrder.discount_code || "-"} />
                <ReadField label="來源" value={editOrder.order_source || "-"} />
                <ReadField label="訂房方式" value={editOrder.ota_channel || "-"} />
              </div>


              {/* 編輯欄位 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div className="space-y-2">
                  <Label className="text-sm">影音組</Label>
                  <Select
                    value={form.video_creator_id ?? NONE}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        video_creator_id: v === NONE ? null : v,
                      }))
                    }
                  >
                    <SelectTrigger className="text-base">
                      <SelectValue placeholder="選擇影音組" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>未指定</SelectItem>
                      {videos.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">

                  <Label className="text-sm">廣告編號</Label>
                  <Input className="text-base"
                    value={form.ad_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ad_id: e.target.value || null }))
                    }
                  />
                </div>

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
            </div>
          )}

          <DrawerFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
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
