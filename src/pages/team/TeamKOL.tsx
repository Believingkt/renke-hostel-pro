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
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, AlertTriangle, Check, X, Pencil, ExternalLink, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KolStatsTab } from "@/components/team/KolStatsTab";
import { Link } from "react-router-dom";

// ====== 型別 & 常數 ======
// 正式邀約 Tab：booking_status 僅保留以下三種顯示，其他值（含 null / 舊資料）一律顯示「—」
const BOOKING_STATUS_DISPLAY: Record<string, string> = {
  成功訂房: "bg-green-100 text-green-700 border-green-200",
  訂房確認中: "bg-amber-100 text-amber-700 border-amber-200",
  已取消: "bg-red-100 text-red-700 border-red-200",
};

function renderBookingStatusBadge(value: string | null | undefined) {
  const cls = value ? BOOKING_STATUS_DISPLAY[value] : undefined;
  if (!cls) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cls}>
      {value}
    </Badge>
  );
}

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
  is_active?: boolean;
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
  venue_name: string | null; // venue 時為名稱，PMS 時 null
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
  companion_cid: string | null;
  short_url: string | null;
  cid_configured: boolean | null;
  cid_notified: boolean | null;
  kol_direct_ticket_link: string | null;
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
  booking_status: string | null;
  cid_code: string;
  companion_cid: string;
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
  kol_direct_ticket_link: string;
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
  booking_status: null,
  cid_code: "",
  companion_cid: "",
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
  kol_direct_ticket_link: "",
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

