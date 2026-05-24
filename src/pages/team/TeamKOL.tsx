import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, AlertTriangle, Check, X, Pencil, ExternalLink, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ====== 型別 & 常數 ======
type BookingStatus =
  | "invited"
  | "booked"
  | "checked_in"
  | "cancelled"
  | "rejected"
  | "on_hold";

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  invited: "邀約中",
  booked: "成功訂房",
  checked_in: "已入住",
  cancelled: "已取消",
  rejected: "已拒絕",
  on_hold: "暫緩",
};

const BOOKING_STATUS_CLASS: Record<BookingStatus, string> = {
  invited: "bg-blue-100 text-blue-700 border-blue-200",
  booked: "bg-green-100 text-green-700 border-green-200",
  checked_in: "bg-gray-200 text-gray-700 border-gray-300",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  rejected: "bg-red-200 text-red-900 border-red-300",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
};

const RARITY_OPTIONS = ["N", "R", "SR", "SSR", "UR", "ck"] as const;
type Rarity = (typeof RARITY_OPTIONS)[number];

const RARITY_CLASS: Record<Rarity, string> = {
  N: "bg-slate-100 text-slate-700 border-slate-200",
  R: "bg-sky-100 text-sky-700 border-sky-200",
  SR: "bg-violet-100 text-violet-700 border-violet-200",
  SSR: "bg-amber-100 text-amber-800 border-amber-300",
  UR: "bg-rose-100 text-rose-700 border-rose-300",
  ck: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

interface Accommodation {
  id: string;
  name: string;
  booking_type: string;
  short_url_alias: string | null;
}

interface KolVenue {
  id: string;
  name: string;
  type: string | null;
  is_active: boolean;
}

// 館別下拉的合併選項
interface VenueOption {
  // 複合 value：PMS 用 "acc:<uuid>"，自訂場域用 "venue:<name>"
  value: string;
  label: string;
  source: "pms" | "venue";
  badge: string; // 小標籤文字
  accommodation_id: string | null; // PMS 時為 uuid，venue 時 null
  venue_name: string | null;       // venue 時為名稱，PMS 時 null
}

interface Scout {
  user_id: string;
  display_name: string;
}

interface KolRow {
  id: string;
  accommodation_id: string | null;
  venue_name: string | null;
  name: string | null;
  ig_handle: string | null;
  ig_url: string | null;
  rarity: string | null;
  scout_id: string | null;
  cid_code: string | null;
  short_url: string | null;
  lihi_url: string | null;
  invited_at: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  day_of_week: string | null;
  inventory_status: string | null;
  booking_status: string | null;
  contract_progress: string | null;
  contract_file_url: string | null;
  task_pre_stay: boolean | null;
  task_post_story: boolean | null;
  task_ig_collab: boolean | null;
  publish_url: string | null;
  publish_date: string | null;
  kol_tags: string[] | null;
  order_number: string | null;
  inventory_count: number | null;
  kpi_qualified: boolean | null;
  is_error: boolean | null;
  error_note: string | null;
  created_by: string | null;
  created_at: string | null;
  // 顯示用
  _accommodation_name?: string;
  _scout_name?: string;
}

interface FormState {
  id?: string;
  // 複合下拉選中的 value（"acc:<uuid>" 或 "venue:<name>"）
  accommodation_select: string;
  accommodation_id: string;
  venue_name: string;
  name: string;
  ig_handle: string;
  rarity: string;
  scout_id: string;
  invited_at: string;
  check_in_date: string;
  check_out_date: string;
  day_of_week: string;
  inventory_status: string;
  booking_status: BookingStatus;
  cid_code: string;
  short_url: string;
  contract_progress: string;
  contract_file_url: string;
  task_pre_stay: boolean;
  task_post_story: boolean;
  task_ig_collab: boolean;
  publish_url: string;
  publish_date: string;
  order_number: string;
  inventory_count: string;
  kol_tags: string[];
  kpi_qualified: boolean;
}

const EMPTY_FORM: FormState = {
  accommodation_select: "",
  accommodation_id: "",
  venue_name: "",
  name: "",
  ig_handle: "",
  rarity: "ck",
  scout_id: "",
  invited_at: "",
  check_in_date: "",
  check_out_date: "",
  day_of_week: "",
  inventory_status: "",
  booking_status: "invited",
  cid_code: "",
  short_url: "",
  contract_progress: "",
  contract_file_url: "",
  task_pre_stay: false,
  task_post_story: false,
  task_ig_collab: false,
  publish_url: "",
  publish_date: "",
  order_number: "",
  inventory_count: "",
  kol_tags: [],
  kpi_qualified: false,
};

interface RaritySetting {
  rarity: string;
  fan_range_desc: string | null;
  bonus_amount: number;
  effective_from: string;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNullable(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

// 將舊資料中的中文標籤反查回 enum key，相容歷史資料
function normalizeBookingStatus(v: string | null | undefined): BookingStatus {
  if (!v) return "invited";
  if ((BOOKING_STATUS_LABEL as Record<string, string>)[v]) return v as BookingStatus;
  const hit = (Object.entries(BOOKING_STATUS_LABEL) as [BookingStatus, string][])
    .find(([, label]) => label === v);
  return hit ? hit[0] : "invited";
}

function calcDayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getDay()] ?? "";
}

// ====== 主元件 ======
export default function TeamKOL() {
  const { roles, userId } = useTeam();
  const isManager =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    roles.includes("scout_manager");

  const [tab, setTab] = useState("invitations");
  const [prefill, setPrefill] = useState<InvitationPrefill | null>(null);

  const handleConvertFromProspect = (p: InvitationPrefill) => {
    setPrefill(p);
    setTab("invitations");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">KOL 星探管理</h1>
        <p className="text-sm text-muted-foreground">
          管理 KOL 邀約、潛在名單與邀約目標
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invitations">正式邀約</TabsTrigger>
          <TabsTrigger value="prospects">潛在名單</TabsTrigger>
          <TabsTrigger value="targets">邀約目標</TabsTrigger>
          <TabsTrigger value="settings">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab
            currentUserId={userId}
            isManager={isManager}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        </TabsContent>

        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab
            currentUserId={userId}
            isManager={isManager}
            onConvert={handleConvertFromProspect}
          />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsTab isManager={isManager} currentUserId={userId} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab isManager={isManager} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface InvitationPrefill {
  name: string;
  ig_handle: string;
  ig_url: string;
  scout_id: string;
  prospect_id: string;
}


// ====== Tab 一：正式邀約 ======
function InvitationsTab({
  currentUserId,
  isManager,
  prefill,
  onPrefillConsumed,
}: {
  currentUserId: string;
  isManager: boolean;
  prefill?: InvitationPrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const [prospectLink, setProspectLink] = useState<string | null>(null);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [venues, setVenues] = useState<KolVenue[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);

  // 館別合併選項（PMS + kol_venues，依名稱排序）
  const accommodationOptions = useMemo<VenueOption[]>(() => {
    const pms: VenueOption[] = accommodations.map((a) => ({
      value: `acc:${a.id}`,
      label: a.name,
      source: "pms",
      badge: "民宿",
      accommodation_id: a.id,
      venue_name: null,
    }));
    const v: VenueOption[] = venues
      .filter((x) => x.is_active)
      .map((x) => ({
        value: `venue:${x.name}`,
        label: x.name,
        source: "venue",
        badge: x.type || "其他",
        accommodation_id: null,
        venue_name: x.name,
      }));
    return [...pms, ...v].sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
  }, [accommodations, venues]);

  const [search, setSearch] = useState("");
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 詳情 Drawer
  const [viewingRow, setViewingRow] = useState<KolRow | null>(null);

  // 稀有度版本 & 標籤字典
  const [rarities, setRarities] = useState<RaritySetting[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Sheet 表單
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

  // 填錯 Dialog
  const [errorTarget, setErrorTarget] = useState<KolRow | null>(null);
  const [errorReason, setErrorReason] = useState("");
  const [reportingError, setReportingError] = useState(false);

  // 載入下拉資料
  useEffect(() => {
    (async () => {
      const [accRes, venueRes, scoutRes, scoutMgrRes, rarRes, tagRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, booking_type, short_url_alias")
          .order("name"),
        supabase
          .from("kol_venues" as any)
          .select("id, name, type, is_active")
          .order("name"),
        supabase.rpc("get_team_role_members", { p_role: "scout" }),
        supabase.rpc("get_team_role_members", { p_role: "scout_manager" as any }),
        supabase
          .from("kol_rarity_settings" as any)
          .select("rarity, fan_range_desc, bonus_amount, effective_from")
          .order("effective_from", { ascending: false }),
        supabase.from("kol_tags" as any).select("name").order("name"),
      ]);
      if (accRes.data) setAccommodations(accRes.data as Accommodation[]);
      if (venueRes.data) setVenues(venueRes.data as unknown as KolVenue[]);
      {
        const seen = new Set<string>();
        const list: Scout[] = [];
        for (const r of [...((scoutRes.data as any[]) ?? []), ...((scoutMgrRes.data as any[]) ?? [])]) {
          const uid = r.user_id;
          const dn = r.display_name ?? uid;
          if (!seen.has(uid)) {
            seen.add(uid);
            list.push({ user_id: uid, display_name: dn });
          }
        }
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setScouts(list);
      }
      if (rarRes.data) {
        // 只保留最新版本的六個稀有度
        const seen = new Set<string>();
        const latest: RaritySetting[] = [];
        for (const r of rarRes.data as any[]) {
          if (!seen.has(r.rarity)) {
            seen.add(r.rarity);
            latest.push(r as RaritySetting);
          }
        }
        // 依固定順序排
        const order = ["N", "R", "SR", "SSR", "UR", "ck"];
        latest.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
        setRarities(latest);
      }
      if (tagRes.data) {
        setAllTags((tagRes.data as any[]).map((t) => t.name));
      }
    })();
  }, []);

  const reloadTags = useCallback(async () => {
    const { data } = await supabase.from("kol_tags" as any).select("name").order("name");
    if (data) setAllTags((data as any[]).map((t) => t.name));
  }, []);

  const handleAddNewTag = async (name: string) => {
    const t = name.trim();
    if (!t) return;
    if (allTags.includes(t)) {
      toast.error("此標籤已存在");
      return;
    }
    const { error } = await supabase.from("kol_tags" as any).insert({ name: t });
    if (error) {
      toast.error(error.message);
      return;
    }
    await reloadTags();
    toast.success("已新增標籤");
  };


  const fetchRows = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("kol_profiles")
      .select("*", { count: "exact" })
      .eq("is_error", false);

    if (filterAcc !== "all") {
      if (filterAcc.startsWith("acc:")) {
        q = q.eq("accommodation_id", filterAcc.slice(4));
      } else if (filterAcc.startsWith("venue:")) {
        q = q.eq("venue_name", filterAcc.slice(6));
      }
    }
    if (filterRarity !== "all") q = q.eq("rarity", filterRarity);
    if (filterTags.length > 0) q = q.overlaps("kol_tags", filterTags);
    const s = search.trim();
    if (s) {
      const esc = s.replace(/[%,()]/g, " ");
      q = q.or(`name.ilike.%${esc}%,ig_handle.ilike.%${esc}%`);
    }

    const { data, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    // 取 scout 姓名
    const scoutIds = Array.from(
      new Set((data ?? []).map((r) => r.scout_id).filter(Boolean) as string[]),
    );
    let scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) =>
        scoutMap.set(p.user_id, p.display_name ?? p.user_id),
      );
    }
    const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
    const enriched = (data ?? []).map((r: any) => ({
      ...r,
      _accommodation_name: r.accommodation_id
        ? accMap.get(r.accommodation_id) ?? "-"
        : r.venue_name ?? "-",
      _scout_name: r.scout_id ? scoutMap.get(r.scout_id) ?? "-" : "-",
    })) as KolRow[];
    setRows(enriched);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [accommodations, page, search, filterAcc, filterRarity, filterTags]);

  useEffect(() => {
    if (accommodations.length > 0) fetchRows();
  }, [fetchRows, accommodations.length]);

  // 篩選條件變更時，重置到第一頁
  useEffect(() => {
    setPage(1);
  }, [search, filterAcc, filterRarity, filterTags]);

  // 伺服器端已套用篩選，直接使用 rows
  const filtered = rows;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));


  // 入住日期 → 自動計算星期幾
  useEffect(() => {
    if (form.check_in_date) {
      const dow = calcDayOfWeek(form.check_in_date);
      if (dow !== form.day_of_week) {
        setForm((f) => ({ ...f, day_of_week: dow }));
      }
    }
  }, [form.check_in_date]); // eslint-disable-line

  // 入住日期 + 館別 → 自動查詢庫存
  useEffect(() => {
    const accId = form.accommodation_id;
    const date = form.check_in_date;
    if (!accId || !date) {
      if (form.inventory_status !== "") {
        setForm((f) => ({ ...f, inventory_status: "" }));
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: rts } = await supabase
        .from("room_types")
        .select("id")
        .eq("accommodation_id", accId);
      const ids = (rts ?? []).map((r: any) => r.id);
      if (ids.length === 0) {
        if (!cancelled) setForm((f) => ({ ...f, inventory_status: "查無房型" }));
        return;
      }
      const { data: inv } = await supabase
        .from("room_inventory_pricing")
        .select("available_rooms, is_available")
        .in("room_type_id", ids)
        .eq("date", date);
      const total = (inv ?? []).reduce(
        (sum: number, r: any) =>
          sum + (r.is_available === false ? 0 : r.available_rooms ?? 0),
        0,
      );
      const status = total > 0 ? `有 ${total} 間` : "額滿";
      if (!cancelled) setForm((f) => ({ ...f, inventory_status: status }));
    })();
    return () => {
      cancelled = true;
    };
  }, [form.accommodation_id, form.check_in_date]); // eslint-disable-line

  // 訂單編號 → 自動切換訂房狀態
  // 只在狀態為 invited / booked 時才自動切換，其餘狀態（含「訂房編號有誤」、「訂房確認中」、
  // cancelled / rejected / on_hold / checked_in 等）一律保留不動。
  useEffect(() => {
    const current = form.booking_status as string;
    if (current !== "invited" && current !== "booked") return;
    const hasOrder = !!form.order_number.trim();
    const next: BookingStatus = hasOrder ? "booked" : "invited";
    if (current !== next) {
      setForm((f) => ({ ...f, booking_status: next }));
    }
  }, [form.order_number]); // eslint-disable-line


  // ig_handle 即時重複檢查
  useEffect(() => {
    const ig = form.ig_handle.trim();
    if (!ig) {
      setDupWarning(null);
      return;
    }
    const handle = setTimeout(async () => {
      let q = supabase
        .from("kol_profiles")
        .select(
          "id, scout_id, invited_at, booking_status, team_member_profiles:scout_id(display_name)",
        )
        .eq("ig_handle", ig)
        .eq("is_error", false);
      if (editingId) q = q.neq("id", editingId);
      const { data } = await q.limit(1);
      if (data && data.length > 0) {
        const d: any = data[0];
        const sn =
          d.team_member_profiles?.display_name ?? d.scout_id ?? "未知";
        const stLabel =
          BOOKING_STATUS_LABEL[d.booking_status as BookingStatus] ??
          (d.booking_status ?? "-");
        setDupWarning(
          `此 KOL 已有邀約紀錄：${sn} 於 ${d.invited_at ?? "-"}，狀態：${stLabel}`,
        );
      } else {
        setDupWarning(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [form.ig_handle, editingId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      invited_at: todayStr(),
      // scout 角色：自動帶入登入者
      scout_id: !isManager ? currentUserId : "",
    });
    setDupWarning(null);
    setProspectLink(null);
    setSheetOpen(true);
  };

  // 從潛在名單轉入時，自動開啟 Sheet 並預填
  useEffect(() => {
    if (!prefill) return;
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      name: prefill.name,
      ig_handle: prefill.ig_handle,
      scout_id: prefill.scout_id || (!isManager ? currentUserId : ""),
      invited_at: todayStr(),
    });
    setProspectLink(prefill.prospect_id);
    setDupWarning(null);
    setSheetOpen(true);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed, isManager, currentUserId]);

  const openEdit = (row: KolRow) => {
    if (!canEditRow(row)) {
      toast.error("您沒有權限編輯這筆紀錄");
      return;
    }
    setEditingId(row.id);
    setForm({
      id: row.id,
      accommodation_select: row.accommodation_id
        ? `acc:${row.accommodation_id}`
        : row.venue_name
          ? `venue:${row.venue_name}`
          : "",
      accommodation_id: row.accommodation_id ?? "",
      venue_name: row.venue_name ?? "",
      name: row.name ?? "",
      ig_handle: row.ig_handle ?? "",
      rarity: row.rarity ?? "",
      scout_id: row.scout_id ?? "",
      invited_at: row.invited_at ?? "",
      check_in_date: row.check_in_date ?? "",
      check_out_date: row.check_out_date ?? "",
      day_of_week: row.day_of_week ?? "",
      inventory_status: row.inventory_status ?? "",
      booking_status: normalizeBookingStatus(row.booking_status),
      cid_code: row.cid_code ?? "",
      short_url: row.short_url ?? "",
      contract_progress: row.contract_progress ?? "",
      contract_file_url: row.contract_file_url ?? "",
      task_pre_stay: !!row.task_pre_stay,
      task_post_story: !!row.task_post_story,
      task_ig_collab: !!row.task_ig_collab,
      publish_url: row.publish_url ?? "",
      publish_date: row.publish_date ?? "",
      order_number: row.order_number ?? "",
      inventory_count:
        row.inventory_count != null ? String(row.inventory_count) : "",
      kol_tags: row.kol_tags ?? [],
      kpi_qualified: !!row.kpi_qualified,
    });
    setDupWarning(null);
    setSheetOpen(true);
  };

  const canEditRow = (row: KolRow) =>
    isManager || row.created_by === currentUserId;

  const canReportError = (row: KolRow) =>
    row.created_by === currentUserId || isManager;

  const handleSave = async () => {
    if (!form.accommodation_id && !form.venue_name) {
      toast.error("請選擇館別");
      return;
    }
    if (!form.name.trim()) {
      toast.error("請輸入 KOL 名稱");
      return;
    }
    if (!form.ig_handle.trim()) {
      toast.error("請輸入 IG 帳號");
      return;
    }

    setSaving(true);
    const kpiEligible = !!form.check_in_date;
    const kpiMonth = form.check_in_date
      ? form.check_in_date.slice(0, 7) + "-01"
      : null;
    const tags = form.kol_tags;

    const payload: Record<string, any> = {
      accommodation_id: form.accommodation_id || null,
      venue_name: form.accommodation_id ? null : (form.venue_name || null),
      name: form.name.trim(),
      ig_handle: form.ig_handle.trim(),
      rarity: form.rarity || null,
      scout_id: form.scout_id || null,
      invited_at: form.invited_at || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      day_of_week: form.day_of_week || null,
      inventory_status: toNullable(form.inventory_status),
      booking_status: form.booking_status,
      cid_code: toNullable(form.cid_code),
      short_url: toNullable(form.short_url),
      contract_progress: toNullable(form.contract_progress),
      contract_file_url: toNullable(form.contract_file_url),
      task_pre_stay: form.task_pre_stay,
      task_post_story: form.task_post_story,
      task_ig_collab: form.task_ig_collab,
      publish_url: toNullable(form.publish_url),
      publish_date: form.publish_date || null,
      order_number: toNullable(form.order_number),
      inventory_count: form.booking_status === "booked" ? 1 : 0,
      kol_tags: tags.length > 0 ? tags : null,
      kpi_eligible: kpiEligible,
      kpi_month: kpiMonth,
    };
    if (isManager) {
      payload.kpi_qualified = form.kpi_qualified;
    }

    let err;
    let newId: string | null = null;
    if (editingId) {
      ({ error: err } = await supabase
        .from("kol_profiles")
        .update(payload)
        .eq("id", editingId));
    } else {
      payload.created_by = currentUserId;
      payload.is_error = false;
      const { data: inserted, error } = await supabase
        .from("kol_profiles")
        .insert(payload)
        .select("id")
        .single();
      err = error;
      newId = inserted?.id ?? null;
    }
    if (err) {
      setSaving(false);
      toast.error(err.message);
      return;
    }

    // 若來自潛在名單轉入,回寫 converted_to_kol_id 與狀態
    if (!editingId && prospectLink && newId) {
      await supabase
        .from("kol_prospects")
        .update({
          converted_to_kol_id: newId,
          status: "converted",
        })
        .eq("id", prospectLink);
    }

    setSaving(false);
    toast.success(editingId ? "已更新邀約" : "已新增邀約");
    setSheetOpen(false);
    setProspectLink(null);
    fetchRows();
  };

  const handleReportError = async () => {
    if (!errorTarget) return;
    if (!errorReason.trim()) {
      toast.error("請填寫填錯原因");
      return;
    }
    setReportingError(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({
        is_error: true,
        error_note: errorReason.trim(),
        corrected_by: currentUserId,
        corrected_at: new Date().toISOString(),
      })
      .eq("id", errorTarget.id);
    setReportingError(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已標記為填錯");
    setErrorTarget(null);
    setErrorReason("");
    fetchRows();
  };

  // 表單上選定的館別 booking_type
  const selectedAcc = accommodations.find(
    (a) => a.id === form.accommodation_id,
  );
  const showCid = selectedAcc?.booking_type !== "short_url";
  const showShortUrl = selectedAcc?.booking_type === "short_url";
  const shortUrlPrefix = selectedAcc?.short_url_alias
    ? `https://liker.land/${selectedAcc.short_url_alias}/`
    : "";

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜尋 KOL 名稱或 IG 帳號"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filterAcc} onValueChange={setFilterAcc}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="館別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部館別</SelectItem>
            {accommodationOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="inline-flex items-center gap-2">
                  <span>{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.badge}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-10 font-normal"
              type="button"
            >
              {filterTags.length === 0
                ? "標籤篩選"
                : `標籤：已選 ${filterTags.length}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="max-h-60 overflow-y-auto space-y-1">
              {allTags.length === 0 && (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  尚無標籤
                </div>
              )}
              {allTags.map((t) => {
                const checked = filterTags.includes(t);
                return (
                  <label
                    key={t}
                    className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setFilterTags(
                          v
                            ? [...filterTags, t]
                            : filterTags.filter((x) => x !== t),
                        )
                      }
                    />
                    {t}
                  </label>
                );
              })}
            </div>
            {filterTags.length > 0 && (
              <div className="border-t mt-2 pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full h-7 text-xs"
                  onClick={() => setFilterTags([])}
                >
                  清除標籤篩選
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* 稀有度篩選按鈕 */}
        <div className="flex items-center gap-1">
          {RARITY_OPTIONS.map((r) => {
            const active = filterRarity === r;
            return (
              <Button
                key={r}
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-9 min-w-[40px] px-2"
                type="button"
                onClick={() =>
                  setFilterRarity(active ? "all" : r)
                }
              >
                {r}
              </Button>
            );
          })}
          {filterRarity !== "all" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2 text-xs"
              type="button"
              onClick={() => setFilterRarity("all")}
            >
              全部
            </Button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新增邀約
          </Button>
        </div>
      </div>

      {/* 結果 */}
      {loading ? null : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            尚無資料
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="w-full overflow-x-auto">
            <Table className="[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>KOL 名稱</TableHead>
                  <TableHead>折扣碼 / CID</TableHead>
                  <TableHead>稀有度</TableHead>
                  <TableHead>館別</TableHead>
                  <TableHead>入住日期</TableHead>
                  <TableHead>邀約人</TableHead>
                  <TableHead>合約進度</TableHead>
                  <TableHead>任務</TableHead>
                  <TableHead>發布日期</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const igUrl = r.ig_handle || null;
                  const contractDone =
                    (r.contract_progress ?? "").includes("已上傳") ||
                    (r.contract_progress ?? "").toLowerCase().includes("uploaded");
                  const codeOrCid = r.cid_code ?? r.short_url ?? "-";
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setViewingRow(r)}
                    >
                      <TableCell className="max-w-[180px]">
                        <div className="flex items-center gap-2 max-w-[180px]">
                          {igUrl ? (
                            <a
                              href={igUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline truncate"
                              title={r.name ?? ""}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.name ?? "-"}
                            </a>
                          ) : (
                            <span className="truncate" title={r.name ?? ""}>
                              {r.name ?? "-"}
                            </span>
                          )}
                          {r.is_error && (
                            <Badge
                              variant="outline"
                              className="bg-red-100 text-red-700 border-red-300 shrink-0"
                            >
                              填錯
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{codeOrCid}</TableCell>
                      <TableCell>
                        {r.rarity && (
                          <Badge
                            variant="outline"
                            className={RARITY_CLASS[r.rarity as Rarity] ?? ""}
                          >
                            {r.rarity}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{r._accommodation_name}</TableCell>
                      <TableCell>{r.check_in_date ?? "-"}</TableCell>
                      <TableCell>{r._scout_name}</TableCell>
                      <TableCell>
                        {r.contract_progress ? (
                          <Badge
                            variant="outline"
                            className={
                              contractDone
                                ? "bg-green-100 text-green-700 border-green-200"
                                : "bg-gray-100 text-gray-700 border-gray-200"
                            }
                          >
                            {r.contract_progress}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {[
                            { ok: !!r.task_pre_stay, label: "前" },
                            { ok: !!r.task_post_story, label: "後" },
                            { ok: !!r.task_ig_collab, label: "協" },
                          ].map((t, i) => (
                            <span
                              key={i}
                              title={
                                t.label === "前"
                                  ? "入住前四件套"
                                  : t.label === "後"
                                    ? "入住後限動"
                                    : "IG 協作"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                                t.ok
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {t.ok ? <Check className="h-3 w-3" /> : t.label}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.publish_date ? (
                          r.publish_url ? (
                            <a
                              href={r.publish_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.publish_date}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            r.publish_date
                          )
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            BOOKING_STATUS_CLASS[
                              r.booking_status as BookingStatus
                            ] ?? ""
                          }
                        >
                          {BOOKING_STATUS_LABEL[
                            r.booking_status as BookingStatus
                          ] ??
                            r.booking_status ??
                            "-"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(r)}
                          aria-label="編輯"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* 分頁 */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            共 {totalCount} 筆，第 {page} / {totalPages} 頁
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一頁
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一頁
            </Button>
          </div>
        </div>
      )}


      {/* 詳情 Drawer */}
      <Sheet open={!!viewingRow} onOpenChange={(o) => !o && setViewingRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center gap-2 pr-12">
              <SheetTitle className="flex-1">邀約明細</SheetTitle>
              {viewingRow && canReportError(viewingRow) && !viewingRow.is_error && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setErrorTarget(viewingRow);
                    setErrorReason("");
                    setViewingRow(null);
                  }}
                >
                  回報填錯
                </Button>
              )}
              {viewingRow && canEditRow(viewingRow) && (
                <Button
                  size="sm"
                  onClick={() => {
                    const target = viewingRow;
                    setViewingRow(null);
                    openEdit(target);
                  }}
                >
                  編輯
                </Button>
              )}
            </div>
          </SheetHeader>
          {viewingRow && (() => {
            const r = viewingRow;
            const igUrl = r.ig_handle || null;
            const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="col-span-2 text-sm break-all">{children}</div>
              </div>
            );
            return (
              <div className="mt-4">
                <Row label="KOL 名稱">
                  {igUrl ? (
                    <a href={igUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {r.name ?? "-"}
                    </a>
                  ) : (
                    r.name ?? "-"
                  )}
                </Row>
                <Row label="網紅帳號連結">
                  {igUrl ? (
                    <a href={igUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      {igUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "-"
                  )}
                </Row>
                <Row label="稀有度">
                  {r.rarity ? (
                    <Badge variant="outline" className={RARITY_CLASS[r.rarity as Rarity] ?? ""}>
                      {r.rarity}
                    </Badge>
                  ) : "-"}
                </Row>
                <Row label="館別">{r._accommodation_name ?? "-"}</Row>
                <Row label="入住日期">{r.check_in_date ?? "-"}</Row>
                <Row label="邀約人">{r._scout_name ?? "-"}</Row>
                <Row label="折扣碼 / CID">{r.cid_code ?? r.short_url ?? "-"}</Row>
                <Row label="合約進度">{r.contract_progress ?? "-"}</Row>
                <Row label="合約檔案">
                  {r.contract_file_url ? (
                    <a href={r.contract_file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      開啟連結 <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "-"}
                </Row>
                <Row label="任務完成">
                  <div className="flex flex-col gap-1">
                    {[
                      { ok: !!r.task_pre_stay, label: "入住前四件套" },
                      { ok: !!r.task_post_story, label: "入住後限動" },
                      { ok: !!r.task_ig_collab, label: "IG 協作" },
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {t.ok ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                        {t.label}
                      </div>
                    ))}
                  </div>
                </Row>
                <Row label="發布連結">
                  {r.publish_url ? (
                    <a href={r.publish_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      {r.publish_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "-"}
                </Row>
                <Row label="發布日期">{r.publish_date ?? "-"}</Row>
                <Row label="訂單編號">{r.order_number ?? "-"}</Row>
                <Row label="狀態">
                  <Badge
                    variant="outline"
                    className={BOOKING_STATUS_CLASS[r.booking_status as BookingStatus] ?? ""}
                  >
                    {BOOKING_STATUS_LABEL[r.booking_status as BookingStatus] ?? r.booking_status ?? "-"}
                  </Badge>
                </Row>
                <Row label="填寫日期">{r.invited_at ?? "-"}</Row>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>



      {/* 新增/編輯 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "編輯邀約" : "新增邀約"}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <Field label="館別 *">
              <Select
                value={form.accommodation_id}
                onValueChange={(v) =>
                  setForm({ ...form, accommodation_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accommodations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="KOL 名稱 *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="網紅帳號連結 *">
                <Input
                  value={form.ig_handle}
                  onChange={(e) =>
                    setForm({ ...form, ig_handle: e.target.value })
                  }
                />
              </Field>
            </div>

            {dupWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                ⚠️ {dupWarning}（仍可繼續新增）
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="稀有度">
                <Select
                  value={form.rarity || "ck"}
                  onValueChange={(v) => setForm({ ...form, rarity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rarities.length === 0 ? (
                      <SelectItem value="ck">ck</SelectItem>
                    ) : (
                      rarities.map((r) => (
                        <SelectItem key={r.rarity} value={r.rarity}>
                          {r.rarity}：{r.fan_range_desc ?? "-"}｜獎金 NT${r.bonus_amount.toLocaleString()}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="KOL 標籤">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal h-10"
                      type="button"
                    >
                      {form.kol_tags.length === 0
                        ? "選擇標籤"
                        : `已選 ${form.kol_tags.length} 個`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {allTags.length === 0 && (
                        <div className="text-xs text-muted-foreground py-2 text-center">
                          尚無標籤，請於下方新增
                        </div>
                      )}
                      {allTags.map((t) => {
                        const checked = form.kol_tags.includes(t);
                        return (
                          <label
                            key={t}
                            className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setForm({
                                  ...form,
                                  kol_tags: v
                                    ? [...form.kol_tags, t]
                                    : form.kol_tags.filter((x) => x !== t),
                                });
                              }}
                            />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                    <div className="border-t mt-2 pt-2 flex gap-1">
                      <Input
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        placeholder="新增標籤..."
                        className="h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = newTagInput.trim();
                            if (t) {
                              handleAddNewTag(t).then(() => {
                                setForm((f) => ({
                                  ...f,
                                  kol_tags: f.kol_tags.includes(t)
                                    ? f.kol_tags
                                    : [...f.kol_tags, t],
                                }));
                                setNewTagInput("");
                              });
                            }
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          const t = newTagInput.trim();
                          if (!t) return;
                          await handleAddNewTag(t);
                          setForm((f) => ({
                            ...f,
                            kol_tags: f.kol_tags.includes(t)
                              ? f.kol_tags
                              : [...f.kol_tags, t],
                          }));
                          setNewTagInput("");
                        }}
                      >
                        新增
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {form.kol_tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {form.kol_tags.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="text-xs gap-1"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              kol_tags: form.kol_tags.filter((x) => x !== t),
                            })
                          }
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <Field label="邀約人">
              {isManager ? (
                <Select
                  value={form.scout_id || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, scout_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇邀約人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指定</SelectItem>
                    {scouts.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={
                    scouts.find((s) => s.user_id === form.scout_id)
                      ?.display_name ?? "（你本人）"
                  }
                  readOnly
                  className="bg-muted"
                />
              )}
            </Field>

            <Field label="入住日期">
              <Input
                type="date"
                value={form.check_in_date}
                onChange={(e) =>
                  setForm({ ...form, check_in_date: e.target.value })
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="星期幾（自動）">
                <Input value={form.day_of_week} readOnly className="bg-muted" />
              </Field>
              <Field label="庫存狀態（自動）">
                <Input
                  value={form.inventory_status}
                  readOnly
                  className="bg-muted"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="訂單編號">
                <Input
                  value={form.order_number}
                  onChange={(e) =>
                    setForm({ ...form, order_number: e.target.value })
                  }
                />
              </Field>
              <Field label="訂房狀態（自動）">
                <Input
                  value={
                    BOOKING_STATUS_LABEL[form.booking_status] ??
                    form.booking_status
                  }
                  readOnly
                  className="bg-muted"
                />
              </Field>
            </div>

            {showCid && (
              <Field label="折扣碼 / CID">
                <Input
                  value={form.cid_code}
                  onChange={(e) =>
                    setForm({ ...form, cid_code: e.target.value })
                  }
                />
              </Field>
            )}

            {showShortUrl && (
              <Field label="短網址後綴">
                <Input
                  value={form.short_url}
                  onChange={(e) =>
                    setForm({ ...form, short_url: e.target.value })
                  }
                />
                {shortUrlPrefix && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    完整網址：{shortUrlPrefix}
                    {form.short_url || form.cid_code}
                  </p>
                )}
              </Field>
            )}

            <Field label="合約進度">
              <Input
                value={form.contract_progress}
                onChange={(e) =>
                  setForm({ ...form, contract_progress: e.target.value })
                }
              />
            </Field>

            <Field label="合約檔案連結">
              <Input
                value={form.contract_file_url}
                onChange={(e) =>
                  setForm({ ...form, contract_file_url: e.target.value })
                }
              />
            </Field>

            <Field label="任務完成">
              <div className="space-y-2">
                {[
                  { k: "task_pre_stay" as const, label: "入住前四件套" },
                  { k: "task_post_story" as const, label: "入住後限動" },
                  { k: "task_ig_collab" as const, label: "IG 協作" },
                ].map(({ k, label }) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!form[k]}
                      onCheckedChange={(v) =>
                        setForm({ ...form, [k]: !!v } as FormState)
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="發布連結">
                <Input
                  value={form.publish_url}
                  onChange={(e) =>
                    setForm({ ...form, publish_url: e.target.value })
                  }
                />
              </Field>
              <Field label="發布日期">
                <Input
                  type="date"
                  value={form.publish_date}
                  onChange={(e) =>
                    setForm({ ...form, publish_date: e.target.value })
                  }
                />
              </Field>
            </div>


            <Field label="填寫日期">
              <Input
                type="date"
                value={form.invited_at}
                onChange={(e) =>
                  isManager && setForm({ ...form, invited_at: e.target.value })
                }
                readOnly={!isManager}
                className={!isManager ? "bg-muted" : ""}
              />
            </Field>
          </div>

          <SheetFooter className="mt-6 sm:justify-between">
            {editingId && isManager ? (
              <Button
                variant="destructive"
                disabled={saving}
                onClick={async () => {
                  if (!editingId) return;
                  if (!window.confirm(`確定要刪除「${form.name || "此筆"}」邀約紀錄嗎？此動作無法復原。`)) return;
                  const { error } = await supabase
                    .from("kol_profiles")
                    .delete()
                    .eq("id", editingId);
                  if (error) {
                    toast.error(`刪除失敗：${error.message}`);
                    return;
                  }
                  toast.success("已刪除");
                  setSheetOpen(false);
                  fetchRows();
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                刪除
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 填錯 Dialog */}
      <Dialog
        open={!!errorTarget}
        onOpenChange={(o) => !o && setErrorTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>回報填錯</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            將標記「{errorTarget?.name}」此筆紀錄為填錯，請填寫原因：
          </p>
          <Textarea
            value={errorReason}
            onChange={(e) => setErrorReason(e.target.value)}
            placeholder="例如：誤填入住日期、KOL 名稱錯誤..."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setErrorTarget(null)}
              disabled={reportingError}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReportError}
              disabled={reportingError}
            >
              {reportingError ? "送出中..." : "確認回報"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ============================================================
// ====== Tab 二:潛在名單 ======
// ============================================================

type ProspectStatus = "negotiating" | "rejected" | "on_hold" | "converted";

const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  negotiating: "洽談中",
  rejected: "拒絕",
  on_hold: "暫緩",
  converted: "已轉正式邀約",
};

const PROSPECT_STATUS_CLASS: Record<ProspectStatus, string> = {
  negotiating: "bg-blue-100 text-blue-700 border-blue-200",
  rejected: "bg-red-200 text-red-900 border-red-300",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
  converted: "bg-green-100 text-green-700 border-green-200",
};

interface ProspectRow {
  id: string;
  name: string | null;
  ig_handle: string | null;
  ig_url: string | null;
  scout_id: string | null;
  contacted_at: string | null;
  collab_type: string | null;
  fee_quote: number | null;
  tags: string[] | null;
  notes: string | null;
  screenshot_url: string | null;
  status: string | null;
  converted_to_kol_id: string | null;
  created_at: string | null;
  _scout_name?: string;
}

interface ProspectForm {
  id?: string;
  name: string;
  ig_handle: string;
  ig_url: string;
  scout_id: string;
  contacted_at: string;
  collab_type: string;
  fee_quote: string;
  tags_input: string;
  notes: string;
  screenshot_url: string;
  status: ProspectStatus;
}

const EMPTY_PROSPECT_FORM: ProspectForm = {
  name: "",
  ig_handle: "",
  ig_url: "",
  scout_id: "",
  contacted_at: "",
  collab_type: "",
  fee_quote: "",
  tags_input: "",
  notes: "",
  screenshot_url: "",
  status: "negotiating",
};

function ProspectsTab({
  currentUserId: _currentUserId,
  isManager: _isManager,
  onConvert,
}: {
  currentUserId: string;
  isManager: boolean;
  onConvert: (p: InvitationPrefill) => void;
}) {
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scouts, setScouts] = useState<Scout[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProspectForm>(EMPTY_PROSPECT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_team_role_members", { p_role: "scout" });
      if (data) {
        const seen = new Set<string>();
        const list: Scout[] = [];
        for (const r of data as any[]) {
          const uid = r.user_id;
          const dn = r.display_name ?? uid;
          if (!seen.has(uid)) {
            seen.add(uid);
            list.push({ user_id: uid, display_name: dn });
          }
        }
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setScouts(list);
      }
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kol_prospects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const scoutIds = Array.from(
      new Set((data ?? []).map((r) => r.scout_id).filter(Boolean) as string[]),
    );
    const scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) =>
        scoutMap.set(p.user_id, p.display_name ?? p.user_id),
      );
    }
    setRows(
      (data ?? []).map((r) => ({
        ...r,
        _scout_name: r.scout_id ? scoutMap.get(r.scout_id) ?? "-" : "-",
      })) as ProspectRow[],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (s) {
        const a = (r.name ?? "").toLowerCase();
        const b = (r.ig_handle ?? "").toLowerCase();
        if (!a.includes(s) && !b.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, filterStatus]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_PROSPECT_FORM);
    setSheetOpen(true);
  };

  const openEdit = (r: ProspectRow) => {
    setEditingId(r.id);
    setForm({
      id: r.id,
      name: r.name ?? "",
      ig_handle: r.ig_handle ?? "",
      ig_url: r.ig_url ?? "",
      scout_id: r.scout_id ?? "",
      contacted_at: r.contacted_at ?? "",
      collab_type: r.collab_type ?? "",
      fee_quote: r.fee_quote != null ? String(r.fee_quote) : "",
      tags_input: (r.tags ?? []).join(", "),
      notes: r.notes ?? "",
      screenshot_url: r.screenshot_url ?? "",
      status: (r.status as ProspectStatus) ?? "negotiating",
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    setSaving(true);
    const tags = form.tags_input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: Record<string, any> = {
      name: form.name.trim(),
      ig_handle: toNullable(form.ig_handle),
      ig_url: toNullable(form.ig_url),
      scout_id: form.scout_id || null,
      contacted_at: form.contacted_at || null,
      collab_type: toNullable(form.collab_type),
      fee_quote: form.fee_quote ? parseFloat(form.fee_quote) : null,
      tags: tags.length > 0 ? tags : null,
      notes: toNullable(form.notes),
      screenshot_url: toNullable(form.screenshot_url),
      status: form.status,
    };
    const { error } = editingId
      ? await supabase
          .from("kol_prospects")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("kol_prospects").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "已更新" : "已新增");
    setSheetOpen(false);
    fetchRows();
  };

  const handleConvert = (r: ProspectRow) => {
    onConvert({
      name: r.name ?? "",
      ig_handle: r.ig_handle ?? "",
      ig_url: r.ig_url ?? "",
      scout_id: r.scout_id ?? "",
      prospect_id: r.id,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜尋名稱或 IG 帳號"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            {(Object.keys(PROSPECT_STATUS_LABEL) as ProspectStatus[]).map(
              (k) => (
                <SelectItem key={k} value={k}>
                  {PROSPECT_STATUS_LABEL[k]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          新增潛在名單
        </Button>
      </div>

      {loading ? null : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            尚無資料
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>IG 帳號</TableHead>
                <TableHead>負責星探</TableHead>
                <TableHead>聯繫日期</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">報價</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name ?? "-"}</TableCell>
                  <TableCell>@{r.ig_handle ?? "-"}</TableCell>
                  <TableCell>{r._scout_name}</TableCell>
                  <TableCell>{r.contacted_at ?? "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        PROSPECT_STATUS_CLASS[r.status as ProspectStatus] ?? ""
                      }
                    >
                      {PROSPECT_STATUS_LABEL[r.status as ProspectStatus] ??
                        r.status ??
                        "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.fee_quote != null
                      ? `$${r.fee_quote.toLocaleString()}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                    >
                      編輯
                    </Button>
                    {r.status !== "converted" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleConvert(r)}
                      >
                        轉為正式邀約
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingId ? "編輯潛在名單" : "新增潛在名單"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <Field label="名稱 *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IG 帳號">
                <Input
                  value={form.ig_handle}
                  onChange={(e) =>
                    setForm({ ...form, ig_handle: e.target.value })
                  }
                />
              </Field>
              <Field label="IG 網址">
                <Input
                  value={form.ig_url}
                  onChange={(e) =>
                    setForm({ ...form, ig_url: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="負責星探">
              <Select
                value={form.scout_id || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, scout_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇星探" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {scouts.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="聯繫日期">
                <Input
                  type="date"
                  value={form.contacted_at}
                  onChange={(e) =>
                    setForm({ ...form, contacted_at: e.target.value })
                  }
                />
              </Field>
              <Field label="合作類型">
                <Select
                  value={form.collab_type || "none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      collab_type: v === "none" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇類型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指定</SelectItem>
                    <SelectItem value="圖文">圖文</SelectItem>
                    <SelectItem value="Reels">Reels</SelectItem>
                    <SelectItem value="限動">限動</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="報價">
                <Input
                  type="number"
                  value={form.fee_quote}
                  onChange={(e) =>
                    setForm({ ...form, fee_quote: e.target.value })
                  }
                />
              </Field>
              <Field label="狀態">
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as ProspectStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(PROSPECT_STATUS_LABEL) as ProspectStatus[]
                    ).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PROSPECT_STATUS_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="標籤(以逗號分隔)">
              <Input
                value={form.tags_input}
                onChange={(e) =>
                  setForm({ ...form, tags_input: e.target.value })
                }
              />
            </Field>
            <Field label="溝通紀錄">
              <Textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Field label="截圖連結">
              <Input
                value={form.screenshot_url}
                onChange={(e) =>
                  setForm({ ...form, screenshot_url: e.target.value })
                }
              />
            </Field>
          </div>
          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================
// ====== Tab 三:邀約目標 ======
// ============================================================

interface TeamTargetRow {
  id?: string;
  accommodation_id: string;
  accommodation_name: string;
  target_count: number;
  actual_count: number;
}

interface PersonalTargetRow {
  id?: string;
  scout_id: string;
  scout_name: string;
  accommodation_id: string;
  accommodation_name: string;
  target_count: number;
  actual_count: number;
}

function achievementColor(actual: number, target: number): string {
  if (target <= 0) return "bg-gray-100 text-gray-700 border-gray-200";
  const rate = actual / target;
  if (rate >= 1) return "bg-green-100 text-green-700 border-green-200";
  if (rate >= 0.8) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function achievementIcon(actual: number, target: number): string {
  if (target <= 0) return "—";
  const rate = actual / target;
  if (rate >= 1) return "✅";
  if (rate >= 0.8) return "⚠️";
  return "❌";
}

function TargetsTab({
  isManager,
  currentUserId,
}: {
  isManager: boolean;
  currentUserId: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);

  const [teamRows, setTeamRows] = useState<TeamTargetRow[]>([]);
  const [personalRows, setPersonalRows] = useState<PersonalTargetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<
    | { kind: "team"; row: TeamTargetRow }
    | { kind: "personal"; row: PersonalTargetRow }
    | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

  const [addKind, setAddKind] = useState<"team" | "personal" | null>(null);
  const [addAcc, setAddAcc] = useState("");
  const [addScout, setAddScout] = useState("");
  const [addCount, setAddCount] = useState("");

  useEffect(() => {
    (async () => {
      const [accRes, scoutRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, booking_type, short_url_alias")
          .order("name"),
        supabase.rpc("get_team_role_members", { p_role: "scout" }),
      ]);
      if (accRes.data) setAccommodations(accRes.data as Accommodation[]);
      if (scoutRes.data) {
        const seen = new Set<string>();
        const list: Scout[] = [];
        for (const r of scoutRes.data as any[]) {
          const uid = r.user_id;
          const dn = r.display_name ?? uid;
          if (!seen.has(uid)) {
            seen.add(uid);
            list.push({ user_id: uid, display_name: dn });
          }
        }
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setScouts(list);
      }
    })();
  }, []);

  const kpiMonthStr = `${year}-${String(month).padStart(2, "0")}-01`;

  const fetchAll = useCallback(async () => {
    if (accommodations.length === 0) return;
    setLoading(true);
    const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
    const scoutMap = new Map(scouts.map((s) => [s.user_id, s.display_name]));

    const [teamRes, personalRes, kolRes] = await Promise.all([
      supabase
        .from("scout_team_targets")
        .select("*")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("scout_monthly_targets")
        .select("*")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("kol_profiles")
        .select("accommodation_id, scout_id")
        .eq("is_error", false)
        .eq("kpi_month", kpiMonthStr),
    ]);

    const teamActual = new Map<string, number>();
    const personalActual = new Map<string, number>();
    (kolRes.data ?? []).forEach((k: any) => {
      if (k.accommodation_id) {
        teamActual.set(
          k.accommodation_id,
          (teamActual.get(k.accommodation_id) ?? 0) + 1,
        );
        if (k.scout_id) {
          const key = `${k.scout_id}|${k.accommodation_id}`;
          personalActual.set(key, (personalActual.get(key) ?? 0) + 1);
        }
      }
    });

    setTeamRows(
      ((teamRes.data as any[]) ?? []).map((t) => ({
        id: t.id,
        accommodation_id: t.accommodation_id,
        accommodation_name: accMap.get(t.accommodation_id) ?? "-",
        target_count: t.target_count,
        actual_count: teamActual.get(t.accommodation_id) ?? 0,
      })),
    );
    setPersonalRows(
      ((personalRes.data as any[]) ?? []).map((t) => ({
        id: t.id,
        scout_id: t.scout_id,
        scout_name: scoutMap.get(t.scout_id) ?? "-",
        accommodation_id: t.accommodation_id,
        accommodation_name: accMap.get(t.accommodation_id) ?? "-",
        target_count: t.target_count,
        actual_count:
          personalActual.get(`${t.scout_id}|${t.accommodation_id}`) ?? 0,
      })),
    );
    setLoading(false);
  }, [year, month, accommodations, scouts, kpiMonthStr]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const n = parseInt(editValue, 10);
    if (Number.isNaN(n) || n < 0) {
      toast.error("請輸入有效的目標數");
      return;
    }
    setSavingTarget(true);
    const table =
      editTarget.kind === "team"
        ? "scout_team_targets"
        : "scout_monthly_targets";
    const { error } = await supabase
      .from(table)
      .update({ target_count: n })
      .eq("id", editTarget.row.id!);
    setSavingTarget(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已更新目標");
    setEditTarget(null);
    fetchAll();
  };

  const openAdd = (kind: "team" | "personal") => {
    setAddKind(kind);
    setAddAcc("");
    setAddScout("");
    setAddCount("");
  };

  const handleAdd = async () => {
    if (!addKind) return;
    if (!addAcc) {
      toast.error("請選擇館別");
      return;
    }
    if (addKind === "personal" && !addScout) {
      toast.error("請選擇星探");
      return;
    }
    const n = parseInt(addCount, 10);
    if (Number.isNaN(n) || n < 0) {
      toast.error("請輸入有效目標數");
      return;
    }
    const payload: Record<string, any> = {
      year,
      month,
      accommodation_id: addAcc,
      target_count: n,
      created_by: currentUserId,
    };
    if (addKind === "personal") payload.scout_id = addScout;

    const table =
      addKind === "team" ? "scout_team_targets" : "scout_monthly_targets";
    const { error } = await (supabase.from(table) as any).insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增目標");
    setAddKind(null);
    fetchAll();
  };

  const years = [
    now.getFullYear() - 1,
    now.getFullYear(),
    now.getFullYear() + 1,
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Label>年月:</Label>
        <Select
          value={String(year)}
          onValueChange={(v) => setYear(parseInt(v, 10))}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y} 年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(month)}
          onValueChange={(v) => setMonth(parseInt(v, 10))}
        >
          <SelectTrigger className="w-24">
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">團體目標</h2>
          {isManager && (
            <Button size="sm" variant="outline" onClick={() => openAdd("team")}>
              <Plus className="mr-1 h-4 w-4" />
              新增目標
            </Button>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead>
                <TableHead className="text-right">目標邀約數</TableHead>
                <TableHead className="text-right">實際邀約數</TableHead>
                <TableHead className="text-right">達標率</TableHead>
                <TableHead className="text-right">狀態</TableHead>
                {isManager && (
                  <TableHead className="text-right">操作</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : teamRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isManager ? 6 : 5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    本月尚未設定團體目標
                  </TableCell>
                </TableRow>
              ) : (
                teamRows.map((r) => {
                  const rate =
                    r.target_count > 0
                      ? Math.round((r.actual_count / r.target_count) * 100)
                      : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.accommodation_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.target_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.actual_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rate}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={achievementColor(
                            r.actual_count,
                            r.target_count,
                          )}
                        >
                          {achievementIcon(r.actual_count, r.target_count)}
                        </Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditTarget({ kind: "team", row: r });
                              setEditValue(String(r.target_count));
                            }}
                          >
                            編輯
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">個人目標</h2>
          {isManager && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openAdd("personal")}
            >
              <Plus className="mr-1 h-4 w-4" />
              新增目標
            </Button>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>星探</TableHead>
                <TableHead>館別</TableHead>
                <TableHead className="text-right">目標數</TableHead>
                <TableHead className="text-right">實際邀約數</TableHead>
                <TableHead className="text-right">達標狀態</TableHead>
                {isManager && (
                  <TableHead className="text-right">操作</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : personalRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isManager ? 6 : 5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    本月尚未設定個人目標
                  </TableCell>
                </TableRow>
              ) : (
                personalRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.scout_name}</TableCell>
                    <TableCell>{r.accommodation_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.target_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.actual_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={achievementColor(
                          r.actual_count,
                          r.target_count,
                        )}
                      >
                        {achievementIcon(r.actual_count, r.target_count)}{" "}
                        {r.target_count > 0
                          ? `${Math.round((r.actual_count / r.target_count) * 100)}%`
                          : ""}
                      </Badge>
                    </TableCell>
                    {isManager && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget({ kind: "personal", row: r });
                            setEditValue(String(r.target_count));
                          }}
                        >
                          編輯
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>編輯目標數</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {editTarget.kind === "team"
                  ? `館別:${editTarget.row.accommodation_name}`
                  : `${(editTarget.row as PersonalTargetRow).scout_name} × ${editTarget.row.accommodation_name}`}
              </p>
              <Input
                type="number"
                min={0}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={savingTarget}
            >
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingTarget}>
              {savingTarget ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addKind} onOpenChange={(o) => !o && setAddKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              新增{addKind === "team" ? "團體" : "個人"}目標
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="館別">
              <Select value={addAcc} onValueChange={setAddAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accommodations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {addKind === "personal" && (
              <Field label="星探">
                <Select value={addScout} onValueChange={setAddScout}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇星探" />
                  </SelectTrigger>
                  <SelectContent>
                    {scouts.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label={`目標邀約數(${year} 年 ${month} 月)`}>
              <Input
                type="number"
                min={0}
                value={addCount}
                onChange={(e) => setAddCount(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKind(null)}>
              取消
            </Button>
            <Button onClick={handleAdd}>新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ====== Tab 四：等級設定 ======
// ============================================================
const RARITY_ORDER = ["N", "R", "SR", "SSR", "UR", "ck"] as const;

interface RarityVersion {
  effective_from: string;
  items: RaritySetting[];
}

function RaritySettingsTab() {
  const [versions, setVersions] = useState<RarityVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEffectiveFrom, setNewEffectiveFrom] = useState(todayStr());
  const [draft, setDraft] = useState<Record<string, { fan_range_desc: string; bonus_amount: string }>>(
    () =>
      Object.fromEntries(
        RARITY_ORDER.map((r) => [r, { fan_range_desc: "", bonus_amount: "0" }]),
      ),
  );
  const [saving, setSaving] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kol_rarity_settings" as any)
      .select("rarity, fan_range_desc, bonus_amount, effective_from")
      .order("effective_from", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const groups = new Map<string, RaritySetting[]>();
    for (const r of ((data ?? []) as unknown as RaritySetting[])) {
      if (!groups.has(r.effective_from)) groups.set(r.effective_from, []);
      groups.get(r.effective_from)!.push(r);
    }
    const list: RarityVersion[] = Array.from(groups.entries()).map(([ef, items]) => ({
      effective_from: ef,
      items: items.sort(
        (a, b) =>
          RARITY_ORDER.indexOf(a.rarity as any) - RARITY_ORDER.indexOf(b.rarity as any),
      ),
    }));
    setVersions(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const current = versions[0];
  const history = versions.slice(1);

  const openCreate = () => {
    // 預填當前版本作為基底
    const base = current?.items ?? [];
    const next: typeof draft = {};
    for (const r of RARITY_ORDER) {
      const hit = base.find((x) => x.rarity === r);
      next[r] = {
        fan_range_desc: hit?.fan_range_desc ?? "",
        bonus_amount: hit ? String(hit.bonus_amount) : "0",
      };
    }
    setDraft(next);
    setNewEffectiveFrom(todayStr());
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!newEffectiveFrom) {
      toast.error("請填寫生效日期");
      return;
    }
    setSaving(true);
    const rows = RARITY_ORDER.map((r) => ({
      rarity: r,
      fan_range_desc: draft[r].fan_range_desc.trim() || null,
      bonus_amount: parseInt(draft[r].bonus_amount || "0", 10) || 0,
      effective_from: newEffectiveFrom,
    }));
    const { error } = await supabase.from("kol_rarity_settings" as any).insert(rows);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增版本");
    setDialogOpen(false);
    loadVersions();
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">目前生效版本</h3>
              <p className="text-xs text-muted-foreground">
                {current
                  ? `生效日期：${current.effective_from}`
                  : "尚無任何版本"}
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              新增版本
            </Button>
          </div>
          {current && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>稀有度</TableHead>
                  <TableHead>粉絲數範圍說明</TableHead>
                  <TableHead className="text-right">每期獎金</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RARITY_ORDER.map((r) => {
                  const hit = current.items.find((x) => x.rarity === r);
                  return (
                    <TableRow key={r}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={RARITY_CLASS[r as Rarity] ?? ""}
                        >
                          {r}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {hit?.fan_range_desc ?? "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        NT$ {(hit?.bonus_amount ?? 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold">歷史版本</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>生效日期</TableHead>
                  {RARITY_ORDER.map((r) => (
                    <TableHead key={r} className="text-right">
                      {r}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((v) => (
                  <TableRow key={v.effective_from}>
                    <TableCell>{v.effective_from}</TableCell>
                    {RARITY_ORDER.map((r) => {
                      const hit = v.items.find((x) => x.rarity === r);
                      return (
                        <TableCell
                          key={r}
                          className="text-right tabular-nums text-xs"
                        >
                          {hit ? `$${hit.bonus_amount.toLocaleString()}` : "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增稀有度版本</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="生效日期 *">
              <Input
                type="date"
                value={newEffectiveFrom}
                onChange={(e) => setNewEffectiveFrom(e.target.value)}
              />
            </Field>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">稀有度</TableHead>
                  <TableHead>粉絲數範圍說明</TableHead>
                  <TableHead className="w-40">每期獎金 (NT$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RARITY_ORDER.map((r) => (
                  <TableRow key={r}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={RARITY_CLASS[r as Rarity] ?? ""}
                      >
                        {r}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft[r].fan_range_desc}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [r]: { ...d[r], fan_range_desc: e.target.value },
                          }))
                        }
                        placeholder="例如：1萬以下 / 1萬~5萬"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={draft[r].bonus_amount}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [r]: { ...d[r], bonus_amount: e.target.value },
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存為新版本"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
