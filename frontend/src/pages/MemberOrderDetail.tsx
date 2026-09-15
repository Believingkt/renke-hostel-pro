import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { OFFLINE_KEYS, readOfflineCache, writeOfflineCache } from "@/lib/native/offlineStore";
import { useOrderRealtime, isOrderPaid } from "@/hooks/use-order-realtime";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  CalendarDays,
  Phone,
  Mail,
  User,
  Users,
  Gift,
  Share2,
  Copy,
  Sparkles,
  Check,
  X,
  Plus,
  LayoutGrid,
  KeyRound,
  MessageSquare,
  Building2,
  Clock,
  ShieldCheck,


} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, differenceInCalendarDays, addDays } from "date-fns";

import AddToCalendarButton from "@/components/booking/AddToCalendarButton";
import ShareStayButton from "@/components/booking/ShareStayButton";
import { toast } from "sonner";
import { isAtmExpired } from "@/lib/atmPayment";
import { resolvePaymentSummary } from "@/lib/paymentSummary";
import { bookingPath } from "@/lib/frontendUrl";
import { buildGuestNotes } from "@/utils/guestNotesWhitelist";
import { BookingLocaleProvider, useBookingLocale } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import { useTranslatedFields, type TranslatableField } from "@/hooks/use-translated-fields";

const ORANGE = "hsl(24,100%,50%)";

const statusLabelKeys: Record<string, string> = {
  pending: "booking.member.status.pending",
  confirmed: "booking.member.status.confirmed",
  on_hold: "booking.member.status.on_hold",
  checked_in: "booking.member.status.checked_in",
  checked_out: "booking.member.status.checked_out",
  cancelled: "booking.member.status.cancelled",
};

const maskEmail = (email?: string | null) => {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
};

const maskPhone = (phone?: string | null) => {
  if (!phone) return "";
  const digits = phone.replace(/\s/g, "");
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
};

/** 將可能含 HTML 的政策文字轉為純文字行 */
const htmlToLines = (html?: string | null): string[] => {
  if (!html) return [];
  const text = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
};

const BANK_NAME_KEYS: Record<string, string> = { "822": "booking.member.atm.bank822" };

const CopyField = ({ label, value, highlight, copyValue }: { label: string; value: string; highlight?: boolean; copyValue?: string }) => {
  const { t } = useBookingLocale();
  return (
  <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`truncate font-semibold tabular-nums ${highlight ? "text-base" : "text-sm"}`}
        style={highlight ? { color: ORANGE } : undefined}
      >
        {value}
      </p>
    </div>
    <button
      type="button"
      aria-label={t("booking.member.atm.copy", { label })}
      onClick={() => {
        navigator.clipboard.writeText(copyValue ?? value.replace(/[^\dA-Za-z]/g, ""));
        toast.success(t("booking.member.copied"));
      }}

      className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
    >
      <Copy className="h-4 w-4" />
    </button>
  </div>
  );
};

const AtmVirtualAccountCard = ({
  bankCode,
  vaccNo,
  expireAt,
  amount,
  amountLabel,
}: {
  bankCode?: string | null;
  vaccNo: string;
  expireAt?: string | null;
  amount: number;
  amountLabel: string;
}) => {
  const { t, dateLocale } = useBookingLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const expire = expireAt ? new Date(expireAt) : null;
  const diff = expire ? expire.getTime() - now : 0;
  const expired = !!expire && diff <= 0;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Building2 className="h-4 w-4" style={{ color: ORANGE }} /> {t("booking.member.atm.title")}
      </p>

      {expire && (
        <div
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: "hsl(24,100%,80%)", background: "hsl(24,100%,97%)" }}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" style={{ color: ORANGE }} />
            {expired ? t("booking.member.atm.expiredTitle") : t("booking.member.atm.countdown")}
          </p>
          {!expired && (
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: ORANGE }}>
              {t("booking.member.atm.remain", { days, hours, mins })}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {t("booking.member.atm.deadlineAt", { time: format(expire, t("booking.member.fmt.atmExpire"), { locale: dateLocale }) })}
          </p>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check className="h-4 w-4" style={{ color: ORANGE }} /> {t("booking.member.atm.opened")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("booking.member.atm.hint")}</p>
        <div className="mt-3 space-y-2">
          <CopyField
            label={
              bankCode && BANK_NAME_KEYS[bankCode]
                ? t("booking.member.atm.bankCodeWith", { bank: t(BANK_NAME_KEYS[bankCode]) })
                : t("booking.member.atm.bankCode")
            }
            value={bankCode || "—"}
          />
          <CopyField label={t("booking.member.atm.vaccNo")} value={vaccNo} />
          <CopyField label={amountLabel} value={`NT$ ${amount.toLocaleString()}`} copyValue={String(Math.round(amount))} highlight />
        </div>
        {expire && (
          <div
            className="mt-3 rounded-xl border p-3 text-xs"
            style={{ borderColor: "hsl(45,90%,80%)", background: "hsl(45,100%,96%)" }}
          >
            <p className="font-medium">{t("booking.member.atm.deadlineTitle")}</p>
            <p className="mt-0.5 font-semibold">
              {format(expire, t("booking.member.fmt.atmExpireLong"), { locale: dateLocale })}
            </p>
            <p className="mt-0.5" style={{ color: ORANGE }}>{t("booking.member.atm.autoCancel")}</p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("booking.member.atm.autoUpdate")}</p>
      </div>
    </div>
  );
};


interface PackageInclude {
  text: string;
  available?: "yes" | "no" | "optional";
  price_note?: string;
}

interface DetailData {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_count: number;
  total_price: number;
  discount_amount: number;
  final_price: number;
  paid_amount: number;
  deposit_required_amount: number;
  booking_deposit_amount: number | null;
  booking_deposit_percentage: number | null;
  notes: string | null;
  atm_vacc_no: string | null;
  atm_vacc_bank_code: string | null;
  atm_expire_at: string | null;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_total: number;
  meal_plan_details: Array<{ date?: string; count?: number; price?: number }>;
  custom_addon_details: Array<{ addon_type?: string; count?: number; total?: number; unit_label?: string }>;

