import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import { GroupBuyVenueIntro } from "@/components/groupbuy/GroupBuyVenueIntro";
import { GroupBuyDateRangeField } from "@/components/groupbuy/GroupBuyDateRangeField";
import { GroupBuyStepper } from "@/components/groupbuy/GroupBuyStepper";
import { GroupBuyQuickPreview } from "@/components/groupbuy/GroupBuyQuickPreview";
import { GroupBuyConfirmDialog } from "@/components/groupbuy/GroupBuyConfirmDialog";
import { GroupBuySummaryCard } from "@/components/groupbuy/GroupBuySummaryCard";
import { GroupBuyPaymentSteps } from "@/components/groupbuy/GroupBuyPaymentSteps";
import { fetchGroupBuyVenueIntro } from "@/lib/groupBuyVenueIntro";
import { SALE_STATE_LABEL, saleState, validateStayRange } from "@/lib/groupBuyDateRules";
import { useAccommodationCache } from "@/hooks/use-accommodation-cache";
import FacilitiesSection from "@/components/FacilitiesSection";
import LocationSection from "@/components/LocationSection";
import FaqSection from "@/components/FaqSection";
import BookingInfoSection from "@/components/BookingInfoSection";
import BookingFooter from "@/components/BookingFooter";
import { GroupBuyFacilitiesCompact } from "@/components/groupbuy/GroupBuyFacilitiesCompact";
import { GroupBuyBookingInfoCompact } from "@/components/groupbuy/GroupBuyBookingInfoCompact";
import { GroupBuyGuestPicker } from "@/components/groupbuy/GroupBuyGuestPicker";
import { evaluateChildSelection, resolveChildRules } from "@/lib/child-rules";
import {
  DEFAULT_GUEST_COUNTS,
  billableGuestCount,
  formatGuestComposition,
  toChildSelection,
  type GuestCounts,
} from "@/lib/groupBuyGuests";
import { CalendarDays, CheckCircle2, Clock, Images, Loader2, MessageCircle, Plus, Wallet } from "lucide-react";


interface Campaign {
  id: string;
  accommodation_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description_html: string | null;
  cover_image_url: string | null;
  gallery_urls: string[];
  kol_display_name: string | null;
  sale_start: string | null;
  sale_end: string | null;
  stay_start_date: string | null;
  stay_end_date: string | null;
  deposit_percentage: number;
  payment_deadline_hours: number;
  contact_note: string | null;
  terms_html: string | null;
  /** 首屏顯示用（後台可設定，皆為選填） */
  highlight_points: string[] | null;
  featured_facilities: string[] | null;
  featured_photo_urls: string[] | null;
}

interface CampaignPackage {
  id: string;
  display_name: string;
  description: string | null;
  short_summary: string | null;
  image_url: string | null;
  group_buy_price: number;
  original_price: number | null;
  max_quantity: number | null;
  room_type_id: string | null;
  room_type_ids: string[] | null;
  package_id: string | null;
  sort_order: number;
}

const fmtWindow = (iso?: string | null) =>
  iso && !isNaN(new Date(iso).getTime())
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "不限";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

/** 全頁統一的內容寬度（桌機約 1040px，兩側保留舒服留白） */
const SHELL = "mx-auto w-full max-w-[1040px] px-5 sm:px-6";

/** 流程步驟標題（單頁式，不做 Wizard） */
function StepHeading({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-[1.375rem] font-bold tracking-tight sm:text-[1.625rem]">{title}</h2>
        {hint && <p className="mt-1 text-base leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}


function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  const diff = (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000;
  return diff > 0 ? Math.round(diff) : 0;
}

function dateList(checkIn: string, n: number) {
  const [y, m, d] = checkIn.split("-").map(Number);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i)).toISOString().split("T")[0],
  );
}

