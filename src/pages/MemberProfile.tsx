import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  ChevronRight,
  ShoppingBag,
  Ticket,
  Gift,
  UserRound,
  Heart,
  ClipboardList,
  ShieldCheck,
  Trash2,
  HelpCircle,
  Sparkles,
  Crown,
  Settings,
  Share2,
  History,
  CreditCard,
} from "lucide-react";
import { isMemberPreview, mockProfile, mockPoints, mockCoupons, mockOrders } from "@/lib/memberPreviewMock";

interface Stats {
  name: string;
  avatarUrl: string | null;
  pointsBalance: number;
  couponCount: number;
  upcomingCount: number;
  totalOrders: number;
}

const initialStats: Stats = {
  name: "",
  avatarUrl: null,
  pointsBalance: 0,
  couponCount: 0,
  upcomingCount: 0,
  totalOrders: 0,
};

const MemberProfile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>(initialStats);

  useEffect(() => {
    if (isMemberPreview()) {
      const today = new Date();
      const upcoming = mockOrders.filter(
        (o) => o.order_status === "confirmed" && new Date(o.check_in_date) >= today
      ).length;
      setStats({
        name: mockProfile.name,
        avatarUrl: null,
        pointsBalance: mockPoints.balance,
        couponCount: mockCoupons.length,
        upcomingCount: upcoming,
        totalOrders: mockOrders.filter((o) => o.order_status !== "cancelled").length,
      });
      setLoading(false);
      return;
    }

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: member } = await supabase
        .from("platform_members")
        .select("id, name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!member) {
        setLoading(false);
        return;
      }

      const todayISO = new Date().toISOString().slice(0, 10);
      const [{ data: points }, { count: couponCount }, { count: upcomingCount }, { count: totalOrders }] =
        await Promise.all([
          supabase.from("member_points").select("balance").eq("member_id", member.id).maybeSingle(),
          (supabase as any)
            .from("member_coupons")
            .select("id", { count: "exact", head: true })
            .eq("member_id", member.id)
            .eq("status", "active"),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("member_id", member.id)
            .eq("order_status", "confirmed" as any)
            .gte("check_in_date", todayISO),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("member_id", member.id)
            .neq("order_status", "cancelled" as any),
        ]);

      setStats({
        name: member.name || "會員",
        avatarUrl: (member as any).avatar_url || null,
        pointsBalance: points?.balance || 0,
        couponCount: couponCount || 0,
        upcomingCount: upcomingCount || 0,
        totalOrders: totalOrders || 0,
      });
      setLoading(false);
    })();
  }, []);

  const memberTier = stats.totalOrders >= 5 ? "尊榮會員" : stats.totalOrders >= 1 ? "白金會員" : "一般會員";
  const tierPerks = stats.totalOrders >= 5
    ? "享有專屬折扣、優先入住、生日禮金"
    : stats.totalOrders >= 1
      ? "累積住宿升級尊榮會員"
      : "完成首筆訂房即可升級";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[hsl(24,100%,55%)] to-[hsl(14,90%,55%)] flex items-center justify-center overflow-hidden ring-2 ring-white shadow-md">
          {stats.avatarUrl ? (
            <img src={stats.avatarUrl} alt={stats.name} className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-7 w-7 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <div className="text-lg font-semibold truncate">{stats.name || "會員"}</div>
          )}
          <Link
            to="/member/profile/edit"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-[hsl(24,100%,50%)]"
          >
            管理我的帳號 <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/member/profile/edit")}
          className="text-muted-foreground"
          aria-label="設定"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Membership card */}
      <Card className="relative overflow-hidden p-4 border-0 text-white shadow-lg bg-gradient-to-br from-[hsl(24,100%,52%)] via-[hsl(18,95%,55%)] to-[hsl(12,90%,58%)]">
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute right-8 bottom-2 h-16 w-16 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2 mb-3">
          <Crown className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-wide">{memberTier}</span>
        </div>
        <div className="relative text-xs text-white/85 mb-4">{tierPerks}</div>
        <div className="relative grid grid-cols-3 gap-2">
          <button
            onClick={() => navigate("/member/points")}
            className="text-left rounded-lg bg-white/15 backdrop-blur px-3 py-2 hover:bg-white/25 transition"
          >
            <div className="text-[11px] text-white/80">紅利點數</div>
            <div className="text-lg font-bold leading-tight">
              {loading ? "—" : stats.pointsBalance.toLocaleString()}
            </div>
          </button>
          <button
            onClick={() => navigate("/member/coupons")}
            className="text-left rounded-lg bg-white/15 backdrop-blur px-3 py-2 hover:bg-white/25 transition"
          >
            <div className="text-[11px] text-white/80">優惠券</div>
            <div className="text-lg font-bold leading-tight">
              {loading ? "—" : stats.couponCount}
              <span className="text-xs font-normal ml-0.5">張</span>
            </div>
          </button>
          <button
            onClick={() => navigate("/member/orders")}
            className="text-left rounded-lg bg-white/15 backdrop-blur px-3 py-2 hover:bg-white/25 transition"
          >
            <div className="text-[11px] text-white/80">待入住</div>
            <div className="text-lg font-bold leading-tight">
              {loading ? "—" : stats.upcomingCount}
              <span className="text-xs font-normal ml-0.5">筆</span>
            </div>
          </button>
        </div>
      </Card>

      {/* Promotion */}
      <Card className="p-4 bg-gradient-to-br from-orange-50 to-white border-orange-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-[hsl(24,100%,50%)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">入住後回饋紅利</div>
            <div className="text-xs text-muted-foreground mt-0.5">每筆訂房最高可得 10% 紅利點數</div>
          </div>
          <Button
            size="sm"
            className="bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white shrink-0"
            onClick={() => navigate("/booking")}
          >
            立即訂房
          </Button>
        </div>
      </Card>

      {/* Menu group: 我的 */}
      <MenuGroup>
        <MenuRow
          icon={ShoppingBag}
          label="所有訂單"
          onClick={() => navigate("/member/orders")}
          badge={loading ? undefined : stats.totalOrders || undefined}
        />
        <MenuRow
          icon={ClipboardList}
          label="待入住"
          onClick={() => navigate("/member/orders")}
          rightText={loading || !stats.upcomingCount ? undefined : `${stats.upcomingCount} 筆`}
          highlight={!!stats.upcomingCount}
        />
        <MenuRow icon={Ticket} label="優惠券" onClick={() => navigate("/member/coupons")} />
        <MenuRow icon={Gift} label="紅利點數" onClick={() => navigate("/member/points")} />
        <MenuRow icon={UserRound} label="個人資料" onClick={() => navigate("/member/profile/edit")} />
        <MenuRow icon={History} label="最近瀏覽" onClick={() => navigate("/member/recent-views")} />
        <MenuRow icon={CreditCard} label="卡片管理" onClick={() => navigate("/member/cards")} />
        <MenuRow icon={ClipboardList} label="常用資訊" onClick={() => navigate("/member/common-info")} />
        <MenuRow icon={Heart} label="我的收藏" onClick={() => navigate("/member/favorites")} last />
      </MenuGroup>

      {/* 福利 */}
      <div>
        <div className="px-1 pb-2 text-sm font-medium text-muted-foreground">福利</div>
        <MenuGroup>
          <MenuRow icon={Share2} label="邀請好友賺獎勵" onClick={() => navigate("/booking")} />
          <MenuRow icon={Gift} label="紅利點數兌換" onClick={() => navigate("/member/points")} />
          <MenuRow icon={Heart} label="我的收藏" onClick={() => navigate("/booking")} last />
        </MenuGroup>
      </div>

      {/* 關於及條款 */}
      <div>
        <div className="px-1 pb-2 text-sm font-medium text-muted-foreground">關於及條款</div>
        <MenuGroup>
          <MenuRow icon={HelpCircle} label="常見問題" onClick={() => window.open("/faq", "_blank")} />
          <MenuRow icon={ShieldCheck} label="隱私權政策" onClick={() => window.open("/privacy", "_blank")} />
          <MenuRow icon={Trash2} label="資料刪除" onClick={() => window.open("/data-deletion", "_blank")} last />
        </MenuGroup>
      </div>

      <div className="text-center text-[11px] text-muted-foreground pt-2 pb-4">
        Lakeze 人客多 · 值得您信賴的訂房夥伴
      </div>
    </div>
  );
};

const MenuGroup = ({ children }: { children: React.ReactNode }) => (
  <Card className="overflow-hidden divide-y divide-border/60 p-0">{children}</Card>
);

const MenuRow = ({
  icon: Icon,
  label,
  onClick,
  rightText,
  badge,
  highlight,
  last,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  rightText?: string;
  badge?: number;
  highlight?: boolean;
  last?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-orange-50/60 active:bg-orange-100/60 transition ${
      last ? "" : ""
    }`}
  >
    <div className="h-9 w-9 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
      <Icon className="h-4.5 w-4.5 text-[hsl(24,100%,50%)]" />
    </div>
    <span className="flex-1 text-sm">{label}</span>
    {badge !== undefined && (
      <span className="text-xs text-muted-foreground tabular-nums">{badge}</span>
    )}
    {rightText && (
      <span
        className={`text-xs tabular-nums ${
          highlight ? "text-[hsl(24,100%,50%)] font-medium" : "text-muted-foreground"
        }`}
      >
        {rightText}
      </span>
    )}
    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
  </button>
);

export default MemberProfile;
