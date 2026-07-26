import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

import { zhTW } from "date-fns/locale";
import { toast } from "sonner";

const ORANGE = "hsl(24,100%,50%)";

const statusLabels: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  on_hold: "保留中",
  checked_in: "入住中",
  checked_out: "已完成",
  cancelled: "已取消",
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

/** 只取出客人自己填寫的特殊需求，濾掉系統寫入的 [訂金制] / [ATM] / [TapPay] 等後台備註 */
const extractGuestNotes = (notes?: string | null): string => {
  if (!notes) return "";
  return notes
    .split("\n")
    .map((line) => {
      let s = line.trim();
      if (!s) return "";
      s = s.replace(/^\[訂金制\][\s\S]*?入住現場付清\s*/, "").trim();
      s = s.replace(/^\[TapPay[^\]]*\]\s*/, "").trim();
      if (/^\[[^\]]+\]/.test(s)) return "";
      return s;
    })
    .filter(Boolean)
    .join("\n");
};

const BANK_NAMES: Record<string, string> = { "822": "中國信託商業銀行" };

const CopyField = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
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
      aria-label={`複製${label}`}
      onClick={() => {
        navigator.clipboard.writeText(value.replace(/[^\dA-Za-z]/g, ""));
        toast.success("已複製");
      }}
      className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
    >
      <Copy className="h-4 w-4" />
    </button>
  </div>
);

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
        <Building2 className="h-4 w-4" style={{ color: ORANGE }} /> ATM 虛擬帳號
      </p>

      {expire && (
        <div
          className="mt-3 rounded-xl border p-3"
          style={{ borderColor: "hsl(24,100%,80%)", background: "hsl(24,100%,97%)" }}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" style={{ color: ORANGE }} />
            {expired ? "繳費期限已到期" : "繳費期限倒數計時"}
          </p>
          {!expired && (
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: ORANGE }}>
              {days} 天 {hours} 小時 {mins} 分
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            期限：{format(expire, "yyyy/M/d aa h:mm", { locale: zhTW })}
          </p>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check className="h-4 w-4" style={{ color: ORANGE }} /> 虛擬帳號已開立
        </p>
        <p className="mt-1 text-xs text-muted-foreground">請於繳費期限前以 ATM、網路銀行或臨櫃匯款。</p>
        <div className="mt-3 space-y-2">
          <CopyField
            label={`銀行代碼${bankCode && BANK_NAMES[bankCode] ? `（${BANK_NAMES[bankCode]}）` : ""}`}
            value={bankCode || "—"}
          />
          <CopyField label="虛擬帳號" value={vaccNo} />
          <CopyField label={amountLabel} value={`NT$ ${amount.toLocaleString()}`} highlight />
        </div>
        {expire && (
          <div
            className="mt-3 rounded-xl border p-3 text-xs"
            style={{ borderColor: "hsl(45,90%,80%)", background: "hsl(45,100%,96%)" }}
          >
            <p className="font-medium">繳費期限</p>
            <p className="mt-0.5 font-semibold">
              {format(expire, "yyyy年M月d日 aa h:mm", { locale: zhTW })}
            </p>
            <p className="mt-0.5" style={{ color: ORANGE }}>逾期未繳款訂單將自動取消。</p>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">系統收到入帳通知後將自動更新訂單狀態，無需另行通知。</p>
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
  notes: string | null;
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


const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card rounded-2xl border border-border px-4 py-4">{children}</div>
);

const MemberOrderDetail = () => {
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

  const [changeOpen, setChangeOpen] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [newGuests, setNewGuests] = useState(1);


  useEffect(() => {
    const load = async () => {
      if (!orderNumber) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, order_status, payment_status, check_in_date, check_out_date, guest_name, guest_phone, guest_email, guest_count, total_price, discount_amount, final_price, paid_amount, deposit_required_amount, notes, accommodation_id, room_type_id, package_id, room_types(name)"
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
          .order("category", { ascending: true }),
      ]);

      setOrder({
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
        notes: data.notes,
        accommodation_id: data.accommodation_id,
        accommodation_name: acc?.name || "",
        accommodation_address: acc?.address || null,
        accommodation_phone: acc?.phone || null,
        accommodation_email: acc?.email || null,
        accommodation_photo: accPhotos?.[0]?.photo_url || null,
        short_url_alias: acc?.short_url_alias || null,
        room_type_name: (data as any).room_types?.name || null,
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
      });

      setLoading(false);
    };
    load();
  }, [orderNumber, reloadKey]);

  const nights = useMemo(() => {
    if (!order) return 0;
    return differenceInCalendarDays(new Date(order.check_out_date), new Date(order.check_in_date));
  }, [order]);

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
        <p className="text-sm text-muted-foreground">找不到這筆訂單</p>
        <button
          onClick={() => navigate("/member/orders")}
          className="px-4 py-2 rounded-full border text-sm font-medium"
          style={{ borderColor: ORANGE, color: ORANGE }}
        >
          回訂房紀錄
        </button>
      </div>
    );
  }

  const statusLabel = statusLabels[order.order_status] || order.order_status;
  const cancelled = order.order_status === "cancelled";
  const points = Math.round(order.final_price * 0.04);
  const balance = Math.max(order.final_price - order.paid_amount, 0);
  const detailPath = order.short_url_alias ? `/${order.short_url_alias}` : `/booking/${order.accommodation_id}`;
  const extendCheckOut = format(addDays(new Date(order.check_out_date), 1), "yyyy-MM-dd");

  const runAction = async (payload: Record<string, unknown>, onDone?: () => void) => {
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("member-order-manage", {
        body: { orderNumber: order.order_number, ...payload },
      });
      const res = (data || {}) as { success?: boolean; message?: string };
      if (error || !res.success) {
        toast.error(res.message || error?.message || "操作失敗，請稍後再試");
        return;
      }
      toast.success(res.message || "已完成");
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


  const handleChange = async () => {
    const datesChanged =
      newCheckIn !== order.check_in_date || newCheckOut !== order.check_out_date;
    const guestsChanged = newGuests !== order.guest_count;
    if (!datesChanged && !guestsChanged) {
      toast.error("沒有任何變更");
      return;
    }
    if (datesChanged) {
      await runAction({ action: "change_dates", newCheckIn, newCheckOut });
    }
    if (guestsChanged) {
      await runAction({ action: "change_guests", guestCount: newGuests });
    }
    setChangeOpen(false);
  };



  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `訂單 ${order.order_number}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("已複製訂單連結");
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => navigate("/member/orders")}
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium">訂單編號 {order.order_number}</p>
        </div>
        <button onClick={share} className="p-1 text-muted-foreground hover:text-foreground" aria-label="分享">
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* 1. 訂單摘要 */}
      <div className="rounded-2xl px-4 py-5 bg-orange-50 border border-orange-100">
        <h1 className={`text-2xl font-bold ${cancelled ? "text-red-500" : ""}`} style={cancelled ? undefined : { color: ORANGE }}>
          {statusLabel}
        </h1>
        {order.guest_email && !cancelled && (
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            我們已寄發訂單確認函至 {maskEmail(order.guest_email)}。
          </p>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(order.order_number);
            toast.success("已複製訂單編號");
          }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Copy className="h-3.5 w-3.5" /> 複製訂單編號
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-border text-center">
          <p className="text-lg font-extrabold tracking-wide" style={{ color: ORANGE }}>
            {order.accommodation_name}
          </p>
        </div>

        {/* 日期列 */}
        <div className="px-4 py-3 flex items-stretch justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">入住</p>
            <p className="text-base font-bold leading-tight">
              {format(new Date(order.check_in_date), "M 月 d 日 EEE", { locale: zhTW })}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-2 shrink-0">
            <div className="h-px w-6 bg-border" />
            <span className="text-xs text-muted-foreground my-1">{nights} 晚</span>
            <div className="h-px w-6 bg-border" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-muted-foreground mb-1">退房</p>
            <p className="text-base font-bold leading-tight">
              {format(new Date(order.check_out_date), "M 月 d 日 EEE", { locale: zhTW })}
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
              ? `房間搭配：${order.room_allocation}`
              : order.package_name || order.room_type_name || "住宿房型"}
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
            <Users className="h-3.5 w-3.5" />
            <span>{order.guest_count} 位大人</span>
          </div>
        </div>

        {/* 尊榮禮遇 */}
        {order.package_includes.length > 0 && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" style={{ color: ORANGE }} />
              <p className="text-sm font-bold">{order.package_subtitle || "尊榮禮遇"}</p>
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
                      {inc.text}
                      {inc.price_note && (
                        <span className="text-muted-foreground ml-1">（{inc.price_note}）</span>
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
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex-1 min-w-0">房費（{nights} 晚）</span>
            <span className="shrink-0 font-semibold tabular-nums">
              NT$ {order.total_price.toLocaleString()}
            </span>
          </div>
          {order.discount_amount > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 text-muted-foreground">折扣</span>
              <span className="shrink-0 text-red-500 tabular-nums">
                -NT$ {order.discount_amount.toLocaleString()}
              </span>
            </div>
          )}
          {order.paid_amount > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 text-muted-foreground">已付款</span>
              <span className="shrink-0 tabular-nums">
                NT$ {order.paid_amount.toLocaleString()}
              </span>
            </div>
          )}
          {balance > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex-1 min-w-0 text-muted-foreground">現場應付尾款</span>
              <span className="shrink-0 font-medium tabular-nums">
                NT$ {balance.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* 總金額 */}
        <div className="border-t border-border px-4 py-3 flex items-baseline justify-between bg-muted/30">
          <span className="text-sm text-muted-foreground">總金額</span>
          <span className="text-xl font-bold" style={{ color: ORANGE }}>
            NT$ {order.final_price.toLocaleString()}
          </span>
        </div>

        {htmlToLines(order.cancellation_policy).length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-sm font-medium">取消政策</p>
            <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground leading-relaxed">
              {htmlToLines(order.cancellation_policy).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>


      {/* 2. 住宿詳情 */}
      <Section>
        <h3 className="text-base font-semibold">住宿詳情</h3>

        <div className="mt-3 flex gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold leading-snug">{order.accommodation_name}</h2>
            <button
              onClick={() => navigate(detailPath)}
              className="mt-1 text-sm underline text-muted-foreground"
            >
              查看住宿頁面
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
              <Phone className="h-4 w-4" /> 電話聯絡
            </a>
          )}
          {order.accommodation_email && (
            <a
              href={`mailto:${order.accommodation_email}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm"
            >
              <Mail className="h-4 w-4" /> 郵件聯絡
            </a>
          )}
        </div>

        <div className="mt-4 flex gap-2.5">
          <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              {format(new Date(order.check_in_date), "yyyy 年 M 月 d 日 EEEE", { locale: zhTW })} —{" "}
              {format(new Date(order.check_out_date), "M 月 d 日 EEEE", { locale: zhTW })}
              <span className="mx-1.5 text-muted-foreground/50">|</span>
              {nights} 晚
            </p>
            {(order.check_in_time || order.check_out_time) && (
              <p className="mt-1 text-muted-foreground">
                {order.check_in_time && <>入住：{order.check_in_time} 後</>}
                {order.check_in_time && order.check_out_time && <br />}
                {order.check_out_time && <>退房：{order.check_out_time} 前</>}
              </p>
            )}
          </div>
        </div>

        {order.accommodation_address && (
          <div className="mt-3 flex gap-2.5">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <p className="font-medium">地點</p>
              <p className="text-muted-foreground">{order.accommodation_address}</p>
              <a
                className="underline text-muted-foreground"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  order.accommodation_address
                )}`}
              >
                查看地圖
              </a>
            </div>
          </div>
        )}

        {order.facilities.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/70 flex gap-2.5">
            <LayoutGrid className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm min-w-0">
              <p className="font-medium">住宿設施</p>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                {order.facilities.join("｜")}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border/70 flex gap-2.5">
          <KeyRound className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm min-w-0">
            <p className="font-medium">{order.check_in_title || "如何辦理入住"}</p>
            <div className="mt-1 space-y-1 text-muted-foreground leading-relaxed">
              {order.check_in_subtitle && <p>{order.check_in_subtitle}</p>}
              {order.check_in_time && <p>入住時間：{order.check_in_time} 後</p>}
              {order.check_out_time && <p>退房時間：{order.check_out_time} 前</p>}
              {htmlToLines(order.other_notes).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {order.accommodation_phone && (
                <p>抵達前請先致電住宿 {order.accommodation_phone} 聯繫辦理入住。</p>
              )}
            </div>
          </div>
        </div>


        {order.notes && (
          <div className="mt-3 pt-3 border-t border-border/70">
            <p className="text-sm font-medium">備註／特殊需求</p>
            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{order.notes}</p>
          </div>
        )}
      </Section>

      {/* 3. 旅客資訊 */}
      <Section>
        <h3 className="text-base font-semibold">旅客資訊</h3>
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
          <h3 className="text-base font-semibold">紅利</h3>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Gift className="h-4 w-4" style={{ color: ORANGE }} />
            <span style={{ color: ORANGE }}>本筆訂單可獲得 {points.toLocaleString()} 點紅利</span>
          </p>
          <button
            onClick={() => navigate("/member/points")}
            className="mt-2 text-sm underline text-muted-foreground"
          >
            查看紅利點數
          </button>
        </Section>
      )}

      {/* Bottom actions */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-3 py-2.5 sm:static sm:bottom-auto sm:border-0 sm:bg-transparent sm:px-0">
        <div className="max-w-4xl mx-auto grid grid-cols-4 gap-2">
          <button
            disabled={cancelled || acting}
            onClick={openCancel}
            className="rounded-lg py-2.5 text-sm font-medium bg-muted text-muted-foreground disabled:opacity-50"
          >
            取消訂單
          </button>
          <button
            disabled={cancelled || acting}
            onClick={() => {
              setNewCheckIn(order.check_in_date);
              setNewCheckOut(order.check_out_date);
              setNewGuests(order.guest_count);
              setChangeOpen(true);
            }}
            className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: ORANGE }}
          >
            更改訂單
          </button>
          <button
            disabled={cancelled}
            onClick={() => navigate(`${detailPath}?checkIn=${order.check_out_date}&checkOut=${extendCheckOut}`)}
            className="rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: ORANGE }}
          >
            延長入住
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-lg py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: ORANGE }}
              >
                管理訂單
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-popover z-50">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard?.writeText(order.order_number);
                  toast.success("已複製訂單編號");
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> 複製訂單編號
              </DropdownMenuItem>
              <DropdownMenuItem onClick={share}>
                <Share2 className="h-4 w-4 mr-2" /> 分享訂單連結
              </DropdownMenuItem>
              {order.accommodation_phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${order.accommodation_phone}`}>
                    <Phone className="h-4 w-4 mr-2" /> 致電住宿
                  </a>
                </DropdownMenuItem>
              )}
              {order.accommodation_email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${order.accommodation_email}`}>
                    <Mail className="h-4 w-4 mr-2" /> 郵件聯絡住宿
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/member/messages")}>
                <MessageSquare className="h-4 w-4 mr-2" /> 聯絡客服
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(detailPath)}>
                <LayoutGrid className="h-4 w-4 mr-2" /> 再次預訂
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 取消訂單確認 */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要取消這筆訂單嗎？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                {quoteLoading && <p className="text-sm text-muted-foreground">正在試算取消費用…</p>}
                {cancelQuote && (
                  <div className="rounded-md border p-3 space-y-1.5">
                    <p className="text-sm">
                      距離入住還有 <span className="font-semibold text-foreground">{cancelQuote.daysBefore}</span> 天，
                      取消扣款比例 <span className="font-semibold text-foreground">{cancelQuote.percent}%</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{cancelQuote.label}</p>
                    <div className="flex justify-between text-sm pt-1 border-t">
                      <span className="text-muted-foreground">取消手續費</span>
                      <span className="font-semibold text-foreground">NT$ {cancelQuote.feeAmount.toLocaleString()}</span>
                    </div>
                    {order.paid_amount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">預計退款</span>
                        <span className="font-semibold text-foreground">NT$ {cancelQuote.refundAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {cancelQuote.freeCancel && (
                      <p className="text-xs text-primary font-medium">符合免費取消，不會扣任何款項。</p>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  取消後無法復原。若卡片已綁定但尚未扣款，系統只會收取上述手續費；若已扣款，將自動退還可退金額。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>再想想</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
            >
              {acting ? "處理中…" : "確認取消訂單"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 更改訂單 */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>更改訂單</DialogTitle>
            <DialogDescription>可調整入住日期與入住人數，送出後將重新確認空房。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">入住日</label>
                <input
                  type="date"
                  value={newCheckIn}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setNewCheckIn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base"
                />
              </div>
              <div>
                <label className="text-sm font-medium">退房日</label>
                <input
                  type="date"
                  value={newCheckOut}
                  min={newCheckIn}
                  onChange={(e) => setNewCheckOut(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">入住人數</label>
              <input
                type="number"
                min={1}
                max={30}
                value={newGuests}
                onChange={(e) => setNewGuests(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-2 text-base"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              已付款訂單無法線上改期，請透過「管理訂單 → 聯絡客服」協助處理。
            </p>
          </div>
          <DialogFooter>
            <button
              disabled={acting}
              onClick={handleChange}
              className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: ORANGE }}
            >
              {acting ? "送出中…" : "確認更改"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
};

export default MemberOrderDetail;
