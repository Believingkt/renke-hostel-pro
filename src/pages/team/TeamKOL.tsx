import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countsTowardTeamTarget } from "@/lib/scoutTeamAchievement";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, AlertTriangle, Check, X, Pencil, ExternalLink, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, HelpCircle, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { KolStatsTab } from "@/components/team/KolStatsTab";
import { KolPublishProgressCard } from "@/components/team/KolPublishProgressCard";
import { KolReciprocalQuotaTab } from "@/components/team/KolReciprocalQuotaTab";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Link, useSearchParams } from "react-router-dom";
import KolSuggestInput from "@/components/team/KolSuggestInput";
import { KolVenueFilterMenu } from "@/components/team/KolVenueFilterMenu";

import { dedupeByContractGroup, CONTRACT_GROUP_CUTOFF } from "@/lib/contractGroup";
import {
  validateInvite,
  FIELD_LABELS,
  FIELD_ANCHORS,
  normalizeIgHandle,
  igProfileUrl,
  isContentPostUrl,
  normalizeCode,
  normalizeKolName,
  kolNameKey,
  isSameContractScope,
  isTravelSeriesAccommodation,
  isSameKolIdentity,
  kolIdentitySignals,
  RULE_ACTION_HINTS,

  type CodeConflict,
  type ValidationIssue,
  type CompanionProfile,
} from "@/lib/kolInviteValidation";
import { describeKolSaveError } from "@/lib/kolSaveErrors";
import { scoutRateAsOfToday, scoutPayoutPeriodLabel } from "@/lib/rateEffectivePeriod";


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

const ANOMALY_INFO: Record<string, { title: string; desc: string; rule: string }> = {
  order_deleted: {
    title: "訂單被刪除",
    desc: "此邀約填了訂單編號，系統也留有該訂單的建立紀錄，但訂單目前已不存在（被刪除）。",
    rule: "觸發條件：order_number 有值 + audit_logs 有該單建立紀錄 + orders 查無此單",
  },
  published_before_checkin: {
    title: "未入住卻已上片",
    desc: "此邀約已填寫上片連結，但入住日還沒到，時序不合理（可能入住日填錯或提前發文）。",
    rule: "觸發條件：publish_url 有值 + 今日（台北時間）< check_in_date",
  },
};

function AnomalyBadge({ reason }: { reason?: string | null }) {
  const info = reason ? ANOMALY_INFO[reason] : undefined;
  if (!info) return null;
  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="點擊查看異常原因"
              >
                <Badge
                  variant="outline"
                  className="bg-orange-100 text-orange-700 border-orange-300 border-dashed cursor-pointer gap-1 pl-1.5 pr-2 hover:bg-orange-200 hover:border-solid transition-colors"
                >
                  <AlertTriangle className="h-3 w-3" />
                  異常
                  <HelpCircle className="h-3 w-3 opacity-70" />
                </Badge>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">點擊查看異常原因</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        align="start"
        className="w-72 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-medium mb-1">{info.title}</div>
        <p className="text-muted-foreground text-xs leading-relaxed">{info.desc}</p>
        <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed">{info.rule}</p>
      </PopoverContent>
    </Popover>
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
  accommodation_id?: string | null;
  room_type_id?: string | null;
}

// 館別下拉的合併選項
interface VenueOption {
  // 複合 value：PMS 用 "acc:<uuid>"，自訂場域用 "venue:<venue_id>"
  value: string;
  label: string;
  source: "pms" | "venue";
  badge: string; // 小標籤文字
  accommodation_id: string | null; // PMS 時為 uuid，venue 時 null
  venue_name: string | null; // venue 時為名稱，PMS 時 null
  venue_id: string | null; // kol_venues.id
}

interface Scout {
  user_id: string;
  display_name: string;
  fulltime_start_yearmonth?: string | null;
}

interface KolRow {
  id: string;
  accommodation_id: string | null;
  venue_id: string | null;
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
  follower_count: number | null;
  follower_count_updated_at: string | null;
  primary_profile_id?: string | null;
  primary_link_exception?: boolean;
  contract_group_id?: string | null;
  // 顯示用
  _accommodation_name?: string;
  _scout_name?: string;
  _effective_booking_status?: string | null;
}

interface FormState {
  id?: string;
  // 複合下拉選中的 value（"acc:<uuid>" 或 "venue:<name>"）
  accommodation_select: string;
  accommodation_id: string;
  venue_id: string;
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
  follower_count_input: string;
  follower_count_original: number | null;
  primary_profile_id: string | null;
  primary_link_exception: boolean;
}

const EMPTY_FORM: FormState = {
  accommodation_select: "",
  accommodation_id: "",
  venue_id: "",
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
  follower_count_input: "",
  follower_count_original: null,
  primary_profile_id: null,
  primary_link_exception: false,

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

// 解析粉絲數輸入。支援：純數字 / 含 k 或 K / 含「萬」
// 回傳 { ok, value }；value 為 null 表示空字串（清空）
function parseFollowerInput(raw: string): { ok: boolean; value: number | null } {
  const s = (raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  // 萬
  const wanMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*萬$/);
  if (wanMatch) return { ok: true, value: Math.round(parseFloat(wanMatch[1]) * 10000) };
  // k / K
  const kMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*[kK]$/);
  if (kMatch) return { ok: true, value: Math.round(parseFloat(kMatch[1]) * 1000) };
  // 純數字
  const numMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)$/);
  if (numMatch) return { ok: true, value: Math.round(parseFloat(numMatch[1])) };
  return { ok: false, value: null };
}