  accommodation_id: string;
  accommodation_name: string;
  accommodation_address: string | null;
  accommodation_phone: string | null;
  accommodation_email: string | null;
  accommodation_photo: string | null;
  short_url_alias: string | null;
  room_type_name: string | null;
  room_photo_url: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: string | null;
  check_in_title: string | null;
  check_in_subtitle: string | null;
  other_notes: string | null;
  package_name: string | null;
  package_subtitle: string | null;
  room_allocation: string | null;
  package_includes: PackageInclude[];
  facilities: string[];
}

/** 變更入住人數的價格試算結果（來自 member-order-manage） */
interface GuestPriceQuote {
  canAutoPrice: boolean;
  needsManualReview: boolean;
  reason?: string;
  nights: number;
  currentGuestCount: number;
  newGuestCount: number;
  currentPackageName: string | null;
  newPackageName: string | null;
  currentRoomTotal: number;
  newRoomTotal: number;
  diff: number;
  currentFinalPrice: number;
  newFinalPrice: number;
  paidAmount: number;
  newOutstanding: number;
}


const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card rounded-2xl border border-border px-4 py-4">{children}</div>
);

const MemberOrderDetailInner = () => {
  const { t, dateLocale } = useBookingLocale();
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<DetailData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelQuote, setCancelQuote] = useState<{
    daysBefore: number;
    percent: number;
    label: string;
    feeAmount: number;
    refundAmount: number;
    freeCancel: boolean;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [changeOpen, setChangeOpen] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [newGuests, setNewGuests] = useState(1);
  const [guestQuote, setGuestQuote] = useState<GuestPriceQuote | null>(null);
  const [guestQuoteLoading, setGuestQuoteLoading] = useState(false);
  const [priceChangeAck, setPriceChangeAck] = useState(false);




  const native = useIsNativeApp();

  useEffect(() => {
    const load = async () => {
      if (!orderNumber) return;
      setLoading(true);
      // 原生 App：先顯示上次快取的訂單內容，離線也看得到
      if (native) {
        const cached = await readOfflineCache<any>(OFFLINE_KEYS.memberOrderDetail(orderNumber));
        if (cached?.data) {
          setOrder(cached.data);
          setLoading(false);
        }
      }
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, order_status, payment_status, check_in_date, check_out_date, guest_name, guest_phone, guest_email, guest_count, total_price, discount_amount, final_price, paid_amount, deposit_required_amount, booking_deposit_amount, booking_deposit_percentage, notes, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, pet_count, pet_plan_price, meal_plan_total, meal_plan_details, custom_addon_details, accommodation_id, room_type_id, package_id, display_room_type_name, room_types(name)"
        )
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (error || !data) {
        setLoading(false);
        setOrder(null);
        return;
      }

      const packageId = (data as any).package_id as string | null;

      const [
        { data: acc },
        { data: settings },
        { data: accPhotos },
        { data: roomPhotos },
        { data: pkg },
        { data: facilities },
      ] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, address, phone, email, short_url_alias")
          .eq("id", data.accommodation_id)
          .maybeSingle(),
        supabase
          .from("booking_settings")
          .select(
            "check_in_time, check_out_time, cancellation_policy, check_in_section_title, check_in_section_subtitle, other_notes"
          )
          .eq("accommodation_id", data.accommodation_id)
          .maybeSingle(),
        supabase
          .from("accommodation_photos")
          .select("photo_url, display_order")
          .eq("accommodation_id", data.accommodation_id)
          .order("display_order", { ascending: true })
          .limit(1),
        data.room_type_id
          ? supabase
              .from("room_photos")
              .select("photo_url, display_order")
              .eq("room_type_id", data.room_type_id)
              .order("display_order", { ascending: true })
              .limit(1)
          : Promise.resolve({ data: [] as any[] }),
        packageId
          ? supabase
              .from("accommodation_packages")
              .select("name, subtitle, room_allocation, includes")
              .eq("id", packageId)
              .maybeSingle()
          : Promise.resolve({ data: null as any }),
        supabase
          .from("accommodation_facilities")
          .select("facility_name, is_available")
          .eq("accommodation_id", data.accommodation_id)
          .is("room_scope", null)
          .order("category", { ascending: true }),
      ]);

      const detail = {
        id: data.id,
        order_number: data.order_number,
        order_status: data.order_status,
        payment_status: data.payment_status,
        check_in_date: data.check_in_date,
        check_out_date: data.check_out_date,
        guest_name: data.guest_name,
        guest_phone: data.guest_phone,
        guest_email: data.guest_email,
        guest_count: data.guest_count || 1,
        total_price: Number(data.total_price || 0),
        discount_amount: Number(data.discount_amount || 0),
        final_price: Number(data.final_price || 0),
        paid_amount: Number(data.paid_amount || 0),
        deposit_required_amount: Number(data.deposit_required_amount || 0),
        booking_deposit_amount: (data as any).booking_deposit_amount ?? null,
        booking_deposit_percentage: (data as any).booking_deposit_percentage ?? null,
        notes: data.notes,
        atm_vacc_no: (data as any).atm_vacc_no || null,
        atm_vacc_bank_code: (data as any).atm_vacc_bank_code || null,
        atm_expire_at: (data as any).atm_expire_at || null,
        pet_count: Number((data as any).pet_count || 0),
        pet_plan_price: Number((data as any).pet_plan_price || 0),
        meal_plan_total: Number((data as any).meal_plan_total || 0),
        meal_plan_details: Array.isArray((data as any).meal_plan_details)
          ? (data as any).meal_plan_details
          : [],
        custom_addon_details: Array.isArray((data as any).custom_addon_details)
          ? (data as any).custom_addon_details
          : [],

        accommodation_id: data.accommodation_id,
        accommodation_name: acc?.name || "",
        accommodation_address: acc?.address || null,
        accommodation_phone: acc?.phone || null,
        accommodation_email: acc?.email || null,
        accommodation_photo: accPhotos?.[0]?.photo_url || null,
        short_url_alias: acc?.short_url_alias || null,
        room_type_name:
          (data as any).room_types?.name || (data as any).display_room_type_name || null,
        room_photo_url: roomPhotos?.[0]?.photo_url || null,
        check_in_time: settings?.check_in_time || null,
        check_out_time: settings?.check_out_time || null,
        cancellation_policy: settings?.cancellation_policy || null,
        check_in_title: (settings as any)?.check_in_section_title || null,
        check_in_subtitle: (settings as any)?.check_in_section_subtitle || null,
        other_notes: (settings as any)?.other_notes || null,
        package_name: (pkg as any)?.name || null,
        package_subtitle: (pkg as any)?.subtitle || null,
        room_allocation: (pkg as any)?.room_allocation || null,
        package_includes: Array.isArray((pkg as any)?.includes)
          ? ((pkg as any).includes as PackageInclude[]).filter((i) => i?.text)
          : [],
        facilities: (facilities || [])
          .filter((f: any) => f.is_available !== false)
          .map((f: any) => f.facility_name)
          .filter(Boolean),
      };

      setOrder(detail as any);
      if (native) void writeOfflineCache(OFFLINE_KEYS.memberOrderDetail(orderNumber), detail);

      setLoading(false);
    };
    load();
  }, [orderNumber, reloadKey, native]);

  // TapPay 付款回呼寫回 orders 後，即時更新本頁狀態
  useOrderRealtime(
    order?.id ? [order.id] : [],
    (row) => {
      setOrder((prev) => {
        if (!prev || prev.id !== row.id) return prev;
        const next = {
          ...prev,
          payment_status: (row.payment_status as string) ?? prev.payment_status,
          order_status: (row.order_status as string) ?? prev.order_status,
          paid_amount: Number(row.paid_amount ?? prev.paid_amount),
        };
        if (!isOrderPaid(prev) && isOrderPaid(next)) {
          toast.success(t("booking.member.detail.paymentReceived"));
          setReloadKey((k) => k + 1);
        }
        return next;
      });
    },
  );

  const guestNotes = useMemo(
    () => buildGuestNotes(order?.notes, "", { includeRoomLayout: true, maskContacts: false }),
    [order?.notes],
  );

  const nights = useMemo(() => {
    if (!order) return 0;
    return differenceInCalendarDays(new Date(order.check_out_date), new Date(order.check_in_date));
  }, [order]);

  // 動態內容（後台維護的中文）自動翻譯：僅顯示層，不影響任何查詢、計價或狀態
  const policyLines = useMemo(() => htmlToLines(order?.cancellation_policy), [order?.cancellation_policy]);
  const otherNoteLines = useMemo(() => htmlToLines(order?.other_notes), [order?.other_notes]);
  const translatableFields = useMemo<TranslatableField[]>(() => {
    if (!order) return [];
    const acc = order.accommodation_id;
    const fields: TranslatableField[] = [];
    const push = (table: string, column: string, id: string, text?: string | null) => {
      if (text && text.trim()) fields.push({ table, column, id, text });
    };
    push("accommodation_info", "name", acc, order.accommodation_name);
    push("accommodation_info", "address", acc, order.accommodation_address);
    push("room_types", "name", order.room_type_name || "", order.room_type_name);
    push("accommodation_packages", "name", `${order.id}:pkg`, order.package_name);
    push("accommodation_packages", "subtitle", `${order.id}:pkg`, order.package_subtitle);
    push("accommodation_packages", "room_allocation", `${order.id}:pkg`, order.room_allocation);
    push("booking_settings", "check_in_section_title", acc, order.check_in_title);
    push("booking_settings", "check_in_section_subtitle", acc, order.check_in_subtitle);
    order.package_includes.forEach((inc, i) =>
      push("accommodation_packages", "includes", `${order.id}:inc:${i}`, inc.text),
    );
    order.facilities.forEach((f, i) => push("accommodation_facilities", "facility_name", `${acc}:${i}`, f));
    policyLines.forEach((line, i) => push("booking_settings", "cancellation_policy", `${acc}:${i}`, line));
    otherNoteLines.forEach((line, i) => push("booking_settings", "other_notes", `${acc}:${i}`, line));
    return fields;
  }, [order, policyLines, otherNoteLines]);
  const { tf } = useTranslatedFields(translatableFields);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{t("booking.member.detail.notFound")}</p>
        <button
          onClick={() => navigate("/member/orders")}
          className="px-4 py-2 rounded-full border text-sm font-medium"
          style={{ borderColor: ORANGE, color: ORANGE }}
        >
          {t("booking.member.detail.backToOrders")}
        </button>
      </div>
    );
  }

  const statusLabel = statusLabelKeys[order.order_status]
    ? t(statusLabelKeys[order.order_status])
    : order.order_status;
  const cancelled = order.order_status === "cancelled";
  const points = Math.round(order.final_price * 0.04);
  const balance = Math.max(order.final_price - order.paid_amount, 0);
  const detailPath = order.short_url_alias
    ? `/${order.short_url_alias}`
    : bookingPath(order.accommodation_id);
  const extendCheckOut = format(addDays(new Date(order.check_out_date), 1), "yyyy-MM-dd");

  const runAction = async (payload: Record<string, unknown>, onDone?: () => void) => {
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("member-order-manage", {
        body: { orderNumber: order.order_number, ...payload },
      });
      let res = (data || {}) as {
        success?: boolean;
        message?: string;
        code?: string;
        reviewTaskCreated?: boolean;
      };
      // 非 2xx 時 data 為 null，需自 Response 取回後端訊息（例如 409 客服待辦）
      if (error && !data) {
        const ctx = (error as { context?: unknown }).context;
        if (typeof Response !== "undefined" && ctx instanceof Response) {
          res = await ctx
            .clone()
            .json()
            .catch(() => ({}));
        }
      }
      if (error || !res.success) {
        if (res.reviewTaskCreated) {
          toast.success(res.message || t("booking.member.detail.reviewCreated"));
          onDone?.();
          setReloadKey((k) => k + 1);
          return;
        }
        toast.error(res.message || (error as Error | null)?.message || t("booking.member.detail.actionFailed"));
        return;
      }
      toast.success(res.message || t("booking.member.detail.actionDone"));
      onDone?.();
      setReloadKey((k) => k + 1);
    } finally {
      setActing(false);
    }
  };


  const handleCancel = () => runAction({ action: "cancel" }, () => setCancelOpen(false));

  const openCancel = async () => {
    setCancelQuote(null);
    setCancelOpen(true);
    setQuoteLoading(true);
    try {
      const { data } = await supabase.functions.invoke("member-order-manage", {
        body: { orderNumber: order.order_number, action: "cancel_quote" },
      });
      const res = (data || {}) as { success?: boolean; quote?: typeof cancelQuote };
      if (res.success && res.quote) setCancelQuote(res.quote);
    } finally {
      setQuoteLoading(false);
    }
  };


  // 已付訂金／已付款的訂單不可線上改期，需聯繫客服或民宿
  const dateChangeLocked =
    Number(order.paid_amount || 0) > 0 ||
    ["paid", "deposit_paid", "partial"].includes(String(order.payment_status));

  const fullyPaid = ["paid", "fully_paid"].includes(String(order.payment_status));

  /** 變更人數 → 即時向後端試算是否需補差／退差 */
  const fetchGuestQuote = async (n: number) => {
    setPriceChangeAck(false);
    if (!Number.isInteger(n) || n < 1 || n > 30 || n === order.guest_count) {
      setGuestQuote(null);
      return;
    }
    setGuestQuoteLoading(true);
    try {
      const { data } = await supabase.functions.invoke("member-order-manage", {
        body: {
          orderNumber: order.order_number,
          action: "change_guests_quote",
          guestCount: n,
        },
      });
      const res = (data || {}) as { success?: boolean; priceQuote?: GuestPriceQuote };
      setGuestQuote(res.success && res.priceQuote ? res.priceQuote : null);
    } catch {
      setGuestQuote(null);
    } finally {
      setGuestQuoteLoading(false);
    }
  };

  const guestPriceChanged = !!guestQuote?.canAutoPrice && guestQuote.diff !== 0;
  const guestChangeBlocked =
    (guestPriceChanged && fullyPaid) ||
    (!!guestQuote?.needsManualReview && Number(order.paid_amount || 0) > 0);

  const handleChange = async () => {
    const datesChanged =
      newCheckIn !== order.check_in_date || newCheckOut !== order.check_out_date;
    const guestsChanged = newGuests !== order.guest_count;
    if (!datesChanged && !guestsChanged) {
      toast.error(t("booking.member.change.noChange"));
      return;
    }
    if (guestsChanged && guestPriceChanged && !priceChangeAck) {
      toast.error(t("booking.member.change.confirmPriceFirst"));
      return;
    }
    if (datesChanged) {
      // 已付訂金／已付款 → 送出客服改期申請（人工確認空房與價差）
      await runAction({
        action: dateChangeLocked ? "request_date_change" : "change_dates",
        newCheckIn,
        newCheckOut,
      });
    }
    if (guestsChanged) {
      await runAction({
        action: "change_guests",
        guestCount: newGuests,
        confirmPriceChange: priceChangeAck || !guestPriceChanged,
      });
    }

    setGuestQuote(null);
    setPriceChangeAck(false);
    setChangeOpen(false);
  };


  // ATM 轉帳金額與逾期狀態（與虛擬帳號卡片一致）
  // 付款摘要單一真實來源：訂房訂金取訂單快照（舊單回退備註），不使用入住押金欄位
  const paySummary = resolvePaymentSummary(order as any);
  const atmTransferAmount = paySummary.bookingDepositAmount;
  const atmExpired = isAtmExpired(order as any);


  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: t("booking.member.detail.orderNumber", { order: order.order_number }), url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("booking.member.detail.copiedLink"));
      }
    } catch { /* user cancelled */ }
  };

  const resendEmail = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-order-confirmation", {
        body: {
          orderNumber: order.order_number,
          triggerSource: "member_resend",
          siteUrl: window.location.origin,
        },
      });
      const res = (data || {}) as { success?: boolean; error?: string; to?: string };
      if (error || !res.success) {
        toast.error(res.error || error?.message || t("booking.member.detail.resendFailed"));
        return;
      }
      toast.success(t("booking.member.detail.resendSuccess", { email: maskEmail(res.to || order.guest_email) }));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => navigate("/member/orders")}
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label={t("booking.member.back")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium">{t("booking.member.detail.orderNumber", { order: order.order_number })}</p>
        </div>
        <BookingLanguageSwitch className="mr-1" />
        <button onClick={share} className="p-1 text-muted-foreground hover:text-foreground" aria-label={t("booking.member.share")}>
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* 1. 訂單摘要 */}
      <div className="rounded-2xl px-4 py-5 bg-orange-50 border border-orange-100 space-y-4">
        <div>
          <h1 className={`text-2xl font-bold ${cancelled ? "text-red-500" : ""}`} style={cancelled ? undefined : { color: ORANGE }}>
            {statusLabel}
          </h1>
          {order.guest_email && !cancelled && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              {t("booking.member.detail.emailSent", { email: maskEmail(order.guest_email) })}
            </p>
          )}
          <button
            disabled={resending}
            onClick={resendEmail}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground disabled:opacity-50"
          >
            {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {t("booking.member.detail.resend")}
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!cancelled && (
              <AddToCalendarButton
                size="sm"
                orderNumber={order.order_number}
                accommodationName={order.accommodation_name}
                roomTypeName={order.room_type_name}
                address={order.accommodation_address}
                checkInDate={order.check_in_date}
                checkOutDate={order.check_out_date}
              />
            )}
            {/* 只分享民宿頁連結，不含任何訂單個資 */}
            <ShareStayButton
              size="sm"
              accommodationId={order.accommodation_id}
              accommodationName={order.accommodation_name}
            />
          </div>
        </div>


        {!cancelled && (
          <>
            <div className="border-t border-orange-100 pt-3">
              <p className="text-base font-semibold">
                {paySummary.payTitle}{" "}
                <span className="text-xl font-bold" style={{ color: atmExpired ? "hsl(var(--destructive))" : ORANGE }}>
                  NT$ {paySummary.payAmount.toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {order.payment_status === "paid"
                  ? t("booking.member.detail.paidNote")
                  : order.atm_vacc_no
                    ? order.atm_expire_at
                      ? atmExpired
                        ? t("booking.member.detail.atmExpiredNote", {
                            time: format(new Date(order.atm_expire_at), t("booking.member.fmt.dateTime"), { locale: dateLocale }),
                          })
                        : t("booking.member.detail.atmBeforeNote", {
                            time: format(new Date(order.atm_expire_at), t("booking.member.fmt.dateTime"), { locale: dateLocale }),
                          })
                      : t("booking.member.detail.atmGenericNote")
                    : t("booking.member.detail.cardChargeNote", {
                        date: format(new Date(order.check_in_date), t("booking.member.fmt.monthDay"), { locale: dateLocale }),
                      })}
              </p>
            </div>


            <div className="border-t border-orange-100 pt-3">
              <p className="text-base font-semibold">
                {differenceInCalendarDays(new Date(order.check_in_date), new Date()) >= 14
                  ? t("booking.member.detail.freeCancelTitle")
                  : t("booking.member.detail.feeCancelTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {t("booking.member.detail.freeCancelNote", {
                  date: format(addDays(new Date(order.check_in_date), -14), t("booking.member.fmt.fullDate"), { locale: dateLocale }),
                })}
              </p>
            </div>
          </>
        )}
      </div>


      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-border text-center">
          <p className="text-lg font-extrabold tracking-wide" style={{ color: ORANGE }}>
            {tf({ table: "accommodation_info", column: "name", id: order.accommodation_id, text: order.accommodation_name })}
          </p>
        </div>

        {/* 日期列 */}
        <div className="px-4 py-3 flex items-stretch justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{t("booking.member.detail.checkIn")}</p>
            <p className="text-base font-bold leading-tight">
              {format(new Date(order.check_in_date), t("booking.member.fmt.monthDayWeek"), { locale: dateLocale })}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-2 shrink-0">
            <div className="h-px w-6 bg-border" />
            <span className="text-xs text-muted-foreground my-1">{t("booking.member.detail.nights", { nights })}</span>
            <div className="h-px w-6 bg-border" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-muted-foreground mb-1">{t("booking.member.detail.checkOut")}</p>
            <p className="text-base font-bold leading-tight">
              {format(new Date(order.check_out_date), t("booking.member.fmt.monthDayWeek"), { locale: dateLocale })}
            </p>
          </div>
        </div>

        {/* 房間搭配 */}
        <div className="border-t border-border px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground/80">
            ROOM ALLOCATION
          </p>
          <p className="text-sm font-bold leading-snug">
            {order.room_allocation
              ? t("booking.member.detail.roomAllocation", {
                  value: tf({ table: "accommodation_packages", column: "room_allocation", id: `${order.id}:pkg`, text: order.room_allocation }),
                })
              : order.package_name
                ? tf({ table: "accommodation_packages", column: "name", id: `${order.id}:pkg`, text: order.package_name })
                : order.room_type_name
                  ? tf({ table: "room_types", column: "name", id: order.room_type_name, text: order.room_type_name })
                  : t("booking.member.detail.defaultRoom")}
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
            <Users className="h-3.5 w-3.5" />
            <span>{t("booking.member.detail.adults", { count: order.guest_count })}</span>
          </div>
        </div>

        {/* 尊榮禮遇 */}
        {order.package_includes.length > 0 && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" style={{ color: ORANGE }} />
              <p className="text-sm font-bold">
                {order.package_subtitle
                  ? tf({ table: "accommodation_packages", column: "subtitle", id: `${order.id}:pkg`, text: order.package_subtitle })
                  : t("booking.member.detail.perks")}
              </p>
            </div>
            <ul className="space-y-1.5">
              {order.package_includes.map((inc, i) => {
                const Icon = inc.available === "no" ? X : inc.available === "optional" ? Plus : Check;
                const color =
                  inc.available === "no"
                    ? "hsl(var(--destructive))"
                    : inc.available === "optional"
                      ? "hsl(25, 70%, 45%)"
                      : ORANGE;
                return (
                  <li key={i} className="flex items-start gap-1.5">
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color }} />
                    <span
                      className={`text-xs leading-snug ${
                        inc.available === "no" ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {tf({ table: "accommodation_packages", column: "includes", id: `${order.id}:inc:${i}`, text: inc.text })}
                      {inc.price_note && (
                        <span className="text-muted-foreground ml-1">{t("booking.member.detail.parenNote", { note: inc.price_note })}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 費用明細 */}
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground/80">
            PRICE BREAKDOWN
          </p>
          {(() => {
            const customTotal = (order.custom_addon_details || []).reduce(
              (s, a) => s + Number(a?.total || 0),
              0
            );
            const addonsTotal =
              Number(order.pet_plan_price || 0) + Number(order.meal_plan_total || 0) + customTotal;
            const roomTotal = Math.max(0, order.total_price - addonsTotal);
            return (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex-1 min-w-0">{t("booking.member.detail.roomFee", { nights })}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    NT$ {roomTotal.toLocaleString()}
                  </span>
                </div>
                {order.pet_plan_price > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex-1 min-w-0 text-muted-foreground">
                      {t("booking.member.detail.petAddon")}{order.pet_count > 0 ? ` × ${order.pet_count}` : ""}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      NT$ {order.pet_plan_price.toLocaleString()}
                    </span>
                  </div>
                )}
                {order.meal_plan_total > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex-1 min-w-0 text-muted-foreground">
                      {t("booking.member.detail.mealAddon")}
                      {order.meal_plan_details.length > 0
                        ? t("booking.member.detail.parenNote", {
                            note: order.meal_plan_details
                              .map((m) => `${m.date ?? ""} × ${m.count ?? 0}`)
                              .join(t("booking.member.detail.listSep")),
                          })
                        : ""}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      NT$ {order.meal_plan_total.toLocaleString()}
                    </span>
                  </div>
                )}
                {(order.custom_addon_details || [])
                  .filter((a) => Number(a?.total || 0) > 0)
                  .map((a, i) => (
                    <div
                      key={`${a.addon_type}-${i}`}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="flex-1 min-w-0 text-muted-foreground">
                        {a.addon_type || t("booking.member.detail.addonItem")}
                        {a.count ? ` × ${a.count}${a.unit_label || ""}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        NT$ {Number(a.total).toLocaleString()}
                      </span>
                    </div>
                  ))}
              </>
            );
          })()}
          {order.discount_amount > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 text-muted-foreground">{t("booking.member.detail.discount")}</span>
              <span className="shrink-0 text-red-500 tabular-nums">
                -NT$ {order.discount_amount.toLocaleString()}
              </span>
            </div>
          )}
          {order.paid_amount > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 text-muted-foreground flex items-center gap-2 flex-wrap">
                {t("booking.member.detail.paidLabel")}
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {t("booking.member.detail.paidLabel")}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-emerald-600">
                NT$ {order.paid_amount.toLocaleString()}
              </span>
            </div>
          )}

          {order.paid_amount <= 0 && atmTransferAmount > 0 && order.payment_status !== "paid" && (() => {
            return (

              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex-1 min-w-0 text-muted-foreground flex items-center gap-2 flex-wrap">
                  {t("booking.member.detail.pendingDeposit")}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      order.order_status === "cancelled"
                        ? "bg-muted text-muted-foreground"
                        : atmExpired
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {order.order_status === "cancelled"
                      ? t("booking.member.detail.badgeCancelled")
                      : atmExpired
                        ? t("booking.member.detail.badgeExpired")
                        : t("booking.member.detail.badgeUnpaid")}
                  </span>
                </span>
                <span
                  className="shrink-0 font-medium tabular-nums"
                  style={{ color: atmExpired ? "hsl(0, 72%, 45%)" : ORANGE }}
                >
                  NT$ {atmTransferAmount.toLocaleString()}
                </span>
              </div>
            );
          })()}

          {(() => {
            const onSiteBalance = paySummary.accommodationBalance;
            if (onSiteBalance <= 0) return null;
            return (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex-1 min-w-0 text-muted-foreground">{t("booking.member.detail.onSiteBalance")}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  NT$ {onSiteBalance.toLocaleString()}
                </span>
              </div>
            );
          })()}
        </div>

        {/* 總金額 */}
        <div className="border-t border-border px-4 py-3 flex items-baseline justify-between bg-muted/30">
          <span className="text-sm text-muted-foreground">{t("booking.member.detail.total")}</span>
          <span className="text-xl font-bold" style={{ color: ORANGE }}>
            NT$ {order.final_price.toLocaleString()}
          </span>
        </div>

        {policyLines.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-sm font-medium">{t("booking.member.detail.cancellationPolicy")}</p>
            <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground leading-relaxed">
              {policyLines.map((line, i) => (
                <li key={i}>
                  {tf({ table: "booking_settings", column: "cancellation_policy", id: `${order.accommodation_id}:${i}`, text: line })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>


      {/* 2. 住宿詳情 */}
      <Section>
        <h3 className="text-base font-semibold">{t("booking.member.detail.stayDetails")}</h3>

        <div className="mt-3 flex gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold leading-snug">
              {tf({ table: "accommodation_info", column: "name", id: order.accommodation_id, text: order.accommodation_name })}
            </h2>
            <button
              onClick={() => navigate(detailPath)}
              className="mt-1 text-sm underline text-muted-foreground"
            >
              {t("booking.member.detail.viewStayPage")}
            </button>
          </div>
          {order.accommodation_photo && (
            <img
              src={order.accommodation_photo}
              alt={order.accommodation_name}
              className="h-16 w-20 rounded-lg object-cover shrink-0"
              loading="lazy"
            />
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {order.accommodation_phone && (
            <a
              href={`tel:${order.accommodation_phone}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm"
            >
              <Phone className="h-4 w-4" /> {t("booking.member.detail.callAcc")}
            </a>
          )}
          {order.accommodation_email && (
            <a
              href={`mailto:${order.accommodation_email}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm"
            >
              <Mail className="h-4 w-4" /> {t("booking.member.detail.emailAcc")}
            </a>
          )}
        </div>

        <div className="mt-4 flex gap-2.5">
          <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              {format(new Date(order.check_in_date), t("booking.member.fmt.fullDateWeek"), { locale: dateLocale })} —{" "}
              {format(new Date(order.check_out_date), t("booking.member.fmt.monthDayWeekFull"), { locale: dateLocale })}
              <span className="mx-1.5 text-muted-foreground/50">|</span>
              {t("booking.member.detail.nights", { nights })}
            </p>
            {(order.check_in_time || order.check_out_time) && (
              <p className="mt-1 text-muted-foreground">
                {order.check_in_time && <>{t("booking.member.detail.checkInTime", { time: order.check_in_time })}</>}
                {order.check_in_time && order.check_out_time && <br />}
                {order.check_out_time && <>{t("booking.member.detail.checkOutTime", { time: order.check_out_time })}</>}
              </p>
            )}
          </div>
        </div>

        {order.accommodation_address && (
          <div className="mt-3 flex gap-2.5">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{t("booking.member.detail.location")}</p>
              <p className="text-muted-foreground">
                {tf({ table: "accommodation_info", column: "address", id: order.accommodation_id, text: order.accommodation_address })}
              </p>
              <a
                className="underline text-muted-foreground"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  order.accommodation_address
                )}`}
              >
                {t("booking.member.detail.viewMap")}
              </a>
            </div>
          </div>
        )}

        {order.facilities.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/70 flex gap-2.5">
            <LayoutGrid className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm min-w-0">
              <p className="font-medium">{t("booking.member.detail.facilities")}</p>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                {order.facilities
                  .map((f, i) => tf({ table: "accommodation_facilities", column: "facility_name", id: `${order.accommodation_id}:${i}`, text: f }))
                  .join(t("booking.member.detail.facilitySep"))}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border/70 flex gap-2.5">
          <KeyRound className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm min-w-0">
            <p className="font-medium">
              {order.check_in_title
                ? tf({ table: "booking_settings", column: "check_in_section_title", id: order.accommodation_id, text: order.check_in_title })
                : t("booking.member.detail.howToCheckIn")}
            </p>
            <div className="mt-1 space-y-1 text-muted-foreground leading-relaxed">
              {order.check_in_subtitle && (
                <p>
                  {tf({ table: "booking_settings", column: "check_in_section_subtitle", id: order.accommodation_id, text: order.check_in_subtitle })}
                </p>
              )}
              {order.check_in_time && <p>{t("booking.member.detail.checkInTime", { time: order.check_in_time })}</p>}
              {order.check_out_time && <p>{t("booking.member.detail.checkOutTime", { time: order.check_out_time })}</p>}
              {otherNoteLines.map((line, i) => (
                <p key={i}>
                  {tf({ table: "booking_settings", column: "other_notes", id: `${order.accommodation_id}:${i}`, text: line })}
                </p>
              ))}
              {order.accommodation_phone && (
                <p>{t("booking.member.detail.callBefore", { phone: order.accommodation_phone })}</p>
              )}
            </div>
          </div>
        </div>

        {order.atm_vacc_no && (
          <div className="mt-4 pt-4 border-t border-border/70">
            <AtmVirtualAccountCard
              bankCode={order.atm_vacc_bank_code}
              vaccNo={order.atm_vacc_no}
              expireAt={order.atm_expire_at}
              amount={atmTransferAmount}

              amountLabel={
                order.notes?.match(/的\s*(\d+)%/)
                  ? t("booking.member.atm.transferAmountWithPct", { pct: order.notes.match(/的\s*(\d+)%/)![1] })
                  : t("booking.member.atm.transferAmount")
              }
            />
          </div>
        )}

        {guestNotes && (
          <div className="mt-4 pt-4 border-t border-border/70 flex gap-2.5">
            <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm min-w-0">
              <p className="font-medium">{t("booking.member.detail.specialRequests")}</p>
              <p className="mt-1 text-muted-foreground whitespace-pre-line leading-relaxed">
                {guestNotes}
              </p>
            </div>
          </div>
        )}

      </Section>

      {/* 3. 旅客資訊 */}
      <Section>
        <h3 className="text-base font-semibold">{t("booking.member.detail.guestInfo")}</h3>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" /> {order.guest_name}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" /> {maskPhone(order.guest_phone)}
          </p>
          {order.guest_email && (
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" /> {maskEmail(order.guest_email)}
            </p>
          )}
        </div>
      </Section>

      {/* 4. 紅利 */}
      {!cancelled && (
        <Section>
          <h3 className="text-base font-semibold">{t("booking.member.detail.rewards")}</h3>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4" style={{ color: ORANGE }} />
            <span style={{ color: ORANGE }}>{t("booking.member.detail.rewardPoints", { points: points.toLocaleString() })}</span>
          </p>
          <button
            onClick={() => navigate("/member/points")}
            className="mt-2 text-sm underline text-muted-foreground"
          >
            {t("booking.member.detail.viewPoints")}
          </button>
        </Section>
      )}

      {/* Bottom actions */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2.5 sm:static sm:bottom-auto sm:border-0 sm:bg-transparent sm:px-0">
        <div className="max-w-4xl mx-auto grid grid-cols-4 gap-2">
          <button
            disabled={cancelled || acting}
            onClick={openCancel}
            className="rounded-lg py-2.5 text-sm font-medium bg-muted text-muted-foreground disabled:opacity-50"
          >
            {t("booking.member.detail.cancelOrder")}
          </button>
          <button
            disabled={cancelled || acting}
            onClick={() => {
              setNewCheckIn(order.check_in_date);
              setNewCheckOut(order.check_out_date);
              setNewGuests(order.guest_count);
              setGuestQuote(null);
              setPriceChangeAck(false);
              setChangeOpen(true);
            }}

            className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: ORANGE }}
          >
            {t("booking.member.detail.changeOrder")}
          </button>
          <button
            disabled={cancelled}
            onClick={() => navigate(`${detailPath}?checkIn=${order.check_out_date}&checkOut=${extendCheckOut}`)}
            className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: ORANGE }}
          >
            {t("booking.member.detail.extendStay")}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-lg py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: ORANGE }}
              >
                {t("booking.member.detail.manageOrder")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-popover z-50">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard?.writeText(order.order_number);
                  toast.success(t("booking.member.detail.copiedOrderNumber"));
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> {t("booking.member.detail.copyOrderNumber")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={share}>
                <Share2 className="h-4 w-4 mr-2" /> {t("booking.member.detail.shareLink")}
              </DropdownMenuItem>
              {order.accommodation_phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${order.accommodation_phone}`}>
                    <Phone className="h-4 w-4 mr-2" /> {t("booking.member.detail.callStay")}
                  </a>
                </DropdownMenuItem>
              )}
              {order.accommodation_email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${order.accommodation_email}`}>
                    <Mail className="h-4 w-4 mr-2" /> {t("booking.member.detail.emailStay")}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/member/messages")}>
                <MessageSquare className="h-4 w-4 mr-2" /> {t("booking.member.detail.contactSupport")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(detailPath)}>
                <LayoutGrid className="h-4 w-4 mr-2" /> {t("booking.member.detail.bookAgain")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 取消訂單確認 */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("booking.member.cancel.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                {quoteLoading && <p className="text-sm text-muted-foreground">{t("booking.member.cancel.quoting")}</p>}
                {cancelQuote && (
                  <div className="rounded-md border p-3 space-y-1.5">
                    <p className="text-sm">
                      {t("booking.member.cancel.daysBefore", {
                        days: cancelQuote.daysBefore,
                        percent: cancelQuote.percent,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{cancelQuote.label}</p>
                    <div className="flex justify-between text-sm pt-1 border-t">
                      <span className="text-muted-foreground">{t("booking.member.cancel.fee")}</span>
                      <span className="font-semibold text-foreground">NT$ {cancelQuote.feeAmount.toLocaleString()}</span>
                    </div>
                    {order.paid_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("booking.member.cancel.refund")}</span>
                        <span className="font-semibold text-foreground">NT$ {cancelQuote.refundAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {cancelQuote.freeCancel && (
                      <p className="text-xs text-primary font-medium">{t("booking.member.cancel.free")}</p>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">{t("booking.member.cancel.warning")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>{t("booking.member.cancel.keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
            >
              {acting ? t("booking.member.cancel.processing") : t("booking.member.cancel.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 更改訂單 */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("booking.member.change.title")}</DialogTitle>
            <DialogDescription>{t("booking.member.change.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("booking.member.change.checkInLabel")}</label>
                <input
                  type="date"
                  value={newCheckIn}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setNewCheckIn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("booking.member.change.checkOutLabel")}</label>
                <input
                  type="date"
                  value={newCheckOut}
                  min={newCheckIn}

                  onChange={(e) => setNewCheckOut(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("booking.member.change.guestsLabel")}</label>
              <input
                type="number"
                min={1}
                max={30}
                value={newGuests}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setNewGuests(n);
                  void fetchGuestQuote(n);
                }}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base"
              />
            </div>

            {guestQuoteLoading && (
              <p className="text-xs text-muted-foreground">{t("booking.member.change.quoteLoading")}</p>
            )}

            {!guestQuoteLoading && guestQuote?.needsManualReview && newGuests !== order.guest_count && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {guestQuote.reason || t("booking.member.change.manualReview")}
                {Number(order.paid_amount || 0) > 0 && t("booking.member.change.paidSuffix")}
              </p>
            )}


            {!guestQuoteLoading && guestPriceChanged && guestQuote && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1.5">
                <p className="font-medium text-foreground">{t("booking.member.change.priceRecalc")}</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("booking.member.change.plan")}</span>
                  <span>
                    {guestQuote.currentPackageName || "-"} → {guestQuote.newPackageName || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("booking.member.detail.roomFee", { nights: guestQuote.nights })}</span>
                  <span>
                    NT${guestQuote.currentRoomTotal.toLocaleString()} → NT$
                    {guestQuote.newRoomTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("booking.member.change.paidAmount")}</span>
                  <span>NT${guestQuote.paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold" style={{ color: ORANGE }}>
                  <span>{guestQuote.diff > 0 ? t("booking.member.change.needExtra") : t("booking.member.change.refundDiff")}</span>
                  <span>NT${Math.abs(guestQuote.diff).toLocaleString()}</span>
                </div>
                <p className="text-muted-foreground">
                  {guestQuote.newOutstanding > 0
                    ? t("booking.member.change.newTotalNeedPay", {
                        total: guestQuote.newFinalPrice.toLocaleString(),
                        outstanding: guestQuote.newOutstanding.toLocaleString(),
                      })
                    : t("booking.member.change.newTotalNoPay", {
                        total: guestQuote.newFinalPrice.toLocaleString(),
                      })}
                </p>
                {fullyPaid ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-400">
                    {t("booking.member.change.fullyPaidNote")}
                  </p>
                ) : (
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={priceChangeAck}
                      onChange={(e) => setPriceChangeAck(e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      {guestQuote.diff > 0
                        ? t("booking.member.change.ackExtra")
                        : t("booking.member.change.ackRefund")}
                    </span>
                  </label>
                )}
              </div>
            )}

            {dateChangeLocked ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t("booking.member.change.lockedNote")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("booking.member.change.unlockedNote")}
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              disabled={
                acting ||
                guestQuoteLoading ||
                (newGuests !== order.guest_count &&
                  !guestChangeBlocked &&
                  guestPriceChanged &&
                  !priceChangeAck)
              }
              onClick={handleChange}
              className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: ORANGE }}
            >
              {acting
                ? t("booking.member.change.submitting")
                : dateChangeLocked &&
                    (newCheckIn !== order.check_in_date || newCheckOut !== order.check_out_date)
                  ? t("booking.member.change.submitRequest")
                  : t("booking.member.change.submitConfirm")}
            </button>
          </DialogFooter>

        </DialogContent>
      </Dialog>


    </div>
  );
};

const MemberOrderDetail = () => (
  <BookingLocaleProvider>
    <MemberOrderDetailInner />
  </BookingLocaleProvider>
);

export default MemberOrderDetail;
