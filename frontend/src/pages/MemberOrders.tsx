import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShoppingBag,
  Search,
  PackagePlus,
  BedDouble,
  ChevronLeft,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { isMemberPreview, mockOrders } from "@/lib/memberPreviewMock";
import { useOrderRealtime, isOrderPaid } from "@/hooks/use-order-realtime";
import { openFrontendBooking } from "@/lib/frontendUrl";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { OFFLINE_KEYS, readOfflineCache, writeOfflineCache } from "@/lib/native/offlineStore";
import PullToRefresh from "@/components/native/PullToRefresh";
import OfflineBanner from "@/components/native/OfflineBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingLocaleProvider, useBookingLocale } from "@/contexts/BookingLocaleContext";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import { useTranslatedFields, type TranslatableField } from "@/hooks/use-translated-fields";

interface MemberOrder {
  id: string;
  order_number: string;
  order_date: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string | null;
  paid_amount: number;

  final_price: number;
  guest_name: string;
  guest_count: number;
  accommodation_id: string;
  accommodation_name: string;
  room_type_name: string | null;
  room_photo_url: string | null;
  atm_vacc_no: string | null;
  atm_expire_at: string | null;
}

type TabKey = "all" | "upcoming" | "history" | "refunded";

const tabs: { key: TabKey; labelKey: string }[] = [
  { key: "all", labelKey: "booking.member.orders.tab.all" },
  { key: "upcoming", labelKey: "booking.member.orders.tab.upcoming" },
  { key: "history", labelKey: "booking.member.orders.tab.past" },
  { key: "refunded", labelKey: "booking.member.orders.tab.cancelled" },
];

const statusLabelKeys: Record<string, string> = {
  pending: "booking.member.status.pending",
  confirmed: "booking.member.status.confirmed",
  on_hold: "booking.member.status.on_hold",
  checked_in: "booking.member.status.checked_in",
  checked_out: "booking.member.status.checked_out",
  cancelled: "booking.member.status.cancelled",
};

const paymentLabelKeys: Record<string, string> = {
  paid: "booking.member.payment.paid",
  deposit_paid: "booking.member.payment.deposit_paid",
  partial: "booking.member.payment.partial",
  partial_paid: "booking.member.payment.partial",
  refunded: "booking.member.payment.refunded",
  unpaid: "booking.member.payment.unpaid",
  pending_payment: "booking.member.payment.unpaid",
};

const statusColors: Record<string, string> = {
  pending: "text-amber-600",
  confirmed: "text-emerald-600",
  on_hold: "text-sky-600",
  checked_in: "text-sky-600",
  checked_out: "text-muted-foreground",
  cancelled: "text-red-500",
};

const ORANGE = "hsl(24,100%,50%)";

