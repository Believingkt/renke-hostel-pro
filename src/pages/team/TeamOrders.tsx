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
import { Separator } from "@/components/ui/separator";
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
import { Pencil, Check, X, Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import ScoutDiscountCodesTab from "@/components/team/ScoutDiscountCodesTab";
import TeamCommissionStatsTab from "@/components/team/TeamCommissionStatsTab";
import CommissionRatesTab from "@/components/team/CommissionRatesTab";
import { getOrderSourceConfig } from "@/utils/orderHelpers";

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
  guest_phone: string | null;
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
  nickname?: string | null;
  deposit_confirm_date?: string | null;
  team_commission_price?: number | null;
  commission_price_confirmed_by?: string | null;
  commission_price_confirmed_at?: string | null;
}

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [franchiseFilter, setFranchiseFilter] = useState<string>("ALL");
  const [franchiseProjects, setFranchiseProjects] = useState<{ id: string; name: string }[]>([]);
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [closerOnly, setCloserOnly] = useState(true);
  const [closerFilter, setCloserFilter] = useState<string>("ALL"); // "ALL" | "NONE" | <user_id>
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState<number>(0);
  const [summary, setSummary] = useState<{ validCount: number; validSum: number; cancelledCount: number }>({
    validCount: 0,
    validSum: 0,
    cancelledCount: 0,
  });

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmerNameMap, setConfirmerNameMap] = useState<Record<string, string>>({});
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
  const [adVideoRules, setAdVideoRules] = useState<
    { keyword: string; video_creator_id: string; sort_order: number | null }[]
  >([]);
  const [adNameByAdId, setAdNameByAdId] = useState<Record<string, string>>({});

  function matchVideoCreatorByAdId(adId: string | null): string | null {
    if (!adId) return null;
    const adName = adNameByAdId[adId];
    if (!adName) return null;
    const lower = adName.toLowerCase();
    for (const r of adVideoRules) {
      if (r.keyword && lower.includes(r.keyword.toLowerCase())) {
        return r.video_creator_id;
      }
    }
    return null;
  }


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
      nickname: null,
      deposit_confirm_date: null,
      team_commission_price: null,
      commission_price_confirmed_by: null,
      commission_price_confirmed_at: null,
    };
  }

  useEffect(() => {
    loadAccommodations();
    loadMembers();
  }, []);

  // Debounce search input → search (server query keyword)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setPage(1);
  }, [accFilter, year, month, franchiseFilter, search, closerOnly, closerFilter, pageSize]);

  // Re-query whenever filters or pagination change
  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accFilter, year, month, franchiseFilter, search, closerOnly, closerFilter, page, pageSize]);

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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ad_video_creator_rules")
        .select("keyword, video_creator_id, sort_order")
        .order("sort_order", { ascending: true });
      setAdVideoRules(
        ((data ?? []) as any[]).filter((r) => r.keyword && r.video_creator_id),
      );
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meta_ads")
        .select("ad_id, ad_name");
      const map: Record<string, string> = {};
      for (const a of ((data ?? []) as Array<{ ad_id: string; ad_name: string | null }>)) {
        if (a.ad_id && a.ad_name) map[a.ad_id] = a.ad_name;
      }
      setAdNameByAdId(map);
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

  // Helper: page through a Supabase query to collect all rows (used for meta-side prefilter)
  async function fetchAllOrderIdsFromMeta(filters: {
    closerOnly: boolean;
    franchiseProject: string;
    closerFilter: string; // "ALL" | "NONE" | <user_id>
  }): Promise<string[]> {
    const ids: string[] = [];
    const SIZE = 1000;
    let from = 0;
    while (true) {
      let q = supabase.from("order_meta").select("order_id");
      if (filters.closerFilter === "NONE") {
        q = q.is("closer_id", null);
      } else if (filters.closerFilter !== "ALL") {
        q = q.eq("closer_id", filters.closerFilter);
      } else if (filters.closerOnly) {
        q = q.not("closer_id", "is", null);
      }
      if (filters.franchiseProject !== "ALL") q = q.eq("franchise_project", filters.franchiseProject);
      const { data, error } = await q.range(from, from + SIZE - 1);
      if (error) throw error;
      const batch = (data ?? []) as Array<{ order_id: string }>;
      for (const r of batch) if (r.order_id) ids.push(r.order_id);
      if (batch.length < SIZE) break;
      from += SIZE;
    }
    return ids;
  }

  async function loadOrders() {
    setLoading(true);
    try {
      // Step 1: meta-side prefilter (closerOnly / franchiseFilter / closerFilter)
      const needsMetaPrefilter = closerOnly || franchiseFilter !== "ALL" || closerFilter !== "ALL";
      let metaOrderIds: string[] | null = null;
      if (needsMetaPrefilter) {
        metaOrderIds = await fetchAllOrderIdsFromMeta({
          closerOnly,
          franchiseProject: franchiseFilter,
          closerFilter,
        });
        if (metaOrderIds.length === 0) {
          setOrders([]);
          setTotal(0);
          setSummary({ validCount: 0, validSum: 0, cancelledCount: 0 });
          return;
        }
      }

      // Helper: apply shared filters to any orders query
      const applyFilters = <T extends any>(qb: T): T => {
        let q: any = qb;
        q = q.neq("guest_name", "保留單").gt("final_price", 0);
        if (accFilter !== "ALL") q = q.eq("accommodation_id", accFilter);
        if (year !== "ALL") {
          const y = Number(year);
          if (month !== "ALL") {
            const m = Number(month);
            const startDay = `${y}-${String(m).padStart(2, "0")}-01`;
            const lastDay = new Date(y, m, 0).getDate();
            const endDay = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            q = q.gte("order_date", startDay).lte("order_date", endDay);
          } else {
            q = q.gte("order_date", `${y}-01-01`).lte("order_date", `${y}-12-31`);
          }
        }
        const s = search.trim();
        if (s) {
          const esc = s.replace(/[,()]/g, " ").trim();
          if (esc) {
            q = q.or(
              `order_number.ilike.%${esc}%,guest_name.ilike.%${esc}%,guest_phone.ilike.%${esc}%,discount_code.ilike.%${esc}%`
            );
          }
        }
        if (metaOrderIds) q = q.in("id", metaOrderIds);
        return q as T;
      };

      // Step 2: build paged orders query with exact count
      let q = applyFilters(
        supabase
          .from("orders")
          .select(
            `id, order_number, guest_name, guest_phone, check_in_date, check_out_date,
             final_price, discount_code, order_source, ota_channel, accommodation_id, order_date, created_at`,
            { count: "exact" }
          )
      );

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Summary queries (run in parallel with list query)
      const validSumQ = applyFilters(
        supabase.from("orders").select("final_price", { count: "exact" })
      ).neq("order_status", "cancelled");
      const cancelledQ = applyFilters(
        supabase.from("orders").select("id", { count: "exact", head: true })
      ).eq("order_status", "cancelled");

      const [ordersRes, validRes, cancelledRes] = await Promise.all([
        q.order("created_at", { ascending: false }).range(from, to),
        validSumQ,
        cancelledQ,
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (validRes.error) throw validRes.error;
      if (cancelledRes.error) throw cancelledRes.error;

      const pageRows = ordersRes.data || [];
      const totalCount = ordersRes.count ?? 0;
      const validSum = ((validRes.data || []) as any[]).reduce(
        (s, r) => s + Number(r.final_price || 0),
        0
      );
      setSummary({
        validCount: validRes.count ?? 0,
        validSum,
        cancelledCount: cancelledRes.count ?? 0,
      });

      // Step 3: fetch meta + accommodations for this page
      const orderIds = pageRows.map((o: any) => o.id);
      const [metaRes, accRes] = await Promise.all([
        orderIds.length
          ? supabase
              .from("order_meta")
              .select(
                `order_id, closer_id, video_creator_id, scout_id, traffic_source,
                 booking_method, ad_id, is_excluded, closer_assisted,
                 scout_commission_rate, closer_commission_rate, exclusion_note,
                 franchise_project, member_number, inquiry_date, voucher_used, voucher_count, addon_note, addon_amount,
                 nickname, deposit_confirm_date`
              )
              .in("order_id", orderIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from("accommodation_info").select("id, name"),
      ]);
      if (metaRes.error) throw metaRes.error;
      if (accRes.error) throw accRes.error;

      const metaMap = new Map<string, MetaRow>();
      ((metaRes.data || []) as any[]).forEach((m) => metaMap.set(m.order_id, m));

      const accMap = new Map<string, string>();
      (accRes.data || []).forEach((a: any) => accMap.set(a.id, a.name));

      const rows: OrderRow[] = pageRows.map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        guest_name: o.guest_name,
        guest_phone: o.guest_phone ?? null,
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
      setTotal(totalCount);
    } catch (e: any) {
      toast.error("載入訂單失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  // Static year options (2023 .. nextYear)
  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    const arr: string[] = [];
    for (let y = cur + 1; y >= 2023; y--) arr.push(String(y));
    return arr;
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  type SortKey = "inquiry" | "checkIn" | "checkOut" | "orderDate" | "depositConfirm" | "finalPrice";
  type SortDir = "asc" | "desc";
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const getSortVal = (o: OrderRow, key: SortKey): string | number | null => {
    switch (key) {
      case "inquiry": return o.meta?.inquiry_date ?? null;
      case "checkIn": return o.check_in_date ?? null;
      case "checkOut": return o.check_out_date ?? null;
      case "orderDate": return o.order_date ?? null;
      case "depositConfirm": return o.meta?.deposit_confirm_date ?? null;
      case "finalPrice": return Number(o.final_price || 0);
    }
  };

  const pageItems = useMemo(() => {
    if (!sort) return orders;
    const arr = [...orders];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = getSortVal(a, sort.key);
      const vb = getSortVal(b, sort.key);
      const aEmpty = va === null || va === undefined || va === "";
      const bEmpty = vb === null || vb === undefined || vb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1; // empty 永遠排最後
      if (bEmpty) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return arr;
  }, [orders, sort]);

  const SortableHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => {
    const active = sort?.key === k;
    const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => cycleSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
        </button>
      </TableHead>
    );
  };

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
      nickname: o.meta?.nickname ?? null,
      deposit_confirm_date: o.meta?.deposit_confirm_date ?? null,
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
        nickname: form.nickname ?? null,
        deposit_confirm_date: form.deposit_confirm_date ?? null,
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
        <div className="overflow-x-auto">
          <TabsList>
            {!isScout && <TabsTrigger value="orders">訂單列表</TabsTrigger>}
            <TabsTrigger value="scout-codes">星探專屬折扣碼</TabsTrigger>
            <TabsTrigger value="stats">成交統計</TabsTrigger>
            {(isAdmin || isCloser || isVideo) && <TabsTrigger value="commission-rates">民宿分潤比例</TabsTrigger>}
            {!isScout && <TabsTrigger value="settings">設定</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="orders" className="space-y-4">
          <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜尋訂單編號、客戶姓名、電話、折扣碼"
                className="pl-10 md:pl-10"
              />
            </div>
            <span className="text-sm text-muted-foreground shrink-0">目前顯示：</span>
            <Button
              type="button"
              size="sm"
              variant={closerOnly ? "default" : "outline"}
              className={`shrink-0 w-32 justify-center ${closerOnly ? "bg-orange-500 hover:bg-orange-600 text-white" : "text-muted-foreground"}`}
              onClick={() => {
                setCloserOnly((v) => {
                  const next = !v;
                  if (!next) setCloserFilter("ALL");
                  return next;
                });
                setPage(1);
              }}
            >
              {closerOnly ? "成交大師訂單" : "全部訂單"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

            <Select value={closerFilter} onValueChange={setCloserFilter} disabled={!closerOnly}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="成交組" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部成交組</SelectItem>
                {closers.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>


            <span className="text-sm text-muted-foreground ml-2">下單日：</span>

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
          </div>

          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <SortableHead k="inquiry" label="詢問日期" className="whitespace-nowrap" />
                  <SortableHead k="checkIn" label="入住日" className="whitespace-nowrap" />
                  <SortableHead k="checkOut" label="退房日" className="whitespace-nowrap" />
                  <TableHead className="whitespace-nowrap w-32 min-w-32 max-w-32">客戶暱稱</TableHead>
                  <TableHead className="whitespace-nowrap">客戶姓名</TableHead>
                  <TableHead className="whitespace-nowrap">電話</TableHead>
                  <SortableHead k="orderDate" label="訂購時間 (下單日)" className="whitespace-nowrap" />
                  <SortableHead k="depositConfirm" label="訂金確認日" className="whitespace-nowrap" />
                  <SortableHead k="finalPrice" label="總金額" className="whitespace-nowrap tabular-nums" />
                  <TableHead className="whitespace-nowrap">館別</TableHead>
                  <TableHead className="whitespace-nowrap">訂房方式</TableHead>
                  <TableHead className="whitespace-nowrap">備註</TableHead>
                  <TableHead className="whitespace-nowrap">來源</TableHead>
                  <TableHead className="whitespace-nowrap">來源管道</TableHead>
                  <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                  <TableHead className="whitespace-nowrap">成交組</TableHead>
                  <TableHead className="whitespace-nowrap">廣告編號</TableHead>
                  <TableHead className="whitespace-nowrap">影音組</TableHead>
                  <TableHead className="whitespace-nowrap">補充資料</TableHead>
                  <TableHead className="whitespace-nowrap w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                      載入中...
                    </TableCell>
                  </TableRow>
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((o) => {
                    const closerName = closers.find((m) => m.user_id === o.meta?.closer_id)?.display_name ?? "-";
                    const videoName = videos.find((m) => m.user_id === o.meta?.video_creator_id)?.display_name ?? "-";
                    return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openEdit(o)}
                    >
                      <TableCell className="whitespace-nowrap">{o.meta?.inquiry_date || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_in_date}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.check_out_date}</TableCell>
                      <TableCell className="w-32 min-w-32 max-w-32">
                        <div className="w-32 truncate" title={o.meta?.nickname || ""}>{o.meta?.nickname || "-"}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{o.guest_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.guest_phone || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-xs">
                        {o.order_date
                          ? new Date(o.order_date).toLocaleString("zh-TW", {
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
                      <TableCell className="whitespace-nowrap">{o.meta?.deposit_confirm_date || "-"}</TableCell>
                      <TableCell className="tabular-nums">${o.final_price?.toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.accommodation_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{bookingMap.get(o.meta?.booking_method ?? "") ?? o.meta?.booking_method ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap max-w-[200px] truncate" title={o.meta?.exclusion_note ?? ""}>{o.meta?.exclusion_note || "-"}</TableCell>
                      <TableCell>{(() => {
                        const cfg = getOrderSourceConfig(o.order_source ?? '');
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        );
                      })()}</TableCell>
                      <TableCell className="whitespace-nowrap">{trafficMap.get(o.meta?.traffic_source ?? "") ?? o.meta?.traffic_source ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{closerName}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.meta?.ad_id || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{videoName}</TableCell>
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
                            setIsEditing(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-2 rounded-md bg-muted/60 border px-3 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span>
              有效訂單：<span className="font-semibold text-foreground">{summary.validCount.toLocaleString()}</span> 筆
              <span className="text-muted-foreground">（排除取消）</span>
            </span>
            <span>
              有效訂單總金額：<span className="font-semibold text-primary">NT$ {summary.validSum.toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground">
              取消訂單：<span className="font-semibold text-foreground">{summary.cancelledCount.toLocaleString()}</span> 筆
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="text-sm text-muted-foreground">
              共 {total} 筆，第 {page} / {totalPages} 頁
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">每頁</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger className="w-20 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一頁
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
            <div className="overflow-y-auto px-4 pb-4 space-y-6">
              {/* ===== 訂單基本資訊 ===== */}
              <section className="space-y-3">
                <SectionTitle>訂單基本資訊</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <ReadField label="訂單編號" value={editOrder.order_number} />
                  <ReadField label="館別" value={editOrder.accommodation_name} />
                  <ReadField label="房客姓名" value={editOrder.guest_name} />
                  {isEditing ? (
                    <div className="space-y-2">
                      <Label className="text-sm">客戶暱稱</Label>
                      <Input
                        className="text-base"
                        value={form.nickname ?? ""}
                        placeholder="輸入客戶暱稱"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, nickname: e.target.value || null }))
                        }
                      />
                    </div>
                  ) : (
                    <ReadField label="客戶暱稱" value={form.nickname || "-"} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ReadField label="電話" value={editOrder.guest_phone || "-"} />
                  <ReadField
                    label="入住區間"
                    value={`${editOrder.check_in_date} ~ ${editOrder.check_out_date}`}
                  />
                </div>
                <ReadField
                  label="金額"
                  value={`$${editOrder.final_price?.toLocaleString()}`}
                />
              </section>

              <Separator />

              {!isEditing ? (
                <>
                  {/* ===== 行銷資訊（唯讀） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>行銷資訊</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      {/* 來源 / 折扣碼 */}
                      <div>
                        <div className="text-xs text-muted-foreground">來源</div>
                        <div className="mt-1">
                          {(() => {
                            const cfg = getOrderSourceConfig(editOrder.order_source ?? '');
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <ReadField label="折扣碼" value={editOrder.discount_code || "-"} />
                      {/* 訂房方式 / 來源管道 */}
                      <ReadField
                        label="訂房方式"
                        value={bookingMap.get(form.booking_method ?? '') ?? form.booking_method ?? '-'}
                      />
                      <ReadField
                        label="來源管道"
                        value={trafficMap.get(form.traffic_source ?? '') ?? form.traffic_source ?? '-'}
                      />
                      {/* 成交人 / 影音組 */}
                      <ReadField
                        label="成交人"
                        value={closers.find((m) => m.user_id === form.closer_id)?.display_name || "-"}
                      />
                      <ReadField
                        label="影音組"
                        value={videos.find((v) => v.user_id === form.video_creator_id)?.display_name || "-"}
                      />
                    </div>
                    {/* 廣告編號 全寬 */}
                    <ReadField label="廣告編號" value={form.ad_id || "-"} />
                  </section>

                  <Separator />

                  {/* ===== 時間資訊（唯讀） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>時間資訊</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <ReadField label="詢問日期" value={form.inquiry_date || "-"} />
                      <ReadField label="訂購時間 (下單日)" value={editOrder.order_date ? editOrder.order_date.slice(0, 10) : "-"} />
                      <ReadField label="訂金確認日" value={form.deposit_confirm_date || "-"} />
                    </div>
                  </section>

                  <Separator />

                  {/* ===== 特許加盟（唯讀） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>特許加盟</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <ReadField label="加盟專案" value={form.franchise_project || "-"} />
                      <ReadField label="會員編號" value={form.member_number || "-"} />
                      <ReadField label="加購備註" value={form.addon_note || "-"} />
                      <ReadField
                        label="加購金額"
                        value={form.addon_amount ? `$${Number(form.addon_amount).toLocaleString()}` : "-"}
                      />
                      <ReadField label="使用住宿券張數" value={String(form.voucher_count ?? 0)} />
                    </div>
                  </section>

                  <Separator />

                  {/* ===== 其他（唯讀） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>其他</SectionTitle>
                    <ReadField label="不分潤" value={form.is_excluded ? "是" : "否"} />
                    <ReadField label="備註" value={form.exclusion_note || "-"} />
                  </section>
                </>
              ) : (
                <>
                  {/* ===== 行銷資訊（編輯） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>行銷資訊</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 來源（唯讀標籤） */}
                      <div className="space-y-2">
                        <Label className="text-sm">來源</Label>
                        <div className="min-h-[48px] md:h-10 flex items-center px-4 md:px-3 py-3 md:py-2 rounded-lg border border-input bg-muted/40">
                          {(() => {
                            const cfg = getOrderSourceConfig(editOrder.order_source ?? '');
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 折扣碼（唯讀） */}
                      <div className="space-y-2">
                        <Label className="text-sm">折扣碼</Label>
                        <div className="min-h-[48px] md:h-10 flex items-center px-4 md:px-3 py-3 md:py-2 rounded-lg border border-input bg-muted/40 text-base md:text-sm">
                          {editOrder.discount_code || "-"}
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

                      {/* 影音組(唯讀) */}
                      <div className="space-y-2">
                        <Label className="text-sm">影音組</Label>
                        <div className="min-h-[48px] md:h-10 flex items-center px-4 md:px-3 py-3 md:py-2 rounded-lg border border-input bg-muted/40 text-base md:text-sm">
                          {videos.find((v) => v.user_id === form.video_creator_id)?.display_name || "-"}
                        </div>
                      </div>

                      {/* 廣告編號 全寬 */}
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-sm">廣告編號</Label>
                        <Input
                          className="text-base"
                          value={form.ad_id ?? ""}
                          onChange={(e) => {
                            const nextAdId = e.target.value || null;
                            const matched = matchVideoCreatorByAdId(nextAdId);
                            setForm((f) => ({
                              ...f,
                              ad_id: nextAdId,
                              video_creator_id: matched,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </section>

                  <Separator />

                  {/* ===== 時間資訊（編輯） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>時間資訊</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                      {/* 訂購時間（唯讀） */}
                      <div className="space-y-2">
                        <Label className="text-sm">訂購時間 (下單日)</Label>
                        <div className="min-h-[48px] md:h-10 flex items-center px-4 md:px-3 py-3 md:py-2 rounded-lg border border-input bg-muted/40 text-base md:text-sm">
                          {editOrder.order_date ? editOrder.order_date.slice(0, 10) : "-"}
                        </div>
                      </div>

                      {/* 訂金確認日 */}
                      <div className="space-y-2">
                        <Label className="text-sm">訂金確認日</Label>
                        <Input
                          type="date"
                          className="text-base"
                          value={form.deposit_confirm_date ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, deposit_confirm_date: e.target.value || null }))
                          }
                        />
                      </div>
                    </div>
                  </section>

                  <Separator />

                  {/* ===== 特許加盟（編輯） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>特許加盟</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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


                    </div>
                  </section>

                  <Separator />

                  {/* ===== 其他（編輯） ===== */}
                  <section className="space-y-3">
                    <SectionTitle>其他</SectionTitle>
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
                  </section>
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
                      nickname: editOrder.meta?.nickname ?? null,
                      deposit_confirm_date: editOrder.meta?.deposit_confirm_date ?? null,
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground tracking-wide">
      {children}
    </h3>
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
