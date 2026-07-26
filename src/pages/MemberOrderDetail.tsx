import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronDown,
  Loader2,
  MapPin,
  CalendarDays,
  Phone,
  Mail,
  User,
  BedDouble,
  Users,
  Gift,
  Share2,
  Copy,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
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
}

const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card rounded-2xl border border-border px-4 py-4">{children}</div>
);

const MemberOrderDetail = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<DetailData | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!orderNumber) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, order_status, payment_status, check_in_date, check_out_date, guest_name, guest_phone, guest_email, guest_count, total_price, discount_amount, final_price, paid_amount, deposit_required_amount, notes, accommodation_id, room_type_id, room_types(name)"
        )
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (error || !data) {
        setLoading(false);
        setOrder(null);
        return;
      }

      const [{ data: acc }, { data: settings }, { data: accPhotos }, { data: roomPhotos }] =
        await Promise.all([
          supabase
            .from("accommodation_info")
            .select("id, name, address, phone, email, short_url_alias")
            .eq("id", data.accommodation_id)
            .maybeSingle(),
          supabase
            .from("booking_settings")
            .select("check_in_time, check_out_time, cancellation_policy")
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
      });
      setLoading(false);
    };
    load();
  }, [orderNumber]);

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
          <Share2 className="h-4.5 w-4.5 h-5 w-5" />
        </button>
      </div>

      {/* Status hero */}
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

      {/* Payment */}
      <Section>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted-foreground">
            {order.paid_amount > 0 ? "已支付" : "應付金額"}
          </span>
          <span className="text-xl font-bold" style={{ color: ORANGE }}>
            NT${(order.paid_amount > 0 ? order.paid_amount : order.final_price).toLocaleString()}
          </span>
        </div>

        <button
          onClick={() => setPriceOpen((v) => !v)}
          className="mt-2 flex items-center gap-1 text-sm underline text-foreground"
        >
          價格明細
          <ChevronDown className={`h-4 w-4 transition ${priceOpen ? "rotate-180" : ""}`} />
        </button>

        {priceOpen && (
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">房價小計</span>
              <span>NT${order.total_price.toLocaleString()}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">折扣</span>
                <span className="text-red-500">-NT${order.discount_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1.5 border-t border-border/70">
              <span>訂單總額</span>
              <span>NT${order.final_price.toLocaleString()}</span>
            </div>
            {order.paid_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">已付款</span>
                <span>NT${order.paid_amount.toLocaleString()}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">現場應付尾款</span>
                <span className="font-medium">NT${balance.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {order.cancellation_policy && (
          <div className="mt-3 pt-3 border-t border-border/70">
            <p className="text-sm font-medium">取消政策</p>
            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {order.cancellation_policy}
            </p>
          </div>
        )}
      </Section>

      {/* Accommodation */}
      <Section>
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold leading-snug">{order.accommodation_name}</h2>
            <button
              onClick={() => navigate(detailPath)}
              className="mt-1 text-sm underline text-muted-foreground"
            >
              住宿詳情
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

        {/* dates */}
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
      </Section>

      {/* Room */}
      <Section>
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold leading-snug">
              {order.room_type_name || "住宿房型"}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">1 間 {nights} 晚</p>
          </div>
          {order.room_photo_url && (
            <img
              src={order.room_photo_url}
              alt={order.room_type_name || "房型"}
              className="h-16 w-20 rounded-lg object-cover shrink-0"
              loading="lazy"
            />
          )}
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> {order.guest_count} 位旅客
          </p>
          <p className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-muted-foreground" /> 1 間房
          </p>
        </div>
        {order.notes && (
          <div className="mt-3 pt-3 border-t border-border/70">
            <p className="text-sm font-medium">備註／特殊需求</p>
            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{order.notes}</p>
          </div>
        )}
      </Section>

      {/* Guest info */}
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

      {/* Rewards */}
      {!cancelled && (
        <Section>
          <h3 className="text-base font-semibold">獎勵及禮遇</h3>
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
        <div className="max-w-4xl mx-auto flex gap-2">
          <button
            onClick={() => navigate(detailPath)}
            className="flex-1 rounded-full border py-2.5 text-sm font-medium"
            style={{ borderColor: ORANGE, color: ORANGE }}
          >
            再次預訂
          </button>
          <button
            onClick={() => navigate("/member/messages")}
            className="flex-1 rounded-full py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: ORANGE }}
          >
            聯絡客服
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberOrderDetail;