export default function GroupBuyCampaign() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [packages, setPackages] = useState<CampaignPackage[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  /** 團購訂單一次固定只訂 1 間，前台不提供間數選擇 */
  const roomQuantity = 1;
  const [guests, setGuests] = useState<GuestCounts>(DEFAULT_GUEST_COUNTS);
  /** 方案對應的兒童規則覆寫與房型容量（依既有民宿設定，不建立第二套資料） */
  const [pkgChildOverride, setPkgChildOverride] = useState<unknown | null>(null);
  const [roomCapacity, setRoomCapacity] = useState<number | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [availability, setAvailability] = useState<{ checking: boolean; ok: boolean | null; message: string }>({
    checking: false,
    ok: null,
    message: "",
  });
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedPkgs, setExpandedPkgs] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<{ name?: boolean; phone?: boolean; email?: boolean }>({});
  /** 備註為次要欄位，預設收合（非必填，未變更任何驗證） */
  const [noteOpen, setNoteOpen] = useState(false);

  /** 住宿快速預覽用（僅顯示，資料與下方民宿介紹同源） */
  const [previewPhotos, setPreviewPhotos] = useState<string[]>([]);
  const [previewFacilities, setPreviewFacilities] = useState<string[]>([]);
  /** Hero 主標題以「民宿名稱」為最高層級（僅顯示用，不影響任何訂房邏輯） */
  const [venueName, setVenueName] = useState("");


  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      setLoading(true);
      const { data: c } = await supabase
        .from("group_buy_campaigns")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (cancelled) return;
      if (!c) {
        setCampaign(null);
        setLoading(false);
        return;
      }
      setCampaign(c as unknown as Campaign);
      const { data: pkgs } = await supabase
        .from("group_buy_campaign_packages")
        .select("*")
        .eq("campaign_id", c.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      const list = (pkgs ?? []) as unknown as CampaignPackage[];
      setPackages(list);
      // 依步驟流程：不預選方案、不預填日期，讓使用者明確走 STEP 1 → STEP 2


      setLoading(false);
      const { data: acc } = await supabase
        .from("accommodation_info")
        .select("name")
        .eq("id", c.accommodation_id)
        .maybeSingle();
      if (!cancelled && acc?.name) setVenueName(acc.name);

      const intro = await fetchGroupBuyVenueIntro(c.accommodation_id);
      if (!cancelled && intro && intro.is_visible !== false) {
        setPreviewPhotos(intro.gallery_urls.slice(0, 12));
        setPreviewFacilities(intro.facilities);
      }

    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  /** 共用一般訂房頁的民宿資料（設施／交通／訂房須知／社群連結），不另外建立第二份資料 */
  const { info: accInfo, secondaryData } = useAccommodationCache(campaign?.accommodation_id ?? null);

  const selectedPkg = useMemo(
    () => packages.find((p) => p.id === selectedPkgId) ?? null,
    [packages, selectedPkgId],
  );
  const nights = nightsBetween(checkIn, checkOut);
  /** 日期選擇完成後的顯示文字（純顯示，不影響任何計算） */
  const stayLabel = useMemo(() => {
    if (!checkIn || !checkOut) return "";
    const fmt = (v: string) => {
      const d = new Date(`${v}T00:00:00`);
      const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      return `${d.getMonth() + 1}/${d.getDate()}（${w}）`;
    };
    return `${fmt(checkIn)} → ${fmt(checkOut)}`;
  }, [checkIn, checkOut]);
  /** 兒童分齡規則：完全沿用民宿設定，方案有覆寫時以覆寫為準 */
  const childRules = useMemo(
    () => resolveChildRules((accInfo as any)?.child_age_rules, pkgChildOverride),
    [accInfo, pkgChildOverride],
  );
  const childEval = useMemo(
    () => evaluateChildSelection(childRules, toChildSelection(guests), Math.max(1, nights), guests.adults),
    [childRules, guests, nights],
  );
  /** 房型容量檢查：成人＋計入容量的兒童 */
  const capacityHeadcount = guests.adults + childEval.capacityHeadcount;
  const capacityError =
    roomCapacity != null && roomCapacity > 0 && capacityHeadcount > roomCapacity
      ? `此方案房型每間最多入住 ${roomCapacity} 位（目前 ${capacityHeadcount} 位）`
      : "";
  const guestError = childEval.blockReason || capacityError || (guests.adults < 1 ? "至少需 1 位成人" : "");
  const guestCount = billableGuestCount(guests);
  const guestSummary = formatGuestComposition(guests, childRules);

  const baseTotal = selectedPkg ? Math.round(selectedPkg.group_buy_price) * nights * roomQuantity : 0;
  const childExtraTotal = selectedPkg && nights > 0 ? childEval.extraFeePerNight * nights : 0;
  const total = baseTotal + childExtraTotal;
  const depositPct = campaign?.deposit_percentage ?? 30;
  const deposit = Math.min(total, Math.round((total * depositPct) / 100));
  const balance = Math.max(0, total - deposit);
  /** 前台日期限制（可入住起迄）＋ 販售狀態 */
  const stayErrors = useMemo(
    () => (campaign ? validateStayRange(campaign, checkIn, checkOut) : {}),
    [campaign, checkIn, checkOut],
  );
  const sale = campaign ? saleState(campaign) : "on_sale";
  const bookingLocked = sale !== "on_sale";
  const dateBlocked = !!(stayErrors.checkIn || stayErrors.checkOut);

  /** 表單欄位錯誤（顯示在對應欄位下方） */
  const nameError = touched.name && !guestName.trim() ? "請填寫訂房人姓名" : "";
  const phoneError = touched.phone && !guestPhone.trim() ? "請填寫聯絡電話" : "";
  const emailError = !guestEmail.trim()
    ? touched.email
      ? "請填寫 Email"
      : ""
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())
      ? ""
      : "Email 格式不正確";

  /** 訂房流程步驟狀態（純顯示） */
  const step1Done = !!selectedPkg;
  const step2Done = step1Done && nights > 0 && !dateBlocked;
  const step3Done =
    step2Done && !!guestName.trim() && !!guestPhone.trim() && !!guestEmail.trim() && !emailError;
  const currentStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 4;
  const completedSteps = [step1Done ? 1 : 0, step2Done ? 2 : 0, step3Done ? 3 : 0].filter(Boolean) as number[];

  /** 方案綁定的候選房型（順序即為分配優先順序） */
  const candidateRoomTypeIds = useMemo(() => {
    if (!selectedPkg) return [] as string[];
    if (selectedPkg.room_type_ids && selectedPkg.room_type_ids.length > 0) return selectedPkg.room_type_ids;
    return selectedPkg.room_type_id ? [selectedPkg.room_type_id] : [];
  }, [selectedPkg]);

  /** 讀取方案兒童規則覆寫與房型容量（僅讀取既有設定） */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedPkg) {
        setPkgChildOverride(null);
        setRoomCapacity(null);
        return;
      }
      const [overrideRes, capRes] = await Promise.all([
        selectedPkg.package_id
          ? supabase
              .from("accommodation_packages")
              .select("child_age_rules_override")
              .eq("id", selectedPkg.package_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        candidateRoomTypeIds.length > 0
          ? supabase.from("room_types").select("id, capacity").in("id", candidateRoomTypeIds)
          : Promise.resolve({ data: [] } as any),
      ]);
      if (cancelled) return;
      setPkgChildOverride(((overrideRes as any)?.data?.child_age_rules_override as unknown) ?? null);
      const caps = (((capRes as any)?.data ?? []) as Array<{ capacity: number | null }>)
        .map((r) => Number(r.capacity ?? 0))
        .filter((n) => n > 0);
      setRoomCapacity(caps.length > 0 ? Math.max(...caps) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPkg, candidateRoomTypeIds]);



  /** 依活動可入住期間預先計算「該日期是否還有庫存」，無庫存日期於日曆停用 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!campaign || bookingLocked || candidateRoomTypeIds.length === 0) {
        setUnavailableDates(new Set());
        return;
      }
      const today = new Date().toISOString().split("T")[0];
      const start = campaign.stay_start_date && campaign.stay_start_date > today ? campaign.stay_start_date : today;
      const endLimit = campaign.stay_end_date;
      const dates: string[] = [];
      const [y, m, d] = start.split("-").map(Number);
      for (let i = 0; i < 120; i++) {
        const iso = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i)).toISOString().split("T")[0];
        if (endLimit && iso > endLimit) break;
        dates.push(iso);
      }
      if (dates.length === 0) {
        setUnavailableDates(new Set());
        return;
      }
      const results = await Promise.all(
        candidateRoomTypeIds.map((rtId) =>
          supabase.rpc("get_adjusted_room_inventory_batch", {
            p_room_type_id: rtId,
            p_dates: dates,
            p_accommodation_id: campaign.accommodation_id,
          }),
        ),
      );
      if (cancelled) return;
      const okDates = new Set<string>();
      for (const { data, error } of results) {
        if (error) continue;
        for (const row of (data ?? []) as any[]) {
          const iso = row?.date_value ?? row?.date;
          if (!iso) continue;
          if (row?.is_blocked === true) continue;
          if (Number(row?.available_rooms ?? 0) >= roomQuantity) okDates.add(String(iso));
        }
      }
      // 完全查不到資料時不阻擋使用者（維持原本送出時的後端驗證）
      if (okDates.size === 0 && results.every((r) => r.error)) {
        setUnavailableDates(new Set());
        return;
      }
      setUnavailableDates(new Set(dates.filter((iso) => !okDates.has(iso))));
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign, candidateRoomTypeIds, roomQuantity, bookingLocked]);


  const checkAvailability = useCallback(async () => {
    const roomTypeIds =
      selectedPkg?.room_type_ids && selectedPkg.room_type_ids.length > 0
        ? selectedPkg.room_type_ids
        : selectedPkg?.room_type_id
          ? [selectedPkg.room_type_id]
          : [];
    if (!campaign || roomTypeIds.length === 0 || nights <= 0 || dateBlocked) {
      setAvailability({ checking: false, ok: null, message: "" });
      return;
    }
    setAvailability({ checking: true, ok: null, message: "" });
    const dates = dateList(checkIn, nights);
    let lastMessage = "此區間目前無足夠空房";

    for (const rtId of roomTypeIds) {
      const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: rtId,
        p_dates: dates,
        p_accommodation_id: campaign.accommodation_id,
      });
      if (error) continue;
      const rows = (data ?? []) as any[];
      const blocked = rows.find((r) => r?.is_blocked === true);
      if (blocked) {
        lastMessage = blocked.blocked_by_room_name
          ? `${blocked.date_value} 已被「${blocked.blocked_by_room_name}」預訂`
          : `${blocked.date_value} 已滿房`;
        continue;
      }
      const short = rows.find((r) => Number(r?.available_rooms ?? 0) < roomQuantity);
      if (short) {
        lastMessage = `${short.date_value} 僅剩 ${Math.max(0, Number(short.available_rooms))} 間`;
        continue;
      }
      setAvailability({ checking: false, ok: true, message: "此區間有空房，可立即預訂" });
      return;
    }
    setAvailability({ checking: false, ok: false, message: lastMessage });
  }, [campaign, selectedPkg, checkIn, nights, roomQuantity, dateBlocked]);

  useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);


  const submit = async () => {
    if (!campaign || !selectedPkg) return;
    if (sale !== "on_sale") {
      toast({ title: sale === "not_started" ? "團購尚未開賣" : "團購已結束", variant: "destructive" });
      return;
    }
    const errs = validateStayRange(campaign, checkIn, checkOut);
    const firstErr = errs.checkIn || errs.checkOut;
    if (firstErr) {
      toast({ title: "日期不符合活動規定", description: firstErr, variant: "destructive" });
      return;
    }
    if (nights <= 0) {
      toast({ title: "請選擇入住與退房日期", variant: "destructive" });
      return;
    }
    if (guestError) {
      toast({ title: "入住人數不符合規定", description: guestError, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-create-order", {
        body: {
          slug: campaign.slug,
          campaignPackageId: selectedPkg.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          roomQuantity,
          guestCount,
          adultCount: guests.adults,
          childCount: guests.children,
          toddlerCount: guests.toddlers,
          infantCount: guests.infants,
          guestName,
          guestPhone,
          guestEmail,
          guestNote,
          origin: window.location.origin,
        },
      });
      const payload: any = data;
      if (error || payload?.error) {
        // supabase.functions.invoke 在非 2xx 時只給「non-2xx status code」，
        // 真正的訊息在 error.context 的 response body，需要另外讀出來
        let message: string | null = payload?.error ?? null;
        const ctx: any = (error as any)?.context;
        if (!message && ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.clone().json();
            message = body?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        toast({
          title: "預訂失敗",
          description: message ?? error?.message ?? "請稍後再試",
          variant: "destructive",
        });
        setConfirmOpen(false);
        void checkAvailability();
        return;
      }
      setResult(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
      navigate(`/g/order/${payload.orderNumber}/confirmed`, {
        state: { phoneLast4: guestPhone.replace(/\D/g, "").slice(-4), result: payload },
      });
    } catch (e) {
      toast({ title: "預訂失敗", description: e instanceof Error ? e.message : "請稍後再試", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!campaign) {
    return (
      <div className="gb-theme min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <h1 className="text-xl font-semibold text-foreground">找不到這個團購活動</h1>
          <p className="mt-2 text-muted-foreground">活動可能尚未開始或已經結束。</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="gb-theme min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-5 py-10">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" /> 訂房已成立，請完成訂金匯款
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl bg-muted p-4">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">訂單編號</span>
                  <span className="font-semibold">{result.orderNumber}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">訂單總額</span>
                  <span>{twd(result.total)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">應付訂金（{result.depositPercentage}%）</span>
                  <span className="font-semibold text-accent">{twd(result.deposit)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">入住現場付清</span>
                  <span>{twd(result.balance)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">匯款期限</span>
                  <span className="font-semibold">{result.paymentDeadlineText}</span>
                </div>
              </div>

              {result.bank ? (
                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="mb-2 font-semibold text-foreground">匯款資訊</p>
                  <p>
                    {result.bank.bankName}
                    {result.bank.bankCode ? `（${result.bank.bankCode}）` : ""}
                    {result.bank.branchName ? ` ${result.bank.branchName}` : ""}
                  </p>
                  <p>戶名：{result.bank.accountName}</p>
                  <p className="font-semibold">帳號：{result.bank.accountNumber}</p>
                  {result.bank.note && <p className="text-muted-foreground">{result.bank.note}</p>}
                </div>
              ) : (
                <p className="text-muted-foreground">匯款資訊將由客服另行提供，請留意信箱通知。</p>
              )}

              <p className="text-muted-foreground">
                匯款完成後，請至訂單查詢頁點選「我已完成匯款」，逾期未匯款訂單將自動取消。
                {result.emailSent ? " 通知信已寄至您的信箱。" : ""}
              </p>
              <Button asChild className="h-12 w-full rounded-xl">
                <Link to={`/g/order/${result.orderNumber}`}>前往訂單查詢／回報匯款</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const saleBadge =
    sale === "on_sale" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground/80" />
        {SALE_STATE_LABEL.on_sale}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
        {SALE_STATE_LABEL[sale]}
      </span>
    );

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const scrollToForm = () => goTo("gb-book");
  /**
   * 客服 LINE 來源：優先使用民宿既有的官方 LINE 設定（accommodation_info.line_id），
   * 沒有設定時才回退解析活動聯絡說明中的網址。不新增第二套客服資料。
   */
  const accLineId = ((accInfo as any)?.line_id ?? "").trim();
  const officialLineUrl = accLineId
    ? /^https?:\/\//i.test(accLineId)
      ? accLineId
      : `https://line.me/R/ti/p/${accLineId.startsWith("@") ? accLineId : `@${accLineId}`}`
    : "";
  const lineUrl = officialLineUrl || (campaign.contact_note?.match(/https?:\/\/[^\s，、）)]+/)?.[0] ?? "");

  const scrollToNextStep = () =>
    goTo(currentStep <= 2 ? "gb-book" : currentStep === 3 ? "gb-form" : "gb-pay");
  const readyToConfirm =
    !!selectedPkg &&
    !bookingLocked &&
    step3Done &&
    availability.ok === true &&
    !availability.checking;

  /** 首屏顯示用資料（皆為後台可設定欄位，未設定時自動回退既有資料） */
  const highlightPoints = (campaign.highlight_points ?? []).filter((s) => !!s?.trim()).slice(0, 3);
  const featuredFacilities = (campaign.featured_facilities ?? []).filter((s) => !!s?.trim());
  const heroPhotos = (campaign.featured_photo_urls ?? []).filter(Boolean).slice(0, 4);
  const heroPhotoRow = (heroPhotos.length > 0 ? heroPhotos : previewPhotos).slice(0, 3);
  /** 首屏價格錨點：取所有方案中的最低團購價與對應原價 */
  const lowestPkg = packages.reduce<CampaignPackage | null>(
    (best, p) => (!best || p.group_buy_price < best.group_buy_price ? p : best),
    null,
  );
  /** 最高現省：遍歷所有上架方案，取 MAX(原價 - 團購價)，忽略沒有原價的方案 */
  const maxSave = packages.reduce(
    (m, p) => (p.original_price ? Math.max(m, Math.round(p.original_price - p.group_buy_price)) : m),
    0,
  );



  return (
    <div className="gb-theme min-h-screen bg-background pb-28 text-foreground sm:pb-16">
      {/* ── Hero ── */}
      <header className="relative">
        {campaign.cover_image_url ? (
          <div className="relative">
            <img
              src={campaign.cover_image_url}
              alt={venueName || campaign.title}
              className="h-[66vw] max-h-[560px] min-h-[280px] w-full object-cover object-center sm:h-[46vw]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/85 to-transparent" />
          </div>
        ) : (
          <div className="h-20 w-full" />
        )}
        <div className={SHELL}>
          <div
            className={`relative z-10 rounded-2xl bg-card px-5 py-5 shadow-[0_10px_40px_-26px_rgba(63,57,51,0.5)] sm:px-8 sm:py-6 ${
              campaign.cover_image_url ? "-mt-12 sm:-mt-16" : "mt-6"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-sm font-medium tracking-wide text-secondary-foreground">
                {campaign.kol_display_name ? `${campaign.kol_display_name} 專屬團購` : "團媽專屬團購"}
              </span>
              {saleBadge}
            </div>
            {/* 1 民宿名稱 */}
            <h1 className="mt-2.5 text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2.25rem]">
              {venueName || campaign.title}
            </h1>
            {/* 2 一句話賣點 */}
            {(campaign.subtitle || (venueName && campaign.title)) && (
              <p className="mt-1.5 line-clamp-2 text-base leading-[1.7] text-muted-foreground">
                {campaign.subtitle || campaign.title}
              </p>
            )}

            {/* 3 團購價格錨點 */}
            {lowestPkg && (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-sm text-muted-foreground">團購價</span>
                <span className="text-[1.875rem] font-bold leading-none tracking-tight text-accent tabular-nums sm:text-[2.125rem]">
                  {twd(lowestPkg.group_buy_price)}
                </span>
                <span className="text-sm text-muted-foreground">起／晚</span>
                {lowestPkg.original_price ? (
                  <span className="text-sm text-muted-foreground/80 line-through tabular-nums">
                    原價 {twd(lowestPkg.original_price)}
                  </span>
                ) : null}
                {maxSave > 0 && (
                  <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    最高現省 {twd(maxSave)}
                  </span>
                )}
              </div>
            )}

            {/* 4 活動主賣點（後台可設定，最多 3 點） */}
            {highlightPoints.length > 0 && (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-3">
                {highlightPoints.map((h) => (
                  <li key={h} className="flex items-start gap-1.5 text-sm leading-snug text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* 5 活動核心條件（販售期限、可入住、訂金） */}
            <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border/60 pt-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <p className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">販售至</span>
                <span className="font-medium tabular-nums">{fmtWindow(campaign.sale_end)}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">可入住</span>
                <span className="font-medium tabular-nums">
                  {campaign.stay_start_date ?? "不限"} ~ {campaign.stay_end_date ?? "不限"}
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">本次僅付訂金</span>
                <span className="font-medium tabular-nums">{depositPct}%</span>
              </p>
            </div>

            {/* 6 主要行動 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!bookingLocked && (
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-accent px-6 text-base font-semibold text-accent-foreground hover:bg-accent/90"
                  onClick={() => goTo("gb-plans")}
                >
                  立即選擇方案
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 rounded-xl px-4 text-sm"
                onClick={() => goTo("gb-venue")}
              >
                <Images className="mr-1.5 h-4 w-4" /> 查看住宿照片與介紹
              </Button>
            </div>

            {/* 7 精選照片（後台可指定，未指定時取民宿相簿） */}
            {heroPhotoRow.length > 0 && (
              <div className={`mt-3 grid gap-2 ${heroPhotoRow.length === 1 ? "grid-cols-1" : heroPhotoRow.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {heroPhotoRow.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    onClick={() => goTo("gb-venue")}
                    className="h-20 overflow-hidden rounded-xl sm:h-24"
                    aria-label="查看住宿照片"
                  >
                    <img src={url} alt={`${venueName || campaign.title} 照片 ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </header>

      <main className={SHELL}>
        {bookingLocked && (
          <p className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {sale === "ended"
              ? "此團購活動已結束，目前無法使用團購價格預訂。"
              : "此團購活動尚未開賣，目前無法下訂。"}
          </p>
        )}


        {/* ── 訂房流程 Stepper ── */}
        {!bookingLocked && (
          <GroupBuyStepper
            className="mt-6"
            current={currentStep}
            completed={completedSteps}
            steps={[
              { no: 1, label: "選擇方案", targetId: "gb-plans" },
              { no: 2, label: "選擇日期", targetId: "gb-book" },
              { no: 3, label: "填寫資料", targetId: "gb-form" },
              { no: 4, label: "完成預訂", targetId: "gb-pay" },
            ]}
          />
        )}




        {/* ── STEP 1 選擇專屬方案 ── */}
        <section id="gb-plans" className="mt-10 scroll-mt-6">
          <StepHeading
            step={1}
            title="選擇專屬方案"
            hint={
              bookingLocked
                ? "以下為本次團購的方案與價格，活動期間已結束，僅供瀏覽。"
                : "團媽限定價格，選定方案後即可挑選入住日期完成預訂。"
            }
          />
          <div className="mt-5 space-y-3.5">
            {packages.map((p) => {
              const active = !bookingLocked && p.id === selectedPkgId;
              const save = p.original_price ? Math.round(p.original_price - p.group_buy_price) : 0;
              return (
                <div
                  key={p.id}
                  className={`flex w-full flex-col gap-4 rounded-2xl border p-4 transition sm:flex-row sm:p-5 ${
                    active
                      ? "border-primary bg-secondary/60 ring-1 ring-primary/30"
                      : "border-border/70 bg-card"
                  } ${bookingLocked ? "opacity-70" : ""}`}
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.display_name}
                      loading="lazy"
                      className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-28 sm:w-36"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {/* 第一層：方案名稱 */}
                    <p className="text-[1.1875rem] font-bold leading-snug tracking-tight sm:text-[1.25rem]">
                      {p.display_name}
                    </p>
                    {/* 第二層：方案短摘要（後台可設定；未設定時取方案內容前段） */}
                    {(p.short_summary?.trim() || p.description) && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                        {p.short_summary?.trim() || p.description}
                      </p>
                    )}
                    {/* 第三層：完整方案內容（預設收合，完整內容不刪除） */}
                    {p.description && (
                      <>
                        {expandedPkgs[p.id] && (
                          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {p.description}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedPkgs((s) => ({ ...s, [p.id]: !s[p.id] }))}
                          className="mt-1 text-sm font-medium text-primary underline underline-offset-4"
                        >
                          {expandedPkgs[p.id] ? "收合方案內容" : "查看完整方案內容"}
                        </button>
                      </>
                    )}

                    {/* 第三／四層：團購價 → 原價與省下金額 */}
                    <div className="mt-3.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm text-muted-foreground">團購價</span>
                        <span className="text-[1.75rem] font-bold leading-none tracking-tight text-accent tabular-nums sm:text-[2rem]">
                          {twd(p.group_buy_price)}
                        </span>
                        <span className="text-sm text-muted-foreground">／晚</span>
                      </div>
                      {(p.original_price || save > 0) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {p.original_price ? (
                            <span className="text-sm text-muted-foreground/80 line-through tabular-nums">
                              原價 {twd(p.original_price)}
                            </span>
                          ) : null}
                          {save > 0 && (
                            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                              現省 {twd(save)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* 第五層：選擇方案 */}
                    <div className="mt-4">
                      {bookingLocked ? (
                        <span className="text-sm text-muted-foreground">
                          {sale === "ended" ? "活動已結束" : "尚未開賣"}
                        </span>
                      ) : active ? (
                        <div className="rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                            <CheckCircle2 className="h-4 w-4" /> 已選擇「{p.display_name}」
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="font-semibold text-accent tabular-nums">
                              {twd(p.group_buy_price)}
                            </span>
                            ／晚 · 下一步：選擇入住日期
                          </p>
                          <button
                            type="button"
                            onClick={scrollToForm}
                            className="mt-1.5 text-sm font-medium text-primary underline underline-offset-4"
                          >
                            前往選擇入住日期
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-xl border-primary/40 text-base font-semibold text-primary hover:bg-primary/10 sm:w-auto sm:px-6"
                          onClick={() => {
                            setSelectedPkgId(p.id);
                            setTimeout(scrollToForm, 60);
                          }}
                        >
                          選擇此方案
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {packages.length === 0 && <p className="text-muted-foreground">此活動尚未上架方案。</p>}
          </div>
        </section>

        {/* ── 住宿亮點（僅文字，照片交由首屏 Hero 與下方完整相簿） ── */}
        <GroupBuyQuickPreview
          facilities={featuredFacilities.length > 0 ? featuredFacilities : previewFacilities}
          totalPhotos={previewPhotos.length}
          onViewAll={() => goTo("gb-venue")}
        />







        {/* ── 訂房表單（最終 CTA） ── */}
        {bookingLocked ? (
          <section
            id="gb-book"
            className="mt-10 scroll-mt-6 rounded-3xl border border-border/70 bg-muted/50 p-5 text-center sm:p-7"
          >
            <h2 className="text-[1.25rem] font-bold tracking-tight">
              {sale === "ended" ? "此團購活動已結束" : "此團購活動尚未開賣"}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {sale === "ended"
                ? "目前無法使用團購價格預訂，以上方案與價格僅供瀏覽。"
                : "開賣後即可選擇方案與入住日期完成預訂。"}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              已下訂？
              <Link to="/g/order" className="font-medium text-primary underline underline-offset-4">
                查詢訂單／回報匯款
              </Link>
            </p>
          </section>
        ) : (
        <section
          id="gb-book"
          className="mt-10 scroll-mt-6 rounded-3xl border border-border/70 bg-card p-5 sm:p-7"
        >
          <StepHeading
            step={2}
            title="選擇入住日期"
            hint="無空房或不可入住的日期已停用，選好日期後即可填寫訂房資料。"
          />

          {!selectedPkg ? (
            <p className="mt-5 rounded-2xl bg-muted/70 px-4 py-5 text-center text-base text-muted-foreground">
              請先於上方 STEP 1 選擇一個團購方案，即可挑選入住日期。
            </p>
          ) : (
            <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start lg:gap-7">
              {/* 左欄：日期 → 人數 → 訂房資料 */}
              <div className="min-w-0">
                <GroupBuyDateRangeField
                  checkIn={checkIn}
                  checkOut={checkOut}
                  min={campaign.stay_start_date}
                  max={campaign.stay_end_date}
                  unavailableDates={unavailableDates}
                  invalidCheckIn={!!checkIn && !!stayErrors.checkIn}
                  invalidCheckOut={!!checkOut && !!stayErrors.checkOut}
                  onChange={(ci, co) => {
                    setCheckIn(ci);
                    setCheckOut(co);
                  }}
                />
                {!!checkIn && stayErrors.checkIn && <p className="mt-1 text-sm text-destructive">{stayErrors.checkIn}</p>}
                {!!checkOut && stayErrors.checkOut && <p className="mt-1 text-sm text-destructive">{stayErrors.checkOut}</p>}

                <div className="mt-4">
                  <GroupBuyGuestPicker
                    value={guests}
                    onChange={setGuests}
                    rules={childRules}
                    blockReason={guestError}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    團購方案每筆訂單固定 1 間房。
                    {childEval.extraFeePerNight > 0 && (
                      <>
                        {" "}
                        兒童加價每晚 NT$
                        {childEval.extraFeePerNight.toLocaleString("en-US")}。
                      </>
                    )}
                  </p>
                </div>


                {nights > 0 && !dateBlocked && (
                  <div className="mt-4">
                    {availability.checking && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> 確認庫存中…
                      </p>
                    )}
                    {!availability.checking && availability.ok === true && (
                      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-sm font-medium text-primary">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {stayLabel}
                          <span className="mt-0.5 block font-normal">共 {nights} 晚・{availability.message}</span>
                        </span>
                      </div>
                    )}
                    {!availability.checking && availability.ok === false && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                        {stayLabel}
                        <span className="mt-0.5 block">共 {nights} 晚・{availability.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {nights > 0 && !dateBlocked && (
                  <>
                    <Separator className="my-7 bg-border/70" />
                    <div id="gb-form" className="scroll-mt-6">
                      <StepHeading step={3} title="填寫訂房資料" hint="請填寫可聯絡到您的資訊，匯款資訊將寄至此 Email。" />
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                      <div className="sm:col-span-2">
                        <Label htmlFor="gb-name" className="text-sm font-medium text-foreground">訂房人姓名</Label>
                        <Input
                          id="gb-name"
                          value={guestName}
                          aria-invalid={!!nameError || undefined}
                          className={nameError ? "border-destructive" : undefined}
                          onChange={(e) => setGuestName(e.target.value)}
                          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        />
                        {nameError && <p className="mt-1 text-sm text-destructive">{nameError}</p>}
                      </div>
                      <div>
                        <Label htmlFor="gb-phone" className="text-sm font-medium text-foreground">聯絡電話</Label>
                        <Input
                          id="gb-phone"
                          inputMode="tel"
                          value={guestPhone}
                          aria-invalid={!!phoneError || undefined}
                          className={phoneError ? "border-destructive" : undefined}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        />
                        {phoneError && <p className="mt-1 text-sm text-destructive">{phoneError}</p>}
                      </div>
                      <div>
                        <Label htmlFor="gb-email" className="text-sm font-medium text-foreground">Email（接收訂單確認及匯款資訊）</Label>
                        <Input
                          id="gb-email"
                          type="email"
                          value={guestEmail}
                          aria-invalid={!!emailError || undefined}
                          className={emailError ? "border-destructive" : undefined}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                        />
                        {emailError && <p className="mt-1 text-sm text-destructive">{emailError}</p>}
                      </div>
                      <div className="sm:col-span-2">
                        {!noteOpen ? (
                          <button
                            type="button"
                            onClick={() => setNoteOpen(true)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
                          >
                            <Plus className="h-4 w-4" /> 有特殊需求？
                          </button>
                        ) : (
                          <>
                            <Label htmlFor="gb-note" className="text-sm font-medium text-foreground">
                              備註（民宿將盡力配合，但無法保證能滿足所有需求）
                            </Label>
                            <Textarea id="gb-note" rows={3} value={guestNote} onChange={(e) => setGuestNote(e.target.value)} />
                          </>
                        )}
                      </div>

                    </div>
                  </>
                )}
              </div>

              {/* 右欄（桌機置頂固定）：訂單摘要 → 付款方式 → 確認訂房 */}
              <aside id="gb-pay" className="mt-7 scroll-mt-6 lg:sticky lg:top-6 lg:mt-0">
                {nights > 0 && !dateBlocked ? (
                  <>
                    <div className="lg:hidden">
                      <StepHeading step={4} title="確認訂房內容與金額" />
                    </div>
                    <div className="mt-4 lg:mt-0">
                      <GroupBuySummaryCard
                        packageName={selectedPkg.display_name}
                        checkIn={checkIn}
                        checkOut={checkOut}
                        nights={nights}
                        roomQuantity={roomQuantity}
                        guestSummary={guestSummary}
                        childExtraTotal={childExtraTotal}
                        baseTotal={baseTotal}
                        total={total}
                        deposit={deposit}
                        balance={balance}
                        depositPct={depositPct}
                        deadlineHours={campaign.payment_deadline_hours}
                        available={availability.ok === true}
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
                    選好入住與退房日期後，這裡會顯示訂單金額與應付訂金。
                  </div>
                )}

                <div className="mt-4">
                  <GroupBuyPaymentSteps
                    depositPercentage={depositPct}
                    deadlineHours={campaign.payment_deadline_hours}
                  />
                </div>

                <Button
                  className="mt-4 h-14 w-full rounded-xl bg-accent text-lg font-semibold text-accent-foreground shadow-sm transition hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                  disabled={
                    submitting ||
                    availability.checking ||
                    availability.ok !== true ||
                    nights <= 0 ||
                    !selectedPkg ||
                    dateBlocked ||
                    bookingLocked ||
                    !guestName.trim() ||
                    !guestPhone.trim() ||
                    !guestEmail.trim() ||
                    !!emailError ||
                    guestCount < 1 ||
                    !!guestError
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  確認訂房並取得匯款資訊
                </Button>
                <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
                  送出前會再顯示一次確認畫面，確認後才會建立訂單。
                </p>
              </aside>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-2.5">
            <p className="text-sm text-muted-foreground">
              已下訂？
              <Link to="/g/order" className="font-medium text-primary underline underline-offset-4">
                查詢訂單／回報匯款
              </Link>
            </p>
          </div>


        </section>

        )}

        {/* ── 完整民宿介紹（放在訂房流程之後） ── */}
        {campaign.description_html && (
          <div
            className="prose prose-sm mt-10 max-w-none text-foreground prose-headings:text-foreground prose-p:leading-relaxed prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.description_html) }}
          />
        )}

        {campaign.gallery_urls?.length > 0 && (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {campaign.gallery_urls.map((url) => (
              <img
                key={url}
                src={url}
                alt={venueName || campaign.title}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        <div id="gb-venue" className="scroll-mt-6" />
        <GroupBuyVenueIntro
          accommodationId={campaign.accommodation_id}
          hideGallery={(campaign.gallery_urls?.length ?? 0) >= 3}
          hideFacilities
        />



        {campaign.terms_html && (
          <div
            className="prose prose-sm mt-6 max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.terms_html) }}
          />
        )}

        {(campaign.contact_note || lineUrl) && (
          <section className="mt-8 rounded-2xl border border-border/70 bg-card p-4 text-center sm:p-5">
            {campaign.contact_note && (
              <p className="text-sm leading-relaxed text-muted-foreground">{campaign.contact_note}</p>
            )}
            {lineUrl && (
              <Button
                asChild
                variant="outline"
                className="mt-3 h-11 rounded-xl border-primary/40 px-5 text-base font-medium text-primary hover:bg-primary/10"
              >
                <a href={lineUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1.5 h-4 w-4" /> 有問題？LINE 詢問
                </a>
              </Button>
            )}
          </section>
        )}

      </main>

      {/* ── 民宿詳細資訊：完全共用一般訂房頁的既有元件與資料來源 ── */}
      {accInfo && (
        <div className="mx-auto w-full max-w-[1040px] [&_section]:py-8 sm:[&_section]:py-10">
          {accInfo.show_facilities_section !== false &&
            ((secondaryData?.facilities?.length || 0) > 0 ||
              (secondaryData?.roomScopeFacilities?.whole?.length || 0) > 0 ||
              (secondaryData?.roomScopeFacilities?.single?.length || 0) > 0) && (
              <GroupBuyFacilitiesCompact
                highlights={
                  (featuredFacilities.length > 0
                    ? featuredFacilities
                    : (secondaryData?.facilities || []).map((f: any) => f.facility_name)
                  )
                    .filter(Boolean)
                    .slice(0, 9)
                }
                totalCount={
                  (secondaryData?.facilities?.length || 0) +
                  (secondaryData?.roomScopeFacilities?.whole?.length || 0) +
                  (secondaryData?.roomScopeFacilities?.single?.length || 0)
                }
              >
                <FacilitiesSection
                  facilities={secondaryData?.facilities || []}
                  wholeFacilities={
                    (accInfo as any).show_room_facilities_whole !== false
                      ? secondaryData?.roomScopeFacilities?.whole || []
                      : []
                  }
                  singleFacilities={
                    (accInfo as any).show_room_facilities_single !== false
                      ? secondaryData?.roomScopeFacilities?.single || []
                      : []
                  }
                />
              </GroupBuyFacilitiesCompact>
            )}


          {accInfo.show_location_section !== false && (
            <LocationSection
              address={accInfo.address}
              locationInfo={secondaryData?.locationInfo}
              customTitle="交通資訊"
              initialAttractionCount={3}
            />
          )}



          {accInfo.show_faq_section !== false && <FaqSection accommodationId={accInfo.id} />}

          {accInfo.show_booking_info_section !== false && (
            <GroupBuyBookingInfoCompact bookingSettings={secondaryData?.bookingSettings}>
              <BookingInfoSection
                bookingSettings={secondaryData?.bookingSettings}
                checkInNotice={accInfo.check_in_notice}
                customSections={secondaryData?.customBookingSections}
              />
            </GroupBuyBookingInfoCompact>
          )}

        </div>
      )}

      <BookingFooter
        hidePartnershipInfo
        lineId={(accInfo as any)?.line_id}
        facebookUrl={(accInfo as any)?.facebook_url}
        instagramUrl={(accInfo as any)?.instagram_url}
        threadsUrl={(accInfo as any)?.threads_url}
        youtubeUrl={(accInfo as any)?.youtube_url}
        tiktokUrl={(accInfo as any)?.tiktok_url}
      />


      {selectedPkg && (
        <GroupBuyConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          submitting={submitting}
          onConfirm={() => void submit()}
          venueName={venueName || campaign.title}
          packageName={selectedPkg.display_name}
          checkIn={checkIn}
          checkOut={checkOut}
          nights={nights}
          roomQuantity={roomQuantity}
          guestSummary={guestSummary}
          baseTotal={baseTotal}
          childExtraTotal={childExtraTotal}
          total={total}
          deposit={deposit}
          balance={balance}
          depositPct={depositPct}
          guestName={guestName}
          guestPhone={guestPhone}
          guestEmail={guestEmail}
        />
      )}

      {/* ── 手機固定底部 CTA（只做捲動導引 / 開啟確認層，不改動任何訂房邏輯） ── */}
      {selectedPkg && sale === "on_sale" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.625rem)] pt-2.5 backdrop-blur sm:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {readyToConfirm ? `訂金（${depositPct}%）` : selectedPkg.display_name}
              </p>
              <p className="text-lg font-bold leading-tight text-accent tabular-nums">
                {readyToConfirm ? twd(deposit) : nights > 0 ? twd(total) : twd(selectedPkg.group_buy_price)}
                {!readyToConfirm && nights <= 0 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">／晚</span>
                )}
              </p>
            </div>
            <Button
              onClick={() => (readyToConfirm ? setConfirmOpen(true) : scrollToNextStep())}
              className="h-11 shrink-0 rounded-xl bg-accent px-5 text-base font-semibold text-accent-foreground hover:bg-accent/90"
            >
              {readyToConfirm ? "確認訂房" : currentStep === 2 ? "選擇入住日期" : "繼續預訂"}
            </Button>
          </div>
        </div>
      )}

    </div>
  );

}

