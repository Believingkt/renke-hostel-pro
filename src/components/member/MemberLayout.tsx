import { useEffect, useState } from "react";
import { useNavigate, Outlet, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { User, Gift, Ticket, ShoppingBag, LogOut, Home } from "lucide-react";
import portalLogo from "@/assets/lakeze-portal-logo.png";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileBottomNav from "@/components/member/MobileBottomNav";

const navItems = [
  { path: "/member/orders", label: "訂房紀錄", icon: ShoppingBag },
  { path: "/member/coupons", label: "優惠券", icon: Ticket },
  { path: "/member/points", label: "紅利點數", icon: Gift },
  { path: "/member/profile", label: "個人資料", icon: User },
];

const MemberLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [memberName, setMemberName] = useState("");

  useEffect(() => {
    const ensureMember = async (user: any) => {
      if (!user) return;
      const { data: existing } = await supabase
        .from("platform_members")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        const meta = user.user_metadata || {};
        const fallbackName =
          meta.name || meta.full_name || meta.display_name || user.email?.split("@")[0] || "會員";
        await supabase.from("platform_members").insert({
          user_id: user.id,
          name: fallbackName,
          email: user.email || meta.email || "",
          phone: meta.phone || null,
          avatar_url: meta.avatar_url || meta.picture || null,
          gender: meta.gender || null,
          nationality: meta.nationality || null,
          address: meta.address || null,
        } as any);
        setMemberName(fallbackName);
      } else {
        setMemberName(existing.name);
      }
    };

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/member/auth");
        return;
      }
      await ensureMember(user);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        ensureMember(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("已登出");
    navigate("/booking");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          <Link to="/booking" className="flex items-center gap-2">
            <img src={portalLogo} alt="Lakeze 人客多" className="h-16 sm:h-24 object-contain" />
            <span className="text-sm text-muted-foreground hidden sm:inline">會員中心</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/booking")} className="gap-1 px-2 sm:px-3">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">訂房</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1 text-destructive px-2 sm:px-3">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">登出</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Desktop top nav */}
      {!isMobile && (
        <nav className="border-b bg-white">
          <div className="max-w-4xl mx-auto px-4 flex gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-[hsl(24,100%,50%)] text-[hsl(24,100%,50%)] font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Content — add bottom padding on mobile for the tab bar */}
      <main className={`max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 ${isMobile ? "pb-24" : ""}`}>
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <MobileBottomNav />
    </div>
  );
};

export default MemberLayout;
