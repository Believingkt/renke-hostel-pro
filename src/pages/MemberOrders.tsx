import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
  Calendar,
  Search,
  PackagePlus,
  BedDouble,
  Copy,
  Check,
  User,
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

type TabKey = "all" | "upcoming" | "completed" | "cancelled";

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "upcoming", label: "待出發" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

const statusLabels: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  on_hold: "保留中",
  checked_in: "已入住",
  checked_out: "已完成",
  cancelled: "已取消",
};

const statusStyles: Record<string, string> = {
  pending: "text-amber-600 border-amber-200 bg-amber-50",
  confirmed: "text-emerald-700 border-emerald-200 bg-emerald-50",
  on_hold: "text-blue-600 border-blue-200 bg-blue-50",
  checked_in: "text-blue-600 border-blue-200 bg-blue-50",
  checked_out: "text-muted-foreground border-border bg-muted",
  cancelled: "text-red-600 border-red-200 bg-red-50",
};

const MemberOrders = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<MemberOrder[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimOrderNumber, setClaimOrderNumber] = useState("");
  const [claimGuestName, setClaimGuestName] = useState("");
  const [claimPhoneLast4, setClaimPhoneLast4] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    if (isMemberPreview()) {
      setOrders(mockOrders as any);
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, email, phone, name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      setLoading(false);
      return;
    }

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

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    // Get accommodation names
    const accIds = [...new Set((data || []).map((o) => o.accommodation_id))];
    const { data: accs } = await supabase
      .from("accommodation_info")
      .select("id, name")
      .in("id", accIds);
    const accMap = new Map((accs || []).map((a) => [a.id, a.name]));

    // Get room photos
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

  const filteredOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter((o) => {
      if (activeTab === "all") return true;
      if (activeTab === "cancelled") return o.order_status === "cancelled";
      if (activeTab === "completed")
        return (
          o.order_status === "checked_out" ||
          (o.order_status !== "cancelled" && new Date(o.check_out_date) < today)
        );
      // upcoming
      return (
        o.order_status !== "cancelled" &&
        o.order_status !== "checked_out" &&
        new Date(o.check_out_date) >= today
      );
    });
  }, [orders, activeTab]);

  const tabCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counts: Record<TabKey, number> = { all: orders.length, upcoming: 0, completed: 0, cancelled: 0 };
    orders.forEach((o) => {
      if (o.order_status === "cancelled") counts.cancelled++;
      else if (o.order_status === "checked_out" || new Date(o.check_out_date) < today) counts.completed++;
      else counts.upcoming++;
    });
    return counts;
  }, [orders]);

  const handleCopy = (orderNumber: string) => {
    navigator.clipboard.writeText(orderNumber);
    setCopiedId(orderNumber);
    setTimeout(() => setCopiedId(null), 1500);
  };

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          我的訂單
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setClaimOpen(true)}
          className="text-sm text-muted-foreground gap-1"
        >
          <Search className="h-4 w-4" />
          找不到訂單？
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? "text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            style={
              activeTab === tab.key
                ? { background: "hsl(25, 70%, 50%)" }
                : undefined
            }
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && activeTab !== tab.key && (
              <span className="ml-1 text-sm">({tabCounts[tab.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Order List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground">
            {activeTab === "all" ? "尚無訂房紀錄" : "此分類沒有訂單"}
          </p>
          {activeTab === "all" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClaimOpen(true)}
            >
              <PackagePlus className="h-4 w-4 mr-1.5" />
              認領歷史訂單
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const nights = differenceInCalendarDays(
              new Date(order.check_out_date),
              new Date(order.check_in_date)
            );
            const statusLabel =
              statusLabels[order.order_status] || order.order_status;
            const statusStyle =
              statusStyles[order.order_status] || "text-muted-foreground border-border bg-muted";

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-border overflow-hidden shadow-sm"
              >
                {/* Order header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">訂單編號：</span>
                    <span className="font-mono text-foreground truncate">
                      {order.order_number}
                    </span>
                    <button
                      onClick={() => handleCopy(order.order_number)}
                      className="shrink-0 p-0.5 hover:text-foreground transition-colors"
                    >
                      {copiedId === order.order_number ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-sm font-medium ${statusStyle}`}
                  >
                    {statusLabel}
                  </Badge>
                </div>

                {/* Order body */}
                <div className="p-4">
                  <div className="flex gap-3">
                    {/* Room photo */}
                    <div className="w-24 h-20 sm:w-28 sm:h-24 rounded-lg overflow-hidden bg-muted shrink-0">
                      {order.room_photo_url ? (
                        <img
                          src={order.room_photo_url}
                          alt={order.room_type_name || "房型"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BedDouble
                            className="h-8 w-8"
                            style={{ color: "hsl(25, 50%, 80%)" }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground text-base truncate">
                          {order.accommodation_name}
                        </h3>
                        <p className="font-bold text-foreground whitespace-nowrap">
                          NT${order.final_price.toLocaleString()}
                        </p>
                      </div>

                      {/* Stay details */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {format(new Date(order.check_in_date), "M月d日", {
                            locale: zhTW,
                          })}{" "}
                          -{" "}
                          {format(new Date(order.check_out_date), "M月d日", {
                            locale: zhTW,
                          })}
                        </span>
                        <span>{nights} 晚</span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {order.room_type_name && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5 shrink-0" />
                            {order.room_type_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          {order.guest_name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Order date */}
                  {order.order_date && (
                    <p className="text-sm text-muted-foreground mt-3 pt-2.5 border-t border-border/60">
                      預訂日期：
                      {format(new Date(order.order_date), "yyyy年M月d日", {
                        locale: zhTW,
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Claim Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              認領歷史訂單
            </DialogTitle>
            <DialogDescription className="text-left">
              輸入您過去的訂單編號、訂房姓名與聯絡電話末4碼，即可將該訂單綁定到您的會員帳號
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>訂單編號</Label>
              <Input
                placeholder="例如：RK5M72B9"
                value={claimOrderNumber}
                onChange={(e) =>
                  setClaimOrderNumber(e.target.value.toUpperCase())
                }
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
              <Label>聯絡電話末4碼</Label>
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
              className="w-full"
            >
              {claiming && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              確認認領
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MemberOrders;
