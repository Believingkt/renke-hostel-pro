import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { isMemberPreview, mockOrders } from "@/lib/memberPreviewMock";

interface MemberOrder {
  id: string;
  order_number: string;
  order_date: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  final_price: number;
  guest_name: string;
  guest_count: number;
  accommodation_id: string;
  accommodation_name: string;
  room_type_name: string | null;
  room_photo_url: string | null;
}

type TabKey = "all" | "upcoming" | "history" | "refunded";

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "所有訂單" },
  { key: "upcoming", label: "待出發" },
  { key: "history", label: "歷史" },
  { key: "refunded", label: "已取消" },
];

const statusLabels: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  on_hold: "保留中",
  checked_in: "入住中",
  checked_out: "已完成",
  cancelled: "已取消",
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

const MemberOrders = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimOrderNumber, setClaimOrderNumber] = useState("");
  const [claimGuestName, setClaimGuestName] = useState("");
  const [claimPhoneLast4, setClaimPhoneLast4] = useState("");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    if (isMemberPreview()) {
      setOrders(mockOrders as any);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, email, phone, name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) { setLoading(false); return; }

    const conditions: string[] = [`member_id.eq.${member.id}`];
    if (member.email) conditions.push(`guest_email.eq.${member.email}`);
    if (member.phone) conditions.push(`guest_phone.eq.${member.phone}`);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, order_date, check_in_date, check_out_date, order_status, final_price, guest_name, guest_count, accommodation_id, room_type_id, room_types(name)"
      )
      .or(conditions.join(","))
      .order("check_in_date", { ascending: false })
      .limit(50);

    if (error) { console.error(error); setLoading(false); return; }

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

    setOrders(
      (data || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        order_date: o.order_date,
        check_in_date: o.check_in_date,
        check_out_date: o.check_out_date,
        order_status: o.order_status,
        final_price: o.final_price,
        guest_name: o.guest_name,
        guest_count: o.guest_count || 1,
        accommodation_id: o.accommodation_id,
        accommodation_name: accMap.get(o.accommodation_id) || "",
        room_type_name: o.room_types?.name || null,
        room_photo_url: o.room_type_id ? photoMap.get(o.room_type_id) || null : null,
      }))
    );
    setLoading(false);
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
      toast.error("請填寫訂單編號、訂房姓名與聯絡電話末4碼");
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
        toast.error(data?.error || "認領失敗，請稍後再試");
        setClaiming(false);
        return;
      }
      toast.success(`訂單 ${data.order_number} 認領成功！`);
      setClaimOpen(false);
      setClaimOrderNumber("");
      setClaimGuestName("");
      setClaimPhoneLast4("");
      setLoading(true);
      await loadOrders();
    } catch {
      toast.error("認領失敗，請稍後再試");
    } finally {
      setClaiming(false);
    }
  };

  const activeTabLabel = tabs.find((t) => t.key === activeTab)?.label || "所有訂單";

  return (
    <div className="-mx-4 -mt-4">
      {/* Sticky header — back / title / search */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="flex items-center h-12 px-2">
          <button
            onClick={() => navigate("/member/profile")}
            className="p-2 -ml-1 text-foreground"
            aria-label="返回"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center text-base font-semibold">{activeTabLabel}</h1>
          <button
            onClick={() => setClaimOpen(true)}
            className="p-2 -mr-1 text-foreground"
            aria-label="搜尋訂單"
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
                {tab.label}
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
            <SlidersHorizontal className="h-3 w-3" /> 篩選
          </button>
          <button className="px-3 py-1.5 rounded-full border text-xs whitespace-nowrap"
            style={{ borderColor: ORANGE, color: ORANGE, background: "hsl(24 100% 50% / 0.06)" }}>
            住宿
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {activeTab === "all" ? "尚無訂房紀錄" : "此分類沒有訂單"}
            </p>
            {activeTab === "all" && (
              <Button variant="outline" size="sm" onClick={() => setClaimOpen(true)}>
                <PackagePlus className="h-4 w-4 mr-1.5" />
                認領歷史訂單
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
              const statusLabel = statusLabels[order.order_status] || order.order_status;
              const statusColor = statusColors[order.order_status] || "text-muted-foreground";
              const past = isPast(order.check_out_date);
              const cancelled = order.order_status === "cancelled";
              const pointsEarned = Math.round(order.final_price * 0.04);
              const earnedLabel = past || order.order_status === "checked_out" ? "您已賺得" : "您將賺得";

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
                      <span>住宿</span>
                    </div>
                    <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
                  </div>

                  {/* Body */}
                  <div className="px-4 pb-4">
                    <h3 className="text-[15px] font-semibold text-foreground leading-snug">
                      {order.accommodation_name}
                    </h3>
                    {order.room_type_name && (
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">
                        {order.room_type_name}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-muted-foreground">
                      {format(new Date(order.check_in_date), "M月d日", { locale: zhTW })}
                      {" - "}
                      {format(new Date(order.check_out_date), "M月d日", { locale: zhTW })}
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      1 間房 {nights} 晚
                    </p>

                    {/* Points earned */}
                    {!cancelled && (
                      <div className="mt-1.5 flex items-center gap-1 text-sm" style={{ color: ORANGE }}>
                        <span>{earnedLabel}：{pointsEarned} 點</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    )}

                    {/* Price + refund line */}
                    <div className="mt-3 flex items-end justify-between">
                      <div className="flex-1" />
                      <div className="text-right">
                        {cancelled ? (
                          <>
                            <p className="text-sm text-muted-foreground line-through">
                              線上預付 NT${order.final_price.toLocaleString()}
                            </p>
                            <p className="text-sm font-medium text-red-500 mt-0.5">
                              已退款 NT${order.final_price.toLocaleString()}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            線上預付{" "}
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
                          navigate(`/booking/${order.accommodation_id}`);
                        }}
                        className="px-4 py-1.5 rounded-full border text-sm font-medium"
                        style={{ borderColor: ORANGE, color: ORANGE }}
                      >
                        再次預訂
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
                          撰寫評論
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
                          修改訂單
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            <p className="text-center text-xs text-muted-foreground pt-4 pb-2">
              已顯示所有{activeTabLabel}
            </p>
          </div>
        )}
      </div>

      {/* Claim Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              認領歷史訂單
            </DialogTitle>
            <DialogDescription className="text-left">
              輸入您過去的訂單編號、訂房姓名與聯絡電話末 4 碼，即可將訂單綁定到會員帳號
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>訂單編號</Label>
              <Input
                placeholder="例如：RK5M72B9"
                value={claimOrderNumber}
                onChange={(e) => setClaimOrderNumber(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>訂房姓名</Label>
              <Input
                placeholder="請輸入當時填寫的姓名"
                value={claimGuestName}
                onChange={(e) => setClaimGuestName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>聯絡電話末 4 碼</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="例如：1234"
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
              確認認領
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MemberOrders;