// 顯示粉絲數：>=1000 → 四捨五入到整數 K，否則原始數字；空值 "-"
function formatFollowerCount(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n < 1000) return String(n);
  return `${Math.round(n / 1000)}K`;
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
  // AM／AM 主管可編輯互惠額度，但僅限其負責館別
  const isAmTeam = roles.includes("am") || roles.includes("am_manager");
  // scout 可唯讀檢視互惠額度（含切換館別），但不可編輯
  const canViewReciprocalQuota = isManager || isAmTeam || roles.includes("scout");
  const [amManagedAccIds, setAmManagedAccIds] = useState<string[] | null>(null);
  const { currentAccommodationId } = useAccommodation();

  useEffect(() => {
    if (!isAmTeam || isManager || !userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("team_member_profiles")
        .select("am_managed_accommodation_ids")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const ids = (data as { am_managed_accommodation_ids?: string[] | null } | null)
        ?.am_managed_accommodation_ids;
      setAmManagedAccIds(Array.isArray(ids) ? ids.filter(Boolean) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAmTeam, isManager, userId]);

  // 分頁狀態可由網址 ?tab= 帶入（小鈴鐺通知等外部連結會用到）
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "invitations");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setTab(t);
  }, [searchParams]);
  const [prefill, setPrefill] = useState<InvitationPrefill | null>(null);
  const [canSeeStats, setCanSeeStats] = useState<boolean>(
    roles.includes("super_admin") ||
      roles.includes("admin") ||
      roles.includes("scout") ||
      roles.includes("scout_manager"),
  );
  // scout_manager / venue_manager / hotel_admin / super_admin 才可編輯 KOL購票連結
  const [canEditTicketLink, setCanEditTicketLink] = useState<boolean>(
    roles.includes("super_admin") ||
      roles.includes("venue_manager") ||
      roles.includes("scout_manager"),
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
        .in("role", ["hotel_admin", "super_admin", "venue_manager", "scout_manager"])
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setCanEditTicketLink(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, canEditTicketLink]);

  const [employmentType, setEmploymentType] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("team_member_profiles")
        .select("employment_type")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setEmploymentType((data as any)?.employment_type ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const isFulltime = employmentType === "fulltime";
  const isParttime = !isFulltime;
  const canSeeFulltimeTargets = isFulltime || isManager;
  const canSeeParttimeTargets = isParttime || isFulltime || isManager;

  // 週報 Tab：管理員 / scout 體系（canSeeStats）之外，AM 與 AM 主管亦可唯讀檢視
  const canSeeWeeklyReport = canSeeStats || isAmTeam;

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
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="invitations">正式邀約</TabsTrigger>
            {canSeeWeeklyReport && <TabsTrigger value="weekly_report">週報</TabsTrigger>}
            <TabsTrigger value="prospects">潛在名單</TabsTrigger>
            {canSeeFulltimeTargets && <TabsTrigger value="fulltime_targets">邀約目標（正職個人）</TabsTrigger>}
            {canSeeParttimeTargets && <TabsTrigger value="targets">邀約目標</TabsTrigger>}
            {canSeeStats && <TabsTrigger value="stats">業績統計</TabsTrigger>}
            <TabsTrigger value="venues">場域邀約管理</TabsTrigger>
            {canViewReciprocalQuota && <TabsTrigger value="reciprocal_quota">互惠額度</TabsTrigger>}
            <TabsTrigger value="settings">設定</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab
            currentUserId={userId}
            isManager={isManager}
            canEditTicketLink={canEditTicketLink}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
            onGoToVenues={() => setTab("venues")}
          />

        </TabsContent>

        {canSeeWeeklyReport && (
          <TabsContent value="weekly_report" className="mt-4">
            <div className="space-y-4">
              <WeeklyReportTab canCopy={isManager} />
              <KolPublishProgressCard />
            </div>
          </TabsContent>
        )}


        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab currentUserId={userId} isManager={isManager} onConvert={handleConvertFromProspect} />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsTab isManager={isManager} currentUserId={userId} />
        </TabsContent>

        <TabsContent value="fulltime_targets" className="mt-4">
          <FulltimeTargetsTab isManager={isManager} currentUserId={userId} />
        </TabsContent>


        {canSeeStats && (
          <TabsContent value="stats" className="mt-4">
            <KolStatsTab />
          </TabsContent>
        )}

        <TabsContent value="venues" className="mt-4">
          <div className="space-y-4">
            <VenuesCard isManager={isManager} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab isManager={isManager} />
        </TabsContent>

        {canViewReciprocalQuota && (
          <TabsContent value="reciprocal_quota" className="mt-4">
            <KolReciprocalQuotaTab
              isManager={isManager || (isAmTeam && (amManagedAccIds?.length ?? 0) > 0)}
              defaultAccommodationId={currentAccommodationId}
              allowedAccommodationIds={isManager || !isAmTeam ? null : amManagedAccIds}
            />
          </TabsContent>
        )}
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
  onGoToVenues,
}: {
  currentUserId: string;
  isManager: boolean;
  canEditTicketLink: boolean;
  prefill?: InvitationPrefill | null;
  onPrefillConsumed?: () => void;
  onGoToVenues?: () => void;
}) {


  const [prospectLink, setProspectLink] = useState<string | null>(null);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [pmsCodesSet, setPmsCodesSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [venues, setVenues] = useState<KolVenue[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);

  // accommodation_id → 場域類別（民宿／餐廳／農場／其他）；PMS 母館預設為民宿
  const venueTypeByAcc = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of venues) {
      if (v.accommodation_id && !v.room_type_id) m.set(v.accommodation_id, v.type || "民宿");
    }
    return m;
  }, [venues]);
  const venueTypeOfAcc = (accId?: string | null) => (accId ? (venueTypeByAcc.get(accId) ?? "民宿") : null);



  // 館別合併選項（PMS + kol_venues，依名稱排序）
  const accommodationOptions = useMemo<VenueOption[]>(() => {
    // 從 kol_venues 建立 accommodation_id → venue_id 的映射（PMS 母館）
    const accToVenueId = new Map<string, string>();
    const activeVenueAccIds = new Set<string>();
    for (const v of venues) {
      if (v.accommodation_id && !v.room_type_id) {
        accToVenueId.set(v.accommodation_id, v.id);
        if (v.is_active) activeVenueAccIds.add(v.accommodation_id);
      }
    }
    const pms: VenueOption[] = accommodations
      // 只要 kol_venues 有對應且 active 就顯示，不受 accommodation_info.is_active 影響
      .filter((a) => activeVenueAccIds.has(a.id) || a.is_active !== false)
      .map((a) => ({
        value: `acc:${a.id}`,
        label: a.name,
        source: "pms",
        badge: "民宿",
        accommodation_id: a.id,
        venue_name: null,
        venue_id: accToVenueId.get(a.id) ?? null,
      }));
    const v: VenueOption[] = venues
      .filter((x) => x.is_active && !x.accommodation_id && !x.room_type_id)
      .map((x) => ({
        value: `venue:${x.id}`,
        label: x.name,
        source: "venue",
        badge: x.type || "其他",
        accommodation_id: null,
        venue_name: x.name,
        venue_id: x.id,
      }));
    return [...pms, ...v].sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
  }, [accommodations, venues]);

  // 篩選器選項（與 accommodationOptions 相同）
  const filterAccOptions = accommodationOptions;



  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [filterAccs, setFilterAccs] = useState<string[]>([]);
  const [filterAccsInitialized, setFilterAccsInitialized] = useState(false);
  // 選項載入完成後預設全選一次
  useEffect(() => {
    if (!filterAccsInitialized && filterAccOptions.length > 0) {
      setFilterAccs(filterAccOptions.map((o) => o.value));
      setFilterAccsInitialized(true);
    }
  }, [filterAccOptions, filterAccsInitialized]);

  const [filterRarity, setFilterRarity] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterQualified, setFilterQualified] = useState<string>("all");
  // 合作進度篩選（前端判斷）："all" | "not_checked_in" | "checked_in_no_post" | "posted" | "abnormal"
  const [filterProgress, setFilterProgress] = useState<string>("all");
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 詳情 Drawer
  const [viewingRow, setViewingRow] = useState<KolRow | null>(null);

  // 通知小鈴鐺深連結：/team/kol?tab=invitations&kolId=xxx → 自動開啟該筆詳情
  const [deepLinkParams, setDeepLinkParams] = useSearchParams();
  const deepLinkKolId = deepLinkParams.get("kolId");
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkKolId || deepLinkHandledRef.current === deepLinkKolId) return;
    const target = rows.find((r) => r.id === deepLinkKolId);
    if (!target) return;
    deepLinkHandledRef.current = deepLinkKolId;
    setViewingRow(target);
    const next = new URLSearchParams(deepLinkParams);
    next.delete("kolId");
    setDeepLinkParams(next, { replace: true });
  }, [deepLinkKolId, rows]); // eslint-disable-line react-hooks/exhaustive-deps


  // 稀有度版本 & 標籤字典
  const [rarities, setRarities] = useState<RaritySetting[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Sheet 表單
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [igContentUrlAck, setIgContentUrlAck] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [followerError, setFollowerError] = useState<string | null>(null);
  // 防呆：阻擋訊息 / 合拍同住確認 / IG 重複確認
  const [blockIssues, setBlockIssues] = useState<ValidationIssue[]>([]);
  const [collabConfirmed, setCollabConfirmed] = useState(false);
  const [igDupConfirmed, setIgDupConfirmed] = useState(false);
  /** 名稱僅全半形／大小寫不同時，確認為不同人（不套用既有寫法） */
  const [nameVariantConfirmed, setNameVariantConfirmed] = useState(false);
  /** 既有的同名不同寫法（供表單即時提示） */
  const [nameVariant, setNameVariant] = useState<string | null>(null);
  const [cidConflicts, setCidConflicts] = useState<CodeConflict[]>([]);
  /** cidConflicts 對應的查詢條件（code|accommodation|editingId），避免顯示到上一次查詢的結果 */
  const [cidConflictKey, setCidConflictKey] = useState<string | null>(null);
  const [primaryConfirm, setPrimaryConfirm] = useState<{ id: string; name: string } | null>(null);
  /** 建立時即時查重：同館且（同折扣碼 或 同名）的既有邀約 */
  const [similarMatches, setSimilarMatches] = useState<KolRow[]>([]);
  /** 列表一鍵合併：child 掛到 parent 之下 */
  const [mergeConfirm, setMergeConfirm] = useState<{ parent: KolRow; child: KolRow } | null>(null);
  const [mergeExceptionConfirmed, setMergeExceptionConfirmed] = useState(false);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);


  // 填錯 Dialog
  const [errorTarget, setErrorTarget] = useState<KolRow | null>(null);
  const [errorReason, setErrorReason] = useState("");
  const [reportingError, setReportingError] = useState(false);

  // 取消邀約 Dialog
  const [cancelTarget, setCancelTarget] = useState<KolRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // 設為附屬記錄：搜尋主要記錄 Dialog
  const [linkSubsidiaryTarget, setLinkSubsidiaryTarget] = useState<KolRow | null>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState<KolRow[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkConfirm, setLinkConfirm] = useState<{ child: KolRow; parent: KolRow; isException: boolean } | null>(null);
  const [linkExceptionConfirmed, setLinkExceptionConfirmed] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  // 取消附屬關係
  const [unlinkTarget, setUnlinkTarget] = useState<KolRow | null>(null);
  const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);

  // 載入下拉資料
  useEffect(() => {
    (async () => {
      const [accRes, venueRes, scoutRes, scoutMgrRes, rarRes, tagRes] = await Promise.all([
        supabase.from("accommodation_info").select("id, name, booking_type, short_url_alias, is_active").order("name"),
        supabase
          .from("kol_venues" as any)
          .select("id, name, type, is_active, accommodation_id, room_type_id")
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

  // 只有「最新一次請求」可以寫入結果（避免快慢請求競態覆蓋）
  const fetchSeqRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  // 分頁 + 篩選條件快取（60 秒），切換館別／換頁時不必重打整頁
  const rowsCacheRef = useRef<
    Map<string, { ts: number; rows: KolRow[]; count: number; pmsCodes: Set<string> }>
  >(new Map());
  const CACHE_TTL_MS = 60_000;

  const runFetchRows = useCallback(async (force: boolean) => {
    const cacheKey = JSON.stringify([
      page,
      search.trim(),
      [...filterAccs].sort(),
      [...filterRarity].sort(),
      [...filterTags].sort(),
      filterScout,
      filterYear,
      filterMonth,
      filterQualified,
      filterProgress,
      filterAccOptions.length,
    ]);

    if (force) {
      rowsCacheRef.current.clear();
    } else {
      const hit = rowsCacheRef.current.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        fetchSeqRef.current += 1;
        fetchAbortRef.current?.abort();
        fetchAbortRef.current = null;
        setRows(hit.rows);
        setTotalCount(hit.count);
        setPmsCodesSet(hit.pmsCodes);
        setLoading(false);
        return;
      }
    }

    const reqId = ++fetchSeqRef.current;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const isStale = () => reqId !== fetchSeqRef.current || controller.signal.aborted;

    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;


    let q = supabase
      .from("kol_profiles_with_progress" as any)
      .select("*", { count: "exact" })
      .eq("is_error", false)
      .is("primary_profile_id", null);
    if (filterProgress !== "all") q = q.eq("collab_progress", filterProgress);

    // 館別多選篩選：若全選（或未載入完成）→ 不加篩選
    const allOptionValues = filterAccOptions.map((o) => o.value);
    const isAllSelected =
      allOptionValues.length > 0 && allOptionValues.every((v) => filterAccs.includes(v));
    if (!isAllSelected && filterAccs.length > 0) {
      const accIds: string[] = [];
      const venueIds: string[] = [];
      for (const v of filterAccs) {
        if (v.startsWith("acc:")) accIds.push(v.slice(4));
        else if (v.startsWith("venue:")) venueIds.push(v.slice(6));
      }
      if (accIds.length > 0 && venueIds.length > 0) {
        q = q.or(`accommodation_id.in.(${accIds.join(",")}),venue_id.in.(${venueIds.join(",")})`);
      } else if (accIds.length > 0) {
        q = q.in("accommodation_id", accIds);
      } else if (venueIds.length > 0) {
        q = q.in("venue_id", venueIds);
      } else {
        // 選了但沒有可解析的值 → 空結果
        q = q.eq("venue_id", "00000000-0000-0000-0000-000000000000");
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
    let matchedParentIds: string[] = [];
    if (s) {
      const esc = s.replace(/[%,()]/g, " ");
      // 搜尋也要命中「附屬記錄（子檔）」→ 先撈出命中的子檔，把它們的主檔一併帶進本頁
      const { data: childHits } = await supabase
        .from("kol_profiles")
        .select("primary_profile_id")
        .not("primary_profile_id", "is", null)
        .or(`name.ilike.%${esc}%,ig_handle.ilike.%${esc}%,cid_code.ilike.%${esc}%,order_number.ilike.%${esc}%`)
        .limit(200);
      matchedParentIds = Array.from(
        new Set(
          (childHits ?? [])
            .map((c: any) => c.primary_profile_id as string | null)
            .filter((v): v is string => !!v),
        ),
      );
      const orParts = [
        `name.ilike.%${esc}%`,
        `ig_handle.ilike.%${esc}%`,
        `cid_code.ilike.%${esc}%`,
        `order_number.ilike.%${esc}%`,
      ];

      if (matchedParentIds.length > 0) orParts.push(`id.in.(${matchedParentIds.join(",")})`);
      q = q.or(orParts.join(","));
    }

    const { data, count, error } = await q
      .order("created_at", { ascending: false })
      .range(from, to)
      .abortSignal(controller.signal);

    if (isStale()) return;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // 補撈本頁主檔底下的附屬記錄（子檔），讓列表／搜尋看得到（例如同住夥伴）
    const primaryRows = ((data ?? []) as any[]);
    let childRowsData: any[] = [];
    if (primaryRows.length > 0) {
      const { data: kids } = await supabase
        .from("kol_profiles_with_progress" as any)
        .select("*")
        .eq("is_error", false)
        .in("primary_profile_id", primaryRows.map((r) => r.id));
      childRowsData = (kids ?? []) as any[];
    }
    // 取 scout 姓名
    const rowsData = [...primaryRows, ...childRowsData];
    const scoutIds = Array.from(new Set(rowsData.map((r) => r.scout_id).filter(Boolean) as string[]));

    let scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) => scoutMap.set(p.user_id, p.display_name ?? p.user_id));
    }
    const accMap = new Map(accommodations.map((a) => [a.id, a.name]));

    // 依 order_number 批次查 orders.order_status，自動連動「狀態」欄位
    const orderNumbers = Array.from(
      new Set(
        rowsData
          .map((r: any) => (r.order_number ?? "").trim())
          .filter((s: string) => s.length > 0)
      )
    );
    const orderStatusMap = new Map<string, string>();
    if (orderNumbers.length > 0) {
      const { data: ordRows } = await supabase
        .from("orders")
        .select("order_number, order_status")
        .in("order_number", orderNumbers);
      (ordRows ?? []).forEach((o: any) => {
        if (o.order_number) orderStatusMap.set(o.order_number, o.order_status);
      });
    }
    const deriveBookingStatus = (orderNumber: string | null, fallback: string | null) => {
      const key = (orderNumber ?? "").trim();
      if (!key) return fallback;
      const os = orderStatusMap.get(key);
      if (os === "confirmed") return "成功訂房";
      if (os === "cancelled") return "已取消";
      // PMS 查無此單：非 PMS 館別（農場／餐廳／外部館）本來就不會有訂單，
      // 不可一律改寫成「訂房確認中」，改為保留 DB 原值。
      if (os === undefined) return fallback;
      return "訂房確認中";
    };


    const venueById = new Map(venues.map((v) => [v.id, v]));
    const resolveVenueDisplay = (r: any): string => {
      const vRow = r.venue_id ? venueById.get(r.venue_id) : null;
      if (vRow) {
        // 若子館別已停用，fallback 顯示母館名稱
        if (vRow.room_type_id && vRow.is_active === false && vRow.accommodation_id) {
          return accMap.get(vRow.accommodation_id) ?? vRow.name ?? "-";
        }
        return vRow.name ?? "-";
      }
      return r.accommodation_id ? (accMap.get(r.accommodation_id) ?? "-") : (r.venue_name ?? "-");
    };
    const enriched = rowsData.map((r: any) => ({
      ...r,
      _accommodation_name: resolveVenueDisplay(r),
      _scout_name: r.scout_id ? (scoutMap.get(r.scout_id) ?? "-") : "-",
      _effective_booking_status: deriveBookingStatus(r.order_number, r.booking_status),
    })) as KolRow[];
    setRows(enriched);
    // 搜尋命中子檔時，自動展開對應主檔，避免使用者以為搜不到
    if (matchedParentIds.length > 0) {
      setExpandedRows((prev) => {
        const next = new Set(prev);
        matchedParentIds.forEach((id) => next.add(id));
        return next;
      });
    }

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
  }, [accommodations, page, search, filterAccs, filterAccOptions, filterRarity, filterTags, filterScout, filterYear, filterMonth, filterQualified, filterProgress]);

  useEffect(() => {
    if (accommodations.length > 0) fetchRows();
  }, [fetchRows, accommodations.length]);

  // 篩選條件變更時，重置到第一頁
  useEffect(() => {
    setPage(1);
  }, [search, filterAccs, filterRarity, filterTags, filterScout, filterYear, filterMonth, filterQualified, filterProgress]);


  // 伺服器端已套用所有篩選（含合作進度 collab_progress）
  const filtered = rows;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));


  // 前端排序（三段循環：none → asc → desc → none）
  type SortKey = "qualified" | "rarity" | "accommodation" | "check_in_date" | "scout" | "booking_status" | "contract_progress" | "publish_date" | "invited_at";
  const [sortField, setSortField] = useState<SortKey | "">("");

  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSort = (field: SortKey) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortField("");
      setSortDir("asc");
    }
  };

  // 展開的主要記錄 id 集合
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 場域 id → venue（供子館別名稱查詢）
  const venueByIdAll = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  const getSortIcon = (field: SortKey) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };
  const sortedRows = useMemo(() => {
    if (!sortField) return filtered;
    const getVal = (r: KolRow): string | number | null => {
      switch (sortField) {
        case "qualified": return r.kpi_qualified ? 1 : 0;
        case "rarity": {
          const idx = r.rarity ? RARITY_OPTIONS.indexOf(r.rarity as Rarity) : -1;
          return idx < 0 ? Number.POSITIVE_INFINITY : idx;
        }
        case "accommodation": return (r as any)._accommodation_name ?? null;
        case "check_in_date": return r.check_in_date ?? null;
        case "scout": return (r as any)._scout_name ?? null;
        case "booking_status": return (r as any)._effective_booking_status ?? r.booking_status ?? null;
        case "contract_progress": {
          const cs = computeContractProgress(r.publish_url, r.publish_date, r.contract_file_url);
          return cs?.empty ? null : (cs?.label ?? null);
        }
        case "publish_date": return r.publish_date ?? null;
        case "invited_at": return r.invited_at ?? null;
      }
    };

    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (av! < bv!) return sortDir === "asc" ? -1 : 1;
      if (av! > bv!) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);
  const SortableHead = ({ field, children }: { field: SortKey; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center">
        {children}
        {getSortIcon(field)}
      </div>
    </TableHead>
  );

  // 依 primary_profile_id 分組：主要記錄 / 附屬記錄 / 孤兒附屬
  const groupedRows = useMemo(() => {
    const primaries: KolRow[] = [];
    const subMap = new Map<string, KolRow[]>();
    const orphans: KolRow[] = [];
    const primaryIds = new Set(
      sortedRows.filter((r) => !r.primary_profile_id).map((r) => r.id),
    );
    for (const r of sortedRows) {
      if (!r.primary_profile_id) {
        primaries.push(r);
      } else if (primaryIds.has(r.primary_profile_id)) {
        const arr = subMap.get(r.primary_profile_id) ?? [];
        arr.push(r);
        subMap.set(r.primary_profile_id, arr);
      } else {
        orphans.push(r);
      }
    }
    return { primaries, subMap, orphans };
  }, [sortedRows]);

  // 列表疑似重複：同館且同折扣碼、但尚未歸戶（無主附關係、合約不同）的邀約，
  // 供管理員標紅並一鍵合併。同名但代碼不同、或有主附關係者一律排除，避免誤擋。
  const duplicateGroups = useMemo(() => {
    const groups: { parent: KolRow; child: KolRow }[] = [];
    const byAccCode = new Map<string, KolRow[]>();
    for (const r of sortedRows) {
      const acc = r.accommodation_id;
      const code = r.cid_code ? normalizeCode(r.cid_code) : "";
      if (!acc || !code) continue;
      const key = `${acc}::${code}`;
      const arr = byAccCode.get(key) ?? [];
      arr.push(r);
      byAccCode.set(key, arr);
    }
    const primaryId = (r: KolRow) => r.primary_profile_id ?? null;
    for (const arr of byAccCode.values()) {
      if (arr.length < 2) continue;
      const independent = arr.filter((r) => {
        const p = primaryId(r);
        // 有主附關係：只要主檔也在同組內即視為已歸戶；主檔不在組內則屬孤兒，另視情況
        return !p || !arr.some((o) => o.id === p);
      });
      if (independent.length < 2) continue;
      // 同一合約不視為重複
      const contractSeen = new Set<string>();
      const isolated: KolRow[] = [];
      for (const r of independent) {
        const g = r.contract_group_id ?? "";
        if (g && contractSeen.has(g)) continue;
        if (g) contractSeen.add(g);
        isolated.push(r);
      }
      if (isolated.length < 2) continue;
      // 以建立時間較早者為主檔
      const sorted = [...isolated].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      );
      groups.push({ parent: sorted[0], child: sorted[1] });
    }
    return groups;
  }, [sortedRows]);

  // 稽核提醒：PMS 有折扣碼、但該館沒有對應邀約（孤兒折扣碼）
  const [orphanCodes, setOrphanCodes] = useState<
    { discount_code_id: string; code: string; code_name: string | null; accommodation_id: string; accommodation_name: string | null; created_at: string }[]
  >([]);
  const [orphanDismissed, setOrphanDismissed] = useState(false);
  useEffect(() => {
    const accIds = accommodations.map((a) => a.id);
    if (accIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("list_orphan_kol_discount_codes" as any, {
        _accommodation_ids: accIds,
      });
      if (cancelled || error) return;
      setOrphanCodes((data as any[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodations]);








  // 入住日期 → 自動計算星期幾
  useEffect(() => {
    if (form.check_in_date) {
      const dow = calcDayOfWeek(form.check_in_date);
      if (dow !== form.day_of_week) {
        setForm((f) => ({ ...f, day_of_week: dow }));
      }
    }
  }, [form.check_in_date]); // eslint-disable-line

  // 入住日期 + 館別 → 呼叫 check_kol_inventory RPC (venue_id 版)
  useEffect(() => {
    const date = form.check_in_date;
    // 優先用 form.venue_id；若尚未帶入，用 accommodation_id 從 venues 查
    let venueId: string | null = form.venue_id || null;
    if (!venueId && form.accommodation_id) {
      const v = venues.find((x) => x.accommodation_id === form.accommodation_id && !x.room_type_id);
      venueId = v?.id ?? null;
    }
    if (!date || !venueId) {
      if (form.inventory_status !== "") {
        setForm((f) => ({ ...f, inventory_status: "" }));
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("check_kol_inventory" as any, {
        p_venue_id: venueId,
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
  }, [form.accommodation_id, form.venue_id, form.check_in_date, venues]); // eslint-disable-line

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

  // 換一筆／關閉表單時，重置「確定就是帳號連結」的確認狀態
  useEffect(() => {
    setIgContentUrlAck(false);
  }, [sheetOpen, editingId]);

  // ig_handle 即時重複檢查：只在目前主檔之前已有同 IG 主檔時提示。
  // 最早的第一筆主檔（包含日後回頭編輯）不顯示提示；附屬紀錄也不顯示。
  useEffect(() => {
    const ig = form.ig_handle.trim();
    // 既有附屬紀錄已經完成主檔關聯，不需要再次確認「二次合作」。
    // 名稱／IG 不一致仍由下方 CID 身分規則獨立檢查並阻擋。
    if ((editingId && form.primary_profile_id) || !ig || isContentPostUrl(ig)) {
      setDupWarning(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("id, name, scout_id, invited_at, created_at, booking_status, accommodation_id, venue_id, primary_profile_id, team_member_profiles:scout_id(display_name)")
        .eq("ig_handle", normalizeIgHandle(ig))
        .eq("is_error", false)
        .is("primary_profile_id", null)
        .limit(100);
      if (cancelled) return;

      const currentInvitedAt = form.invited_at || "9999-12-31";
      const editingRow = editingId ? rows.find((row) => row.id === editingId) : null;
      const queriedMasters = ((data as any[]) ?? []);
      const masters = [
        ...queriedMasters,
        ...(editingId && !queriedMasters.some((d) => d.id === editingId)
          ? [{ id: editingId, invited_at: currentInvitedAt, created_at: editingRow?.created_at ?? "" }]
          : []),
      ]
        .map((d) => editingId && d.id === editingId ? { ...d, invited_at: currentInvitedAt } : d)
        .sort((a, b) => {
          const dateCompare = (a.invited_at || "9999-12-31").localeCompare(b.invited_at || "9999-12-31");
          if (dateCompare !== 0) return dateCompare;
          const createdCompare = (a.created_at || "").localeCompare(b.created_at || "");
          if (createdCompare !== 0) return createdCompare;
          return String(a.id).localeCompare(String(b.id));
        });

      // 新增主檔視為同日既有資料之後；編輯主檔則只找排序在本筆之前的資料。
      const currentIndex = editingId ? masters.findIndex((d) => d.id === editingId) : -1;
      const earlierMasters = editingId
        ? (currentIndex > 0 ? masters.slice(0, currentIndex) : [])
        : masters.filter((d) => (d.invited_at || "9999-12-31") <= currentInvitedAt);

      if (earlierMasters.length > 0) {
        const d: any = earlierMasters[0];
        const sn = d.team_member_profiles?.display_name ?? d.scout_id ?? "未知";
        const stLabel = d.booking_status ?? "-";
        const venueLabel =
          venues.find((v) => v.id === d.venue_id)?.name ??
          accommodations.find((a) => a.id === d.accommodation_id)?.name ??
          "未指定";
        setDupWarning(
          [
            `此 KOL 的已有邀約紀錄：`,
            `${sn} 於 ${d.invited_at ?? "-"} 填寫`,
            `館別：${venueLabel}`,
            `狀態：${stLabel}`,
            ...(d.name ? [`（既有名稱：${d.name}）`] : []),
          ].join("\n"),
        );

      } else {
        setDupWarning(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [form.ig_handle, form.invited_at, editingId, form.primary_profile_id, rows]);

  // 建立時即時查重：同館且（同折扣碼 或 同名）的既有邀約
  // 不阻擋、不改資料，只列出相似紀錄並提供「查看明細」與「設為附屬」捷徑。
  useEffect(() => {
    if (!sheetOpen) {
      setSimilarMatches([]);
      return;
    }
    const code = normalizeCode(form.cid_code);
    const name = kolNameKey(form.name);
    const acc = form.accommodation_id;
    if (!acc || (!code && !name)) {
      setSimilarMatches([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        let q = supabase
          .from("kol_profiles")
          .select("id, name, cid_code, venue_name, check_in_date, invited_at, booking_status, primary_profile_id, contract_group_id")
          .eq("is_error", false)
          .eq("accommodation_id", acc)
          .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
          .limit(20);
        // 同折扣碼優先；無折扣碼時改用同名比對
        q = code ? q.eq("cid_code", code) : q.eq("name_normalized", name);
        const { data } = await q;
        const list = ((data ?? []) as unknown) as KolRow[];
        // 排除同住合拍（本筆掛在該主檔下、或對方掛在本筆下、或兩筆同主檔）——那些是合法的共用
        const selfPrimary = form.primary_profile_id ?? null;
        const filtered = list.filter((m) => {
          const mPrimary = m.primary_profile_id ?? null;
          if (selfPrimary && (m.id === selfPrimary || mPrimary === selfPrimary)) return false;
          if (editingId && mPrimary === editingId) return false;
          if (kolNameKey(m.name ?? "") !== name) return false;
          if (!form.check_in_date || !m.check_in_date) return false;
          const gap = Math.abs(new Date(m.check_in_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000;
          if (gap > 31) return false;
          return true;
        });
        setSimilarMatches(filtered.slice(0, 5));
      } catch {
        setSimilarMatches([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [sheetOpen, form.accommodation_id, form.cid_code, form.name, form.check_in_date, form.primary_profile_id, editingId]);


  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      invited_at: "",
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
      invited_at: "",
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
        : row.venue_id
          ? `venue:${row.venue_id}`
          : "",
      accommodation_id: row.accommodation_id ?? "",
      venue_id: row.venue_id ?? "",
      venue_name: row.venue_name ?? "",
      name: row.name ?? "",
      ig_handle: row.ig_url || igProfileUrl(row.ig_handle) || row.ig_handle || "",
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
      follower_count_input: row.follower_count != null ? String(row.follower_count) : "",
      follower_count_original: row.follower_count ?? null,
      primary_profile_id: row.primary_profile_id ?? null,
      primary_link_exception: !!row.primary_link_exception,
    });
    setContractGroupId(row.contract_group_id ?? null);
    setDupWarning(null);
    setSheetOpen(true);
  };

  const canEditRow = (row: KolRow) => isManager || row.created_by === currentUserId || row.scout_id === currentUserId;

  const canReportError = (row: KolRow) => row.created_by === currentUserId || isManager;

  // 折扣碼即時衝突檢查（以 query key 標記結果，避免切換 KOL／CID／館別時顯示到上一筆的提示）
  useEffect(() => {
    if (!sheetOpen) {
      setCidConflicts([]);
      setCidConflictKey(null);
      setCollabConfirmed(false);
      setIgDupConfirmed(false);
      setNameVariantConfirmed(false);
      setNameVariant(null);
      return;
    }
    const code = normalizeCode(form.cid_code);
    const key = `${code}|${form.accommodation_id || ""}|${editingId ?? ""}`;
    if (!code) {
      setCidConflicts([]);
      setCidConflictKey(key);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("check_discount_code_conflict", {
        _code: code,
        _accommodation_id: form.accommodation_id || null,
        _exclude_profile_id: editingId,
      });
      if (cancelled) return;
      setCidConflicts(((data as CodeConflict[]) ?? []).filter((c) => c.severity !== "info"));
      setCidConflictKey(key);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.cid_code, form.accommodation_id, editingId, sheetOpen]);

  // 名稱「僅全半形／大小寫／空白不同」即時偵測
  useEffect(() => {
    if (!sheetOpen) return;
    const key = kolNameKey(form.name);
    const raw = form.name.trim();
    if (!key) {
      setNameVariant(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("id, name")
        .eq("name_normalized", key)
        .eq("is_error", false)
        .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
        .limit(1);
      const existing = ((data as any[]) ?? [])[0]?.name ?? null;
      setNameVariant(existing && existing !== raw ? existing : null);
    }, 350);
    return () => clearTimeout(t);
  }, [form.name, editingId, sheetOpen]);

  const handleSave = async () => {
    if (!form.accommodation_id && !form.venue_id) {
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
    if (!form.invited_at) {
      const ok = window.confirm("填寫日期尚未填寫，此 KOL 將不會列入邀約目標統計，確定要繼續儲存嗎？");
      if (!ok) return;
    }

    // 粉絲數驗證
    const followerParsed = parseFollowerInput(form.follower_count_input);
    if (!followerParsed.ok) {
      setFollowerError("粉絲數格式錯誤，請依照範例輸入（例如:57.7萬、57.7k 或 1226）");
      return;
    }

    // ===== 防呆檢查（阻擋 / 警告）=====
    const igIsContentUrl = isContentPostUrl(form.ig_handle);
    const normIg = igIsContentUrl
      ? (igProfileUrl(form.ig_handle) || form.ig_handle.trim())
      : normalizeIgHandle(form.ig_handle);
    const normCid = normalizeCode(form.cid_code);
    const normCompanion = normalizeCode(form.companion_cid);
    const orderNo = form.order_number.trim();

    let orderExists: boolean | null = null;
    let orderDiscountCode: string | null = null;
    let orderBoundTo: string | null = null;
    let companion: CompanionProfile = null;
    let conflicts: CodeConflict[] = [];
    let igDupName: string | null = null;
    let nameVariantExisting: string | null = null;
    const nameKey = kolNameKey(form.name);

    try {
      const [orderRes, boundRes, companionRes, conflictRes, igRes, nameRes] = await Promise.all([
        orderNo
          ? supabase.from("orders").select("id, discount_code").eq("order_number", orderNo).maybeSingle()
          : Promise.resolve({ data: null } as any),
        orderNo
          ? supabase
              .from("kol_profiles")
              .select("id, name, primary_profile_id")
              .eq("order_number", orderNo)
              .eq("is_error", false)
              .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
              .limit(5)
          : Promise.resolve({ data: [] } as any),
        normCompanion
          ? supabase
              .from("kol_profiles")
              .select("id, name, cid_code, companion_cid, accommodation_id, venue_id, check_in_date, contract_group_id")
              .eq("cid_code", normCompanion)
              .eq("is_error", false)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        normCid
          ? supabase.rpc("check_discount_code_conflict", {
              _code: normCid,
              _accommodation_id: form.accommodation_id || null,
              _exclude_profile_id: editingId,
            })
          : Promise.resolve({ data: [] } as any),
        normIg && !igIsContentUrl
          ? supabase
              .from("kol_profiles")
              .select("id, name, ig_handle, primary_profile_id")
              .ilike("ig_handle", normIg)
              .eq("is_error", false)
              .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
              .limit(5)
          : Promise.resolve({ data: [] } as any),
        nameKey
          ? supabase
              .from("kol_profiles")
              .select("id, name")
              .eq("name_normalized", nameKey)
              .eq("is_error", false)
              .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
              .limit(1)
          : Promise.resolve({ data: [] } as any),
      ]);

      if (orderNo) {
        orderExists = !!orderRes?.data;
        orderDiscountCode = (orderRes?.data as any)?.discount_code ?? null;
        // 同住合拍（主檔／附屬同一家族）可共用同一張訂單，不視為重複綁定
        const selfPrimary = form.primary_profile_id ?? null;
        const boundRows = ((boundRes?.data as any[]) ?? []).filter((r) => {
          const rPrimary = r.primary_profile_id ?? null;
          if (selfPrimary && (r.id === selfPrimary || rPrimary === selfPrimary)) return false;
          if (editingId && rPrimary === editingId) return false;
          return true;
        });
        orderBoundTo = boundRows[0]?.name ?? null;
      }
      companion = (companionRes?.data as CompanionProfile) ?? null;
      conflicts = ((conflictRes?.data as CodeConflict[]) ?? [])
        .filter((c) => c.severity !== "info")
        .map((c) => ({ ...c, venue_type: venueTypeOfAcc(c.accommodation_id) }));

      const selfPrimaryId = form.primary_profile_id ?? null;
      // 編輯既有附屬紀錄時，主檔關係本身就是已確認的合作關係，
      // 不再以 IG 重複要求勾選「二次合作」；名稱不一致仍交由 CID 身分規則處理。
      const igDup = editingId && selfPrimaryId
        ? undefined
        : ((igRes?.data as any[]) ?? [])
            .filter((r) => {
              const rPrimary = r.primary_profile_id ?? null;
              // 同一家族（主檔／兄弟／本筆的附屬）視為合法共用，不再要求勾選確認
              if (selfPrimaryId && (r.id === selfPrimaryId || rPrimary === selfPrimaryId)) return false;
              if (editingId && rPrimary === editingId) return false;
              return true;
            })
            .find((r) => (r.name ?? "").trim() !== form.name.trim());
      igDupName = igDup?.name ?? null;
      const existingName = ((nameRes?.data as any[]) ?? [])[0]?.name ?? null;
      nameVariantExisting = existingName && existingName !== form.name.trim() ? existingName : null;
    } catch {
      // 查詢失敗不阻擋儲存，僅略過進階檢查
    }

    const venueParentAcc = form.venue_id
      ? (venues.find((v) => v.id === form.venue_id)?.accommodation_id ?? null)
      : null;

    const { blocks, warnings, issues } = validateInvite(
      {
        name: form.name,
        ig_handle: normIg,
        scout_id: form.scout_id,
        accommodation_id: form.accommodation_id,
        venue_id: form.venue_id,
        venue_parent_accommodation_id: venueParentAcc,
        venue_label: form.venue_name || "",
        accommodation_label: accommodations.find((a) => a.id === form.accommodation_id)?.name ?? "",
        invited_at: form.invited_at,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        order_number: orderNo,
        order_exists: orderExists,
        order_discount_code: orderDiscountCode,
        order_bound_to_other_profile: orderBoundTo,
        cid_code: form.cid_code,
        companion_cid: "",
        publish_url: form.publish_url,
        publish_date: form.publish_date,
        follower_count_original: form.follower_count_original,
        follower_count_next: followerParsed.value,
        ig_duplicate_confirmed: igDupConfirmed,
        ig_duplicate_name: igDupName,
        collab_confirmed: collabConfirmed,
        self_id: editingId,
        primary_profile_id: form.primary_profile_id ?? null,
        name_variant_existing: nameVariantExisting,
        name_variant_confirmed: nameVariantConfirmed,
        contract_group_id: contractGroupId,
        accommodation_venue_type: form.venue_id
          ? (venues.find((v) => v.id === form.venue_id)?.type ?? "民宿")
          : venueTypeOfAcc(form.accommodation_id),


      },
      { companion, conflicts, isManager },

    );

    const auditSnapshot = {
      name: form.name,
      ig_handle: normIg,
      cid_code: normCid,
      companion_cid: normCompanion,
      order_number: orderNo,
      accommodation_id: form.accommodation_id || null,
      venue_id: form.venue_id || null,
      venue_parent_accommodation_id: venueParentAcc,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      scout_id: form.scout_id || null,
      editing_id: editingId,
    };
    const logValidation = (outcome: string) => {
      void supabase.from("kol_invite_validation_logs").insert({
        user_id: currentUserId,
        profile_id: editingId,
        accommodation_id: form.accommodation_id || null,
        outcome,
        rules: issues.map((i) => i.rule),
        blocks: issues.filter((i) => i.level === "block") as any,
        warnings: issues.filter((i) => i.level === "warning") as any,
        conflicts: conflicts as any,
        submitted_values: auditSnapshot as any,
      });
    };

    if (blocks.length > 0) {
      setBlockIssues(issues.filter((i) => i.level === "block"));
      logValidation("blocked");
      return;
    }
    setBlockIssues([]);
    if (warnings.length > 0) {
      const ok = window.confirm(`請確認以下事項：\n\n${warnings.map((w) => `• ${w}`).join("\n")}\n\n仍要繼續儲存嗎？`);
      if (!ok) {
        logValidation("warned_cancelled");
        return;
      }
      logValidation("warned_accepted");
    }

    setSaving(true);
    const kpiEligible = !!form.check_in_date;
    const kpiMonth = form.check_in_date ? form.check_in_date.slice(0, 7) + "-01" : null;
    const tags = form.kol_tags;


    const resolvedVenueName = form.accommodation_id
      ? (accommodations.find((a) => a.id === form.accommodation_id)?.name ?? null)
      : form.venue_name || null;
    // 解析 venue_id：優先用 form.venue_id / PMS 母館
    let resolvedVenueId: string | null = form.venue_id || null;
    if (!resolvedVenueId && form.accommodation_id) {
      const v = venues.find((x) => x.accommodation_id === form.accommodation_id && !x.room_type_id);
      resolvedVenueId = v?.id ?? null;
    }
    const payload: Record<string, any> = {
      accommodation_id: form.accommodation_id || null,
      venue_id: resolvedVenueId,
      venue_name: resolvedVenueName,
      name: normalizeKolName(form.name),
      name_original: form.name.trim(),
      ig_handle: normIg,
      ig_url: igProfileUrl(form.ig_handle) || null,
      rarity: form.rarity || null,
      scout_id: form.scout_id || null,
      invited_at: form.invited_at || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      day_of_week: form.day_of_week || null,
      inventory_status: toNullable(form.inventory_status),
      booking_status: form.booking_status,
      cid_code: toNullable(form.cid_code),
      companion_cid: null,
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
      primary_profile_id: form.primary_profile_id || null,
      // 旅行日系列跨館視為同一份合約，不需使用者勾選特例，直接自動標記
      primary_link_exception: !!form.primary_link_exception || (() => {
        if (!form.primary_profile_id) return false;
        const parent = rows.find((r) => r.id === form.primary_profile_id);
        const parentAccId = parent?.accommodation_id ?? null;
        if (!parentAccId || !form.accommodation_id || parentAccId === form.accommodation_id) return false;
        const parentName = accommodations.find((a) => a.id === parentAccId)?.name ?? parent?.venue_name ?? null;
        const selfName = accommodations.find((a) => a.id === form.accommodation_id)?.name ?? form.venue_name ?? null;
        return isTravelSeriesAccommodation(parentName) && isTravelSeriesAccommodation(selfName);
      })(),
    };
    // 粉絲數：值有變動才更新 follower_count_updated_at
    payload.follower_count = followerParsed.value;
    if (followerParsed.value !== form.follower_count_original) {
      payload.follower_count_updated_at = new Date().toISOString();
    }

    if (isManager) {
      payload.kpi_qualified = form.kpi_qualified;
    }
    // 掛在主檔底下的同住夥伴一律不列入 KPI（分潤只算主檔）
    if (form.primary_profile_id) {
      payload.kpi_qualified = false;
    }


    let err;
    let newId: string | null = null;
    if (editingId) {
      ({ error: err } = await supabase.from("kol_profiles").update(payload as any).eq("id", editingId));
    } else {
      payload.created_by = currentUserId;
      payload.is_error = false;
      const { data: inserted, error } = await supabase.from("kol_profiles").insert(payload).select("id").single();
      err = error;
      newId = inserted?.id ?? null;
    }
    if (err) {
      setSaving(false);
      const issue = describeKolSaveError(err.message);
      setBlockIssues([issue]);
      toast.error(issue.message);
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
    const isNewPrimary = !editingId && !form.primary_profile_id && !!newId;
    const hasChildVenues =
      isNewPrimary && !!form.accommodation_id
        ? venues.some((v) => v.accommodation_id === form.accommodation_id && v.room_type_id)
        : false;
    setSheetOpen(false);
    setProspectLink(null);
    fetchRows();
    if (editingId) {
      toast.success("已更新邀約");
    } else if (isNewPrimary && hasChildVenues) {
      const savedId = newId!;
      const savedAccommodationId = form.accommodation_id;
      const savedScoutId = form.scout_id;
      const savedName = form.name.trim();
      const savedIg = form.ig_handle.trim();
      toast.success("主要記錄已儲存。如需新增附屬館別記錄，請點選下方按鈕", {
        duration: 10000,
        action: {
          label: "新增附屬記錄",
          onClick: () => {
            openCreateSubsidiaryFromValues({
              primaryId: savedId,
              accommodationId: savedAccommodationId,
              scoutId: savedScoutId,
              name: savedName,
              igHandle: savedIg,
            });
          },
        },
      });
    } else {
      toast.success("已新增邀約");
    }
  };

  const openCreateSubsidiaryFromValues = (opts: {
    primaryId: string;
    accommodationId: string;
    scoutId: string;
    name: string;
    igHandle: string;
  }) => {
    const parentVenue = venues.find(
      (v) => v.accommodation_id === opts.accommodationId && !v.room_type_id,
    );
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      primary_profile_id: opts.primaryId,
      primary_link_exception: false,
      accommodation_select: `acc:${opts.accommodationId}`,
      accommodation_id: opts.accommodationId,
      venue_id: parentVenue?.id ?? "",
      venue_name: "",
      name: opts.name,
      ig_handle: opts.igHandle,
      scout_id: opts.scoutId || currentUserId,
      check_in_date: "",
      check_out_date: "",
    });
    setDupWarning(null);
    setProspectLink(null);
    setSheetOpen(true);
  };

  // 新增附屬記錄前，先顯示功能說明
  const [subsidiaryIntroTarget, setSubsidiaryIntroTarget] = useState<KolRow | null>(null);

  const openCreateSubsidiary = (parentRow: KolRow) => {
    if (!parentRow.accommodation_id) {
      toast.error("僅 PMS 館別的邀約才可新增附屬記錄");
      return;
    }
    setViewingRow(null);
    setSubsidiaryIntroTarget(parentRow);
  };

  const proceedCreateSubsidiary = (parentRow: KolRow) => {
    setSubsidiaryIntroTarget(null);
    openCreateSubsidiaryFromValues({
      primaryId: parentRow.id,
      accommodationId: parentRow.accommodation_id!,
      scoutId: parentRow.scout_id ?? "",
      name: parentRow.name ?? "",
      igHandle: parentRow.ig_handle ?? "",
    });
  };


  // ===== 合約歸戶（contract_group_id）=====
  // 一份合約＝一筆資格；同代碼／同檔期／同場域由系統自動歸為同一份合約，
  // 跨場域的品牌聯名（例：星夢劇場 × 天使星夢度假村）則由此手動合併。
  const [contractGroupId, setContractGroupId] = useState<string | null>(null);
  const [contractSiblings, setContractSiblings] = useState<KolRow[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupResults, setGroupResults] = useState<KolRow[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);

  // 讀取同一份合約的其他邀約
  useEffect(() => {
    if (!sheetOpen || !editingId || !contractGroupId) {
      setContractSiblings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("kol_profiles")
        .select("id, name, cid_code, venue_name, check_in_date, kpi_month")
        .eq("contract_group_id", contractGroupId)
        .neq("id", editingId);
      if (!cancelled) setContractSiblings(((data ?? []) as unknown) as KolRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, editingId, contractGroupId]);

  // 合併對象搜尋
  useEffect(() => {
    if (!groupPickerOpen) {
      setGroupResults([]);
      return;
    }
    const q = groupSearch.trim();
    if (!q) {
      setGroupResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("kol_profiles")
        .select("id, name, cid_code, venue_name, check_in_date, kpi_month, contract_group_id")
        .not("contract_group_id", "is", null)
        .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000")
        .or(`name.ilike.%${q}%,cid_code.ilike.%${q}%`)
        .limit(20);
      if (!cancelled) setGroupResults(((data ?? []) as unknown) as KolRow[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [groupPickerOpen, groupSearch, editingId]);

  const updateContractGroup = async (gid: string) => {
    if (!editingId) return;
    setGroupSaving(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({ contract_group_id: gid } as any)
      .eq("id", editingId);
    setGroupSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setContractGroupId(gid);
    setGroupPickerOpen(false);
    setGroupSearch("");
    toast.success("已更新合約歸戶");
    fetchRows();
  };

  // 主檔／附屬用於同一位 KOL 的同一份合作；跨館或入住日相差超過 31 天時需勾選「特例附屬」。
  useEffect(() => {
    if (!linkSubsidiaryTarget) {
      setLinkSearchResults([]);
      return;
    }
    const q = linkSearchQuery.trim();
    if (!q) {
      setLinkSearchResults([]);
      return;
    }
    let cancelled = false;
    setLinkSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("kol_profiles")
        .select("*")
        .is("primary_profile_id" as any, null)
        .neq("id", linkSubsidiaryTarget.id)
        .or(`name.ilike.%${q}%,ig_handle.ilike.%${q}%`)
        .limit(20);
      if (cancelled) return;
      const rawList = (data ?? []) as unknown as KolRow[];
      const childDate = linkSubsidiaryTarget.check_in_date;
      const list = rawList.filter((candidate) => {
        if (kolNameKey(candidate.name ?? "") !== kolNameKey(linkSubsidiaryTarget.name ?? "")) return false;
        if (!childDate || !candidate.check_in_date) return false;
        return true;
      });

      // 補上館別名稱
      const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
      const venueMap = new Map(venues.map((v) => [v.id, v.name]));
      for (const r of list) {
        r._accommodation_name = r.accommodation_id
          ? accMap.get(r.accommodation_id) ?? ""
          : r.venue_id
            ? venueMap.get(r.venue_id) ?? r.venue_name ?? ""
            : r.venue_name ?? "";
      }
      setLinkSearchResults(list);
      setLinkSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [linkSearchQuery, linkSubsidiaryTarget, accommodations, venues]);

  const handleConfirmLinkSubsidiary = async () => {
    if (!linkConfirm) return;
    setLinkSubmitting(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({
        primary_profile_id: linkConfirm.parent.id,
        primary_link_exception: linkConfirm.isException,
        kpi_qualified: false,
      } as any)
      .eq("id", linkConfirm.child.id);
    setLinkSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已設為附屬記錄");
    setLinkConfirm(null);
    setLinkSubsidiaryTarget(null);
    setLinkSearchQuery("");
    setLinkSearchResults([]);
    fetchRows();
  };

  const handleUnlinkSubsidiary = async () => {
    if (!unlinkTarget) return;
    setUnlinkSubmitting(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({ primary_profile_id: null, primary_link_exception: false } as any)
      .eq("id", unlinkTarget.id);
    setUnlinkSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已取消附屬關係");
    setUnlinkTarget(null);
    fetchRows();
  };

  // 列表一鍵合併：將 child 設為 parent 的附屬記錄，並讓兩者歸入同一合約。
  // 僅管理員可用；零刪除、不改獎金口徑，只建立歸戶關係。
  const handleConfirmMerge = async () => {
    if (!mergeConfirm) return;
    const { parent, child } = mergeConfirm;
    const gap = parent.check_in_date && child.check_in_date
      ? Math.abs(new Date(parent.check_in_date).getTime() - new Date(child.check_in_date).getTime()) / 86400000
      : 0;
    const crossVenue = !!parent.accommodation_id && !!child.accommodation_id
      && parent.accommodation_id !== child.accommodation_id;
    const needsException = gap > 31 || crossVenue;
    if (needsException && !mergeExceptionConfirmed) {
      toast.error(crossVenue ? "跨館別附屬，請先勾選「特例附屬」" : "入住日相差超過 31 天，請先勾選「特例附屬」");
      return;
    }
    setMergeSubmitting(true);
    const gid = parent.contract_group_id ?? child.contract_group_id ?? crypto.randomUUID();
    // child 設為附屬；雙方 contract_group_id 統一（留空者補上，非空者維持既有歸戶）
    const linkRes = await supabase
      .from("kol_profiles")
      .update({
        primary_profile_id: parent.id,
        primary_link_exception: needsException,
        kpi_qualified: false,
      } as any)

      .eq("id", child.id);
    let updateError = linkRes.error;
    if (!updateError && !parent.contract_group_id) {
      const r = await supabase
        .from("kol_profiles")
        .update({ contract_group_id: gid } as any)
        .eq("id", parent.id);
      updateError = r.error;
    }
    if (!updateError && !child.contract_group_id) {
      const r = await supabase
        .from("kol_profiles")
        .update({ contract_group_id: gid } as any)
        .eq("id", child.id);
      updateError = r.error;
    }
    setMergeSubmitting(false);
    if (updateError) {
      toast.error(updateError.message ?? "合併失敗");
      return;
    }
    toast.success(`已將「${child.name}」設為「${parent.name}」的附屬記錄並歸入同一合約`);
    setMergeConfirm(null);
    setMergeExceptionConfirmed(false);
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

  // 即時衝突檢查是否已對齊目前表單（避免切換 KOL／CID／館別時顯示舊結果或閃爍）
  const cidQueryKey = `${normalizeCode(form.cid_code)}|${form.accommodation_id || ""}|${editingId ?? ""}`;
  const cidChecking = !!normalizeCode(form.cid_code) && cidConflictKey !== cidQueryKey;

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="space-y-2">
        {/* PC 版（md: 以上）兩排佈局 */}
        <div className="hidden md:block space-y-2">
          {/* 第一排：搜尋 + 館別 + 邀約人 + 新增邀約 */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="搜尋 KOL 名稱 / 網紅帳號 / CID / 訂單編號"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 max-w-[320px]"
            />
            <KolVenueFilterMenu
              options={filterAccOptions}
              selected={filterAccs}
              onChange={setFilterAccs}
              triggerClassName="w-40"
            />


            <Select value={filterScout} onValueChange={setFilterScout}>
              <SelectTrigger className="w-40">
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
            <div className="ml-auto">
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                新增邀約
              </Button>
            </div>
          </div>

          {/* 第二排：稀有度 + 標籤 + 入住日期 + 累積資格 */}
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 font-normal w-auto justify-start" type="button">
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
                <Button variant="outline" size="sm" className="h-10 font-normal w-auto justify-start" type="button">
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

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">入住日期：</span>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28">
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
                <SelectTrigger className="w-28">
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

            <Select value={filterQualified} onValueChange={setFilterQualified}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="累積資格" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">累積資格</SelectItem>
                <SelectItem value="yes">符合資格</SelectItem>
                <SelectItem value="no">未符合資格</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterProgress} onValueChange={setFilterProgress}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="合作進度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">合作進度</SelectItem>
                <SelectItem value="未入住">未入住</SelectItem>
                <SelectItem value="入住未上片">入住未上片</SelectItem>
                <SelectItem value="已上片">已上片</SelectItem>
                <SelectItem value="異常需檢查">異常需檢查</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 手機版（md: 以下）單欄堆疊 */}
        <div className="md:hidden space-y-2">
          <Input
            placeholder="搜尋 KOL 名稱 / 網紅帳號 / CID / 訂單編號"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full"
          />

          <div className="grid grid-cols-2 gap-2">
            <KolVenueFilterMenu
              options={filterAccOptions}
              selected={filterAccs}
              onChange={setFilterAccs}
              triggerClassName="w-full"
            />



            <Select value={filterScout} onValueChange={setFilterScout}>
              <SelectTrigger className="w-full">
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

          <div className="grid grid-cols-2 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 font-normal w-full justify-start" type="button">
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
                <Button variant="outline" size="sm" className="h-10 font-normal w-full justify-start" type="button">
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

          <div className="grid grid-cols-2 gap-2">
            <Select value={filterQualified} onValueChange={setFilterQualified}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="累積資格" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">累積資格</SelectItem>
                <SelectItem value="yes">符合資格</SelectItem>
                <SelectItem value="no">未符合資格</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterProgress} onValueChange={setFilterProgress}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="合作進度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">合作進度</SelectItem>
                <SelectItem value="未入住">未入住</SelectItem>
                <SelectItem value="入住未上片">入住未上片</SelectItem>
                <SelectItem value="已上片">已上片</SelectItem>
                <SelectItem value="異常需檢查">異常需檢查</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              新增邀約
            </Button>
          </div>
        </div>
      </div>

      {/* 稽核提醒：PMS 有折扣碼但查無對應邀約 */}
      {!orphanDismissed && orphanCodes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                PMS 有折扣碼、但這些館別查無對應邀約（{orphanCodes.length} 筆）
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOrphanDismissed(true)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              同一支折扣碼在別的館別已有邀約，但這一館只有折扣碼、沒有邀約紀錄。請確認是否為未使用到的重複代碼，並回報成交組主管移除。
            </p>
            <ul className="space-y-1">
              {orphanCodes.map((o) => (
                <li key={o.discount_code_id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{o.code}</span>
                  <span className="text-muted-foreground">{o.accommodation_name ?? "—"}</span>
                  {o.code_name && <span className="text-xs text-muted-foreground">（{o.code_name}）</span>}
                  <Link
                    to={`/admin/discount-codes/${o.discount_code_id}/detail?accId=${o.accommodation_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
                  >
                    查看明細
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}




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
                  <TableHead>粉絲數</TableHead>
                  <TableHead>KOL連結</TableHead>
                  <TableHead>折扣碼 / CID</TableHead>
                  <SortableHead field="rarity">稀有度</SortableHead>
                  <SortableHead field="qualified">符合資格</SortableHead>
                  <SortableHead field="accommodation">館別</SortableHead>
                  <SortableHead field="check_in_date">入住日期</SortableHead>
                  <TableHead>星期</TableHead>
                  <SortableHead field="scout">邀約人</SortableHead>
                  <SortableHead field="booking_status">狀態</SortableHead>
                  <TableHead>訂單編號</TableHead>
                  <SortableHead field="contract_progress">合約進度</SortableHead>


                  <TableHead>任務</TableHead>
                  <SortableHead field="publish_date">發布日期</SortableHead>
                  <SortableHead field="invited_at">填寫日期</SortableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const renderMainRow = (r: KolRow, opts: { isOrphan?: boolean; isSub?: boolean } = {}) => {
                    const igUrl = r.ig_url || igProfileUrl(r.ig_handle) || null;
                    const contractStatus = computeContractProgress(r.publish_url, r.publish_date, r.contract_file_url);
                    const codeOrCidValue = r.cid_code ?? r.short_url ?? null;
                    const codeOrCid = codeOrCidValue ?? "-";
                    const isPmsCreated = codeOrCidValue
                      ? pmsCodesSet.has(codeOrCidValue.trim().toUpperCase())
                      : false;
                    const codeOrCidClass = codeOrCidValue && (r.cid_configured || isPmsCreated)
                      ? "text-green-600 font-medium"
                      : "";
                    const subs = groupedRows.subMap.get(r.id) ?? [];
                    const hasSubs = subs.length > 0;
                    const expanded = expandedRows.has(r.id);
                    // 疑似重複：管理員可一鍵合併的候選（僅主檔側標紅）
                    const dupPair = duplicateGroups.find((p) => p.parent.id === r.id);
                    return (
                      <TableRow
                        key={r.id}
                        className={`cursor-pointer hover:bg-muted/50 ${opts.isSub ? "bg-muted/20" : ""} ${dupPair ? "bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/30" : ""}`}
                        onClick={() => setViewingRow(r)}
                      >

                        <TableCell className="max-w-[200px]">
                          <div className="flex items-center gap-1 max-w-[200px]">
                            {opts.isSub ? (
                              <>
                                <span className="inline-block w-4 shrink-0" />
                                <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 shrink-0">
                                  附屬
                                </Badge>
                              </>
                            ) : hasSubs ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
                                className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted shrink-0"
                                aria-label={expanded ? "收合附屬記錄" : "展開附屬記錄"}
                              >
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="inline-block h-5 w-5 shrink-0" />
                            )}
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
                            <AnomalyBadge reason={(r as any).anomaly_reason} />

                            {opts.isOrphan && (
                              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 shrink-0">
                                孤兒附屬
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatFollowerCount(r.follower_count)}</TableCell>
                        <TableCell className="min-w-[240px] max-w-[280px] align-top">
                          {(() => {
                            const link = r.ig_url || igProfileUrl(r.ig_handle);
                            return link ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline break-all whitespace-normal block max-w-[280px]"
                                title={link}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {link}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            );
                          })()}
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
                        <TableCell>{(() => {
                          const vRow = r.venue_id ? venueByIdAll.get(r.venue_id) : null;
                          let name = r._accommodation_name || vRow?.name || r.venue_name || "-";
                          if (vRow && vRow.room_type_id && vRow.is_active === false && vRow.accommodation_id) {
                            name = accommodations.find((a) => a.id === vRow.accommodation_id)?.name ?? name;
                          }
                          return name;
                        })()}</TableCell>
                        <TableCell>{r.check_in_date ?? "-"}</TableCell>
                        <TableCell>{r.day_of_week ?? "-"}</TableCell>
                        <TableCell>{r._scout_name}</TableCell>
                        <TableCell>{renderBookingStatusBadge(r._effective_booking_status ?? r.booking_status)}</TableCell>
                        <TableCell className="tabular-nums">
                          {r.order_number ? (
                            <span title={r.order_number}>{r.order_number}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

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
                        <TableCell>
                          {r.invited_at ? (
                            r.invited_at.slice(0, 10)
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {dupPair && isManager && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 mr-1 border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => setMergeConfirm(dupPair)}
                            >
                              合併重複
                            </Button>
                          )}
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
                  };

                  // 附屬記錄：與主檔使用完全相同的欄位版型，僅加上「附屬」標記與底色
                  const renderSubRow = (sub: KolRow) => renderMainRow(sub, { isSub: true });


                  const nodes: React.ReactNode[] = [];
                  for (const p of groupedRows.primaries) {
                    nodes.push(renderMainRow(p));
                    if (expandedRows.has(p.id)) {
                      for (const sub of (groupedRows.subMap.get(p.id) ?? [])) {
                        nodes.push(renderSubRow(sub));
                      }
                    }
                  }
                  for (const o of groupedRows.orphans) {
                    nodes.push(renderMainRow(o, { isOrphan: true }));
                  }
                  return nodes;
                })()}
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
            <SheetTitle className="pr-12">邀約明細</SheetTitle>
            {viewingRow?.primary_profile_id && (() => {
              const parent = sortedRows.find((x) => x.id === viewingRow.primary_profile_id)
                ?? groupedRows.primaries.find((x) => x.id === viewingRow.primary_profile_id);
              const parentVenue = parent?.venue_id ? venueByIdAll.get(parent.venue_id) : null;
              let parentSubName = parentVenue?.name ?? parent?.venue_name ?? parent?._accommodation_name ?? "-";
              if (parentVenue && parentVenue.room_type_id && parentVenue.is_active === false && parentVenue.accommodation_id) {
                parentSubName = accommodations.find((a) => a.id === parentVenue.accommodation_id)?.name ?? parentSubName;
              }
              const crossVenue = !!parent?.accommodation_id && !!viewingRow.accommodation_id
                && parent.accommodation_id !== viewingRow.accommodation_id;
              const gapDays = parent?.check_in_date && viewingRow.check_in_date
                ? Math.round(Math.abs(new Date(parent.check_in_date).getTime() - new Date(viewingRow.check_in_date).getTime()) / 86400000)
                : null;
              const isException = (viewingRow as { primary_link_exception?: boolean | null }).primary_link_exception === true;
              return (
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
                    附屬記錄
                  </Badge>
                  {isException && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                      特例附屬
                    </Badge>
                  )}
                  <span className="text-muted-foreground">主要館別：{parentSubName}</span>
                  {crossVenue && <span className="text-muted-foreground">跨館別附屬</span>}
                  {gapDays !== null && gapDays > 31 && (
                    <span className="text-muted-foreground">入住日相差 {gapDays} 天</span>
                  )}

                </div>
              );

            })()}
            <div className="flex flex-wrap items-center gap-2 mt-2">

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
              {viewingRow &&
                canEditRow(viewingRow) &&
                !viewingRow.primary_profile_id &&
                viewingRow.accommodation_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCreateSubsidiary(viewingRow)}
                  >
                    新增附屬記錄
                  </Button>
                )}
              {viewingRow &&
                canEditRow(viewingRow) &&
                !viewingRow.primary_profile_id &&
                /* 已是主檔（底下有附屬記錄）就不能再被設為別人的附屬 */
                !rows.some((x) => x.primary_profile_id === viewingRow.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-muted-foreground"
                    onClick={() => {
                      setLinkSubsidiaryTarget(viewingRow);
                      setLinkSearchQuery("");
                      setLinkSearchResults([]);
                      setViewingRow(null);
                    }}
                  >
                    設為附屬記錄
                  </Button>
                )}
              {viewingRow &&
                canEditRow(viewingRow) &&
                viewingRow.primary_profile_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUnlinkTarget(viewingRow);
                      setViewingRow(null);
                    }}
                  >
                    取消附屬關係
                  </Button>
                )}
            </div>
          </SheetHeader>
          {viewingRow &&
            (() => {
              const r = viewingRow;
              const igUrl = r.ig_url || igProfileUrl(r.ig_handle) || null;
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
                  {(r as any).collab_progress === "異常需檢查" && (
                    <Row label="異常原因">
                      <div className="rounded-md border border-orange-200 bg-orange-50 p-2">
                        <div className="font-medium text-orange-800 text-sm">
                          {ANOMALY_INFO[(r as any).anomaly_reason]?.title ?? "未知異常"}
                        </div>
                        <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                          {ANOMALY_INFO[(r as any).anomaly_reason]?.desc ?? "—"}
                        </p>
                        <p className="text-[11px] text-orange-600/80 mt-1 leading-relaxed">
                          {ANOMALY_INFO[(r as any).anomaly_reason]?.rule ?? ""}
                        </p>
                      </div>
                    </Row>
                  )}

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
                  <Row label="狀態">{renderBookingStatusBadge(r._effective_booking_status ?? r.booking_status)}</Row>
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
              <Field label="KOL 名稱 *" anchorId="kolf-name">
                <KolSuggestInput
                  field="name"
                  value={form.name}
                  excludeId={editingId}
                  onChange={(v) => setForm({ ...form, name: v })}
                  onPick={(s) =>
                    setForm((prev) => ({
                      ...prev,
                      name: s.name ?? prev.name,
                      ig_handle: prev.ig_handle || s.ig_handle || "",
                      cid_code: prev.cid_code || s.cid_code || "",
                    }))
                  }
                />
                {nameVariant && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                    <div>
                      ⚠️ 已有寫法不同的同名紀錄「{nameVariant}」（僅全半形／大小寫／空白不同）。
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, name: nameVariant }));
                          setNameVariantConfirmed(false);
                        }}
                      >
                        套用既有寫法
                      </Button>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={nameVariantConfirmed}
                          onCheckedChange={(c) => setNameVariantConfirmed(!!c)}
                        />
                        <span>確認為不同人（不套用既有寫法）</span>
                      </label>
                    </div>
                  </div>
                )}
                {!nameVariant &&
                  form.name.trim() &&
                  normalizeKolName(form.name) !== form.name.trim() && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      儲存時將正規化為「{normalizeKolName(form.name)}」
                    </div>
                  )}
              </Field>
              <Field label="網紅帳號連結 *" anchorId="kolf-ig">
                <KolSuggestInput
                  field="ig_handle"
                  value={form.ig_handle}
                  excludeId={editingId}
                  onChange={(v) => setForm({ ...form, ig_handle: v })}
                  onPick={(s) =>
                    setForm((prev) => ({
                      ...prev,
                      ig_handle: s.ig_handle ?? prev.ig_handle,
                      name: prev.name || s.name || "",
                    }))
                  }
                />
                {isContentPostUrl(form.ig_handle) && !igContentUrlAck && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 space-y-2">
                    <div>
                      ⚠️ 這看起來是貼文／Reels 影片連結，不包含 IG 帳號本身，無法用於查重與自動歸戶。
                      確認這網址是想填寫在「發布連結」欄位嗎？（不影響儲存）
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          const url = form.ig_handle.trim();
                          if (form.publish_url.trim() && form.publish_url.trim() !== url) {
                            if (!window.confirm("「發布連結」已有內容，要覆蓋嗎？")) return;
                          }
                          setForm((prev) => ({ ...prev, publish_url: url, ig_handle: "" }));
                          setIgContentUrlAck(false);
                        }}
                      >
                        移到發布連結
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setIgContentUrlAck(true)}
                      >
                        我確定就是帳號連結
                      </Button>
                    </div>
                  </div>
                )}
              </Field>
            </div>

            {dupWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 space-y-2">
                <div className="whitespace-pre-line">⚠️ {dupWarning}</div>
                <label className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={igDupConfirmed}
                    onCheckedChange={(c) => setIgDupConfirmed(!!c)}
                  />
                  <span>請確認是否為同一位 KOL，進行二次以上的合作？是 = 打勾</span>
                </label>
                <div className="text-amber-700">
                  或<br />
                  請確認目前網紅帳號相同、名稱卻不同。是 key 錯，或 IG 連結貼錯？
                </div>
              </div>
            )}


            {similarMatches.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-2">
                <div className="font-medium">⚠️ 同館別已有相似邀約，請先確認是否為同一份合約</div>
                <ul className="space-y-1">
                  {similarMatches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        {m.name}
                        {m.cid_code ? `（${m.cid_code}）` : ""}
                        {m.check_in_date ? ` · 入住 ${m.check_in_date}` : ""}
                        {m.booking_status ? ` · ${m.booking_status}` : ""}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          const full = rows.find((r) => r.id === m.id) ?? m;
                          setSheetOpen(false);
                          setViewingRow(full);
                        }}
                      >
                        查看明細
                      </Button>
                      {!form.primary_profile_id && !editingId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => setForm((prev) => ({ ...prev, primary_profile_id: m.id, primary_link_exception: false }))}
                        >
                          設為此筆的附屬
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-amber-700">
                  若確認是不同合約（不同期間／不同專案），可直接繼續建立，系統不會阻擋。
                </div>
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

            <Field label="粉絲數" anchorId="kolf-follower">
              <Input
                value={form.follower_count_input}
                placeholder="例如：57.7萬 或 57.7k 或 1226"
                onChange={(e) => setForm({ ...form, follower_count_input: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                請依照 IG 顯示的粉絲數輸入，例如「57.7萬」「57.7k」「57.7K」或純數字「1226」
              </p>
            </Field>


            <Field label="邀約人" anchorId="kolf-scout">
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

            <Field label="館別 *" anchorId="kolf-venue">
              <Select
                value={form.accommodation_select}
                onValueChange={(v) => {
                  const opt = accommodationOptions.find((o) => o.value === v);
                  const nextAccId = opt?.accommodation_id ?? "";
                  setForm({
                    ...form,
                    accommodation_select: v,
                    accommodation_id: nextAccId,
                    venue_id: opt?.venue_id ?? "",
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





            <Field label="入住日期" anchorId="kolf-dates">
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

            {(() => {
              const accId = form.accommodation_id;
              if (!accId) return null;
              const venueId =
                form.venue_id ||
                venues.find((x) => x.accommodation_id === accId && !x.room_type_id)?.id ||
                null;
              const missingVenue = !venueId;
              const missingSettings = form.inventory_status === "⚠️ 缺設定";
              if (!missingVenue && !missingSettings) return null;
              const accName = accommodations.find((a) => a.id === accId)?.name ?? "此館別";
              return (
                <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {missingVenue
                        ? `${accName} 尚未在「場域邀約管理」建立場域資料，庫存狀態無法自動判定。`
                        : `${accName} 尚未設定場域邀約規則（庫存判定將無效），請通知星探主管／AM 前往「場域邀約管理」補齊設定。`}
                    </span>
                  </div>
                  {onGoToVenues && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={onGoToVenues}
                    >
                      前往場域邀約管理
                    </Button>
                  )}
                </div>
              );
            })()}


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="訂單編號" anchorId="kolf-order">
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
              <Field label="折扣碼 / CID" anchorId="kolf-cid">
                {/* 同館同住分步導引 */}
                <Accordion type="single" collapsible className="mb-2">
                  <AccordionItem value="guide" className="rounded-md border px-2">
                    <AccordionTrigger className="py-2 text-xs">同館同住怎麼設定？（分步導引）</AccordionTrigger>
                    <AccordionContent className="pb-2 text-xs text-muted-foreground whitespace-pre-line">
                      {[
                        "Step 1｜館別：先在「館別」下拉選單選好本筆入住的館別（之後的判斷都以這個館別為基準）。",
                        "Step 2｜KOL 名稱 + IG 帳號：兩欄都填完，系統才會判斷「是不是同一位 KOL」。",
                        "　　・IG 相同但名稱不同 → 先出現「名稱／IG 確認」提示，必須先解決才會進入同住判斷。",
                        "Step 3｜折扣碼 / CID：填入與同住主檔相同的 CID。",
                        "　　・同館 + 同 CID + 同一位 KOL → 判定為重複建檔，直接擋下（請去編輯既有那筆）。",
                        "　　・同館 + 同 CID + 不同人 → 判定為同住夥伴，下方會出現「設為主檔：○○○」按鈕。",
                        "　　・跨館 + 同 CID → 同樣會出現「設為主檔」按鈕（同一份合約歸戶）。",
                        "Step 4｜點「設為主檔：○○○」→ 確認視窗說明分潤與 KPI 只計主檔一份 → 確認。",
                        "Step 5｜特例附屬（只有以下情況才會出現，且必須勾選才能存）：",
                        "　　・主檔與本筆分屬不同館別；或",
                        "　　・與主檔的入住日相差超過 31 天。",
                        "Step 6｜下方「明細顯示預覽」確認儲存後明細會怎麼呈現，再按儲存。",
                      ].join("\n")}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {cidChecking && (
                  <div className="mb-2 rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">
                    正在依目前的館別 / KOL / CID 重新檢查衝突與同住關係…
                  </div>
                )}

                {/* 同一 IG、不同名稱：先確認是名稱 key 錯還是 IG 貼錯，才進入同住判斷 */}
                {!cidChecking && (() => {
                  const hit = cidConflicts.find((c) => {
                    if (c.source !== "kol_profiles") return false;
                    const s = kolIdentitySignals({
                      formName: form.name,
                      formIg: form.ig_handle,
                      formContractGroupId: contractGroupId,
                      conflict: c,
                    });
                    return s.igMatches && !s.nameMatches && !!kolNameKey(form.name) && !!kolNameKey(c.owner_name ?? "");
                  });
                  if (!hit) return null;
                  return (
                    <div className="mb-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive space-y-2">
                      <div className="font-medium whitespace-pre-line">
                        {`⛔ IG 帳號與既有邀約「${hit.owner_name ?? "-"}」完全相同，但 KOL 名稱不一致（本筆填「${form.name.trim()}」）。\n請先確認：是「KOL 名稱 key 錯」，還是「IG 連結貼錯（其實是另一位 KOL）」？`}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setForm({ ...form, name: (hit.owner_name ?? "").trim() })}
                        >
                          名稱 key 錯：統一為「{hit.owner_name ?? "-"}」
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const el = document.getElementById(FIELD_ANCHORS.ig_handle);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            (el?.querySelector("input") as HTMLElement | null)?.focus();
                          }}
                        >
                          IG 連結貼錯：前往修正 IG
                        </Button>
                      </div>
                      <div className="text-[11px] font-normal">
                        修正後系統才會重新判斷同館同住（不同人才會出現「設為主檔」按鈕）。
                      </div>
                    </div>
                  );
                })()}

                {!cidChecking && cidConflicts.length > 0 && (() => {
                  const selfAccName = accommodations.find((a) => a.id === form.accommodation_id)?.name ?? "";
                  const selfVenueType = form.venue_id
                    ? (venues.find((v) => v.id === form.venue_id)?.type ?? "民宿")
                    : venueTypeOfAcc(form.accommodation_id);
                  const isLinked = (c: CodeConflict) =>
                    form.primary_profile_id === (c.detail?.profile_id ?? null) ||
                    (!!editingId && (c.detail?.primary_profile_id ?? null) === editingId);
                  const kolHits = cidConflicts.filter((c) => c.source === "kol_profiles");
                  const linked = kolHits.some(isLinked);
                  const identityInputComplete = !!kolNameKey(form.name) && !!normalizeIgHandle(form.ig_handle);

                  type Lv = "block" | "warning" | "info";
                  const levelOf = (c: CodeConflict): Lv => {
                    if (c.source === "scout_discount_codes") return "block";
                    if (c.source !== "kol_profiles") return "warning";
                    if (isLinked(c)) return "warning";
                    const currentNameKey = kolNameKey(form.name);
                    const existingNameKey = kolNameKey(c.owner_name ?? "");
                    if (!identityInputComplete) return "info";
                    const samePerson = isSameKolIdentity({
                      formName: form.name,
                      formIg: form.ig_handle,
                      formContractGroupId: contractGroupId,
                      conflict: c,
                    });
                    if (existingNameKey && existingNameKey !== currentNameKey) return "block";
                    if (!samePerson) return "block";
                    if (c.accommodation_id && c.accommodation_id === form.accommodation_id) return "block";
                    return isSameContractScope({
                      selfAccName,
                      otherAccName: c.accommodation_name,
                      selfVenueType,
                      otherVenueType: venueTypeOfAcc(c.accommodation_id),
                    })
                      ? "warning"
                      : "info";
                  };
                  const marks: Record<Lv, string> = { block: "⛔", warning: "⚠️", info: "ℹ️" };
                  const visibleConflicts = cidConflicts.filter((c) => {
                    if (c.source === "scout_discount_codes") return true;
                    if (c.source === "discount_codes") return false;
                    if (c.source !== "kol_profiles") return true;
                    if (isLinked(c)) return true;
                    if (!identityInputComplete) return c.accommodation_id === form.accommodation_id;
                    const sameIdentity = isSameKolIdentity({
                      formName: form.name,
                      formIg: form.ig_handle,
                      formContractGroupId: contractGroupId,
                      conflict: c,
                    });
                    if (!sameIdentity) return true;
                    if (c.accommodation_id === form.accommodation_id) return true;
                    return isSameContractScope({
                      selfAccName,
                      otherAccName: c.accommodation_name,
                      selfVenueType,
                      otherVenueType: venueTypeOfAcc(c.accommodation_id),
                    });
                  });
                  const levels = visibleConflicts.map(levelOf);
                  const tone = levels.includes("block")
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : levels.includes("warning")
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-border bg-muted text-muted-foreground";
                  // 同住主檔候選：
                  //  - 跨館同 CID（同一份合約歸戶）
                  //  - 同館同 CID 但「不同人」＝真正的同住夥伴，允許掛在主檔底下
                  // 只有「同館 + 判定為同一人」才視為重複建檔，直接阻擋、不提供設為主檔。
                  const isSamePersonHit = (c: typeof kolHits[number]) =>
                    isSameKolIdentity({
                      formName: form.name,
                      formIg: form.ig_handle,
                      formContractGroupId: contractGroupId,
                      conflict: c,
                    });
                  const needsPrimary = kolHits.filter((c) => {
                    if (levelOf(c) !== "block" || isLinked(c)) return false;
                    if (!c.accommodation_id) return false;
                    if (c.accommodation_id !== form.accommodation_id) return true;
                    return !isSamePersonHit(c);
                  });
                  const sameVenueDuplicate = kolHits.some(
                    (c) =>
                      levelOf(c) === "block" &&
                      !isLinked(c) &&
                      c.accommodation_id === form.accommodation_id &&
                      isSamePersonHit(c),
                  );

                  if (visibleConflicts.length === 0 && !linked && needsPrimary.length === 0) return null;

                  // 去重：同一位 KOL 的附屬記錄（子檔）若其主檔已顯示，就不重複列出
                  const shownIds = new Set(
                    visibleConflicts.map((c) => c.detail?.profile_id).filter(Boolean) as string[],
                  );
                  const deduped = visibleConflicts.filter((c) => {
                    if (c.source !== "kol_profiles") return true;
                    const parentId = c.detail?.primary_profile_id ?? null;
                    return !(parentId && shownIds.has(parentId));
                  });
                  // 名稱不一致提示只顯示一次
                  const nameDiffHit = deduped.find(
                    (c) =>
                      c.source === "kol_profiles" &&
                      !!kolNameKey(c.owner_name ?? "") &&
                      !!kolNameKey(form.name) &&
                      kolNameKey(c.owner_name ?? "") !== kolNameKey(form.name),
                  );

                  // 主檔／特例附屬提示（原本放在「同住夥伴」欄位，改置於 CID 欄位上方避免混淆）
                  const primaryNotice = (() => {
                    if (!form.primary_profile_id) return null;
                    const parent = rows.find((r) => r.id === form.primary_profile_id);
                    const conflictParent = cidConflicts.find((c) => c.detail?.profile_id === form.primary_profile_id);
                    const parentCheckIn = parent?.check_in_date ?? conflictParent?.detail?.check_in_date ?? null;
                    const parentAccommodationId = parent?.accommodation_id ?? conflictParent?.accommodation_id ?? null;
                    const crossVenue = !!parentAccommodationId && !!form.accommodation_id
                      && parentAccommodationId !== form.accommodation_id;
                    // 旅行日系列彼此視為同一份合約，跨館不需特例附屬
                    const sameSeries = crossVenue && isTravelSeriesAccommodation(
                      accommodations.find((a) => a.id === parentAccommodationId)?.name ?? conflictParent?.accommodation_name ?? null,
                    ) && isTravelSeriesAccommodation(
                      accommodations.find((a) => a.id === form.accommodation_id)?.name ?? form.venue_name ?? null,
                    );
                    const gap = parentCheckIn && form.check_in_date
                      ? Math.abs(new Date(parentCheckIn).getTime() - new Date(form.check_in_date).getTime()) / 86400000
                      : null;
                    const needsException = (crossVenue && !sameSeries) || (gap !== null && gap > 31);
                    if (!needsException) return null;
                    const reasons = [
                      crossVenue ? "主檔與本筆分屬不同館別" : null,
                      gap !== null && gap > 31 ? `入住日相差 ${Math.round(gap)} 天` : null,
                    ].filter(Boolean).join("、");
                    return (
                      <label className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                        <Checkbox
                          checked={form.primary_link_exception}
                          onCheckedChange={(checked) => setForm({ ...form, primary_link_exception: checked === true })}
                        />
                        <span>特例附屬：{reasons}，已確認仍屬同一份主檔／附屬合作。</span>
                      </label>
                    );

                  })();

                  return (
                    <div className={`mb-2 rounded-md border p-2 text-xs space-y-1 ${tone}`}>
                      {deduped.map((c, i) => {
                        const lv = levelOf(c);
                        const sameIdentity = c.source === "kol_profiles" && isSameKolIdentity({
                          formName: form.name,
                          formIg: form.ig_handle,
                          formContractGroupId: contractGroupId,
                          conflict: c,
                        });
                        const namesDiffer = !!kolNameKey(c.owner_name ?? "") && !!kolNameKey(form.name)
                          && kolNameKey(c.owner_name ?? "") !== kolNameKey(form.name);
                        const isSamePersonOther = sameIdentity && !namesDiffer && c.accommodation_id !== form.accommodation_id;
                        return (
                          <div key={i}>
                            {marks[lv]}{" "}
                            {c.source === "scout_discount_codes"
                              ? `此碼已是星探專屬碼${c.owner_name ? `（${c.owner_name}）` : ""}，命名空間衝突。`
                              : c.source === "kol_profiles"
                                ? isSamePersonOther
                                  ? lv === "warning"
                                    ? `同一位 KOL 於${c.accommodation_name ? `（${c.accommodation_name}）` : "其他館別"}已用同一支 CID；依規則屬同一份合約，只計 1 個資格。`
                                    : `同一位 KOL 於${c.accommodation_name ? `（${c.accommodation_name}）` : "其他館別"}也有合作（同 CID），屬不同館別的獨立合作，各自計算資格，無需處理。`
                                  : !identityInputComplete
                                    ? `此館別已有相同 CID 的邀約；填完 KOL 名稱與 IG 後，系統會確認是否為重複建檔。`
                                    : `此 CID 已被「${c.owner_name ?? "-"}」使用${c.accommodation_name ? `（${c.accommodation_name}）` : ""}，入住日 ${c.detail?.check_in_date ?? "-"}。`
                                : `PMS 已有此折扣碼${c.accommodation_name ? `（綁定 ${c.accommodation_name}）` : ""}。`}
                          </div>
                        );
                      })}
                      {nameDiffHit && (
                        <div className="font-medium">
                          ℹ️ 請統一 KOL 名稱是「{nameDiffHit.owner_name ?? "-"}」或是「{form.name.trim()}」。
                        </div>
                      )}
                      {sameVenueDuplicate && !linked && (
                        <div className="font-medium">
                          ⛔ 同館別已有「同一位 KOL」使用相同 CID，視為重複建檔，無法儲存。
                          <div className="font-normal">請改為編輯既有那筆邀約（不要新增第二筆）。</div>
                        </div>
                      )}
                      {kolHits.length > 0 && (linked || needsPrimary.length > 0) && (
                        <div className="pt-1">
                          {linked ? (
                            <span>已建立同住合拍關係：分潤與 KPI 只算主檔，本筆不重複計分。</span>
                          ) : (
                            <>
                              <div className="font-medium whitespace-pre-line">
                                {"⚠️ 不同 KOL 使用同一組 CID，請確認是否為「同時入住（同住合拍）」？\n" +
                                  "・是同住 → 點下方「設為主檔」，把本筆掛在主檔底下；分潤與 KPI 只算主檔一份。\n" +
                                  "・不是同住 → 請改用本人獨立的專屬折扣碼。"}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {needsPrimary
                                  .filter((c) => c.detail?.profile_id && !c.detail?.primary_profile_id)
                                  .map((c) => (
                                    <Button
                                      key={c.detail.profile_id}
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setPrimaryConfirm({ id: c.detail.profile_id, name: c.owner_name ?? "-" })
                                      }
                                    >
                                      設為主檔：{c.owner_name ?? "-"}
                                      {c.accommodation_name ? `（${c.accommodation_name}）` : ""}
                                    </Button>
                                  ))}
                              </div>
                            </>
                          )}
                          {form.primary_profile_id && (
                            <button
                              type="button"
                              className="mt-1 underline underline-offset-2"
                              onClick={() => setForm({ ...form, primary_profile_id: null, primary_link_exception: false })}
                            >
                              取消主檔關係
                            </button>
                          )}
                        </div>
                      )}

                      {primaryNotice}
                    </div>
                  );
                })()}

                <KolSuggestInput
                  field="cid_code"
                  value={form.cid_code}
                  excludeId={editingId}
                  onChange={(v) => setForm({ ...form, cid_code: v })}
                />
              </Field>
            )}


            <Field label="同住夥伴" anchorId="kolf-companion">
              {form.primary_profile_id ? (
                <div className="rounded-md border bg-muted/40 p-2 text-sm">
                  已掛在主檔底下（附屬記錄）。本筆不列入 KPI 與住宿間數，分潤一律歸主檔。
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-2"
                    onClick={() => setForm({ ...form, primary_profile_id: null, primary_link_exception: false })}
                  >
                    取消主檔關係
                  </button>

                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {"同住合拍設定方式（舊的「同住夥伴折扣碼」欄位已停用）：\n" +
                    "1. 在「折扣碼 / CID」填入與同住主檔相同的 CID。\n" +
                    "2. 上方會出現衝突提示，點「設為主檔：○○○」把本筆掛在主檔底下。\n" +
                    "3. 若主檔為不同館別或入住日相差超過 31 天，再勾選「特例附屬」即可儲存。\n" +
                    "※ 同館別且判定為「同一位 KOL」屬重複建檔，請直接編輯既有那筆。"}
                </p>
              )}
            </Field>

            {/* 明細顯示預覽 + 目前被擋住的原因（未儲存前即時預覽） */}
            {showCid && (() => {
              const parentRow = form.primary_profile_id
                ? rows.find((r) => r.id === form.primary_profile_id)
                : null;
              const conflictParent = form.primary_profile_id
                ? cidConflicts.find((c) => c.detail?.profile_id === form.primary_profile_id)
                : null;
              const parentName = parentRow?.name ?? conflictParent?.owner_name ?? null;
              const parentCheckIn = parentRow?.check_in_date ?? conflictParent?.detail?.check_in_date ?? null;
              const parentAccId = parentRow?.accommodation_id ?? conflictParent?.accommodation_id ?? null;
              const parentAccName =
                accommodations.find((a) => a.id === parentAccId)?.name ??
                conflictParent?.accommodation_name ??
                parentRow?.venue_name ??
                "—";
              const crossVenue = !!parentAccId && !!form.accommodation_id && parentAccId !== form.accommodation_id;
              // 旅行日系列彼此視為同一份合約，跨館不需特例附屬
              const sameSeries =
                crossVenue &&
                isTravelSeriesAccommodation(parentAccName) &&
                isTravelSeriesAccommodation(
                  accommodations.find((a) => a.id === form.accommodation_id)?.name ?? form.venue_name ?? null,
                );
              const gap =
                parentCheckIn && form.check_in_date
                  ? Math.round(
                      Math.abs(new Date(parentCheckIn).getTime() - new Date(form.check_in_date).getTime()) / 86400000,
                    )
                  : null;
              const needsException = (crossVenue && !sameSeries) || (gap !== null && gap > 31);

              // 目前被擋住的原因（前端即時判斷，儲存時仍以完整驗證為準）
              const blockerMap = new Map<string, { rule: string; text: string }>();
              const pushBlocker = (b: { rule: string; text: string }) => {
                // 同一條規則＋同一段文字只顯示一次（避免子館／多筆同人紀錄重複列出）
                if (!blockerMap.has(`${b.rule}|${b.text}`)) blockerMap.set(`${b.rule}|${b.text}`, b);
              };
              const identityComplete = !!kolNameKey(form.name) && !!normalizeIgHandle(form.ig_handle);
              if (!cidChecking && identityComplete) {
                for (const c of cidConflicts) {
                  if (c.source !== "kol_profiles") continue;
                  const linked =
                    form.primary_profile_id === (c.detail?.profile_id ?? null) ||
                    (!!editingId && (c.detail?.primary_profile_id ?? null) === editingId);
                  if (linked) continue;
                  const s = kolIdentitySignals({
                    formName: form.name,
                    formIg: form.ig_handle,
                    formContractGroupId: contractGroupId,
                    conflict: c,
                  });
                  const samePerson = s.nameMatches || s.igMatches || s.groupMatches;
                  const namesDiffer =
                    !!kolNameKey(c.owner_name ?? "") && kolNameKey(c.owner_name ?? "") !== kolNameKey(form.name);
                  if (samePerson && namesDiffer) {
                    pushBlocker({
                      rule: "name.same_identity_different_name",
                      text: `名稱不一致：既有「${c.owner_name ?? "-"}」 vs 本筆「${form.name.trim()}」。`,
                    });
                  } else if (samePerson && c.accommodation_id === form.accommodation_id) {
                    pushBlocker({
                      rule: "cid.duplicate_same_person",
                      text: `同館別已有同一位 KOL「${c.owner_name ?? "-"}」使用此 CID（重複建檔）。`,
                    });
                  } else if (!samePerson) {
                    pushBlocker({
                      rule: "cid.used_by_other",
                      text: `此 CID 目前屬於「${c.owner_name ?? "-"}」，尚未建立同住主檔／附屬關係。`,
                    });
                  }
                }
              }
              if (needsException && !form.primary_link_exception) {
                pushBlocker({
                  rule: "primary.exception_required",
                  text: `主檔為${crossVenue ? "不同館別" : ""}${crossVenue && gap !== null && gap > 31 ? "、" : ""}${gap !== null && gap > 31 ? `入住日相差 ${gap} 天` : ""}，尚未勾選「特例附屬」。`,
                });
              }
              const blockers = [...blockerMap.values()];


              return (
                <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
                  <div className="font-medium text-sm">明細顯示預覽（尚未儲存）</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded border bg-background px-1.5 py-0.5">
                      {form.name.trim() || "（未填名稱）"}
                    </span>
                    <span className="rounded border bg-background px-1.5 py-0.5">
                      CID：{normalizeCode(form.cid_code) || "—"}
                    </span>
                    <span className="rounded border bg-background px-1.5 py-0.5">
                      館別：{accommodations.find((a) => a.id === form.accommodation_id)?.name ?? (form.venue_name || "—")}
                    </span>
                    {form.primary_profile_id ? (
                      <>
                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                          附屬記錄（主檔：{parentName ?? "—"}）
                        </span>
                        {needsException && (
                          <span
                            className={`rounded border px-1.5 py-0.5 ${
                              form.primary_link_exception
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-destructive bg-destructive/10 text-destructive"
                            }`}
                          >
                            特例附屬{form.primary_link_exception ? "已勾選" : "未勾選"}
                          </span>
                        )}
                        {crossVenue && (
                          <span className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-sky-900">
                            跨館別附屬（主檔館別：{parentAccName}）
                          </span>
                        )}
                        {gap !== null && (
                          <span className="rounded border bg-background px-1.5 py-0.5">入住日相差 {gap} 天</span>
                        )}
                      </>
                    ) : (
                      <span className="rounded border bg-background px-1.5 py-0.5">主檔（獨立計算 KPI 與分潤）</span>
                    )}
                  </div>
                  {form.primary_profile_id && (
                    <div className="text-muted-foreground">
                      明細將顯示為附屬記錄：不列入 KPI 與住宿間數，分潤一律歸主檔「{parentName ?? "—"}」。
                    </div>
                  )}
                  <div className="border-t pt-2">
                    {cidChecking ? (
                      <span className="text-muted-foreground">驗證中…</span>
                    ) : blockers.length === 0 ? (
                      <span className="text-emerald-700">目前沒有偵測到阻擋項目，可以嘗試儲存。</span>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="font-medium text-destructive">
                          目前被擋住的原因（{blockers.length}）
                        </div>
                        {blockers.map((b, i) => (
                          <div key={i} className="rounded border border-destructive/40 bg-destructive/5 p-2">
                            <div className="text-destructive">⛔ {b.text}</div>
                            <div className="mt-0.5 text-muted-foreground">
                              💡 怎麼做：{RULE_ACTION_HINTS[b.rule] ?? "請依提示修正後再儲存。"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}





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


            {(showShortUrl || form.short_url) && (
              <Field label="短網址後綴（Legacy，唯讀）">
                <Input value={form.short_url} readOnly disabled className="bg-muted" />
                <p className="mt-1 text-xs text-muted-foreground">
                  已停用：業績歸戶一律以折扣碼 / CID 為準，此欄位僅保留歷史資料。
                </p>
                {shortUrlPrefix && form.short_url && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    完整網址：{shortUrlPrefix}
                    {form.short_url}
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
              <Field label="發布連結" anchorId="kolf-publish">
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

            {editingId && (
              <Field label="合約歸戶">
                {contractGroupId ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        合約 #{contractGroupId.slice(0, 8)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        共 {contractSiblings.length + 1} 筆邀約，資格計 1 件
                      </span>
                    </div>
                    {contractSiblings.length > 0 && (
                      <ul className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                        {contractSiblings.map((sb) => (
                          <li key={sb.id} className="text-muted-foreground">
                            {sb.name || "（未命名）"}
                            {sb.cid_code ? ` ｜ ${sb.cid_code}` : ""}
                            {sb.venue_name ? ` ｜ ${sb.venue_name}` : ""}
                            {sb.check_in_date ? ` ｜ ${sb.check_in_date}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {isManager && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={groupSaving}
                          onClick={() => setGroupPickerOpen(true)}
                        >
                          合併到其他邀約
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={groupSaving || contractSiblings.length === 0}
                          onClick={() => updateContractGroup(crypto.randomUUID())}
                        >
                          拆分為獨立合約
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      同代碼／同檔期／同場域自動歸為一份合約；跨場域的品牌聯名（例：星夢劇場 × 天使星夢度假村）請用「合併到其他邀約」手動歸戶。
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    此筆合作檔期早於 {CONTRACT_GROUP_CUTOFF}，沿用舊口徑（一筆一件），不做合約歸戶。
                  </p>
                )}
              </Field>
            )}
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

      {/* 粉絲數格式錯誤 Dialog */}
      <AlertDialog open={!!followerError} onOpenChange={(o) => !o && setFollowerError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>粉絲數格式錯誤</AlertDialogTitle>
            <AlertDialogDescription>{followerError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setFollowerError(null)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 設為主檔前的說明確認 */}
      <AlertDialog open={!!primaryConfirm} onOpenChange={(o) => !o && setPrimaryConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>要把本筆設為「{primaryConfirm?.name}」的附屬記錄嗎？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>設定主檔代表兩筆是同一份合作（同住合拍、共用同一支 CID）：</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>分潤與勞報一律歸主檔，本筆不重複計算。</li>
                  <li>本筆不列入 KPI 與住宿間數。</li>
                  <li>公開查詢連結以主檔為準。</li>
                  <li>跨館別、或入住日相差超過 31 天時，仍需在下方勾選「特例附屬」才能儲存。</li>
                </ul>
                <p>不同 KOL 共用同一支 CID，只有在「同時入住」時才適用；若不是同時入住，請改用各自獨立的專屬折扣碼，不要設為附屬。</p>

              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (primaryConfirm) {
                  setForm({ ...form, primary_profile_id: primaryConfirm.id, primary_link_exception: false });
                }
                setPrimaryConfirm(null);
              }}
            >
              確認設為主檔
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={blockIssues.length > 0} onOpenChange={(o) => !o && setBlockIssues([])}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>無法儲存，請先修正以下 {blockIssues.length} 個問題</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                {blockIssues.map((issue, i) => (
                  <div key={i} className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-destructive">
                        {FIELD_LABELS[issue.field]}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setBlockIssues([]);
                          setTimeout(() => {
                            const el = document.getElementById(FIELD_ANCHORS[issue.field]);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            (el?.querySelector("input, textarea, button") as HTMLElement | null)?.focus();
                          }, 120);
                        }}
                      >
                        前往欄位 <ChevronRight className="ml-0.5 h-3 w-3" />
                      </Button>
                    </div>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{issue.message}</p>
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <div>🚫 觸發規則：{issue.rule}</div>
                      {issue.expected && <div>✅ 應該是：{issue.expected}</div>}
                      {issue.actual && <div>❌ 目前填的：{issue.actual}</div>}
                      {RULE_ACTION_HINTS[issue.rule] ? (
                        <div className="text-foreground whitespace-pre-line">👉 我該怎麼做：{RULE_ACTION_HINTS[issue.rule]}</div>
                      ) : (
                        issue.suggestion && <div className="whitespace-pre-line">💡 建議做法：{issue.suggestion}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockIssues([])}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* 合約歸戶：合併到其他邀約 */}
      <Dialog
        open={groupPickerOpen}
        onOpenChange={(o) => {
          setGroupPickerOpen(o);
          if (!o) setGroupSearch("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>合併到同一份合約</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              選擇一筆同屬這份合約的邀約，本筆將併入對方的合約歸戶，資格只計 1 件。
            </p>
            <Input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="輸入 KOL 名稱或折扣代碼"
            />
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {groupResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {groupSearch.trim() ? "查無符合的邀約" : "請輸入關鍵字搜尋"}
                </p>
              ) : (
                groupResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    disabled={groupSaving}
                    onClick={() => r.contract_group_id && updateContractGroup(r.contract_group_id)}
                  >
                    <span className="font-medium">{r.name || "（未命名）"}</span>
                    <span className="text-muted-foreground">
                      {r.cid_code ? ` ｜ ${r.cid_code}` : ""}
                      {r.venue_name ? ` ｜ ${r.venue_name}` : ""}
                      {r.check_in_date ? ` ｜ ${r.check_in_date}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupPickerOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 設為附屬記錄：搜尋主要記錄 Dialog */}
      <Dialog
        open={!!linkSubsidiaryTarget}
        onOpenChange={(o) => {
          if (!o) {
            setLinkSubsidiaryTarget(null);
            setLinkSearchQuery("");
            setLinkSearchResults([]);
          }
        }}
      >
        <DialogContent className="max-w-lg overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>選擇主要記錄</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              一般附屬記錄適用於同一位 KOL、同館別且入住日相差 31 天內的資料；跨館別或超過 31 天需另外勾選「特例附屬」。
            </p>

            <Input
              placeholder="搜尋 KOL 名稱或 IG 帳號"
              value={linkSearchQuery}
              onChange={(e) => setLinkSearchQuery(e.target.value)}
            />
            <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
              {linkSearching && (
                <div className="p-3 text-xs text-muted-foreground">搜尋中…</div>
              )}
              {!linkSearching && linkSearchQuery.trim() && linkSearchResults.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">找不到同名的主要記錄</div>
              )}
              {!linkSearching && !linkSearchQuery.trim() && (
                <div className="p-3 text-xs text-muted-foreground">請輸入關鍵字搜尋</div>
              )}
              {linkSearchResults.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="w-full text-left p-3 hover:bg-muted/50 text-sm"
                  onClick={() => {
                    if (linkSubsidiaryTarget) {
                      const gap = linkSubsidiaryTarget.check_in_date && r.check_in_date
                        ? Math.abs(new Date(linkSubsidiaryTarget.check_in_date).getTime() - new Date(r.check_in_date).getTime()) / 86400000
                        : 0;
                      const crossVenue = !!r.accommodation_id && !!linkSubsidiaryTarget.accommodation_id
                        && r.accommodation_id !== linkSubsidiaryTarget.accommodation_id;
                      setLinkExceptionConfirmed(false);
                      setLinkConfirm({ child: linkSubsidiaryTarget, parent: r, isException: gap > 31 || crossVenue });

                    }
                  }}
                >
                  <div className="font-medium">{r.name ?? "-"}</div>
                  <div className="text-xs text-muted-foreground break-all">
                    {r.ig_url || igProfileUrl(r.ig_handle) || r.ig_handle || "-"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                     {r._accommodation_name || "-"} · {r.check_in_date ?? "無日期"} · {
                       (r.accommodation_id && linkSubsidiaryTarget?.accommodation_id &&
                         r.accommodation_id !== linkSubsidiaryTarget.accommodation_id) ||
                       (linkSubsidiaryTarget?.check_in_date && r.check_in_date &&
                       Math.abs(new Date(linkSubsidiaryTarget.check_in_date).getTime() - new Date(r.check_in_date).getTime()) / 86400000 > 31)
                         ? "特例附屬候選"
                         : "主檔候選"
                     }
                  </div>

                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 設為附屬記錄確認 */}
      <AlertDialog
        open={!!linkConfirm}
        onOpenChange={(o) => {
          if (!o && !linkSubmitting) {
            setLinkConfirm(null);
            setLinkExceptionConfirmed(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認設為附屬記錄</AlertDialogTitle>
            <AlertDialogDescription>
              確定將此記錄設為「{linkConfirm?.parent.name ?? ""} - {linkConfirm?.parent._accommodation_name ?? ""}」的附屬記錄嗎？此操作會將「累積資格」設為不打勾。
            </AlertDialogDescription>
            {linkConfirm?.isException && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <Checkbox
                  checked={linkExceptionConfirmed}
                  onCheckedChange={(checked) => setLinkExceptionConfirmed(checked === true)}
                />
                <span>特例附屬：跨館別或入住日相差超過 31 天，我已確認這兩筆仍屬同一份合作。</span>

              </label>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLinkSubsidiary}
              disabled={linkSubmitting || (!!linkConfirm?.isException && !linkExceptionConfirmed)}
            >
              {linkSubmitting ? "處理中..." : "確認"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 列表疑似重複：一鍵合併 */}
      <AlertDialog
        open={!!mergeConfirm}
        onOpenChange={(o) => {
          if (!o && !mergeSubmitting) {
            setMergeConfirm(null);
            setMergeExceptionConfirmed(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>合併疑似重複的邀約</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                <p>
                  這兩筆為「同館別、同折扣碼」但尚未歸戶的邀約，系統判定可能是同一份合約被填寫了兩次。
                </p>
                <ul className="list-disc pl-5">
                  <li>
                    保留為主要記錄：{mergeConfirm?.parent.name ?? ""}
                    {mergeConfirm?.parent.check_in_date ? `（入住 ${mergeConfirm.parent.check_in_date}）` : ""}
                  </li>
                  <li>
                    改為附屬記錄：{mergeConfirm?.child.name ?? ""}
                    {mergeConfirm?.child.check_in_date ? `（入住 ${mergeConfirm.child.check_in_date}）` : ""}
                  </li>
                </ul>
                <p>
                  合併後兩筆會歸入同一份合約，附屬那筆的「累積資格」會取消打勾，請款統計只會計算一次，
                  但兩筆資料都會保留、不會被刪除，日後仍可拆分。
                </p>
                {mergeConfirm?.parent.check_in_date && mergeConfirm.child.check_in_date &&
                  Math.abs(new Date(mergeConfirm.parent.check_in_date).getTime() - new Date(mergeConfirm.child.check_in_date).getTime()) / 86400000 > 31 && (
                    <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      <Checkbox
                        checked={mergeExceptionConfirmed}
                        onCheckedChange={(checked) => setMergeExceptionConfirmed(checked === true)}
                      />
                      <span>特例附屬：入住日相差超過 31 天，我已確認這兩筆仍屬同一份合作。</span>
                    </label>
                  )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMerge}
              disabled={mergeSubmitting || (!!mergeConfirm?.parent.check_in_date && !!mergeConfirm?.child.check_in_date &&
                Math.abs(new Date(mergeConfirm.parent.check_in_date).getTime() - new Date(mergeConfirm.child.check_in_date).getTime()) / 86400000 > 31 &&
                !mergeExceptionConfirmed)}
            >
              {mergeSubmitting ? "處理中..." : "確認合併"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* 新增附屬記錄：功能說明 */}
      <AlertDialog open={!!subsidiaryIntroTarget} onOpenChange={(o) => !o && setSubsidiaryIntroTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>什麼是「附屬記錄」？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                <p>
                  接下來會以「{subsidiaryIntroTarget?.name ?? ""}」為主要記錄，建立一筆掛在它底下的附屬記錄，
                  用於同一位 KOL 在同一館別合作中的另一筆入住記錄。
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>KOL 名稱、網紅帳號連結、邀約人會自動沿用主要記錄，仍可修改。</li>
                  <li>附屬記錄<strong>不會</strong>另外計入累積資格與住宿間數，一份合約仍只算一筆資格。</li>
                  <li>相關分潤與獎金一律歸屬於主要記錄，不會重複計算。</li>
                   <li>一般附屬適用於同一館別、入住日相差 31 天內的資料。</li>
                   <li>跨館別或超過 31 天必須另外勾選「特例附屬」確認。</li>

                  <li>之後可在附屬記錄的明細中「取消附屬關係」，讓它恢復為獨立的主要記錄。</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => subsidiaryIntroTarget && proceedCreateSubsidiary(subsidiaryIntroTarget)}
            >
              我了解，繼續新增
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 取消附屬關係確認 */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && !unlinkSubmitting && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認取消附屬關係</AlertDialogTitle>
            <AlertDialogDescription>
              確定要將「{unlinkTarget?.name ?? ""}」的附屬關係取消嗎？取消後此記錄會恢復為獨立的主要記錄，kpi_qualified 不會自動改回符合資格。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlinkSubsidiary} disabled={unlinkSubmitting}>
              {unlinkSubmitting ? "處理中..." : "確認取消"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children, required, anchorId }: { label: string; children: React.ReactNode; required?: boolean; anchorId?: string }) {
  return (
    <div className="space-y-1 scroll-mt-24" id={anchorId}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
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
  const [inviteSearchInput, setInviteSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(inviteSearchInput), 150);
    return () => clearTimeout(t);
  }, [inviteSearchInput]);
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

  const fetchRows = useCallback(async (searchVal?: string) => {
    setLoading(true);
    let q = supabase.from("kol_prospects").select("*").order("created_at", { ascending: false });

    const s = (searchVal ?? "").trim();
    if (s) {
      const esc = s.replace(/[%,()]/g, " ");
      q = q.or(`name.ilike.%${esc}%,ig_url.ilike.%${esc}%,cid_code.ilike.%${esc}%`);
    }

    const { data, error } = await q;
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
    fetchRows(search);
  }, [fetchRows, search]);

  const scoutFilterOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.scout_id).filter(Boolean) as string[]));
    return ids.map((id) => ({
      id,
      name: rows.find((r) => r.scout_id === id)?._scout_name ?? id,
    }));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterScout !== "all") {
        if (filterScout === "none" ? r.scout_id : r.scout_id !== filterScout) return false;
      }
      if (filterTags.length > 0) {
        const tags = r.tags ?? [];
        if (!filterTags.some((t) => tags.includes(t))) return false;
      }
      return true;
    });
  }, [rows, filterScout, filterTags]);

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
      ? await supabase.from("kol_prospects").update(payload as any).eq("id", editingId)
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
          value={inviteSearchInput}
          onChange={(e) => setInviteSearchInput(e.target.value)}
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
  parttime_count: number;
  fulltime_count: number;
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
        // 取得 fulltime_start_yearmonth
        const userIds = list.map((s) => s.user_id);
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("team_member_profiles" as any)
            .select("user_id, fulltime_start_yearmonth")
            .in("user_id", userIds);
          const startMap = new Map<string, string | null>(
            ((profs as any[]) ?? []).map((p) => [p.user_id, p.fulltime_start_yearmonth ?? null]),
          );
          list.forEach((s) => {
            s.fulltime_start_yearmonth = startMap.get(s.user_id) ?? null;
          });
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
        .select("scout_id, venue_name, rarity, created_at, contract_group_id")
        .eq("is_error", false)
        .eq("kpi_qualified", true)
        .eq("kpi_month", kpiMonthStr)
        .in("venue_name", venueNames)
        .not("invited_at", "is", null)
        .not("contract_file_url", "is", null).neq("contract_file_url", "");
      kolData = dedupeByContractGroup(data ?? []);
    }

    // 全部 kol_profiles 當月（給個人表用，含未在設定中的場域亦可顯示）
    const { data: allKolRaw } = await supabase
      .from("kol_profiles")
      .select("scout_id, venue_name, created_at, contract_group_id")
      .eq("is_error", false)
      .eq("kpi_qualified", true)
      .eq("kpi_month", kpiMonthStr)
      .not("invited_at", "is", null)
      .not("contract_file_url", "is", null).neq("contract_file_url", "");

    // 兼職過濾：scout 的 fulltime_start_yearmonth 為 null 或 > 當前選擇月份，才算兼職邀約
    const selectedYM = `${year}-${String(month).padStart(2, "0")}`;
    const scoutStartMap = new Map(scouts.map((s) => [s.user_id, s.fulltime_start_yearmonth ?? null]));
    const isParttimeForMonth = (scoutId: string | null | undefined) => {
      if (!scoutId) return true;
      const start = scoutStartMap.get(scoutId);
      if (!start) return true;
      return selectedYM < start;
    };

    const filteredAllKol = dedupeByContractGroup(((allKolRaw as any[]) ?? [])).filter((k) =>
      isParttimeForMonth(k.scout_id),
    );
    const allKol = filteredAllKol;

    // 團隊實際統計：正職 / 兼職共用同一目標，實際數為「兼職全量 ＋ 正職 SR↑」累加
    const teamCounts = new Map<string, { parttime: number; fulltime: number }>();
    kolData.forEach((k) => {
      if (!k.venue_name) return;
      const full = !isParttimeForMonth(k.scout_id);
      if (!countsTowardTeamTarget(full, k.rarity)) return;
      const cur = teamCounts.get(k.venue_name) ?? { parttime: 0, fulltime: 0 };
      if (full) cur.fulltime += 1;
      else cur.parttime += 1;
      teamCounts.set(k.venue_name, cur);
    });

    const tRows: TeamTargetRow[] = (settings as any[]).map((s) => {
      const c = teamCounts.get(s.venue_name) ?? { parttime: 0, fulltime: 0 };
      return {
        id: s.id,
        venue_name: s.venue_name ?? "-",
        target_count: s.target_count ?? 0,
        personal_min: s.personal_min,
        is_starlink: !!s.is_starlink,
        actual_count: c.parttime + c.fulltime,
        parttime_count: c.parttime,
        fulltime_count: c.fulltime,
      };
    });

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
    // 解析 accommodation_id 與 venue_id（venue_id 為主要關聯鍵）
    const { data: acc } = await supabase.from("accommodation_info").select("id").eq("name", name).maybeSingle();
    if (!acc?.id) {
      setSaving(false);
      toast.error("找不到對應的場域，請確認館別名稱");
      return;
    }
    const { data: kv } = await supabase
      .from("kol_venues" as any)
      .select("id")
      .eq("accommodation_id", acc.id)
      .is("room_type_id", null)
      .maybeSingle();
    const venueId = (kv as any)?.id ?? null;
    const { error } = await (supabase.from("scout_team_targets" as any) as any).upsert(
      {
        year,
        month,
        venue_id: venueId,
        venue_name: name,
        target_count: t,
        personal_min: pm,
        is_starlink: addStarlink,
        accommodation_id: acc.id,
        created_by: currentUserId,
      },
      { onConflict: "year,month,venue_id" },
    );
    setSaving(false);
    if (error) {
      const msg = /duplicate key|unique/i.test(error.message)
        ? "該月份此場域目標已存在，已自動更新為最新設定"
        : error.message;
      toast.error(msg);
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
        </div>
        <p className="text-xs text-muted-foreground">
          正職與兼職共用同一團隊目標；實際邀約數＝兼職全量 ＋ 正職（SR 以上）累加。
        </p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : teamRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
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
                      <TableCell className="text-right tabular-nums">
                        <div>{r.actual_count}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          兼職 {r.parttime_count} + 正職(SR↑) {r.fulltime_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rate}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.personal_min == null ? "不限定" : `每人至少 ${r.personal_min} 位`}
                      </TableCell>

                      <TableCell className="text-right">
                        <Badge variant="outline" className={achievementColor(r.actual_count, r.target_count)}>
                          {achievementLabel(r.actual_count, r.target_count)}
                        </Badge>
                      </TableCell>
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
// ====== Tab 三-2：正職邀約目標 ======
// ============================================================

interface FulltimeTeamTargetRow {
  id: string;
  venue_name: string;
  target_count: number;
  fulltime_min: number;
  actual_count: number;
}

interface FulltimePersonalRow {
  scout_id: string;
  scout_name: string;
  venue_name: string;
  fulltime_min: number;
  actual_count: number;
}

interface FulltimeSrStat {
  scout_id: string;
  scout_name: string;
  sr_total: number;
  exceed_count: number;
  bonus_amount: number;
}

function FulltimeTargetsTab({ isManager, currentUserId }: { isManager: boolean; currentUserId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [fulltimeScouts, setFulltimeScouts] = useState<Scout[]>([]);
  const [teamRows, setTeamRows] = useState<FulltimeTeamTargetRow[]>([]);
  const [personalRows, setPersonalRows] = useState<FulltimePersonalRow[]>([]);
  const [srStats, setSrStats] = useState<FulltimeSrStat[]>([]);
  const [personalScoutFilter, setPersonalScoutFilter] = useState<string>("all");
  const [personalVenueFilter, setPersonalVenueFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [editRow, setEditRow] = useState<FulltimeTeamTargetRow | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [editFulltimeMin, setEditFulltimeMin] = useState("");
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addVenue, setAddVenue] = useState("");
  const [addTarget, setAddTarget] = useState("0");
  const [addFulltimeMin, setAddFulltimeMin] = useState("0");

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
    const used = new Set(teamRows.map((r) => r.venue_name));
    return merged.filter((o) => !used.has(o.name)).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }, [accList, venueList, teamRows]);

  // 取得「正職」星探：scout 角色 + team_member_profiles.employment_type='fulltime'
  useEffect(() => {
    (async () => {
      const scoutRes = await supabase.rpc("get_team_role_members", { p_role: "scout" });
      const rawScouts = (scoutRes.data ?? []) as any[];
      const userIds = Array.from(new Set(rawScouts.map((r) => r.user_id)));
      if (userIds.length === 0) {
        setFulltimeScouts([]);
        return;
      }
      const { data: profs } = await supabase
        .from("team_member_profiles" as any)
        .select("user_id, employment_type, fulltime_start_yearmonth")
        .in("user_id", userIds);
      const fulltimeSet = new Set(
        ((profs as any[]) ?? []).filter((p) => p.employment_type === "fulltime").map((p) => p.user_id),
      );
      const startMap = new Map<string, string | null>(
        ((profs as any[]) ?? []).map((p) => [p.user_id, p.fulltime_start_yearmonth ?? null]),
      );
      const list: Scout[] = [];
      const seen = new Set<string>();
      for (const r of rawScouts) {
        if (seen.has(r.user_id)) continue;
        if (!fulltimeSet.has(r.user_id)) continue;
        seen.add(r.user_id);
        list.push({
          user_id: r.user_id,
          display_name: r.display_name ?? r.user_id,
          fulltime_start_yearmonth: startMap.get(r.user_id) ?? null,
        });
      }
      list.sort((a, b) => a.display_name.localeCompare(b.display_name));
      setFulltimeScouts(list);
    })();
  }, []);

  const kpiMonthStr = `${year}-${String(month).padStart(2, "0")}-01`;

  const fetchAll = useCallback(async () => {
    setLoading(true);

    // 1. 當月正職團隊目標
    const { data: settings } = await supabase
      .from("scout_fulltime_targets" as any)
      .select("*")
      .eq("year", year)
      .eq("month", month);

    const settingsArr = (settings as any[]) ?? [];

    // 正職資格判定：scout 的 fulltime_start_yearmonth 存在且 <= 當前選擇月份
    const selectedYM = `${year}-${String(month).padStart(2, "0")}`;
    const fulltimeStartMap = new Map(fulltimeScouts.map((s) => [s.user_id, s.fulltime_start_yearmonth ?? null]));
    const isFulltimeForMonth = (scoutId: string | null | undefined) => {
      if (!scoutId) return false;
      const start = fulltimeStartMap.get(scoutId);
      if (!start) return false;
      return selectedYM >= start;
    };
    const eligibleFulltimeIds = Array.from(fulltimeStartMap.entries())
      .filter(([id]) => isFulltimeForMonth(id))
      .map(([id]) => id);

    // 2. 當月實際邀約（依 venue_name + kpi_month），僅統計符合正職資格的星探
    const venueNames = settingsArr.map((s) => s.venue_name).filter(Boolean);
    let kolData: any[] = [];
    if (venueNames.length > 0 && eligibleFulltimeIds.length > 0) {
      const { data } = await supabase
        .from("kol_profiles")
        .select("scout_id, venue_name, created_at, contract_group_id")
        .eq("is_error", false)
        .eq("kpi_qualified", true)
        .eq("kpi_month", kpiMonthStr)
        .in("venue_name", venueNames)
        .in("scout_id", eligibleFulltimeIds)
        .not("invited_at", "is", null)
        .not("contract_file_url", "is", null).neq("contract_file_url", "");
      kolData = dedupeByContractGroup(data ?? []);
    }

    const teamActual = new Map<string, number>();
    kolData.forEach((k) => {
      if (k.venue_name) teamActual.set(k.venue_name, (teamActual.get(k.venue_name) ?? 0) + 1);
    });

    const tRows: FulltimeTeamTargetRow[] = settingsArr.map((s) => ({
      id: s.id,
      venue_name: s.venue_name ?? "-",
      target_count: s.target_count ?? 0,
      fulltime_min: s.fulltime_min ?? 0,
      actual_count: teamActual.get(s.venue_name) ?? 0,
    }));
    tRows.sort((a, b) => a.venue_name.localeCompare(b.venue_name));
    setTeamRows(tRows);

    // 3. 個人實際統計（僅符合正職資格的星探）
    const fulltimeScoutMap = new Map(fulltimeScouts.map((s) => [s.user_id, s.display_name]));
    if (eligibleFulltimeIds.length === 0) {
      setPersonalRows([]);
    } else {
      const { data: allKolRows } = await supabase
        .from("kol_profiles")
        .select("scout_id, venue_name, created_at, contract_group_id")
        .eq("is_error", false)
        .eq("kpi_qualified", true)
        .eq("kpi_month", kpiMonthStr)
        .in("scout_id", eligibleFulltimeIds)
        .not("invited_at", "is", null)
        .not("contract_file_url", "is", null).neq("contract_file_url", "");
      const personalMap = new Map<string, number>();
      const allKol = dedupeByContractGroup(((allKolRows as any[]) ?? []));
      allKol.forEach((k) => {
        if (k.scout_id && k.venue_name) {
          const key = `${k.scout_id}|${k.venue_name}`;
          personalMap.set(key, (personalMap.get(key) ?? 0) + 1);
        }
      });
      const fulltimeMinMap = new Map<string, number>(
        settingsArr.map((s) => [s.venue_name, s.fulltime_min ?? 0]),
      );
      const pRows: FulltimePersonalRow[] = [];
      for (const [key, actual] of personalMap.entries()) {
        const [scout_id, venue_name] = key.split("|");
        if (!fulltimeScoutMap.has(scout_id)) continue;
        pRows.push({
          scout_id,
          scout_name: fulltimeScoutMap.get(scout_id) ?? scout_id.slice(0, 8),
          venue_name,
          fulltime_min: fulltimeMinMap.get(venue_name) ?? 0,
          actual_count: actual,
        });
      }
      pRows.sort((a, b) => a.scout_name.localeCompare(b.scout_name) || a.venue_name.localeCompare(b.venue_name));
      setPersonalRows(pRows);
    }

    // 4. SR 累積統計（正職星探當月 SR/SSR/UR）
    // 有效邀約條件與 calculate-scout-payout 後端一致：
    //   is_error=false、kpi_qualified=true、invited_at 非空
    // 註：此區為「kpi_month 當月」參考統計，非發放期別（期別以 check_in_date 為準）
    if (fulltimeScoutMap.size === 0) {
      setSrStats([]);
    } else {
      const { data: rarityRowsRaw } = await supabase
        .from("kol_profiles")
        .select("scout_id, rarity, created_at")
        .eq("is_error", false)
        .eq("kpi_qualified", true)
        .not("invited_at", "is", null)
        .eq("kpi_month", kpiMonthStr)
        .in("scout_id", eligibleFulltimeIds.length > 0 ? eligibleFulltimeIds : ["00000000-0000-0000-0000-000000000000"])
        .in("rarity", ["SR", "SSR", "UR"]);
      const rarityRows = ((rarityRowsRaw as any[]) ?? []).filter((r) => r.scout_id);


      // 取最近一筆生效的稀有度設定 bonus_amount
      const { data: raritySettings } = await supabase
        .from("kol_rarity_settings" as any)
        .select("rarity, bonus_amount, effective_from")
        .in("rarity", ["SR", "SSR", "UR"])
        .lte("effective_from", `${year}-${String(month).padStart(2, "0")}-31`)
        .order("effective_from", { ascending: false });
      const bonusMap = new Map<string, number>();
      ((raritySettings as any[]) ?? []).forEach((r) => {
        if (!bonusMap.has(r.rarity)) bonusMap.set(r.rarity, r.bonus_amount ?? 0);
      });

      // 依星探分組 → 排序 → 從第 31 筆起算獎金
      const grouped = new Map<string, { rarity: string; created_at: string }[]>();
      rarityRows.forEach((r) => {
        const arr = grouped.get(r.scout_id) ?? [];
        arr.push({ rarity: r.rarity, created_at: r.created_at });
        grouped.set(r.scout_id, arr);
      });
      const stats: FulltimeSrStat[] = [];
      for (const [scoutId, name] of fulltimeScoutMap.entries()) {
        // 僅列出「該月份已達正職起始月」的星探，與後端正職判定一致
        if (!eligibleFulltimeIds.includes(scoutId)) continue;
        const arr = grouped.get(scoutId) ?? [];
        arr.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
        const total = arr.length;
        const exceed = total > 30 ? arr.slice(30) : [];
        const bonus = exceed.reduce((sum, r) => sum + (bonusMap.get(r.rarity) ?? 0), 0);
        stats.push({
          scout_id: scoutId,
          scout_name: name,
          sr_total: total,
          exceed_count: exceed.length,
          bonus_amount: bonus,
        });
      }
      stats.sort((a, b) => b.sr_total - a.sr_total || a.scout_name.localeCompare(b.scout_name));
      setSrStats(stats);
    }

    setLoading(false);
  }, [year, month, kpiMonthStr, fulltimeScouts]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openEdit = (row: FulltimeTeamTargetRow) => {
    setEditRow(row);
    setEditTarget(String(row.target_count));
    setEditFulltimeMin(String(row.fulltime_min));
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const t = parseInt(editTarget, 10);
    if (Number.isNaN(t) || t < 0) {
      toast.error("請輸入有效的團隊目標數");
      return;
    }
    const fm = parseInt(editFulltimeMin, 10);
    if (Number.isNaN(fm) || fm < 0) {
      toast.error("請輸入有效的正職個人最低目標");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("scout_fulltime_targets" as any) as any)
      .update({ target_count: t, fulltime_min: fm })
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
      toast.error("請選擇場域");
      return;
    }
    const t = parseInt(addTarget, 10);
    if (Number.isNaN(t) || t < 0) {
      toast.error("請輸入有效的團隊目標數");
      return;
    }
    const fm = parseInt(addFulltimeMin, 10);
    if (Number.isNaN(fm) || fm < 0) {
      toast.error("請輸入有效的正職個人最低目標");
      return;
    }
    setSaving(true);
    // 解析 venue_id（透過 accommodation_info → kol_venues 母館）
    const { data: acc } = await supabase.from("accommodation_info").select("id").eq("name", name).maybeSingle();
    let venueId: string | null = null;
    if (acc?.id) {
      const { data: kv } = await supabase
        .from("kol_venues" as any)
        .select("id")
        .eq("accommodation_id", acc.id)
        .is("room_type_id", null)
        .maybeSingle();
      venueId = (kv as any)?.id ?? null;
    }
    const { error } = await (supabase.from("scout_fulltime_targets" as any) as any).upsert(
      {
        year,
        month,
        venue_id: venueId,
        venue_name: name,
        target_count: t,
        fulltime_min: fm,
      },
      { onConflict: "year,month,venue_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增目標");
    setAddOpen(false);
    setAddVenue("");
    setAddTarget("0");
    setAddFulltimeMin("0");
    fetchAll();
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Label>年月:</Label>
        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (<SelectItem key={y} value={String(y)}>{y} 年</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 團隊目標已統一至「邀約目標」分頁（scout_team_targets），此處不再另設正職團隊目標 */}
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          團隊邀約目標已統一由「邀約目標」分頁設定，正職與兼職共用同一門檻；
          實際邀約數＝兼職全量 ＋ 正職（SR 以上）累加。本頁僅顯示正職個人邀約狀況。
        </CardContent>
      </Card>


      {/* 個人邀約達標率 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">正職個人邀約達標率</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={personalScoutFilter} onValueChange={setPersonalScoutFilter}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="星探" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部星探</SelectItem>
                {Array.from(new Set(personalRows.map((r) => r.scout_name))).map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={personalVenueFilter} onValueChange={setPersonalVenueFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="場域" /></SelectTrigger>
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
                <TableHead className="text-right">實際邀約數</TableHead>
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
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                        本月尚無正職個人邀約紀錄
                      </TableCell>
                    </TableRow>
                  );
                }
                return filtered.map((r, i) => {
                  return (
                    <TableRow key={`${r.scout_id}-${r.venue_name}-${i}`}>
                      <TableCell>{r.scout_name}</TableCell>
                      <TableCell>{r.venue_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.actual_count}</TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* SR 累積統計 */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">SR 累積統計</h2>
          <span className="text-xs text-muted-foreground">超過 30 位後，依稀有度發放邀約獎金</span>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>正職星探</TableHead>
                <TableHead className="text-right">當月 SR/SSR 總數</TableHead>
                <TableHead className="text-right">是否超過 30 位</TableHead>
                <TableHead className="text-right">超出位數</TableHead>
                <TableHead className="text-right">預估稀有度獎金</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : srStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    尚無正職星探資料
                  </TableCell>
                </TableRow>
              ) : (
                srStats.map((s) => (
                  <TableRow key={s.scout_id}>
                    <TableCell>{s.scout_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sr_total}</TableCell>
                    <TableCell className="text-right">
                      {s.sr_total > 30 ? (
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">✅ 已達標</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">尚未達標</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.exceed_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.bonus_amount > 0 ? `$${s.bonus_amount.toLocaleString()}` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* 編輯 Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="sm:max-w-sm overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>編輯正職目標 — {editRow?.venue_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="團隊目標數">
              <Input type="number" min={0} value={editTarget} onChange={(e) => setEditTarget(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增 Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增正職邀約目標（{year} 年 {month} 月）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="場域名稱">
              <Select value={addVenue} onValueChange={setAddVenue}>
                <SelectTrigger><SelectValue placeholder="選擇館別" /></SelectTrigger>
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
              <Input type="number" min={0} placeholder="0" value={addTarget} onChange={(e) => setAddTarget(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "新增中..." : "新增"}</Button>
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
  const [selectedEf, setSelectedEf] = useState<string>("");
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

  // 與 calculate-scout-payout 一致：以「資料窗起點」為切點，尚未到切點的版本不算目前生效
  const scoutAsOf = scoutRateAsOfToday();
  const currentIdx = versions.findIndex((v) => v.effective_from <= scoutAsOf);
  const current = currentIdx >= 0 ? versions[currentIdx] : undefined;
  const history = versions.filter((_, i) => i !== currentIdx);
  const pendingVersions = versions.filter((v) => v.effective_from > scoutAsOf);

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
    const rows = RARITY_ORDER.map((r) => ({
      rarity: r,
      fan_range_desc: draft[r].fan_range_desc.trim() || null,
      bonus_amount: parseInt(draft[r].bonus_amount || "0", 10) || 0,
      effective_from: newEffectiveFrom,
    }));
    // 防呆：與目前版本完全相同時不需另存新版本
    if (
      current &&
      rows.every((row) => {
        const hit = current.items.find((x) => x.rarity === row.rarity);
        return (
          hit &&
          Number(hit.bonus_amount) === row.bonus_amount &&
          (hit.fan_range_desc ?? null) === row.fan_range_desc
        );
      })
    ) {
      toast.error("內容與目前生效版本相同，無需新增版本（避免產生重複版本）");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("kol_rarity_settings" as any).insert(rows);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增生效版本");
    setDialogOpen(false);
    loadVersions();
  };

  if (loading) return null;

  const selectedVersion =
    versions.find((v) => v.effective_from === selectedEf) ?? current ?? versions[0];
  const selectedStatus: "current" | "pending" | "history" | null = !selectedVersion
    ? null
    : selectedVersion.effective_from === current?.effective_from
      ? "current"
      : selectedVersion.effective_from > scoutAsOf
        ? "pending"
        : "history";
  const prevOfSelected = selectedVersion
    ? versions[versions.findIndex((v) => v.effective_from === selectedVersion.effective_from) + 1]
    : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold">稀有度邀約獎金</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground" aria-label="費率切點規則">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] text-xs">
                      星探結算以「該期資料窗起點」為版本切點（10 日期＝上月 21、25 日期＝當月 6），資料期間開始後才生效的版本順延至下一期採用。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">
                目前生效版本{current ? `・生效日期：${current.effective_from}` : "：尚無任何版本"}
                {current && scoutPayoutPeriodLabel(current.effective_from)
                  ? `（自 ${scoutPayoutPeriodLabel(current.effective_from)} 起採用）`
                  : ""}
              </p>
              {pendingVersions.length > 0 && (
                <p className="text-[11px] text-amber-600">
                  待生效版本：
                  {pendingVersions
                    .map((v) => `${v.effective_from}（${scoutPayoutPeriodLabel(v.effective_from) ?? "—"} 起）`)
                    .join("、")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              {isManager && (
                <Button onClick={openCreate} className="w-full sm:w-auto">
                  <Plus className="mr-1 h-4 w-4" />
                  新增生效版本
                </Button>
              )}
            </div>
          </div>


          {selectedVersion && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={
                    selectedStatus === "current"
                      ? "border-emerald-500 text-emerald-600"
                      : selectedStatus === "pending"
                        ? "border-amber-500 text-amber-600"
                        : "text-muted-foreground"
                  }
                >
                  {selectedStatus === "current" ? "目前生效" : selectedStatus === "pending" ? "待生效" : "歷史版本"}
                </Badge>
                <span className="text-muted-foreground">
                  生效日期 {selectedVersion.effective_from}・自{" "}
                  {scoutPayoutPeriodLabel(selectedVersion.effective_from) ?? "—"} 起採用
                </span>
              </div>
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
                    const hit = selectedVersion.items.find((x) => x.rarity === r);
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

            </>
          )}

          {versions.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {versions.map((v) => {
                const isCurrent = v.effective_from === current?.effective_from;
                const isPending = v.effective_from > scoutAsOf;
                const isSelected = v.effective_from === selectedVersion?.effective_from;
                return (
                  <li key={v.effective_from}>
                    <button
                      type="button"
                      onClick={() => setSelectedEf(v.effective_from)}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-left ${
                        isSelected ? "border-primary ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className="font-medium tabular-nums">
                        {v.effective_from} 起
                      </span>
                      <span className="text-xs text-muted-foreground">
                        自 {scoutPayoutPeriodLabel(v.effective_from) ?? "—"} 起採用
                      </span>
                      {isCurrent && <span className="text-xs text-emerald-600">（目前生效）</span>}
                      {isPending && <span className="text-xs text-amber-600">（待生效）</span>}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {RARITY_ORDER.map(
                          (r) =>
                            `${r} ${Number(
                              v.items.find((x) => x.rarity === r)?.bonus_amount ?? 0,
                            ).toLocaleString()}`,
                        ).join("／")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

        </CardContent>
      </Card>


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
      <InvitationTargetsSettingsBlock isManager={isManager} />
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
  accommodation_id: string | null;
  room_type_id: string | null;
  parent_name: string | null;
  hasSettings: boolean;
}

interface VenueSettingsRow {
  id?: string;
  venue_id: string | null;
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

const EMPTY_SETTINGS = (venue_name: string, venue_id: string | null = null): VenueSettingsRow => ({
  venue_id,
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

/**
 * 場域設定儲存前的欄位防呆檢查。
 * 回傳中文錯誤訊息；若通過則回傳 null。
 */
function validateVenueSettings(s: VenueSettingsRow): string | null {
  if (!s.group_name || !s.group_name.trim()) return "尚未填寫組別名稱";
  if (!s.calc_type || !s.calc_type.trim()) return "尚未選擇計算方式（每日 / 每週）";
  if (s.daily_limit === null || s.daily_limit === undefined || Number.isNaN(s.daily_limit)) {
    return "尚未填寫每日上限";
  }
  if (!Array.isArray(s.allowed_weekdays) || s.allowed_weekdays.length === 0) {
    return "尚未勾選合作星期";
  }
  if (s.collab_start && s.collab_end && s.collab_start > s.collab_end) {
    return "合作起始日不可晚於合作結束日";
  }
  // 特殊區間：有填任一欄位就需要完整填寫
  const hasSpecial =
    !!s.special_start ||
    !!s.special_end ||
    s.special_limit !== null ||
    (Array.isArray(s.special_weekdays) && s.special_weekdays.length > 0);
  if (hasSpecial) {
    if (!s.special_start) return "尚未填寫特殊區間起始日";
    if (!s.special_end) return "尚未填寫特殊區間結束日";
    if (s.special_start > s.special_end) return "特殊區間起始日不可晚於結束日";
    if (s.special_limit === null || s.special_limit === undefined) {
      return "尚未填寫特殊區間每日上限";
    }
    if (!Array.isArray(s.special_weekdays) || s.special_weekdays.length === 0) {
      return "尚未勾選特殊區間星期";
    }
  }
  return null;
}

/** 將 Postgres 錯誤訊息轉為對應欄位的中文防呆說明 */
function humanizeVenueSettingsError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("allowed_weekdays")) return "尚未勾選合作星期";
  if (m.includes("special_weekdays")) return "尚未勾選特殊區間星期";
  if (m.includes("monthly_limit")) return "尚未填寫月上限";
  if (m.includes("daily_limit")) return "尚未填寫每日上限";
  if (m.includes("special_limit")) return "尚未填寫特殊區間每日上限";
  if (m.includes("calc_type")) return "尚未選擇計算方式（每日 / 每週）";
  if (m.includes("group_name")) return "尚未填寫組別名稱";
  if (m.includes("venue_name")) return "尚未填寫場域名稱";
  if (m.includes("collab_start")) return "尚未填寫合作起始日";
  if (m.includes("collab_end")) return "尚未填寫合作結束日";
  if (m.includes("special_start")) return "尚未填寫特殊區間起始日";
  if (m.includes("special_end")) return "尚未填寫特殊區間結束日";
  if (m.includes("contact_email")) return "聯絡信箱格式錯誤";
  return message;
}


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
  const [groupNameOptions, setGroupNameOptions] = useState<string[]>([]);
  const readOnly = viewMode === "view";

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: venueRows, error: vErr }, { data: accoms }, { data: settingsRows }] = await Promise.all([
      supabase
        .from("kol_venues" as any)
        .select("id, name, type, is_active, accommodation_id, room_type_id")
        .order("name"),
      supabase.from("accommodation_info").select("id, name"),
      supabase.from("kol_venue_settings" as any).select("venue_id, group_name"),
    ]);
    if (vErr) toast.error(vErr.message);
    const accNameMap = new Map<string, string>();
    ((accoms ?? []) as any[]).forEach((a) => accNameMap.set(a.id, a.name));
    const settingsSet = new Set(((settingsRows ?? []) as any[]).map((r) => r.venue_id).filter(Boolean));
    const groupSet = new Set<string>();
    ((settingsRows ?? []) as any[]).forEach((r) => {
      const g = (r.group_name || "").trim();
      if (g) groupSet.add(g);
    });
    setGroupNameOptions(Array.from(groupSet).sort((a, b) => a.localeCompare(b, "zh-Hant")));
    const enriched: VenueRow[] = ((venueRows ?? []) as any[])
      // 子館別（room_type_id 有值）已停用；場域管理只顯示母館 / 外部場域
      .filter((v) => !v.room_type_id)
      .map((v) => ({
        id: v.id,
        name: v.name,
        type: v.type,
        is_active: v.is_active,
        accommodation_id: v.accommodation_id ?? null,
        room_type_id: v.room_type_id ?? null,
        parent_name: v.accommodation_id ? accNameMap.get(v.accommodation_id) ?? null : null,
        hasSettings: settingsSet.has(v.id),
      }));
    setRows(enriched);
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
    const { data: inserted, error } = await supabase
      .from("kol_venues" as any)
      .insert({ name: n, type: newType, is_active: true })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    const newVenueId = (inserted as any)?.id ?? null;
    // 同步建立 kol_venue_settings 預設記錄（若不存在）
    if (newVenueId) {
      const { data: existing } = await supabase
        .from("kol_venue_settings" as any)
        .select("id")
        .eq("venue_id", newVenueId)
        .maybeSingle();
      if (!existing) {
        const { error: sErr } = await supabase
          .from("kol_venue_settings" as any)
          .insert({ venue_id: newVenueId, venue_name: n, is_active: true, is_starlink: false });
        if (sErr) {
          toast.error(`場域已建立，但邀約規則建立失敗：${sErr.message}`);
        }
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
    setSettings(EMPTY_SETTINGS(r.name, r.id));
    setEditOpen(true);
    setLoadingSettings(true);
    const { data, error } = await supabase
      .from("kol_venue_settings" as any)
      .select("*")
      .eq("venue_id", r.id)
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
    const editVenueHasChildren =
      !!editVenue.accommodation_id &&
      !editVenue.room_type_id &&
      rows.some((v) => v.accommodation_id === editVenue.accommodation_id && v.room_type_id);
    if (!editVenueHasChildren) {
      const vErrMsg = validateVenueSettings(settings);
      if (vErrMsg) {
        toast.error(vErrMsg);
        return;
      }
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
    // 名稱同步：現在只需要更新 kol_venues.name，kol_venue_settings 已改用 venue_id 關聯
    // 3. upsert kol_venue_settings（依 venue_id 關聯）；有子館別的母館不寫入邀約規則
    if (!editVenueHasChildren) {

    const venueId = editVenue.id;
    const payload: Partial<VenueSettingsRow> = {
      venue_id: venueId,
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
      .eq("venue_id", venueId)
      .maybeSingle();
    if (existing) {
      const { error: sErr } = await supabase
        .from("kol_venue_settings" as any)
        .update(payload)
        .eq("venue_id", venueId);
      if (sErr) {
        setSaving(false);
        toast.error(humanizeVenueSettingsError(sErr.message));
        return;
      }
    } else {
      const { error: sErr } = await supabase.from("kol_venue_settings" as any).insert(payload);
      if (sErr) {
        setSaving(false);
        toast.error(humanizeVenueSettingsError(sErr.message));
        return;
      }
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

  const editVenueHasChildren =
    !!editVenue &&
    !!editVenue.accommodation_id &&
    !editVenue.room_type_id &&
    rows.some((v) => v.accommodation_id === editVenue.accommodation_id && v.room_type_id);
  const editVenueChildren = editVenueHasChildren && editVenue
    ? rows.filter((v) => v.accommodation_id === editVenue.accommodation_id && v.room_type_id)
    : [];

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

          // 分組：PMS 母館 / 子館別（依 accommodation_id 分組） / 外部合作場域
          const parents = filtered
            .filter((r) => r.accommodation_id && !r.room_type_id)
            .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
          const childrenByParent = new Map<string, VenueRow[]>();
          filtered
            .filter((r) => r.room_type_id)
            .forEach((r) => {
              const key = r.accommodation_id ?? "__orphan__";
              const arr = childrenByParent.get(key) ?? [];
              arr.push(r);
              childrenByParent.set(key, arr);
            });
          childrenByParent.forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")));
          const externals = filtered
            .filter((r) => !r.accommodation_id && !r.room_type_id)
            .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

          // 母館不在列表時的孤立子館
          const orphanChildren: VenueRow[] = [];
          childrenByParent.forEach((arr, key) => {
            if (!parents.some((p) => p.accommodation_id === key)) orphanChildren.push(...arr);
          });

          const levelBadge = (r: VenueRow) => {
            if (r.accommodation_id && !r.room_type_id)
              return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">PMS</Badge>;
            if (r.room_type_id)
              return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">子館</Badge>;
            return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">合作</Badge>;
          };

          const renderRow = (r: VenueRow, indent = false) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r, "view")}>
              <TableCell className={indent ? "pl-8" : ""}>
                <div className="flex items-center gap-2">
                  {indent && <span className="text-muted-foreground text-xs">└</span>}
                  <span>{r.name}</span>
                  {levelBadge(r)}
                </div>
              </TableCell>
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
          );

          const SectionHeader = ({ label }: { label: string }) => (
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={5} className="text-xs font-medium text-muted-foreground py-1.5">
                {label}
              </TableCell>
            </TableRow>
          );

          return (
            <>
              <div className="text-xs text-muted-foreground">共 {filtered.length} 筆</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>場域名稱</TableHead>
                      <TableHead>類型</TableHead>
                      <TableHead>啟用</TableHead>
                      <TableHead>設定</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parents.length > 0 && <SectionHeader label="PMS 母館" />}
                    {parents.flatMap((p) => [
                      renderRow(p),
                      ...(childrenByParent.get(p.accommodation_id!) ?? []).map((c) => renderRow(c, true)),
                    ])}
                    {orphanChildren.length > 0 && <SectionHeader label="子館別（無對應母館）" />}
                    {orphanChildren.map((c) => renderRow(c, true))}
                    {externals.length > 0 && <SectionHeader label="外部合作場域" />}
                    {externals.map((e) => renderRow(e))}
                  </TableBody>
                </Table>
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
                        {editVenueHasChildren ? (
                          <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
                            <p>此館別下設有子館別，請至各子館別個別設定邀約規則。</p>
                            {editVenueChildren.length > 0 && (
                              <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                                {editVenueChildren.map((c) => (
                                  <li key={c.id}>{c.name}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : loadingSettings ? (
                          <p className="text-xs text-muted-foreground">載入中…</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            <Item label="星鏈場域" value={showBool(settings.is_starlink, "是", "否")} />
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
                    <Field label="場域名稱" required>
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
                    {editVenueHasChildren ? (
                      <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
                        <p>此館別下設有子館別，請至各子館別個別設定邀約規則。</p>
                        {editVenueChildren.length > 0 && (
                          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                            {editVenueChildren.map((c) => (
                              <li key={c.id}>{c.name}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : loadingSettings ? (
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
                          <Field label="群組名稱" required>
                            <Input
                              value={settings.group_name ?? ""}
                              onChange={(e) => setSettings((p) => ({ ...p, group_name: e.target.value }))}
                              className="h-9"
                              disabled={readOnly}
                              list="kol-venue-group-name-options"
                              placeholder="輸入或選擇既有群組"
                            />
                            <datalist id="kol-venue-group-name-options">
                              {groupNameOptions
                                .filter((g) => g !== (settings.group_name ?? ""))
                                .map((g) => (
                                  <option key={g} value={g} />
                                ))}
                            </datalist>
                          </Field>
                          <Field label="計算方式" required>
                            <Select
                              value={settings.calc_type || ""}
                              onValueChange={(v) => setSettings((p) => ({ ...p, calc_type: v }))}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="請選擇" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="每日">每日</SelectItem>
                                <SelectItem value="每週">每週</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="每日上限" required>
                            {numInput(settings.daily_limit, (v) => setSettings((p) => ({ ...p, daily_limit: v })))}
                          </Field>
                          <Field label="每月上限">
                            {numInput(settings.monthly_limit, (v) => setSettings((p) => ({ ...p, monthly_limit: v })))}
                            <p className="text-xs text-muted-foreground mt-1">
                              填寫後作為每月預設值；若互惠額度已設定當月專屬上限，則以互惠額度為準
                            </p>
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

                        <Field label="可邀星期" required>
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

  // 與 calculate-scout-payout 一致：以「資料窗起點」為切點
  const tierAsOf = scoutRateAsOfToday();
  const allDates = Array.from(new Set(rows.map((r) => r.effective_from)));
  const latestDate = allDates.find((d) => d <= tierAsOf);
  const latestRows = rows.filter((r) => r.effective_from === latestDate);
  const historyDates = allDates.filter((d) => d !== latestDate && d <= tierAsOf);
  const pendingDates = allDates.filter((d) => d > tierAsOf);

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
    // 防呆：與目前版本完全相同時不需另存新版本
    if (
      latestRows.length === draft.length &&
      draft.every((d, idx) => {
        const cur = latestRows[idx];
        return (
          cur &&
          cur.tier_name === d.tier_name &&
          Number(cur.min_count) === Number(d.min_count) &&
          (cur.max_count ?? null) === (d.max_count ?? null) &&
          Number(cur.commission_rate) === Number(d.commission_rate)
        );
      })
    ) {
      toast.error("內容與目前生效版本相同，無需新增版本（避免產生重複版本）");
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
    toast.success("已新增生效版本");
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
              <Plus className="h-4 w-4 mr-1" /> 新增生效版本
            </Button>
          )}
        </div>

        {loading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無設定</p>
        ) : (
          <>
            <div className="mb-2 text-sm font-medium">
              目前版本（生效日：{latestDate ?? "—"}
              {latestDate && scoutPayoutPeriodLabel(latestDate)
                ? `，自 ${scoutPayoutPeriodLabel(latestDate)} 起採用`
                : ""}
              ）
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              星探結算以「該期資料窗起點」為版本切點（10 日期＝上月 21、25 日期＝當月 6），資料期間開始後才生效的版本順延至下一期採用。
            </p>
            {pendingDates.length > 0 && (
              <p className="mb-2 text-[11px] text-amber-600">
                待生效版本：
                {pendingDates
                  .map((d) => `${d}（${scoutPayoutPeriodLabel(d) ?? "—"} 起）`)
                  .join("、")}
              </p>
            )}
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

  // 與 calculate-scout-payout 一致：以「資料窗起點」為切點
  const salaryAsOf = scoutRateAsOfToday();
  const latestIdx = rows.findIndex((r) => r.effective_from <= salaryAsOf);
  const latest = latestIdx >= 0 ? rows[latestIdx] : undefined;
  const salaryHistory = rows.filter((_, i) => i !== latestIdx);
  const pendingSalary = rows.filter((r) => r.effective_from > salaryAsOf);

  const openEdit = () => {
    setEffectiveFrom(todayStr());
    setBase(String(latest?.base_salary ?? 3000));
    setBonus(String(latest?.team_bonus ?? 2000));
    setOpen(true);
  };

  const save = async () => {
    if (!effectiveFrom) return toast.error("請填生效日期");
    // 防呆：金額與目前版本相同時不需要另存新版本
    if (
      latest &&
      Number(base) === Number(latest.base_salary) &&
      Number(bonus) === Number(latest.team_bonus)
    ) {
      return toast.error("金額與目前生效版本相同，無需新增版本（避免產生重複版本）");
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("scout_salary_settings").insert({
      base_salary: Number(base),
      team_bonus: Number(bonus),
      team_threshold_pct: latest?.team_threshold_pct ?? 100,
      effective_from: effectiveFrom,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已新增生效版本");
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
            <div>兼職個人目標達成底薪：{formatMoney(latest.base_salary)}</div>
            <div>團隊獎金金額：{formatMoney(latest.team_bonus)}</div>
            <div className="text-xs text-muted-foreground">
              生效日：{latest.effective_from}
              {scoutPayoutPeriodLabel(latest.effective_from)
                ? `（自 ${scoutPayoutPeriodLabel(latest.effective_from)} 起採用）`
                : ""}
            </div>
            <div className="text-[11px] text-muted-foreground">
              星探結算以「該期資料窗起點」為版本切點（10 日期＝上月 21、25 日期＝當月 6），資料期間開始後才生效的版本順延至下一期採用。
            </div>
            {pendingSalary.length > 0 && (
              <div className="text-[11px] text-amber-600">
                待生效版本：
                {pendingSalary
                  .map((r) => `${r.effective_from}（${scoutPayoutPeriodLabel(r.effective_from) ?? "—"} 起）`)
                  .join("、")}
              </div>
            )}
          </div>
        )}
        {salaryHistory.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-1">歷史版本</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>生效日</TableHead>
                  <TableHead>底薪</TableHead>
                  <TableHead>團隊獎金</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryHistory.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.effective_from}
                      <div className="text-[11px] text-muted-foreground">
                        自 {scoutPayoutPeriodLabel(r.effective_from) ?? "—"} 起採用
                      </div>
                    </TableCell>
                    <TableCell>{formatMoney(r.base_salary)}</TableCell>
                    <TableCell>{formatMoney(r.team_bonus)}</TableCell>
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
// ====== Tab 設定：邀約目標設定 ======
// ============================================================
interface InvitationTargetRow {
  team_id: string | null;
  fulltime_id: string | null;
  year: number;
  month: number;
  venue_name: string;
  team_target: number;
  personal_min: number | null;
  fulltime_min: number;
  is_starlink: boolean;
  accommodation_id: string | null;
}

function InvitationTargetsSettingsBlock({ isManager }: { isManager: boolean }) {
  const tpeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const currentYear = parseInt(tpeParts.find((p) => p.type === "year")?.value ?? String(new Date().getFullYear()), 10);
  const currentMonth = parseInt(tpeParts.find((p) => p.type === "month")?.value ?? String(new Date().getMonth() + 1), 10);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonth)); // "all" | "1".."12"
  const now = new Date();
  const [filterVenue, setFilterVenue] = useState<string>("all");
  const [rows, setRows] = useState<InvitationTargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accList, setAccList] = useState<{ id: string; name: string; is_active?: boolean }[]>([]);

  // dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InvitationTargetRow | null>(null);
  const [fMonth, setFMonth] = useState<string>(String(now.getMonth() + 1));
  const [fVenue, setFVenue] = useState<string>("");
  const [fTeamTarget, setFTeamTarget] = useState<string>("0");
  const [fPersonalMin, setFPersonalMin] = useState<string>("");
  const [fFulltimeMin, setFFulltimeMin] = useState<string>("0");
  const [fStarlink, setFStarlink] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  // delete
  const [deleteRow, setDeleteRow] = useState<InvitationTargetRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 重複目標確認 Dialog
  const [dupConfirmOpen, setDupConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name, is_active")
        .neq("name", "奧丁丁測試")
        .order("name");
      if (data) setAccList(data as any);
    })();
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [teamRes, ftRes] = await Promise.all([
      supabase.from("scout_team_targets" as any).select("*").eq("year", filterYear),
      supabase.from("scout_fulltime_targets" as any).select("*").eq("year", filterYear),
    ]);
    const teamArr = (teamRes.data as any[]) ?? [];
    const ftArr = (ftRes.data as any[]) ?? [];
    const map = new Map<string, InvitationTargetRow>();
    for (const t of teamArr) {
      const key = `${t.year}-${t.month}-${t.venue_name}`;
      map.set(key, {
        team_id: t.id,
        fulltime_id: null,
        year: t.year,
        month: t.month,
        venue_name: t.venue_name,
        team_target: t.target_count ?? 0,
        personal_min: t.personal_min ?? null,
        fulltime_min: 0,
        is_starlink: !!t.is_starlink,
        accommodation_id: t.accommodation_id ?? null,
      });
    }
    for (const f of ftArr) {
      const key = `${f.year}-${f.month}-${f.venue_name}`;
      const cur = map.get(key);
      if (cur) {
        cur.fulltime_id = f.id;
        cur.fulltime_min = f.fulltime_min ?? 0;
        if (!cur.team_target) cur.team_target = f.target_count ?? 0;
      } else {
        map.set(key, {
          team_id: null,
          fulltime_id: f.id,
          year: f.year,
          month: f.month,
          venue_name: f.venue_name,
          team_target: f.target_count ?? 0,
          personal_min: null,
          fulltime_min: f.fulltime_min ?? 0,
          is_starlink: false,
          accommodation_id: null,
        });
      }
    }
    const list = Array.from(map.values()).sort(
      (a, b) => b.month - a.month || a.venue_name.localeCompare(b.venue_name, "zh-Hant"),
    );
    setRows(list);
    setLoading(false);
  }, [filterYear]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredRows = useMemo(() => {
    return rows.filter(
      (r) =>
        (filterMonth === "all" || String(r.month) === filterMonth) &&
        (filterVenue === "all" || r.venue_name === filterVenue),
    );
  }, [rows, filterMonth, filterVenue]);

  const venueNamesInRows = useMemo(
    () => Array.from(new Set(rows.map((r) => r.venue_name))).sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [rows],
  );

  const years = [currentYear - 1, currentYear, currentYear + 1];

  const openAdd = () => {
    setEditing(null);
    setFMonth(String(now.getMonth() + 1));
    setFVenue("");
    setFTeamTarget("0");
    setFPersonalMin("");
    setFFulltimeMin("0");
    setFStarlink(false);
    setDialogOpen(true);
  };

  const openEdit = (row: InvitationTargetRow) => {
    setEditing(row);
    setFMonth(String(row.month));
    setFVenue(row.venue_name);
    setFTeamTarget(String(row.team_target));
    setFPersonalMin(row.personal_min == null ? "" : String(row.personal_min));
    setFFulltimeMin(String(row.fulltime_min));
    setFStarlink(row.is_starlink);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const m = parseInt(fMonth, 10);
    if (!m || m < 1 || m > 12) return toast.error("請選擇月份");
    if (!fVenue.trim()) return toast.error("請選擇場域");
    const tt = parseInt(fTeamTarget, 10);
    if (Number.isNaN(tt) || tt < 0) return toast.error("請輸入有效的團隊目標數");
    const pm = fPersonalMin.trim() === "" ? null : parseInt(fPersonalMin, 10);
    if (pm !== null && (Number.isNaN(pm) || pm < 0)) return toast.error("請輸入有效的兼職個人最低目標");
    const fm = 0;

    // 新增模式才檢查重複；編輯模式直接覆蓋同一筆
    if (!editing) {
      const { data: existing } = await supabase
        .from("scout_team_targets" as any)
        .select("id")
        .eq("year", filterYear)
        .eq("month", m)
        .eq("venue_name", fVenue.trim())
        .maybeSingle();
      if (existing) {
        setDupConfirmOpen(true);
        return;
      }
    }

    await performSave(m, tt, pm, fm);
  };

  const performSave = async (m: number, tt: number, pm: number | null, fm: number) => {
    setSaving(true);
    const { data: acc } = await supabase
      .from("accommodation_info")
      .select("id")
      .eq("name", fVenue.trim())
      .maybeSingle();
    const accId = acc?.id ?? null;
    let venueId: string | null = null;
    if (accId) {
      const { data: kv } = await supabase
        .from("kol_venues" as any)
        .select("id")
        .eq("accommodation_id", accId)
        .is("room_type_id", null)
        .maybeSingle();
      venueId = (kv as any)?.id ?? null;
    }
    const { data: authData } = await supabase.auth.getUser();

    try {
      // Upsert：以 (year, month, venue_id) 為唯一鍵
      const [r1, r2] = await Promise.all([
        (supabase.from("scout_team_targets" as any) as any).upsert(
          {
            year: filterYear,
            month: m,
            venue_id: venueId,
            venue_name: fVenue.trim(),
            target_count: tt,
            personal_min: pm,
            is_starlink: fStarlink,
            accommodation_id: accId,
            created_by: authData.user?.id ?? null,
          },
          { onConflict: "year,month,venue_id" }
        ),
        (supabase.from("scout_fulltime_targets" as any) as any).upsert(
          {
            year: filterYear,
            month: m,
            venue_id: venueId,
            venue_name: fVenue.trim(),
            target_count: tt,
            fulltime_min: fm,
          },
          { onConflict: "year,month,venue_id" }
        ),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      toast.success(editing ? "已更新目標" : "已新增目標");
      setDialogOpen(false);
      setDupConfirmOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOverwrite = async () => {
    const m = parseInt(fMonth, 10);
    const tt = parseInt(fTeamTarget, 10);
    const pm = fPersonalMin.trim() === "" ? null : parseInt(fPersonalMin, 10);
    const fm = 0;
    await performSave(m, tt, pm, fm);
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      if (deleteRow.team_id) {
        const { error } = await (supabase.from("scout_team_targets" as any) as any)
          .delete()
          .eq("id", deleteRow.team_id);
        if (error) throw error;
      }
      if (deleteRow.fulltime_id) {
        const { error } = await (supabase.from("scout_fulltime_targets" as any) as any)
          .delete()
          .eq("id", deleteRow.fulltime_id);
        if (error) throw error;
      }
      toast.success("已刪除目標");
      setDeleteRow(null);
      fetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "刪除失敗");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">邀約目標設定</h3>
          {isManager && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" /> 新增目標
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部月份</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterVenue} onValueChange={setFilterVenue}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="館別" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部館別</SelectItem>
              {venueNamesInRows.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>月份</TableHead>
              <TableHead>場域</TableHead>
              <TableHead className="text-right">團隊目標數</TableHead>
              <TableHead className="text-right">兼職個人最低目標</TableHead>
              <TableHead className="text-center">星鏈場域</TableHead>
              {isManager && <TableHead className="text-right">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? null : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isManager ? 6 : 5} className="text-center text-sm text-muted-foreground">
                  尚無目標資料
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={`${r.year}-${r.month}-${r.venue_name}`}>
                  <TableCell>{r.month} 月</TableCell>
                  <TableCell>{r.venue_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.team_target}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.personal_min == null ? "不限定" : r.personal_min}
                  </TableCell>
                  <TableCell className="text-center">{r.is_starlink ? "✅" : "－"}</TableCell>
                  {isManager && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteRow(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
            {!loading && filteredRows.length > 0 && (
              <TableRow className="bg-muted/60 font-semibold">
                <TableCell>小計</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {filteredRows.reduce((sum, r) => sum + (r.team_target ?? 0), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {filteredRows.reduce((sum, r) => sum + (r.personal_min ?? 0), 0)}
                </TableCell>
                <TableCell />
                {isManager && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* 新增 / 編輯 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {editing ? `編輯邀約目標（${filterYear} 年）` : `新增邀約目標（${filterYear} 年）`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>月份</Label>
              <Select value={fMonth} onValueChange={setFMonth}>
                <SelectTrigger><SelectValue placeholder="選擇月份" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>場域名稱</Label>
              <Select value={fVenue} onValueChange={setFVenue} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="選擇館別" /></SelectTrigger>
                <SelectContent>
                  {accList
                    .filter((a) => a.is_active !== false)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>團隊目標數</Label>
              <Input type="number" min={0} value={fTeamTarget} onChange={(e) => setFTeamTarget(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>兼職個人最低目標（留空=不限定）</Label>
              <Input
                type="number"
                min={0}
                value={fPersonalMin}
                onChange={(e) => setFPersonalMin(e.target.value)}
                placeholder="不限定"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="invite-target-starlink"
                checked={fStarlink}
                onCheckedChange={(c) => setFStarlink(!!c)}
              />
              <Label htmlFor="invite-target-starlink" className="cursor-pointer">
                是否為星鏈場域
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 刪除確認 */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除目標？</AlertDialogTitle>
            <AlertDialogDescription>
              將刪除「{deleteRow?.year} 年 {deleteRow?.month} 月 — {deleteRow?.venue_name}」的團隊與正職邀約目標，此動作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "刪除中..." : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重複目標覆蓋確認 */}
      <AlertDialog open={dupConfirmOpen} onOpenChange={(o) => !o && setDupConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>該場域此月份已存在邀約目標</AlertDialogTitle>
            <AlertDialogDescription>
              該場域在此月份的邀約目標已存在，確定要覆蓋更新嗎？此操作會影響夥伴的達標結果。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOverwrite} disabled={saving}>
              {saving ? "更新中..." : "確定覆蓋"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ====== 週報 Tab ======
interface WeeklyReportRow {
  name: string;
  follower_count: number | null;
  venue_name: string | null;
  ig_url: string | null;
  ig_handle: string | null;
  check_in_date: string;
  created_at: string;
}

function getWeekRange(base: Date, offsetWeeks = 0): { start: Date; end: Date } {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  // 週日為一週起點
  const day = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day + offsetWeeks * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday, end: saturday };
}

function fmtYMD(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`;
}

function toLocalDateOnly(s: string): Date {
  // s 為 YYYY-MM-DD，視為當地日期
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function WeeklyReportTab({ canCopy }: { canCopy: boolean }) {
  const [rows, setRows] = useState<WeeklyReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const thisWeek = useMemo(() => getWeekRange(new Date(), 0), []);
  const nextWeek = useMemo(() => getWeekRange(new Date(), 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startStr = thisWeek.start.toISOString().slice(0, 10);
      const endStr = nextWeek.end.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("kol_profiles")
        .select("name, follower_count, venue_name, ig_url, ig_handle, check_in_date, created_at")
        .eq("booking_status", "成功訂房")
        .gte("check_in_date", startStr)
        .lte("check_in_date", endStr)
        .order("check_in_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setRows((data ?? []) as WeeklyReportRow[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thisWeek.start.getTime(), nextWeek.end.getTime()]);

  const reportText = useMemo(() => {
    const inRange = (s: string, start: Date, end: Date) => {
      const d = toLocalDateOnly(s);
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    };

    const buildSection = (label: string, start: Date, end: Date) => {
      const items = rows.filter((r) => r.check_in_date && inRange(r.check_in_date, start, end));
      const header = `【 ${label} 】${fmtYMD(start)}-${fmtYMD(end)} 網紅入住清單`;
      if (items.length === 0) {
        return `${header}\n（無）`;
      }
      const lines: string[] = [header];
      let lastDate = "";
      for (const r of items) {
        if (r.check_in_date !== lastDate) {
          lines.push("");
          lines.push(`📅 ${fmtYMD(toLocalDateOnly(r.check_in_date))}`);
          lastDate = r.check_in_date;
        }
        const fans = r.follower_count != null ? `｜${formatFollowerCount(r.follower_count)}` : "";
        const venue = r.venue_name ?? "";
        lines.push(`${r.name}${fans}｜${venue}`);
        const link = r.ig_url || r.ig_handle;
        if (link) lines.push(link);
      }
      return lines.join("\n");
    };

    return `${buildSection("本週", thisWeek.start, thisWeek.end)}\n\n${buildSection("下週", nextWeek.start, nextWeek.end)}`;
  }, [rows, thisWeek, nextWeek]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success("已複製到剪貼簿");
    } catch {
      toast.error("複製失敗");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>入住週報</CardTitle>
        {canCopy && (
          <Button size="sm" onClick={handleCopy} disabled={loading}>
            一鍵複製文字
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">載入中…</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words text-sm font-mono bg-muted/30 p-4 rounded-md">
            {reportText}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