const MemberOrdersInner = () => {
  const navigate = useNavigate();
  const { t, dateLocale } = useBookingLocale();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimOrderNumber, setClaimOrderNumber] = useState("");
  const [claimGuestName, setClaimGuestName] = useState("");
  const [claimPhoneLast4, setClaimPhoneLast4] = useState("");
  const [claiming, setClaiming] = useState(false);

  const native = useIsNativeApp();
  const [usingCache, setUsingCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const hasCacheRef = useRef(false);

  useEffect(() => {
    // 原生 App：先顯示上次快取，避免白屏；再抓最新資料
    let cancelled = false;
    (async () => {
      if (native) {
        const cached = await readOfflineCache<MemberOrder[]>(OFFLINE_KEYS.memberOrders("self"));
        if (!cancelled && cached?.data?.length) {
          setOrders(cached.data);
          setCachedAt(cached.savedAt);
          hasCacheRef.current = true;
          setLoading(false);
        }
      }
      if (!cancelled) await refreshOrders();
    })();
    return () => { cancelled = true; };
  }, [native]);

  useEffect(() => {
    if (searchParams.get("claim") === "1") setClaimOpen(true);
  }, [searchParams]);

  // TapPay 付款回呼寫回 orders 後，即時反映到列表
  useOrderRealtime(
    orders.map((o) => o.id),
    (row) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== row.id) return o;
          const next = {
            ...o,
            payment_status: (row.payment_status as string) ?? o.payment_status,
            order_status: (row.order_status as string) ?? o.order_status,
            paid_amount: Number(row.paid_amount ?? o.paid_amount),
          };
          if (!isOrderPaid(o) && isOrderPaid(next)) {
            toast.success(t("booking.member.orders.paidToast", { order: o.order_number }));
          }
          return next;
        }),
      );
    },
    { enabled: !isMemberPreview() },
  );

  const loadOrders = async () => {
    if (isMemberPreview()) {
      setOrders(mockOrders as any);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      // 離線時無法向伺服器確認身分，維持顯示快取內容
      if (native && hasCacheRef.current) setUsingCache(true);
      return;
    }

    const { data: member, error: memberError } = await supabase
      .from("platform_members")
      .select("id, email, phone, name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      setLoading(false);
      if (native && (memberError || hasCacheRef.current)) setUsingCache(true);
      return;
    }

    // 僅顯示已綁定本會員的訂單。以 Email/電話模糊比對可能撈到他人以相同 Email 下的訂單，
    // 未綁定的歷史訂單請走「認領訂單」（訂單編號＋姓名＋電話末4碼）驗證。
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, order_date, created_at, check_in_date, check_out_date, order_status, payment_status, paid_amount, final_price, guest_name, guest_count, accommodation_id, room_type_id, atm_vacc_no, atm_expire_at, display_room_type_name, room_types(name)"
      )
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(50);


    if (error) {
      console.error(error);
      setLoading(false);
      if (native) setUsingCache(true);
      return;
    }

    const accIds = [...new Set((data || []).map((o) => o.accommodation_id))];
    const { data: accs } = await supabase
      .from("accommodation_info")
      .select("id, name")
      .in("id", accIds);
    const accMap = new Map((accs || []).map((a) => [a.id, a.name]));

    const roomTypeIds = [
      ...new Set((data || []).map((o) => o.room_type_id).filter(Boolean)),
    ];
    const { data: roomPhotos } = roomTypeIds.length
      ? await supabase
          .from("room_photos")
          .select("room_type_id, photo_url, display_order")
          .in("room_type_id", roomTypeIds)
          .order("display_order", { ascending: true })
      : { data: [] };

    const photoMap = new Map<string, string>();
    roomPhotos?.forEach((p) => {
      if (p.room_type_id && !photoMap.has(p.room_type_id)) {
        photoMap.set(p.room_type_id, p.photo_url);
      }
    });

    const bookedAt = (o: any) =>
      new Date(o.order_date || o.created_at || o.check_in_date).getTime();

    const mapped: MemberOrder[] = [...(data || [])]
      .sort((a: any, b: any) => bookedAt(b) - bookedAt(a))
      .map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        order_date: o.order_date,
        check_in_date: o.check_in_date,
        check_out_date: o.check_out_date,
        order_status: o.order_status,
        payment_status: o.payment_status ?? null,
        paid_amount: Number(o.paid_amount || 0),
        final_price: o.final_price,
        guest_name: o.guest_name,
        guest_count: o.guest_count || 1,
        accommodation_id: o.accommodation_id,
        accommodation_name: accMap.get(o.accommodation_id) || "",
        room_type_name: o.room_types?.name || o.display_room_type_name || null,
        room_photo_url: o.room_type_id ? photoMap.get(o.room_type_id) || null : null,
        atm_vacc_no: o.atm_vacc_no ?? null,
        atm_expire_at: o.atm_expire_at ?? null,
      }));

    setOrders(mapped);
    if (native) { hasCacheRef.current = true; void writeOfflineCache(OFFLINE_KEYS.memberOrders("self"), mapped); }

    setUsingCache(false);
    setCachedAt(null);
    setLoading(false);
  };

  // 抓資料失敗（例如離線）時保留快取內容並標記離線模式
  const refreshOrders = async () => {
    try {
      await loadOrders();
    } catch (e) {
      console.error(e);
      if (native) setUsingCache(true);
      setLoading(false);
    }
  };

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (activeTab === "all") return true;
      if (activeTab === "refunded") return o.order_status === "cancelled";
      if (activeTab === "history")
        return o.order_status !== "cancelled" && isPast(o.check_out_date);
      // upcoming
      return o.order_status !== "cancelled" && !isPast(o.check_out_date);
    });
  }, [orders, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: orders.length, upcoming: 0, history: 0, refunded: 0 };
    orders.forEach((o) => {
      if (o.order_status === "cancelled") counts.refunded++;
      else if (isPast(o.check_out_date)) counts.history++;
      else counts.upcoming++;
    });
    return counts;
  }, [orders]);

  const handleClaim = async () => {
    const last4 = claimPhoneLast4.replace(/\D/g, "");
    if (!claimOrderNumber.trim() || !claimGuestName.trim() || last4.length !== 4) {
      toast.error(t("booking.member.claim.invalid"));
      return;
    }
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-order", {
        body: {
          order_number: claimOrderNumber.trim(),
          guest_name: claimGuestName.trim(),
          phone_last4: last4,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || t("booking.member.claim.failed"));
        setClaiming(false);
        return;
      }
      toast.success(t("booking.member.claim.success", { order: data.order_number }));
      setClaimOpen(false);
      setClaimOrderNumber("");
      setClaimGuestName("");
      setClaimPhoneLast4("");
      const returnTo = searchParams.get("returnTo");
      if (returnTo?.startsWith("/")) {
        navigate(returnTo);
        return;
      }
      setLoading(true);
      await loadOrders();
    } catch {
      toast.error(t("booking.member.claim.failed"));
    } finally {
      setClaiming(false);
    }
  };

  const activeTabLabel = t(
    tabs.find((tab) => tab.key === activeTab)?.labelKey || "booking.member.orders.tab.all",
  );

  // 動態內容（後台維護的中文）自動翻譯：僅顯示層，不影響任何查詢或狀態
  const translatableFields = useMemo<TranslatableField[]>(() => {
    const fields: TranslatableField[] = [];
    const seen = new Set<string>();
    filteredOrders.forEach((o) => {
      if (o.accommodation_name && !seen.has(`a:${o.accommodation_id}`)) {
        seen.add(`a:${o.accommodation_id}`);
        fields.push({
          table: "accommodation_info",
          column: "name",
          id: o.accommodation_id,
          text: o.accommodation_name,
        });
      }
      if (o.room_type_name && !seen.has(`r:${o.room_type_name}`)) {
        seen.add(`r:${o.room_type_name}`);
        fields.push({
          table: "room_types",
          column: "name",
          id: o.room_type_name,
          text: o.room_type_name,
        });
      }
    });
    return fields;
  }, [filteredOrders]);
  const { tf } = useTranslatedFields(translatableFields);

  return (
    <div className="-mx-4 -mt-4">
      {/* Sticky header — back / title / search */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center h-12 px-2">
          <button
            onClick={() => navigate("/member/profile")}
            className="p-2 -ml-1 text-foreground"
            aria-label={t("booking.member.back")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold">{activeTabLabel}</h1>
          <BookingLanguageSwitch className="mr-1" />
          <button
            onClick={() => setClaimOpen(true)}
            className="p-2 -mr-1 text-foreground"
            aria-label={t("booking.member.orders.search")}
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {/* Underline tabs */}
        <div className="flex gap-1 px-2 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors"
                style={{
                  color: active ? ORANGE : "hsl(var(--muted-foreground))",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {t(tab.labelKey)}
                {tabCounts[tab.key] > 0 && (
                  <span className="ml-1 text-xs opacity-80">({tabCounts[tab.key]})</span>
                )}
                {active && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[2px] w-6 rounded-full"
                    style={{ background: ORANGE }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-3 py-2.5 overflow-x-auto scrollbar-none border-t">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-xs text-foreground bg-background whitespace-nowrap">
            <SlidersHorizontal className="h-3 w-3" /> {t("booking.member.orders.filter")}
          </button>
          <button className="px-3 py-1.5 rounded-full border text-xs whitespace-nowrap"
            style={{ borderColor: ORANGE, color: ORANGE, background: "hsl(24 100% 50% / 0.06)" }}>
            {t("booking.member.orders.type.stay")}
          </button>
        </div>
      </div>

      {/* Body */}
      <OfflineBanner show={native && usingCache} cachedAt={cachedAt} />
      <PullToRefresh onRefresh={refreshOrders}>
      <div className="px-3 py-3">
        {loading ? (
          native ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border p-3 space-y-2">
                  <div className="flex gap-3">
                    <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {activeTab === "all" ? t("booking.member.orders.empty") : t("booking.member.orders.emptyFiltered")}
            </p>
            {activeTab === "all" && (
              <Button variant="outline" size="sm" onClick={() => setClaimOpen(true)}>
                <PackagePlus className="h-4 w-4 mr-1.5" />
                {t("booking.member.orders.claim")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const nights = differenceInCalendarDays(
                new Date(order.check_out_date),
                new Date(order.check_in_date)
              );
              const statusLabel = statusLabelKeys[order.order_status]
                ? t(statusLabelKeys[order.order_status])
                : order.order_status;
              const statusColor = statusColors[order.order_status] || "text-muted-foreground";
              const past = isPast(order.check_out_date);
              const cancelled = order.order_status === "cancelled";
              const paidAmount = Math.max(0, Number(order.paid_amount || 0));

              const atmExpired =
                !cancelled &&
                !isOrderPaid(order) &&
                !!order.atm_vacc_no &&
                !!order.atm_expire_at &&
                new Date(order.atm_expire_at).getTime() < Date.now();

              const paymentLabel = atmExpired
                ? t("booking.member.payment.expired")
                : paymentLabelKeys[order.payment_status || ""]
                  ? t(paymentLabelKeys[order.payment_status || ""])
                  : t(isOrderPaid(order) ? "booking.member.payment.paid" : "booking.member.payment.unpaid");
              const paymentClass = atmExpired
                ? "bg-red-50 text-red-600"
                : order.payment_status === "paid"
                  ? "bg-emerald-50 text-emerald-700"
                  : isOrderPaid(order)
                    ? "bg-sky-50 text-sky-700"
                    : "bg-amber-50 text-amber-700";
              const pointsEarned = Math.round(order.final_price * 0.04);
              const earnedLabel =
                past || order.order_status === "checked_out"
                  ? t("booking.member.orders.earned")
                  : t("booking.member.orders.willEarn");

              return (
                <button
                  key={order.id}
                  onClick={() => navigate(`/member/orders/${order.order_number}`)}
                  className="w-full text-left bg-card rounded-2xl border border-border overflow-hidden active:scale-[0.99] transition"
                >
                  {/* Card head: type + status */}
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <BedDouble className="h-4 w-4" style={{ color: ORANGE }} />
                      <span>{t("booking.member.orders.type.stay")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!cancelled && paymentLabel && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${paymentClass}`}>{paymentLabel}</span>
                      )}
                      <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-4 pb-4">
                    <h3 className="text-[15px] font-semibold text-foreground leading-snug">
                      {tf({
                        table: "accommodation_info",
                        column: "name",
                        id: order.accommodation_id,
                        text: order.accommodation_name,
                      })}
                    </h3>
                    {order.room_type_name && (
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {tf({
                          table: "room_types",
                          column: "name",
                          id: order.room_type_name,
                          text: order.room_type_name,
                        })}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {format(new Date(order.check_in_date), t("booking.member.fmt.monthDayCompact"), { locale: dateLocale })}
                      {" - "}
                      {format(new Date(order.check_out_date), t("booking.member.fmt.monthDayCompact"), { locale: dateLocale })}
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      {t("booking.member.orders.roomNights", { nights })}
                    </p>

                    {/* Points earned */}
                    {!cancelled && (
                      <div className="mt-1.5 flex items-center gap-1 text-sm" style={{ color: ORANGE }}>
                        <span>
                          {t("booking.member.orders.earnedLine", {
                            label: earnedLabel,
                            points: t("booking.member.orders.pointsValue", { points: pointsEarned }),
                          })}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    )}

                    {/* Price line */}
                    <div className="mt-3 flex items-end justify-between">
                      <div className="flex-1" />
                      <div className="text-right">
                        {cancelled ? (
                          paidAmount > 0 ? (
                            <>
                              <p className="text-sm text-muted-foreground line-through">
                                {t("booking.member.orders.prepaidStrike", { amount: paidAmount.toLocaleString() })}
                              </p>
                              <p className="text-sm font-medium text-red-500 mt-0.5">
                                {order.payment_status === "refunded"
                                  ? t("booking.member.orders.refundedAmount", { amount: paidAmount.toLocaleString() })
                                  : t("booking.member.orders.orderCancelled")}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground">
                                {t("booking.member.orders.orderAmount", { amount: order.final_price.toLocaleString() })}
                              </p>
                              <p className="text-sm font-medium text-red-500 mt-0.5">
                                {t("booking.member.orders.unpaidCancelled")}
                              </p>
                            </>
                          )
                        ) : paidAmount > 0 && paidAmount < order.final_price ? (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {t("booking.member.orders.depositPrepaid")}{" "}
                              <span className="text-foreground font-bold text-base ml-1">
                                NT${paidAmount.toLocaleString()}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("booking.member.orders.balanceOnSite", { amount: (order.final_price - paidAmount).toLocaleString() })}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {paidAmount > 0 ? t("booking.member.orders.prepaidLabel") : t("booking.member.orders.amountLabel")}{" "}
                            <span className="text-foreground font-bold text-base ml-1">
                              NT${order.final_price.toLocaleString()}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>


                    {/* Action buttons */}
                    <div className="mt-3 pt-3 border-t border-border/70 flex justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openFrontendBooking(order.accommodation_id, { navigate });
                        }}
                        className="px-4 py-1.5 rounded-full border text-sm font-medium"
                        style={{ borderColor: ORANGE, color: ORANGE }}
                      >
                        {t("booking.member.orders.bookAgain")}
                      </button>
                      {past && !cancelled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/member/orders/${order.order_number}?review=1`);
                          }}
                          className="px-4 py-1.5 rounded-full border text-sm font-medium"
                          style={{ borderColor: ORANGE, color: ORANGE }}
                        >
                          {t("booking.member.orders.writeReview")}
                        </button>
                      )}
                      {!past && !cancelled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/member/orders/${order.order_number}`);
                          }}
                          className="px-4 py-1.5 rounded-full border text-sm font-medium"
                          style={{ borderColor: ORANGE, color: ORANGE }}
                        >
                          {t("booking.member.orders.modify")}
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
              {t("booking.member.orders.allShown", { tab: activeTabLabel })}
            </p>
          </div>
        )}
      </div>
      </PullToRefresh>

      {/* Claim Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t("booking.member.claim.title")}
            </DialogTitle>
            <DialogDescription className="text-left">
              {t("booking.member.claim.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("booking.member.claim.orderNumber")}</Label>
              <Input
                placeholder={t("booking.member.claim.orderNumberPlaceholder")}
                value={claimOrderNumber}
                onChange={(e) => setClaimOrderNumber(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("booking.member.claim.guestName")}</Label>
              <Input
                placeholder={t("booking.member.claim.guestNamePlaceholder")}
                value={claimGuestName}
                onChange={(e) => setClaimGuestName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("booking.member.claim.phone")}</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder={t("booking.member.claim.phonePlaceholder")}
                value={claimPhoneLast4}
                onChange={(e) =>
                  setClaimPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="font-mono tracking-widest"
              />
            </div>
            <Button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full text-white"
              style={{ background: ORANGE }}
            >
              {claiming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {claiming ? t("booking.member.claim.submitting") : t("booking.member.claim.submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MemberOrders = () => (
  <BookingLocaleProvider>
    <MemberOrdersInner />
  </BookingLocaleProvider>
);

export default MemberOrders;