// 依 publish_url / publish_date / contract_file_url 自動計算合約進度狀態
function computeContractProgress(
  publishUrl: string | null | undefined,
  publishDate: string | null | undefined,
  contractUrl: string | null | undefined,
): { label: string; done: boolean; empty: boolean; plain?: boolean } | null {
  // 特例：contract_file_url 為非 URL 的文字（如「業主拍攝」、「不適用」），直接當作合約進度顯示（純文字、無 badge）
  const contractTrimmed = contractUrl ? String(contractUrl).trim() : "";
  if (contractTrimmed && !contractTrimmed.toLowerCase().startsWith("http")) {
    return { label: contractTrimmed, done: false, empty: false, plain: true };
  }
  const hasPub = !!(publishUrl && String(publishUrl).trim());
  const hasDate = !!(publishDate && String(publishDate).trim());
  const hasContract = !!contractTrimmed;
  if (!hasPub && !hasDate && !hasContract) return { label: "—", done: false, empty: true };
  if (hasPub && hasDate && hasContract) return { label: "已上傳", done: true, empty: false };
  if (hasPub && !hasDate && !hasContract) return { label: "補發布日期＋合約連結", done: false, empty: false };
  if (hasPub && hasDate && !hasContract) return { label: "補合約連結", done: false, empty: false };
  if (hasPub && !hasDate && hasContract) return { label: "補發布日期", done: false, empty: false };
  if (!hasPub && hasDate && hasContract) return { label: "補發布連結", done: false, empty: false };
  if (!hasPub && !hasDate && hasContract) return { label: "補發布連結＋發布日期", done: false, empty: false };
  if (!hasPub && hasDate && !hasContract) return { label: "補發布連結＋合約連結", done: false, empty: false };
  return { label: "—", done: false, empty: true };
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
  const isManager = roles.includes("super_admin") || roles.includes("admin") || roles.includes("scout_manager");

  const [tab, setTab] = useState("invitations");
  const [prefill, setPrefill] = useState<InvitationPrefill | null>(null);
  const [canSeeStats, setCanSeeStats] = useState<boolean>(
    roles.includes("super_admin") ||
      roles.includes("admin") ||
      roles.includes("scout") ||
      roles.includes("scout_manager"),
  );
  // hotel_admin / super_admin / venue_manager 才可編輯 KOL購票連結
  const [canEditTicketLink, setCanEditTicketLink] = useState<boolean>(
    roles.includes("super_admin") || roles.includes("venue_manager"),
  );

  useEffect(() => {
    // hotel_admin 不在 TEAM_ROLES 過濾後的 roles 內，需獨立查詢
    let cancelled = false;
    if (canSeeStats) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["hotel_admin", "super_admin", "admin", "scout", "scout_manager"])
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setCanSeeStats(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, canSeeStats]);

  useEffect(() => {
    let cancelled = false;
    if (canEditTicketLink) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["hotel_admin", "super_admin", "venue_manager"])
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setCanEditTicketLink(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, canEditTicketLink]);

  const handleConvertFromProspect = (p: InvitationPrefill) => {
    setPrefill(p);
    setTab("invitations");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">KOL 星探管理</h1>
          <p className="text-sm text-muted-foreground">管理 KOL 邀約、潛在名單與邀約目標</p>
        </div>
        {canSeeStats && (
          <Button asChild variant="outline">
            <Link to="/team/kol/bonus">
              KOL 獎金管理
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invitations">正式邀約</TabsTrigger>
          <TabsTrigger value="prospects">潛在名單</TabsTrigger>
          <TabsTrigger value="targets">邀約目標</TabsTrigger>
          {canSeeStats && <TabsTrigger value="stats">業績統計</TabsTrigger>}
          <TabsTrigger value="venues">場域管理</TabsTrigger>
          <TabsTrigger value="settings">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab
            currentUserId={userId}
            isManager={isManager}
            canEditTicketLink={canEditTicketLink}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        </TabsContent>


        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab currentUserId={userId} isManager={isManager} onConvert={handleConvertFromProspect} />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsTab isManager={isManager} currentUserId={userId} />
        </TabsContent>

        {canSeeStats && (
          <TabsContent value="stats" className="mt-4">
            <KolStatsTab />
          </TabsContent>
        )}

        <TabsContent value="venues" className="mt-4">
          <div className="space-y-4">
            <VenuesCard isManager={isManager} />
            <PmsVenueSettingsCard isManager={isManager} />
          </div>
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
  canEditTicketLink,
  prefill,
  onPrefillConsumed,
}: {
  currentUserId: string;
  isManager: boolean;
  canEditTicketLink: boolean;
  prefill?: InvitationPrefill | null;
  onPrefillConsumed?: () => void;
}) {

  const [prospectLink, setProspectLink] = useState<string | null>(null);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [pmsCodesSet, setPmsCodesSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [venues, setVenues] = useState<KolVenue[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);

  // 館別合併選項（PMS + kol_venues，依名稱排序）
  const accommodationOptions = useMemo<VenueOption[]>(() => {
    const pms: VenueOption[] = accommodations
      .filter((a) => a.is_active !== false)
      .map((a) => ({
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
  const [searchInput, setSearchInput] = useState("");
  const composingRef = useRef(false);
  useEffect(() => {
    if (composingRef.current) return;
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [filterRarity, setFilterRarity] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterQualified, setFilterQualified] = useState<string>("all");
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

  // 取消邀約 Dialog
  const [cancelTarget, setCancelTarget] = useState<KolRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // 載入下拉資料
  useEffect(() => {
    (async () => {
      const [accRes, venueRes, scoutRes, scoutMgrRes, rarRes, tagRes] = await Promise.all([
        supabase.from("accommodation_info").select("id, name, booking_type, short_url_alias, is_active").order("name"),
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
        supabase
          .from("kol_tags" as any)
          .select("name")
          .order("name"),
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
    const { data } = await supabase
      .from("kol_tags" as any)
      .select("name")
      .order("name");
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

    let q = supabase.from("kol_profiles").select("*", { count: "exact" }).eq("is_error", false);

    if (filterAcc !== "all") {
      if (filterAcc.startsWith("acc:")) {
        q = q.eq("accommodation_id", filterAcc.slice(4));
      } else if (filterAcc.startsWith("venue:")) {
        q = q.eq("venue_name", filterAcc.slice(6));
      }
    }
    if (filterRarity.length > 0) q = q.in("rarity", filterRarity);
    if (filterTags.length > 0) q = q.overlaps("kol_tags", filterTags);
    if (filterScout !== "all") q = q.eq("scout_id", filterScout);
    if (filterQualified === "yes") q = q.eq("kpi_qualified", true);
    else if (filterQualified === "no") q = q.or("kpi_qualified.is.null,kpi_qualified.eq.false");
    if (filterYear !== "all") {
      const y = parseInt(filterYear, 10);
      if (filterMonth !== "all") {
        const m = parseInt(filterMonth, 10);
        const start = `${y}-${String(m).padStart(2, "0")}-01`;
        const endY = m === 12 ? y + 1 : y;
        const endM = m === 12 ? 1 : m + 1;
        const end = `${endY}-${String(endM).padStart(2, "0")}-01`;
        q = q.gte("check_in_date", start).lt("check_in_date", end);
      } else {
        q = q.gte("check_in_date", `${y}-01-01`).lt("check_in_date", `${y + 1}-01-01`);
      }
    } else if (filterMonth !== "all") {
      // 只選月份不選年份：以當前年為基準
      const y = new Date().getFullYear();
      const m = parseInt(filterMonth, 10);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const endY = m === 12 ? y + 1 : y;
      const endM = m === 12 ? 1 : m + 1;
      const end = `${endY}-${String(endM).padStart(2, "0")}-01`;
      q = q.gte("check_in_date", start).lt("check_in_date", end);
    }
    const s = search.trim();
    if (s) {
      const esc = s.replace(/[%,()]/g, " ");
      q = q.or(`name.ilike.%${esc}%,ig_handle.ilike.%${esc}%,cid_code.ilike.%${esc}%`);
    }

    const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, to);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    // 取 scout 姓名
    const scoutIds = Array.from(new Set((data ?? []).map((r) => r.scout_id).filter(Boolean) as string[]));
    let scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) => scoutMap.set(p.user_id, p.display_name ?? p.user_id));
    }
    const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
    const enriched = (data ?? []).map((r: any) => ({
      ...r,
      _accommodation_name: r.accommodation_id ? (accMap.get(r.accommodation_id) ?? "-") : (r.venue_name ?? "-"),
      _scout_name: r.scout_id ? (scoutMap.get(r.scout_id) ?? "-") : "-",
    })) as KolRow[];
    setRows(enriched);
    // 取得 PMS 已建立的折扣碼集合
    const { data: pmsCodes } = await supabase.from("discount_codes").select("code");
    const codesSet = new Set<string>(
      (pmsCodes ?? [])
        .map((c: any) => (c.code ?? "").trim().toUpperCase())
        .filter((c: string) => c.length > 0)
    );
    setPmsCodesSet(codesSet);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [accommodations, page, search, filterAcc, filterRarity, filterTags, filterScout, filterYear, filterMonth, filterQualified]);

  useEffect(() => {
    if (accommodations.length > 0) fetchRows();
  }, [fetchRows, accommodations.length]);

  // 篩選條件變更時，重置到第一頁
  useEffect(() => {
    setPage(1);
  }, [search, filterAcc, filterRarity, filterTags, filterScout, filterYear, filterMonth, filterQualified]);

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

  // 入住日期 + 館別 → 呼叫 check_kol_inventory RPC
  useEffect(() => {
    const date = form.check_in_date;
    const venueName = form.accommodation_id
      ? (accommodations.find((a) => a.id === form.accommodation_id)?.name ?? null)
      : form.venue_name || null;
    if (!date || !venueName) {
      if (form.inventory_status !== "") {
        setForm((f) => ({ ...f, inventory_status: "" }));
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("check_kol_inventory" as any, {
        p_venue_name: venueName,
        p_check_in_date: date,
      });
      if (cancelled) return;
      if (error) {
        setForm((f) => ({ ...f, inventory_status: "⚠️ 缺設定" }));
        return;
      }
      setForm((f) => ({ ...f, inventory_status: (data as string) || "⚠️ 缺設定" }));
    })();
    return () => {
      cancelled = true;
    };
  }, [form.accommodation_id, form.venue_name, form.check_in_date, accommodations]); // eslint-disable-line

  // 訂單編號 → 自動切換訂房狀態
  // 填入訂單編號 → 「訂房確認中」；清空 → null。
  // 已有「成功訂房」或「已取消」等其他值時保留不動。
  useEffect(() => {
    const current = form.booking_status;
    const hasOrder = !!form.order_number.trim();
    if (hasOrder && current == null) {
      setForm((f) => ({ ...f, booking_status: "訂房確認中" }));
    } else if (!hasOrder && current === "訂房確認中") {
      setForm((f) => ({ ...f, booking_status: null }));
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
        .select("id, scout_id, invited_at, booking_status, team_member_profiles:scout_id(display_name)")
        .eq("ig_handle", ig)
        .eq("is_error", false);
      if (editingId) q = q.neq("id", editingId);
      const { data } = await q.limit(1);
      if (data && data.length > 0) {
        const d: any = data[0];
        const sn = d.team_member_profiles?.display_name ?? d.scout_id ?? "未知";
        const stLabel = d.booking_status ?? "-";
        setDupWarning(`此 KOL 已有邀約紀錄：${sn} 於 ${d.invited_at ?? "-"}，狀態：${stLabel}`);
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
      scout_id: currentUserId,
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
      scout_id: prefill.scout_id || currentUserId,
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
      booking_status: row.booking_status ?? null,
      cid_code: row.cid_code ?? "",
      companion_cid: row.companion_cid ?? "",
      short_url: row.short_url ?? "",
      contract_progress: row.contract_progress ?? "",
      contract_file_url: row.contract_file_url ?? "",
      task_pre_stay: !!row.task_pre_stay,
      task_post_story: !!row.task_post_story,
      task_ig_collab: !!row.task_ig_collab,
      publish_url: row.publish_url ?? "",
      publish_date: row.publish_date ?? "",
      order_number: row.order_number ?? "",
      inventory_count: row.inventory_count != null ? String(row.inventory_count) : "",
      kol_tags: row.kol_tags ?? [],
      kpi_qualified: !!row.kpi_qualified,
      kol_direct_ticket_link: row.kol_direct_ticket_link ?? "",
    });
    setDupWarning(null);
    setSheetOpen(true);
  };

  const canEditRow = (row: KolRow) => isManager || row.created_by === currentUserId;

  const canReportError = (row: KolRow) => row.created_by === currentUserId || isManager;

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
    const kpiMonth = form.check_in_date ? form.check_in_date.slice(0, 7) + "-01" : null;
    const tags = form.kol_tags;

    const resolvedVenueName = form.accommodation_id
      ? (accommodations.find((a) => a.id === form.accommodation_id)?.name ?? null)
      : form.venue_name || null;
    const payload: Record<string, any> = {
      accommodation_id: form.accommodation_id || null,
      venue_name: resolvedVenueName,
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
      companion_cid: toNullable(form.companion_cid),
      short_url: toNullable(form.short_url),
      contract_progress: toNullable(form.contract_progress),
      contract_file_url: toNullable(form.contract_file_url),
      task_pre_stay: form.task_pre_stay,
      task_post_story: form.task_post_story,
      task_ig_collab: form.task_ig_collab,
      publish_url: toNullable(form.publish_url),
      publish_date: form.publish_date || null,
      order_number: toNullable(form.order_number),
      inventory_count: form.booking_status === "成功訂房" ? 1 : 0,
      kol_tags: tags.length > 0 ? tags : null,
      kol_direct_ticket_link: toNullable(form.kol_direct_ticket_link),
      kpi_eligible: kpiEligible,
      kpi_month: kpiMonth,
    };
    if (isManager) {
      payload.kpi_qualified = form.kpi_qualified;
    }

    let err;
    let newId: string | null = null;
    if (editingId) {
      ({ error: err } = await supabase.from("kol_profiles").update(payload).eq("id", editingId));
    } else {
      payload.created_by = currentUserId;
      payload.is_error = false;
      const { data: inserted, error } = await supabase.from("kol_profiles").insert(payload).select("id").single();
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
  const selectedAcc = accommodations.find((a) => a.id === form.accommodation_id);
  const showCid = selectedAcc?.booking_type !== "short_url";
  const showShortUrl = selectedAcc?.booking_type === "short_url";
  const shortUrlPrefix = selectedAcc?.short_url_alias ? `https://liker.land/${selectedAcc.short_url_alias}/` : "";

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="space-y-2">
        {/* Row 1: 搜尋框獨佔 */}
        <Input
          placeholder="搜尋 KOL 名稱 / 網紅帳號 / CID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />

        {/* Row 2: 館別 + 邀約人 */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={filterAcc} onValueChange={setFilterAcc}>
            <SelectTrigger className="w-full sm:w-44">
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

          <Select value={filterScout} onValueChange={setFilterScout}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="邀約人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部邀約人</SelectItem>
              {scouts.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>
                  {s.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 3: 稀有度 checkbox + 標籤篩選 */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 font-normal w-full sm:w-auto justify-start" type="button">
                {filterRarity.length === 0 ? "稀有度篩選" : `稀有度：${filterRarity.join("/")}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {RARITY_OPTIONS.map((r) => {
                  const checked = filterRarity.includes(r);
                  return (
                    <label
                      key={r}
                      className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setFilterRarity(v ? [...filterRarity, r] : filterRarity.filter((x) => x !== r))
                        }
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
              {filterRarity.length > 0 && (
                <div className="border-t mt-2 pt-2">
                  <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setFilterRarity([])}>
                    清除稀有度篩選
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 font-normal w-full sm:w-auto justify-start" type="button">
                {filterTags.length === 0 ? "標籤篩選" : `標籤：已選 ${filterTags.length}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="max-h-60 overflow-y-auto space-y-1">
                {allTags.length === 0 && <div className="text-xs text-muted-foreground py-2 text-center">尚無標籤</div>}
                {allTags.map((t) => {
                  const checked = filterTags.includes(t);
                  return (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => setFilterTags(v ? [...filterTags, t] : filterTags.filter((x) => x !== t))}
                      />
                      {t}
                    </label>
                  );
                })}
              </div>
              {filterTags.length > 0 && (
                <div className="border-t mt-2 pt-2">
                  <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setFilterTags([])}>
                    清除標籤篩選
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 4: 入住日期篩選（年份 + 月份） */}
        <div className="flex items-center gap-2 flex-nowrap">
          <span className="text-sm text-muted-foreground whitespace-nowrap">入住日期：</span>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="年份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部年份</SelectItem>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部月份</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 5: 累積資格獨佔 */}
        <Select value={filterQualified} onValueChange={setFilterQualified}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="累積資格" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">累積資格</SelectItem>
            <SelectItem value="yes">符合資格</SelectItem>
            <SelectItem value="no">未符合資格</SelectItem>
          </SelectContent>
        </Select>

        {/* Row 6: 新增邀約按鈕靠右 */}
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新增邀約
          </Button>
        </div>
      </div>


      {/* 結果 */}
      {loading ? null : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">尚無資料</CardContent>
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
                  <TableHead>符合資格</TableHead>
                  <TableHead>館別</TableHead>
                  <TableHead>入住日期</TableHead>
                  <TableHead>星期</TableHead>
                  <TableHead>邀約人</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>合約進度</TableHead>
                  <TableHead>任務</TableHead>
                  <TableHead>發布日期</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const igUrl = r.ig_handle || null;
                  const contractStatus = computeContractProgress(r.publish_url, r.publish_date, r.contract_file_url);
                  const codeOrCidValue = r.cid_code ?? r.short_url ?? null;
                  const codeOrCid = codeOrCidValue ?? "-";
                  const isPmsCreated = codeOrCidValue
                    ? pmsCodesSet.has(codeOrCidValue.trim().toUpperCase())
                    : false;
                  const codeOrCidClass = codeOrCidValue && (r.cid_configured || isPmsCreated)
                    ? "text-green-600 font-medium"
                    : "";
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewingRow(r)}>
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
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 shrink-0">
                              填錯
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={codeOrCidClass}>{codeOrCid}</TableCell>
                      <TableCell>
                        {r.rarity && (
                          <Badge variant="outline" className={RARITY_CLASS[r.rarity as Rarity] ?? ""}>
                            {r.rarity}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.kpi_qualified ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            <Check className="h-3 w-3" />
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{r._accommodation_name}</TableCell>
                      <TableCell>{r.check_in_date ?? "-"}</TableCell>
                      <TableCell>{r.day_of_week ?? "-"}</TableCell>
                      <TableCell>{r._scout_name}</TableCell>
                      <TableCell>{renderBookingStatusBadge(r.booking_status)}</TableCell>
                      <TableCell>
                        {contractStatus && !contractStatus.empty ? (
                          contractStatus.plain ? (
                            <span>{contractStatus.label}</span>
                          ) : (
                            <Badge
                              variant="outline"
                              className={
                                contractStatus.done
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : "bg-orange-100 text-orange-700 border-orange-200"
                              }
                            >
                              {contractStatus.label}
                            </Badge>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
                              title={t.label === "前" ? "入住前四件套" : t.label === "後" ? "入住後限動" : "IG 協作"}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                                t.ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
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
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg overflow-x-hidden">
          <SheetHeader>
            <div className="flex items-center gap-2 pr-12">
              <SheetTitle className="flex-1">邀約明細</SheetTitle>
              {viewingRow && viewingRow.booking_status !== "已取消" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setCancelTarget(viewingRow)}
                >
                  取消邀約
                </Button>
              )}
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
          {viewingRow &&
            (() => {
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
                      (r.name ?? "-")
                    )}
                  </Row>
                  <Row label="網紅帳號連結">
                    {igUrl ? (
                      <a
                        href={igUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
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
                    ) : (
                      "-"
                    )}
                  </Row>
                  <Row label="標籤">
                    {r.kol_tags && r.kol_tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.kol_tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </Row>
                  <Row label="同住夥伴">
                    <CompanionDisplay
                      companionCid={r.companion_cid ?? null}
                      selfCid={r.cid_code ?? null}
                      selfId={r.id}
                      onJumpTo={(id) => {
                        const target = rows.find((x) => x.id === id);
                        if (target) setViewingRow(target);
                      }}
                    />
                  </Row>
                  <Row label="累積資格">
                    {r.kpi_qualified ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                        符合資格
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                        未確認
                      </Badge>
                    )}
                  </Row>
                  <Row label="館別">{r._accommodation_name ?? "-"}</Row>
                  <Row label="入住日期">{r.check_in_date ?? "-"}</Row>
                  <Row label="星期">{r.day_of_week ?? "-"}</Row>
                  <Row label="邀約人">{r._scout_name ?? "-"}</Row>
                  <Row label="狀態">{renderBookingStatusBadge(r.booking_status)}</Row>
                  <Row label="訂單編號">{r.order_number ?? "-"}</Row>
                  <Row label="折扣碼 / CID">{(() => {
                    const v = r.cid_code ?? r.short_url ?? null;
                    if (!v) return "-";
                    const isPmsCreated = pmsCodesSet.has(v.trim().toUpperCase());
                    const cls = (r.cid_configured || isPmsCreated) ? "text-green-600 font-medium" : "";
                    return <span className={cls}>{v}</span>;
                  })()}</Row>
                  {(r.cid_code || r.short_url) && (
                    <Row label="折扣碼設定狀態">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(r.cid_configured || (r.cid_code && pmsCodesSet.has(r.cid_code.trim().toUpperCase()))) ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            已設定
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                            待設定
                          </Badge>
                        )}
                        {/* 重新發送通知按鈕已停用 */}
                      </div>
                    </Row>
                  )}
                  <Row label="KOL購票連結">
                    {r.kol_direct_ticket_link ? (
                      <a
                        href={r.kol_direct_ticket_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                      >
                        {r.kol_direct_ticket_link} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="合約進度">
                    {(() => {
                      const s = computeContractProgress(r.publish_url, r.publish_date, r.contract_file_url);
                      if (!s || s.empty) return <span className="text-muted-foreground">—</span>;
                      if (s.plain) return <span>{s.label}</span>;
                      return (
                        <Badge
                          variant="outline"
                          className={
                            s.done
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-orange-100 text-orange-700 border-orange-200"
                          }
                        >
                          {s.label}
                        </Badge>
                      );
                    })()}
                  </Row>
                  <Row label="合約檔案">
                    {r.contract_file_url ? (
                      <a
                        href={r.contract_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        開啟連結 <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "-"
                    )}
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
                  <Row label="發布日期">{r.publish_date ?? "-"}</Row>
                  <Row label="發布連結">
                    {r.publish_url ? (
                      <a
                        href={r.publish_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {r.publish_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "-"
                    )}
                  </Row>
                  <Row label="填寫日期">{r.invited_at ?? "-"}</Row>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>

      {/* 新增/編輯 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto overflow-x-hidden sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "編輯邀約" : "新增邀約"}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="KOL 名稱 *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="網紅帳號連結 *">
                <Input value={form.ig_handle} onChange={(e) => setForm({ ...form, ig_handle: e.target.value })} />
              </Field>
            </div>

            {dupWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                ⚠️ {dupWarning}（仍可繼續新增）
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="稀有度">
                <Select value={form.rarity || "ck"} onValueChange={(v) => setForm({ ...form, rarity: v })}>
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
                    <Button variant="outline" className="w-full justify-start font-normal h-10" type="button">
                      {form.kol_tags.length === 0 ? "選擇標籤" : `已選 ${form.kol_tags.length} 個`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {allTags.length === 0 && (
                        <div className="text-xs text-muted-foreground py-2 text-center">尚無標籤，請於下方新增</div>
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
                                  kol_tags: v ? [...form.kol_tags, t] : form.kol_tags.filter((x) => x !== t),
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
                                  kol_tags: f.kol_tags.includes(t) ? f.kol_tags : [...f.kol_tags, t],
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
                            kol_tags: f.kol_tags.includes(t) ? f.kol_tags : [...f.kol_tags, t],
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
                      <Badge key={t} variant="outline" className="text-xs gap-1">
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
                  onValueChange={(v) => setForm({ ...form, scout_id: v === "none" ? "" : v })}
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
                  value={scouts.find((s) => s.user_id === form.scout_id)?.display_name ?? "（你本人）"}
                  readOnly
                  className="bg-muted"
                />
              )}
            </Field>

            <Field label="館別 *">
              <Select
                value={form.accommodation_select}
                onValueChange={(v) => {
                  const opt = accommodationOptions.find((o) => o.value === v);
                  setForm({
                    ...form,
                    accommodation_select: v,
                    accommodation_id: opt?.accommodation_id ?? "",
                    venue_name: opt?.venue_name ?? "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
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
            </Field>

            <Field label="入住日期">
              <Input
                type="date"
                value={form.check_in_date}
                onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="星期幾（自動）">
                <Input value={form.day_of_week} readOnly className="bg-muted" />
              </Field>
              <Field label="庫存狀態（自動）">
                <Input value={form.inventory_status} readOnly className="bg-muted" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="訂單編號">
                <Input value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} />
              </Field>
              <Field label="訂房狀態（自動）">
                <Input
                  value={form.booking_status ?? "—"}
                  readOnly
                  className="bg-muted"
                />
              </Field>
            </div>

            {showCid && (
              <Field label="折扣碼 / CID">
                <Input value={form.cid_code} onChange={(e) => setForm({ ...form, cid_code: e.target.value })} />
              </Field>
            )}

            <Field label="同住夥伴">
              <CompanionSearch
                value={form.companion_cid}
                onChange={(cid) => setForm({ ...form, companion_cid: cid })}
              />
            </Field>


            <Field label="KOL購票連結">
              {canEditTicketLink ? (
                <Input
                  value={form.kol_direct_ticket_link}
                  onChange={(e) => setForm({ ...form, kol_direct_ticket_link: e.target.value })}
                  placeholder="https://..."
                />
              ) : form.kol_direct_ticket_link ? (
                <a
                  href={form.kol_direct_ticket_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-sm text-primary underline underline-offset-2"
                >
                  {form.kol_direct_ticket_link} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </Field>


            {showShortUrl && (
              <Field label="短網址後綴">
                <Input value={form.short_url} onChange={(e) => setForm({ ...form, short_url: e.target.value })} />
                {shortUrlPrefix && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    完整網址：{shortUrlPrefix}
                    {form.short_url || form.cid_code}
                  </p>
                )}
              </Field>
            )}

            <Field label="合約進度">
              {(() => {
                const s = computeContractProgress(form.publish_url, form.publish_date, form.contract_file_url);
                if (!s || s.empty) return <span className="text-muted-foreground text-sm">—</span>;
                if (s.plain) return <span className="text-sm">{s.label}</span>;
                return (
                  <Badge
                    variant="outline"
                    className={
                      s.done
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-orange-100 text-orange-700 border-orange-200"
                    }
                  >
                    {s.label}
                  </Badge>
                );
              })()}
            </Field>

            <Field label="合約檔案連結">
              <Input
                value={form.contract_file_url}
                onChange={(e) => setForm({ ...form, contract_file_url: e.target.value })}
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
                      onCheckedChange={(v) => setForm({ ...form, [k]: !!v } as FormState)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="發布連結">
                <Input value={form.publish_url} onChange={(e) => setForm({ ...form, publish_url: e.target.value })} />
              </Field>
              <Field label="發布日期">
                <Input
                  type="date"
                  value={form.publish_date}
                  onChange={(e) => setForm({ ...form, publish_date: e.target.value })}
                />
              </Field>
            </div>

            <Field label="填寫日期">
              <Input
                type="date"
                value={form.invited_at}
                onChange={(e) => setForm({ ...form, invited_at: e.target.value })}
              />
            </Field>


            <Field label="累積資格">
              {isManager ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.kpi_qualified}
                    onCheckedChange={(v) => {
                      if (!!v && form.rarity === "ck") {
                        toast.error("無法勾選符合資格", {
                          description: "稀有度為「ck（揪客）」時不可勾選符合資格，請先調整稀有度為其他選項。",
                        });
                        return;
                      }
                      setForm({ ...form, kpi_qualified: !!v });
                    }}
                  />
                  符合資格
                </label>
              ) : (
                <Input value={form.kpi_qualified ? "符合資格" : "未確認"} readOnly className="bg-muted" />
              )}
            </Field>
          </div>

          <SheetFooter className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-2">
            <div className="flex gap-2 order-2 sm:order-1">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setSheetOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={handleSave} disabled={saving}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
            </div>
            {editingId && isManager && (
              <Button
                variant="destructive"
                className="order-1 sm:order-2 w-full sm:w-auto"
                disabled={saving}
                onClick={async () => {
                  if (!editingId) return;
                  if (!window.confirm(`確定要刪除「${form.name || "此筆"}」邀約紀錄嗎？此動作無法復原。`)) return;
                  const { error } = await supabase.from("kol_profiles").delete().eq("id", editingId);
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
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 填錯 Dialog */}
      <Dialog open={!!errorTarget} onOpenChange={(o) => !o && setErrorTarget(null)}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>回報填錯</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">將標記「{errorTarget?.name}」此筆紀錄為填錯，請填寫原因：</p>
          <Textarea
            value={errorReason}
            onChange={(e) => setErrorReason(e.target.value)}
            placeholder="例如：誤填入住日期、KOL 名稱錯誤..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorTarget(null)} disabled={reportingError}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleReportError} disabled={reportingError}>
              {reportingError ? "送出中..." : "確認回報"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消邀約 Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && !cancelling && setCancelTarget(null)}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>確認取消邀約</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            確定要取消 {cancelTarget?.name} 的邀約嗎?此操作將把訂房狀態改為已取消。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              返回
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={async () => {
                if (!cancelTarget) return;
                setCancelling(true);
                const { error } = await supabase
                  .from("kol_profiles")
                  .update({ booking_status: "已取消" })
                  .eq("id", cancelTarget.id);
                setCancelling(false);
                if (error) {
                  toast.error("取消失敗:" + error.message);
                  return;
                }
                toast.success("邀約已取消");
                setCancelTarget(null);
                setViewingRow(null);
                fetchRows();
              }}
            >
              {cancelling ? "處理中..." : "確認取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// 同住夥伴搜尋元件：以 name 即時搜尋 kol_profiles，選定後寫入該筆 cid_code
function CompanionSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (cid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string | null; venue_name: string | null; cid_code: string | null }>>([]);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string>("");
  const [searching, setSearching] = useState(false);

  // 已有 value 時反查名稱顯示
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelectedName("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("name")
        .eq("cid_code", value)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setSelectedName((data?.name as string) ?? value);
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  // 即時搜尋
  useEffect(() => {
    if (!query.trim() || value) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("id, name, venue_name, cid_code")
        .ilike("name", `%${query.trim()}%`)
        .not("cid_code", "is", null)
        .limit(20);
      if (!cancelled) {
        setResults((data as any) ?? []);
        setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-sm">
          {selectedName || value}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange("");
            setQuery("");
            setResults([]);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="輸入 KOL 名稱搜尋…"
      />
      {open && query.trim() && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {searching && <div className="px-3 py-2 text-xs text-muted-foreground">搜尋中…</div>}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">無符合的 KOL（需有 CID）</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                if (!r.cid_code) {
                  toast.error("該筆無 CID，無法作為同住夥伴");
                  return;
                }
                onChange(r.cid_code);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
            >
              <span className="font-medium">{r.name ?? "-"}</span>
              <span className="text-muted-foreground"> | {r.venue_name ?? "-"} | {r.cid_code ?? "-"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 同住夥伴顯示：正向（companion_cid → name）+ 反向（其他人 companion_cid = 本筆 cid_code）
function CompanionDisplay({
  companionCid,
  selfCid,
  selfId,
  onJumpTo,
}: {
  companionCid: string | null;
  selfCid: string | null;
  selfId: string;
  onJumpTo: (id: string) => void;
}) {
  const [forward, setForward] = useState<{ id: string; name: string | null } | null>(null);
  const [reverse, setReverse] = useState<Array<{ id: string; name: string | null }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (companionCid) {
        const { data } = await supabase
          .from("kol_profiles")
          .select("id, name")
          .eq("cid_code", companionCid)
          .neq("id", selfId)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setForward((data as any) ?? null);
      } else {
        setForward(null);
      }
      if (selfCid) {
        const { data } = await supabase
          .from("kol_profiles")
          .select("id, name")
          .eq("companion_cid", selfCid)
          .neq("id", selfId);
        if (!cancelled) setReverse(((data as any) ?? []));
      } else {
        setReverse([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companionCid, selfCid, selfId]);

  if (!companionCid && reverse.length === 0) return <>-</>;

  return (
    <div className="space-y-1">
      {companionCid && (
        <div>
          {forward ? (
            <button
              type="button"
              onClick={() => onJumpTo(forward.id)}
              className="text-primary hover:underline"
            >
              {forward.name ?? companionCid}
            </button>
          ) : (
            <span className="text-muted-foreground">{companionCid}（查無對應 KOL）</span>
          )}
        </div>
      )}
      {reverse.map((r) => (
        <div key={r.id} className="text-xs text-muted-foreground">
          同住夥伴：
          <button
            type="button"
            onClick={() => onJumpTo(r.id)}
            className="text-primary hover:underline"
          >
            {r.name ?? "-"}
          </button>
        </div>
      ))}
    </div>
  );
}




// ============================================================
// ====== Tab 二:潛在名單 ======
// ============================================================

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
  ig_url: string;
  scout_id: string;
  contacted_at: string;
  fee_quote: string;
  tags: string[];
  notes: string;
  screenshot_url: string;
}

const EMPTY_PROSPECT_FORM: ProspectForm = {
  name: "",
  ig_url: "",
  scout_id: "",
  contacted_at: "",
  fee_quote: "",
  tags: [],
  notes: "",
  screenshot_url: "",
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
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  const [search, setSearch] = useState("");
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProspectForm>(EMPTY_PROSPECT_FORM);
  const [saving, setSaving] = useState(false);

  const reloadTags = useCallback(async () => {
    const { data } = await supabase
      .from("kol_tags" as any)
      .select("name")
      .order("name");
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

  useEffect(() => {
    (async () => {
      const [scoutRes, tagRes] = await Promise.all([
        supabase.rpc("get_team_role_members", { p_role: "scout" }),
        supabase
          .from("kol_tags" as any)
          .select("name")
          .order("name"),
      ]);
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
      if (tagRes.data) setAllTags((tagRes.data as any[]).map((t) => t.name));
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kol_prospects").select("*").order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const scoutIds = Array.from(new Set((data ?? []).map((r) => r.scout_id).filter(Boolean) as string[]));
    const scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) => scoutMap.set(p.user_id, p.display_name ?? p.user_id));
    }
    setRows(
      (data ?? []).map((r) => ({
        ...r,
        _scout_name: r.scout_id ? (scoutMap.get(r.scout_id) ?? "-") : "-",
      })) as ProspectRow[],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const scoutFilterOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.scout_id).filter(Boolean) as string[]));
    return ids.map((id) => ({
      id,
      name: rows.find((r) => r.scout_id === id)?._scout_name ?? id,
    }));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterScout !== "all") {
        if (filterScout === "none" ? r.scout_id : r.scout_id !== filterScout) return false;
      }
      if (filterTags.length > 0) {
        const tags = r.tags ?? [];
        if (!filterTags.some((t) => tags.includes(t))) return false;
      }
      if (s) {
        const a = (r.name ?? "").toLowerCase();
        const b = (r.ig_url ?? "").toLowerCase();
        if (!a.includes(s) && !b.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, filterScout, filterTags]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [search, filterScout, filterTags]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

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
      ig_url: r.ig_url ?? "",
      scout_id: r.scout_id ?? "",
      contacted_at: r.contacted_at ?? "",
      fee_quote: r.fee_quote != null ? String(r.fee_quote) : "",
      tags: r.tags ?? [],
      notes: r.notes ?? "",
      screenshot_url: r.screenshot_url ?? "",
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      name: form.name.trim(),
      ig_url: toNullable(form.ig_url),
      scout_id: form.scout_id || null,
      contacted_at: form.contacted_at || null,
      fee_quote: form.fee_quote ? parseFloat(form.fee_quote) : null,
      tags: form.tags.length > 0 ? form.tags : null,
      notes: toNullable(form.notes),
      screenshot_url: toNullable(form.screenshot_url),
    };
    const { error } = editingId
      ? await supabase.from("kol_prospects").update(payload).eq("id", editingId)
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
          placeholder="搜尋 KOL 名稱 或 網紅帳號連結"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filterScout} onValueChange={setFilterScout}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="負責星探" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部星探</SelectItem>
            <SelectItem value="none">未指定</SelectItem>
            {scoutFilterOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 font-normal" type="button">
              {filterTags.length === 0 ? "標籤篩選" : `標籤：已選 ${filterTags.length}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="max-h-60 overflow-y-auto space-y-1">
              {(() => {
                const usedTags = Array.from(new Set(rows.flatMap((r) => r.tags ?? []))).sort((a, b) =>
                  a.localeCompare(b),
                );
                if (usedTags.length === 0) {
                  return <div className="text-xs text-muted-foreground py-2 text-center">尚無標籤</div>;
                }
                return usedTags.map((t) => {
                  const checked = filterTags.includes(t);
                  return (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setFilterTags(v ? [...filterTags, t] : filterTags.filter((x) => x !== t))
                        }
                      />
                      {t}
                    </label>
                  );
                });
              })()}
            </div>
            {filterTags.length > 0 && (
              <div className="border-t mt-2 pt-2">
                <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => setFilterTags([])}>
                  清除標籤篩選
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          新增潛在名單
        </Button>
      </div>

      {loading ? null : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">尚無資料</CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>標籤</TableHead>
                <TableHead>負責星探</TableHead>
                <TableHead>聯繫日期</TableHead>
                <TableHead className="text-right">報價</TableHead>
                <TableHead>溝通紀錄</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => {
                const tags = r.tags ?? [];
                const displayName = r.name ?? "-";
                const nameNode = <span className="block max-w-[180px] truncate">{displayName}</span>;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[180px]">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {r.ig_url ? (
                              <a
                                href={r.ig_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline block max-w-[180px] truncate"
                              >
                                {displayName}
                              </a>
                            ) : (
                              nameNode
                            )}
                          </TooltipTrigger>
                          <TooltipContent>{displayName}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      {tags.length === 0 ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 2).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                          {tags.length > 2 && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs">
                                    +{tags.length - 2}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{tags.slice(2).join("、")}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{r._scout_name}</TableCell>
                    <TableCell>{r.contacted_at ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.fee_quote != null ? `$${r.fee_quote.toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell>
                      {r.screenshot_url ? (
                        <a
                          href={r.screenshot_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          查看截圖
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="編輯">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {r.status !== "converted" && (
                        <Button size="sm" variant="ghost" onClick={() => handleConvert(r)}>
                          轉為正式邀約
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            共 {totalCount} 筆，第 {page} / {totalPages} 頁
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一頁
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一頁
            </Button>
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg overflow-x-hidden">
          <SheetHeader>
            <SheetTitle>{editingId ? "編輯潛在名單" : "新增潛在名單"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <Field label="名稱 *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="網紅帳號連結">
              <Input value={form.ig_url} onChange={(e) => setForm({ ...form, ig_url: e.target.value })} />
            </Field>
            <Field label="負責星探">
              <Select
                value={form.scout_id || "none"}
                onValueChange={(v) => setForm({ ...form, scout_id: v === "none" ? "" : v })}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="聯繫日期">
                <Input
                  type="date"
                  value={form.contacted_at}
                  onChange={(e) => setForm({ ...form, contacted_at: e.target.value })}
                />
              </Field>
              <Field label="報價">
                <Input
                  type="number"
                  value={form.fee_quote}
                  onChange={(e) => setForm({ ...form, fee_quote: e.target.value })}
                />
              </Field>
            </div>
            <Field label="KOL 標籤">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-10" type="button">
                    {form.tags.length === 0 ? "選擇標籤" : `已選 ${form.tags.length} 個`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {(() => {
                      const usedTags = Array.from(new Set([...rows.flatMap((r) => r.tags ?? []), ...form.tags])).sort(
                        (a, b) => a.localeCompare(b),
                      );
                      if (usedTags.length === 0) {
                        return (
                          <div className="text-xs text-muted-foreground py-2 text-center">尚無標籤，請於下方新增</div>
                        );
                      }
                      return usedTags.map((t) => {
                        const checked = form.tags.includes(t);
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
                                  tags: v ? [...form.tags, t] : form.tags.filter((x) => x !== t),
                                });
                              }}
                            />
                            {t}
                          </label>
                        );
                      });
                    })()}
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
                                tags: f.tags.includes(t) ? f.tags : [...f.tags, t],
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
                          tags: f.tags.includes(t) ? f.tags : [...f.tags, t],
                        }));
                        setNewTagInput("");
                      }}
                    >
                      新增
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {form.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs gap-1">
                      {t}
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            tags: form.tags.filter((x) => x !== t),
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
            <Field label="合作期待">
              <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Field label="截圖連結">
              <Input
                value={form.screenshot_url}
                onChange={(e) => setForm({ ...form, screenshot_url: e.target.value })}
              />
            </Field>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
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
  id: string;
  venue_name: string;
  target_count: number;
  personal_min: number | null;
  is_starlink: boolean;
  actual_count: number;
}

interface PersonalRow {
  scout_id: string;
  scout_name: string;
  venue_name: string;
  personal_min: number | null;
  actual_count: number;
}

function achievementColor(actual: number, target: number): string {
  if (target <= 0) return "bg-gray-100 text-gray-700 border-gray-200";
  const rate = actual / target;
  if (rate >= 1) return "bg-green-100 text-green-700 border-green-200";
  if (rate >= 0.8) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function achievementLabel(actual: number, target: number): string {
  if (target <= 0) return "—";
  const rate = actual / target;
  if (rate >= 1) return "✅ 達標";
  if (rate >= 0.8) return "⚠️ 接近";
  return "❌ 未達標";
}

function TargetsTab({ isManager, currentUserId }: { isManager: boolean; currentUserId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [scouts, setScouts] = useState<Scout[]>([]);
  const [teamRows, setTeamRows] = useState<TeamTargetRow[]>([]);
  const [personalRows, setPersonalRows] = useState<PersonalRow[]>([]);
  const [personalScoutFilter, setPersonalScoutFilter] = useState<string>("all");
  const [personalVenueFilter, setPersonalVenueFilter] = useState<string>("all");
  const [fallbackLabel, setFallbackLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [editRow, setEditRow] = useState<TeamTargetRow | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [editPersonal, setEditPersonal] = useState("");
  const [editStarlink, setEditStarlink] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addVenue, setAddVenue] = useState("");
  const [addTarget, setAddTarget] = useState("0");
  const [addPersonal, setAddPersonal] = useState("");
  const [addStarlink, setAddStarlink] = useState(false);

  // 館別下拉選項（PMS + kol_venues），與正式邀約 Tab 相同
  const [accList, setAccList] = useState<{ id: string; name: string; is_active?: boolean }[]>([]);
  const [venueList, setVenueList] = useState<{ name: string; type: string | null; is_active: boolean }[]>([]);

  useEffect(() => {
    (async () => {
      const [accRes, venueRes] = await Promise.all([
        supabase.from("accommodation_info").select("id, name, is_active").order("name"),
        supabase.from("kol_venues" as any).select("name, type, is_active"),
      ]);
      if (accRes.data) setAccList(accRes.data as any);
      if (venueRes.data) setVenueList(venueRes.data as any);
    })();
  }, []);

  const venueOptions = useMemo(() => {
    const pms = accList
      .filter((a) => a.is_active !== false)
      .map((a) => ({ name: a.name, badge: "民宿" }));
    const vs = (venueList || []).filter((v) => v.is_active).map((v) => ({ name: v.name, badge: v.type || "其他" }));
    const merged = [...pms, ...vs];
    // 排除當月已存在目標的場域
    const used = new Set(teamRows.map((r) => r.venue_name));
    return merged.filter((o) => !used.has(o.name)).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [accList, venueList, teamRows]);

  useEffect(() => {
    (async () => {
      const scoutRes = await supabase.rpc("get_team_role_members", { p_role: "scout" });
      if (scoutRes.data) {
        const seen = new Set<string>();
        const list: Scout[] = [];
        for (const r of scoutRes.data as any[]) {
          if (!seen.has(r.user_id)) {
            seen.add(r.user_id);
            list.push({ user_id: r.user_id, display_name: r.display_name ?? r.user_id });
          }
        }
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setScouts(list);
      }
    })();
  }, []);

  const kpiMonthStr = `${year}-${String(month).padStart(2, "0")}-01`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setFallbackLabel("");

    // 1. 當月團隊目標
    let { data: settings } = await supabase
      .from("scout_team_targets" as any)
      .select("*")
      .eq("year", year)
      .eq("month", month);

    // 2. 若無資料，回退到最近一個月
    if (!settings || settings.length === 0) {
      const cutoff = year * 100 + month;
      const { data: all } = await supabase.from("scout_team_targets" as any).select("*");
      const earlier = ((all as any[]) ?? []).filter((r) => r.year * 100 + r.month < cutoff);
      if (earlier.length > 0) {
        earlier.sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
        const latest = earlier[0];
        settings = earlier.filter((r) => r.year === latest.year && r.month === latest.month);
        setFallbackLabel(`沿用 ${latest.year}/${latest.month} 設定`);
      } else {
        settings = [];
      }
    }

    // 3. 當月實際邀約（依 venue_name + kpi_month）
    const venueNames = (settings as any[]).map((s) => s.venue_name).filter(Boolean);
    let kolData: any[] = [];
    if (venueNames.length > 0) {
      const { data } = await supabase
        .from("kol_profiles")
        .select("scout_id, venue_name")
        .eq("is_error", false)
        .eq("kpi_month", kpiMonthStr)
        .in("venue_name", venueNames);
      kolData = data ?? [];
    }

    // 全部 kol_profiles 當月（給個人表用，含未在設定中的場域亦可顯示）
    const { data: allKol } = await supabase
      .from("kol_profiles")
      .select("scout_id, venue_name")
      .eq("is_error", false)
      .eq("kpi_month", kpiMonthStr);

    // 團隊實際統計
    const teamActual = new Map<string, number>();
    kolData.forEach((k) => {
      if (k.venue_name) teamActual.set(k.venue_name, (teamActual.get(k.venue_name) ?? 0) + 1);
    });

    const tRows: TeamTargetRow[] = (settings as any[]).map((s) => ({
      id: s.id,
      venue_name: s.venue_name ?? "-",
      target_count: s.target_count ?? 0,
      personal_min: s.personal_min,
      is_starlink: !!s.is_starlink,
      actual_count: teamActual.get(s.venue_name) ?? 0,
    }));
    tRows.sort((a, b) => a.venue_name.localeCompare(b.venue_name));
    setTeamRows(tRows);

    // 個人實際統計
    const personalMap = new Map<string, number>();
    (allKol ?? []).forEach((k: any) => {
      if (k.scout_id && k.venue_name) {
        const key = `${k.scout_id}|${k.venue_name}`;
        personalMap.set(key, (personalMap.get(key) ?? 0) + 1);
      }
    });
    const personalMinMap = new Map<string, number | null>(
      (settings as any[]).map((s) => [s.venue_name, s.personal_min]),
    );
    const scoutMap = new Map(scouts.map((s) => [s.user_id, s.display_name]));
    const pRows: PersonalRow[] = [];
    for (const [key, actual] of personalMap.entries()) {
      const [scout_id, venue_name] = key.split("|");
      // 僅顯示具備 scout 角色的成員，過濾掉歷史/其他角色資料
      if (!scoutMap.has(scout_id)) continue;
      pRows.push({
        scout_id,
        scout_name: scoutMap.get(scout_id) ?? scout_id.slice(0, 8),
        venue_name,
        personal_min: personalMinMap.has(venue_name) ? (personalMinMap.get(venue_name) ?? null) : null,
        actual_count: actual,
      });
    }
    pRows.sort((a, b) => a.scout_name.localeCompare(b.scout_name) || a.venue_name.localeCompare(b.venue_name));
    setPersonalRows(pRows);
    setLoading(false);
  }, [year, month, kpiMonthStr, scouts]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openEdit = (row: TeamTargetRow) => {
    setEditRow(row);
    setEditTarget(String(row.target_count));
    setEditPersonal(row.personal_min == null ? "" : String(row.personal_min));
    setEditStarlink(row.is_starlink);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const t = parseInt(editTarget, 10);
    if (Number.isNaN(t) || t < 0) {
      toast.error("請輸入有效的團隊目標數");
      return;
    }
    const pm = editPersonal.trim() === "" ? null : parseInt(editPersonal, 10);
    if (pm !== null && (Number.isNaN(pm) || pm < 0)) {
      toast.error("請輸入有效的個人最低目標");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("scout_team_targets" as any) as any)
      .update({ target_count: t, personal_min: pm, is_starlink: editStarlink })
      .eq("id", editRow.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已更新目標");
    setEditRow(null);
    fetchAll();
  };

  const handleAdd = async () => {
    const name = addVenue.trim();
    if (!name) {
      toast.error("請輸入場域名稱");
      return;
    }
    const t = parseInt(addTarget, 10);
    if (Number.isNaN(t) || t < 0) {
      toast.error("請輸入有效的團隊目標數");
      return;
    }
    const pm = addPersonal.trim() === "" ? null : parseInt(addPersonal, 10);
    if (pm !== null && (Number.isNaN(pm) || pm < 0)) {
      toast.error("請輸入有效的個人最低目標");
      return;
    }
    setSaving(true);
    // 嘗試解析 accommodation_id
    const { data: acc } = await supabase.from("accommodation_info").select("id").eq("name", name).maybeSingle();
    const { error } = await (supabase.from("scout_team_targets" as any) as any).insert({
      year,
      month,
      venue_name: name,
      target_count: t,
      personal_min: pm,
      is_starlink: addStarlink,
      accommodation_id: acc?.id ?? null,
      created_by: currentUserId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增目標");
    setAddOpen(false);
    setAddVenue("");
    setAddTarget("0");
    setAddPersonal("");
    setAddStarlink(false);
    fetchAll();
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Label>年月:</Label>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
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
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
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

      {/* 團隊邀約目標 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold">團隊邀約目標</h2>
            {fallbackLabel && <span className="text-xs text-muted-foreground">{fallbackLabel}</span>}
          </div>
          {isManager && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新增目標
            </Button>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>場域</TableHead>
                <TableHead className="text-center">星鏈</TableHead>
                <TableHead className="text-right">團隊目標</TableHead>
                <TableHead className="text-right">實際邀約數</TableHead>
                <TableHead className="text-right">達標率</TableHead>
                <TableHead>個人最低目標</TableHead>
                <TableHead className="text-right">狀態</TableHead>
                {isManager && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : teamRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isManager ? 8 : 7} className="text-center text-sm text-muted-foreground">
                    尚無目標資料
                  </TableCell>
                </TableRow>
              ) : (
                teamRows.map((r) => {
                  const rate = r.target_count > 0 ? Math.round((r.actual_count / r.target_count) * 100) : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.venue_name}</TableCell>
                      <TableCell className="text-center">{r.is_starlink ? "✅" : "－"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.target_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.actual_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{rate}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.personal_min == null ? "不限定" : `每人至少 ${r.personal_min} 位`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={achievementColor(r.actual_count, r.target_count)}>
                          {achievementLabel(r.actual_count, r.target_count)}
                        </Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
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
        </Card>
      </div>

      {/* 個人邀約達標率 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">個人邀約達標率</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={personalScoutFilter} onValueChange={setPersonalScoutFilter}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="星探" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部星探</SelectItem>
                {Array.from(new Set(personalRows.map((r) => r.scout_name))).map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={personalVenueFilter} onValueChange={setPersonalVenueFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="場域" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部場域</SelectItem>
                {Array.from(new Set(personalRows.map((r) => r.venue_name))).map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>星探</TableHead>
                <TableHead>場域</TableHead>
                <TableHead className="text-right">個人目標</TableHead>
                <TableHead className="text-right">實際邀約數</TableHead>
                <TableHead className="text-right">達標狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const filtered = personalRows.filter(
                  (r) =>
                    (personalScoutFilter === "all" || r.scout_name === personalScoutFilter) &&
                    (personalVenueFilter === "all" || r.venue_name === personalVenueFilter),
                );
                if (loading) return null;
                if (filtered.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        本月尚無個人邀約紀錄
                      </TableCell>
                    </TableRow>
                  );
                }
                return filtered.map((r, i) => {
                  let badge: JSX.Element;
                  if (r.personal_min == null) {
                    badge = <span className="text-muted-foreground">—</span>;
                  } else if (r.actual_count >= r.personal_min) {
                    badge = (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                        ✅ 達標
                      </Badge>
                    );
                  } else {
                    badge = (
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                        ❌ 未達標
                      </Badge>
                    );
                  }
                  return (
                    <TableRow key={`${r.scout_id}-${r.venue_name}-${i}`}>
                      <TableCell>{r.scout_name}</TableCell>
                      <TableCell>{r.venue_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.personal_min == null ? "不限定" : r.personal_min}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.actual_count}</TableCell>
                      <TableCell className="text-right">{badge}</TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* 編輯 Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="sm:max-w-sm overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>編輯目標 — {editRow?.venue_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="團隊目標數">
              <Input type="number" min={0} value={editTarget} onChange={(e) => setEditTarget(e.target.value)} />
            </Field>
            <Field label="個人最低目標（留空=不限定）">
              <Input
                type="number"
                min={0}
                value={editPersonal}
                onChange={(e) => setEditPersonal(e.target.value)}
                placeholder="不限定"
              />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox id="edit-starlink" checked={editStarlink} onCheckedChange={(c) => setEditStarlink(!!c)} />
              <Label htmlFor="edit-starlink" className="cursor-pointer">
                是否為星鏈場域
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增 Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              新增邀約目標（{year} 年 {month} 月）
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="場域名稱">
              <Select value={addVenue} onValueChange={setAddVenue}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {venueOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">無可選場域</div>
                  ) : (
                    venueOptions.map((opt) => (
                      <SelectItem key={opt.name} value={opt.name}>
                        <span className="inline-flex items-center gap-2">
                          <span>{opt.name}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.badge}</span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="團隊目標數">
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={addTarget}
                onChange={(e) => setAddTarget(e.target.value)}
              />
            </Field>
            <Field label="個人最低目標（留空=不限定）">
              <Input
                type="number"
                min={0}
                value={addPersonal}
                onChange={(e) => setAddPersonal(e.target.value)}
                placeholder="不限定"
              />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox id="add-starlink" checked={addStarlink} onCheckedChange={(c) => setAddStarlink(!!c)} />
              <Label htmlFor="add-starlink" className="cursor-pointer">
                是否為星鏈場域
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "新增中..." : "新增"}
            </Button>
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

function RaritySettingsTab({ isManager }: { isManager: boolean }) {
  const [versions, setVersions] = useState<RarityVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEffectiveFrom, setNewEffectiveFrom] = useState(todayStr());
  const [draft, setDraft] = useState<Record<string, { fan_range_desc: string; bonus_amount: string }>>(() =>
    Object.fromEntries(RARITY_ORDER.map((r) => [r, { fan_range_desc: "", bonus_amount: "0" }])),
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
    for (const r of (data ?? []) as unknown as RaritySetting[]) {
      if (!groups.has(r.effective_from)) groups.set(r.effective_from, []);
      groups.get(r.effective_from)!.push(r);
    }
    const list: RarityVersion[] = Array.from(groups.entries()).map(([ef, items]) => ({
      effective_from: ef,
      items: items.sort((a, b) => RARITY_ORDER.indexOf(a.rarity as any) - RARITY_ORDER.indexOf(b.rarity as any)),
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
              <h3 className="font-semibold">稀有度邀約獎金</h3>
              <p className="text-xs text-muted-foreground">
                目前生效版本{current ? `・生效日期：${current.effective_from}` : "：尚無任何版本"}
              </p>
            </div>
            {isManager && (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                新增版本
              </Button>
            )}
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
                        <Badge variant="outline" className={RARITY_CLASS[r as Rarity] ?? ""}>
                          {r}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{hit?.fan_range_desc ?? "-"}</TableCell>
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
                        <TableCell key={r} className="text-right tabular-nums text-xs">
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
        <DialogContent className="max-w-2xl overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增稀有度版本</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="生效日期 *">
              <Input type="date" value={newEffectiveFrom} onChange={(e) => setNewEffectiveFrom(e.target.value)} />
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
                      <Badge variant="outline" className={RARITY_CLASS[r as Rarity] ?? ""}>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
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

// ============================================================
// ====== Tab 四：設定 (稀有度 + 合作場域) ======
// ============================================================
function SettingsTab({ isManager }: { isManager: boolean }) {
  return (
    <div className="space-y-4">
      <SalarySettingsBlock isManager={isManager} />
      <RaritySettingsTab isManager={isManager} />
      <TierSettingsBlock isManager={isManager} />
    </div>
  );
}

interface VenueRow {
  id: string;
  name: string;
  type: string | null;
  is_active: boolean;
}

interface VenueSettingsRow {
  id?: string;
  venue_name: string;
  group_name: string | null;
  calc_type: string | null;
  daily_limit: number | null;
  collab_start: string | null;
  collab_end: string | null;
  allowed_weekdays: number[] | null;
  special_start: string | null;
  special_end: string | null;
  special_limit: number | null;
  special_weekdays: number[] | null;
  monthly_limit: number | null;
  link_rule: string | null;
  order_number_rule: string | null;
  is_active: boolean;
  is_starlink: boolean;
  personal_target: number | null;
  contact_email: string | null;
  has_external_platform: boolean;
}

const VENUE_TYPES = ["民宿", "餐廳", "農場", "其他"] as const;

const EMPTY_SETTINGS = (venue_name: string): VenueSettingsRow => ({
  venue_name,
  group_name: null,
  calc_type: null,
  daily_limit: null,
  collab_start: null,
  collab_end: null,
  allowed_weekdays: null,
  special_start: null,
  special_end: null,
  special_limit: null,
  special_weekdays: null,
  monthly_limit: null,
  link_rule: null,
  order_number_rule: null,
  is_active: true,
  is_starlink: false,
  personal_target: null,
  contact_email: null,
  has_external_platform: false,
});

function VenuesCard({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("民宿");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // 篩選器
  const [filterName, setFilterName] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  useEffect(() => {
    setPage(1);
  }, [filterName, filterType, filterStatus]);

  // Drawer state
  const [editOpen, setEditOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"view" | "edit">("edit");
  const [editVenue, setEditVenue] = useState<VenueRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("民宿");
  const [editActive, setEditActive] = useState(true);
  const [settings, setSettings] = useState<VenueSettingsRow>(EMPTY_SETTINGS(""));
  const [originalVenueName, setOriginalVenueName] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const readOnly = viewMode === "view";

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kol_venues" as any)
      .select("id, name, type, is_active")
      .order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as VenueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const n = newName.trim();
    if (!n) {
      toast.error("請輸入場域名稱");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("kol_venues" as any).insert({ name: n, type: newType, is_active: true });
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    // 同步建立 kol_venue_settings 預設記錄（若不存在）
    const { data: existing } = await supabase
      .from("kol_venue_settings" as any)
      .select("id")
      .eq("venue_name", n)
      .maybeSingle();
    if (!existing) {
      const { error: sErr } = await supabase
        .from("kol_venue_settings" as any)
        .insert({ venue_name: n, is_active: true, is_starlink: false });
      if (sErr) {
        toast.error(`場域已建立，但邀約規則建立失敗：${sErr.message}`);
      }
    }
    setSaving(false);
    toast.success("已新增場域");
    setNewName("");
    setNewType("民宿");
    setAddOpen(false);
    load();
  };

  const openEdit = async (r: VenueRow, mode: "view" | "edit" = "edit") => {
    setViewMode(mode);
    setEditVenue(r);
    setEditName(r.name);
    setEditType(r.type || "其他");
    setEditActive(r.is_active);
    setOriginalVenueName(r.name);
    setSettings(EMPTY_SETTINGS(r.name));
    setEditOpen(true);
    setLoadingSettings(true);
    const { data, error } = await supabase
      .from("kol_venue_settings" as any)
      .select("*")
      .eq("venue_name", r.name)
      .maybeSingle();
    if (error && error.code !== "PGRST116") toast.error(error.message);
    if (data) setSettings(data as unknown as VenueSettingsRow);
    setLoadingSettings(false);
  };

  const toggleWeekday = (field: "allowed_weekdays" | "special_weekdays", day: number) => {
    setSettings((prev) => {
      const cur = prev[field] ?? [];
      const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
      return { ...prev, [field]: next };
    });
  };

  const saveEdit = async () => {
    if (!editVenue) return;
    const n = editName.trim();
    if (!n) {
      toast.error("請輸入場域名稱");
      return;
    }
    setSaving(true);
    // 1. 更新 kol_venues
    const { error: vErr } = await supabase
      .from("kol_venues" as any)
      .update({ name: n, type: editType, is_active: editActive })
      .eq("id", editVenue.id);
    if (vErr) {
      setSaving(false);
      toast.error(`更新場域失敗：${vErr.message}`);
      return;
    }
    // 2. 若名稱已變更，同步更新 kol_venue_settings.venue_name
    if (originalVenueName && originalVenueName !== n) {
      await supabase
        .from("kol_venue_settings" as any)
        .update({ venue_name: n })
        .eq("venue_name", originalVenueName);
    }
    // 3. upsert kol_venue_settings
    const payload: Partial<VenueSettingsRow> = {
      venue_name: n,
      group_name: settings.group_name || null,
      calc_type: settings.calc_type || null,
      daily_limit: settings.daily_limit,
      collab_start: settings.collab_start || null,
      collab_end: settings.collab_end || null,
      allowed_weekdays: settings.allowed_weekdays,
      special_start: settings.special_start || null,
      special_end: settings.special_end || null,
      special_limit: settings.special_limit,
      special_weekdays: settings.special_weekdays,
      monthly_limit: settings.monthly_limit,
      link_rule: settings.link_rule || null,
      order_number_rule: settings.order_number_rule || null,
      is_active: settings.is_active,
      is_starlink: settings.is_starlink,
      personal_target: settings.personal_target,
      contact_email: settings.contact_email?.trim() || null,
      has_external_platform: settings.has_external_platform,
    };
    const { data: existing } = await supabase
      .from("kol_venue_settings" as any)
      .select("id")
      .eq("venue_name", n)
      .maybeSingle();
    if (existing) {
      const { error: sErr } = await supabase
        .from("kol_venue_settings" as any)
        .update(payload)
        .eq("venue_name", n);
      if (sErr) {
        setSaving(false);
        toast.error(`更新邀約規則失敗：${sErr.message}`);
        return;
      }
    } else {
      const { error: sErr } = await supabase.from("kol_venue_settings" as any).insert(payload);
      if (sErr) {
        setSaving(false);
        toast.error(`建立邀約規則失敗：${sErr.message}`);
        return;
      }
    }
    setSaving(false);
    toast.success("已更新");
    setEditOpen(false);
    setEditVenue(null);
    load();
  };

  const toggleActive = async (r: VenueRow) => {
    const { error } = await supabase
      .from("kol_venues" as any)
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  };

  const numInput = (val: number | null, set: (v: number | null) => void) => (
    <Input
      type="number"
      value={val ?? ""}
      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
      className="h-9"
      disabled={readOnly}
    />
  );
  const textInput = (val: string | null, set: (v: string) => void) => (
    <Input value={val ?? ""} onChange={(e) => set(e.target.value)} className="h-9" disabled={readOnly} />
  );
  const dateInput = (val: string | null, set: (v: string) => void) => (
    <Input type="date" value={val ?? ""} onChange={(e) => set(e.target.value)} className="h-9" disabled={readOnly} />
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold">合作場域管理</h3>
          <p className="text-xs text-muted-foreground">
            管理非 PMS 民宿的合作場域（餐廳、農場等），將同步顯示於館別下拉選單
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="搜尋場域名稱"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="w-48"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="類型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">類型</SelectItem>
              {VENUE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">狀態</SelectItem>
              <SelectItem value="active">啟用</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
            </SelectContent>
          </Select>
          {isManager && (
            <Button className="ml-auto" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新增
            </Button>
          )}
        </div>

        {(() => {
          const filtered = rows.filter((r) => {
            if (filterName.trim() && !r.name.toLowerCase().includes(filterName.trim().toLowerCase())) return false;
            if (filterType !== "all" && (r.type || "") !== filterType) return false;
            if (filterStatus === "active" && !r.is_active) return false;
            if (filterStatus === "inactive" && r.is_active) return false;
            return true;
          });
          if (loading) return null;
          if (filtered.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">尚無資料</p>;
          const totalCount = filtered.length;
          const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
          const currentPage = Math.min(page, totalPages);
          const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
          return (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>場域名稱</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r, "view")}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.type || "-"}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                            啟用
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                            停用
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isManager && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(r, "edit");
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActive(r);
                              }}
                            >
                              {r.is_active ? "停用" : "啟用"}
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  共 {totalCount} 筆，第 {currentPage} / {totalPages} 頁
                </p>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      上一頁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一頁
                    </Button>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>新增場域</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">場域名稱</label>
                <Input placeholder="場域名稱" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">類型</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENUE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={handleAdd} disabled={saving}>
                <Plus className="mr-1 h-4 w-4" />
                新增
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
            <SheetHeader>
              <div className="flex items-center justify-between gap-2 pr-8">
                <SheetTitle>
                  {readOnly ? "場域明細" : "編輯場域"} — {originalVenueName}
                </SheetTitle>
                {readOnly && isManager && (
                  <Button size="sm" onClick={() => setViewMode("edit")}>
                    <Pencil className="mr-1 h-4 w-4" />
                    編輯
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 py-4">
              {readOnly ? (
                (() => {
                  const dash = "—";
                  const showText = (v: any) => (v === null || v === undefined || v === "" ? dash : String(v));
                  const showBool = (v: boolean, on = "啟用", off = "停用") => (v ? `✓ ${on}` : `✗ ${off}`);
                  const showDays = (arr: number[] | null | undefined) =>
                    arr && arr.length > 0
                      ? arr
                          .slice()
                          .sort((a, b) => a - b)
                          .map((i) => WEEKDAYS[i])
                          .join("、")
                      : dash;
                  const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-sm">{value}</div>
                    </div>
                  );
                  return (
                    <>
                      <section className="space-y-3">
                        <h4 className="font-semibold text-sm">基本資訊</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                          <Item label="場域名稱" value={showText(editName)} />
                          <Item label="類型" value={showText(editType)} />
                          <Item label="狀態" value={showBool(editActive)} />
                        </div>
                      </section>
                      <section className="space-y-3">
                        <h4 className="font-semibold text-sm">邀約規則設定</h4>
                        {loadingSettings ? (
                          <p className="text-xs text-muted-foreground">載入中…</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            <Item label="星鏈場域" value={showBool(settings.is_starlink, "是", "否")} />
                            <Item label="個人目標" value={showText(settings.personal_target)} />
                            <Item label="群組名稱" value={showText(settings.group_name)} />
                            <Item label="計算方式" value={showText(settings.calc_type)} />
                            <Item label="每日上限" value={showText(settings.daily_limit)} />
                            <Item label="每月上限" value={showText(settings.monthly_limit)} />
                            <Item label="合作開始日" value={showText(settings.collab_start)} />
                            <Item label="合作結束日" value={showText(settings.collab_end)} />
                            <div className="col-span-2">
                              <Item label="可邀星期" value={showDays(settings.allowed_weekdays)} />
                            </div>
                            <Item label="特殊期間開始" value={showText(settings.special_start)} />
                            <Item label="特殊期間結束" value={showText(settings.special_end)} />
                            <Item label="特殊期間上限" value={showText(settings.special_limit)} />
                            <div className="col-span-2">
                              <Item label="特殊期間可邀星期" value={showDays(settings.special_weekdays)} />
                            </div>
                            <div className="col-span-2">
                              <Item label="連結規則" value={showText(settings.link_rule)} />
                            </div>
                            <div className="col-span-2">
                              <Item label="訂單編號規則" value={showText(settings.order_number_rule)} />
                            </div>
                            <Item label="聯絡 Email" value={showText(settings.contact_email)} />
                            <Item label="有外部訂房平台" value={showBool(settings.has_external_platform, "是", "否")} />
                          </div>
                        )}
                      </section>
                    </>
                  );
                })()
              ) : (
                <>
                  {/* 區塊一：基本資訊 */}
                  <section className="space-y-3">
                    <h4 className="font-semibold text-sm">基本資訊</h4>
                    <Field label="場域名稱">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={readOnly} />
                    </Field>
                    <Field label="類型">
                      <Select value={editType} onValueChange={setEditType} disabled={readOnly}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VENUE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="venue-active"
                        checked={editActive}
                        onCheckedChange={(v) => setEditActive(v === true)}
                        disabled={readOnly}
                      />
                      <Label htmlFor="venue-active" className="cursor-pointer">
                        啟用此場域
                      </Label>
                    </div>
                  </section>

                  {/* 區塊二：邀約規則 */}
                  <section className="space-y-3">
                    <h4 className="font-semibold text-sm">邀約規則設定</h4>
                    {loadingSettings ? (
                      <p className="text-xs text-muted-foreground">載入中…</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="venue-starlink"
                            checked={settings.is_starlink}
                            onCheckedChange={(v) => setSettings((p) => ({ ...p, is_starlink: v === true }))}
                            disabled={readOnly}
                          />
                          <Label htmlFor="venue-starlink" className="cursor-pointer">
                            星鏈場域
                          </Label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="個人目標">
                            {numInput(settings.personal_target, (v) =>
                              setSettings((p) => ({ ...p, personal_target: v })),
                            )}
                          </Field>
                          <Field label="群組名稱">
                            {textInput(settings.group_name, (v) => setSettings((p) => ({ ...p, group_name: v })))}
                          </Field>
                          <Field label="計算方式">
                            {textInput(settings.calc_type, (v) => setSettings((p) => ({ ...p, calc_type: v })))}
                          </Field>
                          <Field label="每日上限">
                            {numInput(settings.daily_limit, (v) => setSettings((p) => ({ ...p, daily_limit: v })))}
                          </Field>
                          <Field label="每月上限">
                            {numInput(settings.monthly_limit, (v) => setSettings((p) => ({ ...p, monthly_limit: v })))}
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="合作開始日">
                            {dateInput(settings.collab_start, (v) => setSettings((p) => ({ ...p, collab_start: v })))}
                          </Field>
                          <Field label="合作結束日">
                            {dateInput(settings.collab_end, (v) => setSettings((p) => ({ ...p, collab_end: v })))}
                          </Field>
                        </div>

                        <Field label="可邀星期">
                          <div className="flex flex-wrap gap-3">
                            {WEEKDAYS.map((w, idx) => (
                              <label key={`aw-${idx}`} className="flex items-center gap-1 text-sm cursor-pointer">
                                <Checkbox
                                  checked={(settings.allowed_weekdays ?? []).includes(idx)}
                                  onCheckedChange={() => toggleWeekday("allowed_weekdays", idx)}
                                  disabled={readOnly}
                                />
                                {w}
                              </label>
                            ))}
                          </div>
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="特殊期間開始">
                            {dateInput(settings.special_start, (v) => setSettings((p) => ({ ...p, special_start: v })))}
                          </Field>
                          <Field label="特殊期間結束">
                            {dateInput(settings.special_end, (v) => setSettings((p) => ({ ...p, special_end: v })))}
                          </Field>
                          <Field label="特殊期間上限">
                            {numInput(settings.special_limit, (v) => setSettings((p) => ({ ...p, special_limit: v })))}
                          </Field>
                        </div>

                        <Field label="特殊期間可邀星期">
                          <div className="flex flex-wrap gap-3">
                            {WEEKDAYS.map((w, idx) => (
                              <label key={`sw-${idx}`} className="flex items-center gap-1 text-sm cursor-pointer">
                                <Checkbox
                                  checked={(settings.special_weekdays ?? []).includes(idx)}
                                  onCheckedChange={() => toggleWeekday("special_weekdays", idx)}
                                  disabled={readOnly}
                                />
                                {w}
                              </label>
                            ))}
                          </div>
                        </Field>

                        <Field label="連結規則">
                          {textInput(settings.link_rule, (v) => setSettings((p) => ({ ...p, link_rule: v })))}
                        </Field>
                        <Field label="訂單編號規則">
                          {textInput(settings.order_number_rule, (v) =>
                            setSettings((p) => ({ ...p, order_number_rule: v })),
                          )}
                        </Field>
                        <Field label="聯絡 Email">
                          <Input
                            type="email"
                            placeholder="負責人 Email"
                            value={settings.contact_email ?? ""}
                            onChange={(e) =>
                              setSettings((p) => ({ ...p, contact_email: e.target.value }))
                            }
                            disabled={readOnly}
                          />
                        </Field>
                        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                          <div className="space-y-0.5">
                            <Label htmlFor="venue-external-platform" className="cursor-pointer">
                              有外部訂房平台
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              開啟後建立邀約時將額外通知此 Email
                            </p>
                          </div>
                          <Switch
                            id="venue-external-platform"
                            checked={settings.has_external_platform}
                            onCheckedChange={(v) =>
                              setSettings((p) => ({ ...p, has_external_platform: v === true }))
                            }
                            disabled={readOnly}
                          />
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}
            </div>

            <SheetFooter>
              {readOnly ? (
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  關閉
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                    取消
                  </Button>
                  <Button onClick={saveEdit} disabled={saving || loadingSettings}>
                    {saving ? "儲存中…" : "儲存"}
                  </Button>
                </>
              )}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

// ============================================================
// ====== PMS 民宿設定（kol_venue_settings by accommodation_info） ======
// ============================================================
interface PmsAccomRow {
  id: string;
  name: string;
  hasSettings: boolean;
}

function PmsVenueSettingsCard({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<PmsAccomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [settings, setSettings] = useState<VenueSettingsRow>(EMPTY_SETTINGS(""));
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: accoms, error: aErr }, { data: settingsRows, error: sErr }] = await Promise.all([
      supabase
        .from("accommodation_info")
        .select("id, name")
        .eq("is_active", true)
        .neq("name", "奧丁丁測試")
        .order("name"),
      supabase.from("kol_venue_settings" as any).select("venue_name"),
    ]);
    if (aErr) toast.error(aErr.message);
    if (sErr) toast.error(sErr.message);
    const settingsSet = new Set(((settingsRows ?? []) as any[]).map((r) => r.venue_name));
    setRows(
      ((accoms ?? []) as any[]).map((a) => ({
        id: a.id,
        name: a.name,
        hasSettings: settingsSet.has(a.name),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadSettings = async (name: string) => {
    setLoadingSettings(true);
    setSettings(EMPTY_SETTINGS(name));
    const { data, error } = await supabase
      .from("kol_venue_settings" as any)
      .select("*")
      .eq("venue_name", name)
      .maybeSingle();
    if (error && error.code !== "PGRST116") toast.error(error.message);
    if (data) setSettings(data as unknown as VenueSettingsRow);
    setLoadingSettings(false);
  };

  const openEdit = async (name: string) => {
    setEditName(name);
    setEditOpen(true);
    await loadSettings(name);
  };

  const openView = async (name: string) => {
    setEditName(name);
    setViewOpen(true);
    await loadSettings(name);
  };

  const switchToEdit = () => {
    setViewOpen(false);
    setEditOpen(true);
  };

  const toggleWeekday = (field: "allowed_weekdays" | "special_weekdays", day: number) => {
    setSettings((prev) => {
      const cur = prev[field] ?? [];
      const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
      return { ...prev, [field]: next };
    });
  };

  const saveEdit = async () => {
    const n = editName.trim();
    if (!n) return;
    setSaving(true);
    const payload: Partial<VenueSettingsRow> = {
      venue_name: n,
      group_name: settings.group_name || null,
      calc_type: settings.calc_type || null,
      daily_limit: settings.daily_limit,
      collab_start: settings.collab_start || null,
      collab_end: settings.collab_end || null,
      allowed_weekdays: settings.allowed_weekdays,
      special_start: settings.special_start || null,
      special_end: settings.special_end || null,
      special_limit: settings.special_limit,
      special_weekdays: settings.special_weekdays,
      monthly_limit: settings.monthly_limit,
      link_rule: settings.link_rule || null,
      order_number_rule: settings.order_number_rule || null,
      is_active: settings.is_active,
      is_starlink: settings.is_starlink,
      personal_target: settings.personal_target,
      contact_email: settings.contact_email?.trim() || null,
      has_external_platform: settings.has_external_platform,
    };
    const { data: existing } = await supabase
      .from("kol_venue_settings" as any)
      .select("id")
      .eq("venue_name", n)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("kol_venue_settings" as any)
        .update(payload)
        .eq("venue_name", n);
      if (error) {
        setSaving(false);
        toast.error(`更新失敗：${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("kol_venue_settings" as any).insert(payload);
      if (error) {
        setSaving(false);
        toast.error(`建立失敗：${error.message}`);
        return;
      }
    }
    setSaving(false);
    toast.success("已儲存");
    setEditOpen(false);
    load();
  };

  const numInput = (val: number | null, set: (v: number | null) => void) => (
    <Input
      type="number"
      value={val ?? ""}
      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
      className="h-9"
    />
  );
  const textInput = (val: string | null, set: (v: string) => void) => (
    <Input value={val ?? ""} onChange={(e) => set(e.target.value)} className="h-9" />
  );
  const dateInput = (val: string | null, set: (v: string) => void) => (
    <Input type="date" value={val ?? ""} onChange={(e) => set(e.target.value)} className="h-9" />
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold">PMS 民宿設定</h3>
          <p className="text-xs text-muted-foreground">
            管理 PMS 民宿的 KOL 庫存設定（入住配額、允許星期等）
          </p>
        </div>

        {loading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">尚無資料</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>民宿名稱</TableHead>
                <TableHead>設定狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openView(r.name)}
                >
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    {r.hasSettings ? (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                        已設定
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                        未設定
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isManager && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Sheet open={viewOpen} onOpenChange={setViewOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden">
            <SheetHeader>
              <div className="flex items-center justify-between gap-2 pr-8">
                <SheetTitle>場域明細 — {editName}</SheetTitle>
                {isManager && (
                  <Button size="sm" onClick={switchToEdit}>
                    <Pencil className="mr-1 h-4 w-4" />
                    編輯
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 py-4">
              {(() => {
                const dash = "—";
                const showText = (v: any) => (v === null || v === undefined || v === "" ? dash : String(v));
                const showBool = (v: boolean, on = "啟用", off = "停用") => (v ? `✓ ${on}` : `✗ ${off}`);
                const showDays = (arr: number[] | null | undefined) =>
                  arr && arr.length > 0
                    ? arr
                        .slice()
                        .sort((a, b) => a - b)
                        .map((i) => WEEKDAYS[i])
                        .join("、")
                    : dash;
                const Item = ({ label, value }: { label: string; value: React.ReactNode }) => (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-sm">{value}</div>
                  </div>
                );
                return (
                  <>
                    <section className="space-y-3">
                      <h4 className="font-semibold text-sm">基本資訊</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        <Item label="民宿名稱" value={showText(editName)} />
                        <Item label="設定狀態" value={showBool(settings.is_active)} />
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h4 className="font-semibold text-sm">邀約規則設定</h4>
                      {loadingSettings ? (
                        <p className="text-xs text-muted-foreground">載入中…</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                          <Item label="星鏈場域" value={showBool(settings.is_starlink, "是", "否")} />
                          <Item label="個人目標" value={showText(settings.personal_target)} />
                          <Item label="群組名稱" value={showText(settings.group_name)} />
                          <Item label="計算方式" value={showText(settings.calc_type)} />
                          <Item label="每日上限" value={showText(settings.daily_limit)} />
                          <Item label="每月上限" value={showText(settings.monthly_limit)} />
                          <Item label="合作開始日" value={showText(settings.collab_start)} />
                          <Item label="合作結束日" value={showText(settings.collab_end)} />
                          <div className="col-span-2">
                            <Item label="可邀星期" value={showDays(settings.allowed_weekdays)} />
                          </div>
                          <Item label="特殊期間開始" value={showText(settings.special_start)} />
                          <Item label="特殊期間結束" value={showText(settings.special_end)} />
                          <Item label="特殊期間上限" value={showText(settings.special_limit)} />
                          <div className="col-span-2">
                            <Item label="特殊期間可邀星期" value={showDays(settings.special_weekdays)} />
                          </div>
                          <div className="col-span-2">
                            <Item label="連結規則" value={showText(settings.link_rule)} />
                          </div>
                          <div className="col-span-2">
                            <Item label="訂單編號規則" value={showText(settings.order_number_rule)} />
                          </div>
                          <Item label="聯絡 Email" value={showText(settings.contact_email)} />
                          <Item label="有外部訂房平台" value={showBool(settings.has_external_platform, "是", "否")} />
                        </div>
                      )}
                    </section>
                  </>
                );
              })()}
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                關閉
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>編輯 PMS 民宿設定 — {editName}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {loadingSettings ? (
                <p className="text-xs text-muted-foreground">載入中…</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pms-starlink"
                      checked={settings.is_starlink}
                      onCheckedChange={(v) => setSettings((p) => ({ ...p, is_starlink: v === true }))}
                    />
                    <Label htmlFor="pms-starlink" className="cursor-pointer">
                      星鏈場域
                    </Label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="個人目標">
                      {numInput(settings.personal_target, (v) =>
                        setSettings((p) => ({ ...p, personal_target: v })),
                      )}
                    </Field>
                    <Field label="群組名稱">
                      {textInput(settings.group_name, (v) => setSettings((p) => ({ ...p, group_name: v })))}
                    </Field>
                    <Field label="計算方式">
                      {textInput(settings.calc_type, (v) => setSettings((p) => ({ ...p, calc_type: v })))}
                    </Field>
                    <Field label="每日上限">
                      {numInput(settings.daily_limit, (v) => setSettings((p) => ({ ...p, daily_limit: v })))}
                    </Field>
                    <Field label="每月上限">
                      {numInput(settings.monthly_limit, (v) => setSettings((p) => ({ ...p, monthly_limit: v })))}
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="合作開始日">
                      {dateInput(settings.collab_start, (v) => setSettings((p) => ({ ...p, collab_start: v })))}
                    </Field>
                    <Field label="合作結束日">
                      {dateInput(settings.collab_end, (v) => setSettings((p) => ({ ...p, collab_end: v })))}
                    </Field>
                  </div>

                  <Field label="可邀星期">
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAYS.map((w, idx) => (
                        <label key={`pms-aw-${idx}`} className="flex items-center gap-1 text-sm cursor-pointer">
                          <Checkbox
                            checked={(settings.allowed_weekdays ?? []).includes(idx)}
                            onCheckedChange={() => toggleWeekday("allowed_weekdays", idx)}
                          />
                          {w}
                        </label>
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="特殊期間開始">
                      {dateInput(settings.special_start, (v) => setSettings((p) => ({ ...p, special_start: v })))}
                    </Field>
                    <Field label="特殊期間結束">
                      {dateInput(settings.special_end, (v) => setSettings((p) => ({ ...p, special_end: v })))}
                    </Field>
                    <Field label="特殊期間上限">
                      {numInput(settings.special_limit, (v) => setSettings((p) => ({ ...p, special_limit: v })))}
                    </Field>
                  </div>

                  <Field label="特殊期間可邀星期">
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAYS.map((w, idx) => (
                        <label key={`pms-sw-${idx}`} className="flex items-center gap-1 text-sm cursor-pointer">
                          <Checkbox
                            checked={(settings.special_weekdays ?? []).includes(idx)}
                            onCheckedChange={() => toggleWeekday("special_weekdays", idx)}
                          />
                          {w}
                        </label>
                      ))}
                    </div>
                  </Field>

                  <Field label="連結規則">
                    {textInput(settings.link_rule, (v) => setSettings((p) => ({ ...p, link_rule: v })))}
                  </Field>
                  <Field label="訂單編號規則">
                    {textInput(settings.order_number_rule, (v) =>
                      setSettings((p) => ({ ...p, order_number_rule: v })),
                    )}
                  </Field>
                  <Field label="聯絡 Email">
                    <Input
                      type="email"
                      placeholder="負責人 Email"
                      value={settings.contact_email ?? ""}
                      onChange={(e) => setSettings((p) => ({ ...p, contact_email: e.target.value }))}
                    />
                  </Field>

                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="pms-external-platform" className="cursor-pointer">
                        有外部訂房平台
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        開啟後建立邀約時將額外通知此 Email
                      </p>
                    </div>
                    <Switch
                      id="pms-external-platform"
                      checked={settings.has_external_platform}
                      onCheckedChange={(v) =>
                        setSettings((p) => ({ ...p, has_external_platform: v === true }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pms-active"
                      checked={settings.is_active}
                      onCheckedChange={(v) => setSettings((p) => ({ ...p, is_active: v === true }))}
                    />
                    <Label htmlFor="pms-active" className="cursor-pointer">
                      啟用此設定
                    </Label>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button onClick={saveEdit} disabled={saving || loadingSettings}>
                {saving ? "儲存中…" : "儲存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}



// ============================================================
// ====== Tab 設定：KOL 分潤等級 ======
// ============================================================
interface TierRow {
  id: string;
  tier_name: string;
  min_count: number;
  max_count: number | null;
  commission_rate: number;
  sort_order: number | null;
  effective_from: string;
}

const formatMoney = (n: number | null | undefined) => `NT$ ${Number(n ?? 0).toLocaleString()}`;

function TierSettingsBlock({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [draft, setDraft] = useState<Omit<TierRow, "id" | "effective_from">[]>([
    { tier_name: "", min_count: 0, max_count: null, commission_rate: 0, sort_order: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scout_tier_settings")
      .select("*")
      .order("effective_from", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as TierRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const latestDate = rows[0]?.effective_from;
  const latestRows = rows.filter((r) => r.effective_from === latestDate);
  const historyDates = Array.from(new Set(rows.map((r) => r.effective_from))).slice(1);

  const openNew = () => {
    setEffectiveFrom(todayStr());
    setDraft(
      latestRows.length > 0
        ? latestRows.map((r) => ({
            tier_name: r.tier_name,
            min_count: r.min_count,
            max_count: r.max_count,
            commission_rate: Number(r.commission_rate),
            sort_order: r.sort_order ?? 0,
          }))
        : [{ tier_name: "", min_count: 0, max_count: null, commission_rate: 0, sort_order: 0 }],
    );
    setOpen(true);
  };

  const save = async () => {
    if (!effectiveFrom) {
      toast.error("請填入生效日期");
      return;
    }
    if (draft.some((d) => !d.tier_name)) {
      toast.error("請填入所有等級名稱");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = draft.map((d, idx) => ({
      tier_name: d.tier_name,
      min_count: d.min_count,
      max_count: d.max_count,
      commission_rate: d.commission_rate,
      sort_order: d.sort_order ?? idx,
      effective_from: effectiveFrom,
      created_by: auth.user?.id ?? null,
    }));
    const { error } = await supabase.from("scout_tier_settings").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已新增版本");
    setOpen(false);
    fetchRows();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-row items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">KOL 分潤等級</h3>
            <p className="text-xs text-muted-foreground mt-1">修改後只影響新訂單，歷史已結算資料不受影響</p>
          </div>
          {isManager && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> 新增版本
            </Button>
          )}
        </div>

        {loading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無設定</p>
        ) : (
          <>
            <div className="mb-2 text-sm font-medium">目前版本（生效日：{latestDate}）</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>等級名稱</TableHead>
                  <TableHead>累積人數</TableHead>
                  <TableHead>分潤比例</TableHead>
                  <TableHead>生效日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.tier_name}</TableCell>
                    <TableCell>
                      {r.min_count} ~ {r.max_count ?? "∞"}
                    </TableCell>
                    <TableCell>{(Number(r.commission_rate) * 100).toFixed(2)}%</TableCell>
                    <TableCell>{r.effective_from}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {historyDates.length > 0 && (
              <div className="mt-4 text-xs text-muted-foreground">歷史版本：{historyDates.join(", ")}</div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增 KOL 分潤等級版本</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>生效日期</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              {draft.map((d, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Label>等級名稱</Label>
                    <Input
                      value={d.tier_name}
                      onChange={(e) => {
                        const next = [...draft];
                        next[idx] = { ...d, tier_name: e.target.value };
                        setDraft(next);
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>下限</Label>
                    <Input
                      type="number"
                      value={d.min_count}
                      onChange={(e) => {
                        const next = [...draft];
                        next[idx] = { ...d, min_count: Number(e.target.value) };
                        setDraft(next);
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>上限（空=∞）</Label>
                    <Input
                      type="number"
                      value={d.max_count ?? ""}
                      onChange={(e) => {
                        const next = [...draft];
                        next[idx] = {
                          ...d,
                          max_count: e.target.value === "" ? null : Number(e.target.value),
                        };
                        setDraft(next);
                      }}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label>分潤比例（0~1，例如 0.05）</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={d.commission_rate}
                      onChange={(e) => {
                        const next = [...draft];
                        next[idx] = { ...d, commission_rate: Number(e.target.value) };
                        setDraft(next);
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft(draft.filter((_, i) => i !== idx))}
                      disabled={draft.length <= 1}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft([
                    ...draft,
                    {
                      tier_name: "",
                      min_count: 0,
                      max_count: null,
                      commission_rate: 0,
                      sort_order: draft.length,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> 新增等級
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// ====== Tab 設定：底薪與團隊獎金 ======
// ============================================================
interface SalaryRow {
  id: string;
  base_salary: number;
  team_bonus: number;
  team_threshold_pct: number;
  effective_from: string;
}

function SalarySettingsBlock({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<SalaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [base, setBase] = useState("3000");
  const [bonus, setBonus] = useState("2000");
  const [threshold, setThreshold] = useState("50");
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scout_salary_settings")
      .select("*")
      .order("effective_from", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as SalaryRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const latest = rows[0];

  const openEdit = () => {
    setEffectiveFrom(todayStr());
    setBase(String(latest?.base_salary ?? 3000));
    setBonus(String(latest?.team_bonus ?? 2000));
    setThreshold(String(latest?.team_threshold_pct ?? 50));
    setOpen(true);
  };

  const save = async () => {
    if (!effectiveFrom) return toast.error("請填生效日期");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("scout_salary_settings").insert({
      base_salary: Number(base),
      team_bonus: Number(bonus),
      team_threshold_pct: Number(threshold),
      effective_from: effectiveFrom,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已新增版本");
    setOpen(false);
    fetchRows();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-row items-start justify-between gap-2">
          <h3 className="font-semibold">底薪與團隊獎金</h3>
          {isManager && (
            <Button size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> 編輯
            </Button>
          )}
        </div>

        {loading ? null : !latest ? (
          <p className="text-sm text-muted-foreground">尚無設定</p>
        ) : (
          <div className="space-y-1 text-sm">
            <div>個人目標達成底薪：{formatMoney(latest.base_salary)}</div>
            <div>團隊獎金金額：{formatMoney(latest.team_bonus)}</div>
            <div>團隊達成門檻：{latest.team_threshold_pct}%</div>
            <div className="text-xs text-muted-foreground">生效日：{latest.effective_from}</div>
          </div>
        )}
        {rows.length > 1 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-1">歷史版本</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>生效日</TableHead>
                  <TableHead>底薪</TableHead>
                  <TableHead>團隊獎金</TableHead>
                  <TableHead>門檻</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(1).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.effective_from}</TableCell>
                    <TableCell>{formatMoney(r.base_salary)}</TableCell>
                    <TableCell>{formatMoney(r.team_bonus)}</TableCell>
                    <TableCell>{r.team_threshold_pct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>編輯底薪與團隊獎金</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>生效日期</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <Label>底薪金額</Label>
              <Input type="number" value={base} onChange={(e) => setBase(e.target.value)} />
            </div>
            <div>
              <Label>團隊獎金金額</Label>
              <Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </div>
            <div>
              <Label>團隊達成門檻 (%)</Label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
