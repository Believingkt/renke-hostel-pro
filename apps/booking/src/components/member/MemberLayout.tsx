import { useEffect, useState } from "react";
import { useNavigate, Outlet, Link, useLocation } from "react-router-dom";
import { initMemberPreviewFromUrl, isMemberPreview, mockMemberName } from "@/lib/memberPreviewMock";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { User, Gift, Ticket, ShoppingBag, LogOut, Home } from "lucide-react";
import portalLogo from "@lakeze/shared/assets/lakeze-portal-logo.png";
import { toast } from "sonner";
import { useIsMobile } from "@lakeze/shared/hooks/use-mobile";
import MobileBottomNav from "@lakeze/shared/components/member/MobileBottomNav";
import AtmPaymentBanner from "@/components/member/AtmPaymentBanner";
import { deactivateCurrentDeviceTokens, initPushNotifications } from "@lakeze/shared/lib/pushNotifications";
import BiometricEnrollPrompt from "@/components/member/BiometricEnrollPrompt";
import { clearManualLogoutFlag, disableBiometricLogin, refreshStoredBiometricToken, setManualLogoutFlag } from "@/lib/biometricAuth";
import { clearAppBadge, resetServerUnreadBadge } from "@lakeze/shared/lib/appBadge";
import { useIsNativeApp } from "@lakeze/shared/hooks/use-is-native-app";
import { MEMBER_LOGOUT_EVENT } from "@/lib/native/memberLogoutEvent";
import { getAuthUserOfflineSafe } from "@/lib/authSession";


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
  const native = useIsNativeApp();
  const [memberName, setMemberName] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    initMemberPreviewFromUrl();
    if (isMemberPreview()) {
      setMemberName(mockMemberName);
      return;
    }

    const ensureMember = async (user: any) => {
      if (!user) return;
      clearManualLogoutFlag();
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
      // 原生 App：登入後請求推播權限並註冊 device token（網頁版會直接略過）
      initPushNotifications().catch(() => {});
      // 已啟用 Face ID 時，同步最新的 refresh token 到 Keychain
      refreshStoredBiometricToken().catch(() => {});
    };

    const checkAuth = async () => {
      // 離線時以本機持久化的 session 為準；網路錯誤絕不導向登入頁
      const { user, offline } = await getAuthUserOfflineSafe();
      if (!user) {
        if (offline) return;
        navigate("/member/auth");
        return;
      }
      try {
        await ensureMember(user);
      } catch {
        /* 離線或請求失敗：維持登入狀態，頁面各自顯示快取 */
      }
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
    // 1. 先立旗標：任何自動還原（Face ID）都必須跳過
    setManualLogoutFlag();

    // 2. 所有需要寫回伺服器的動作都必須在 signOut 之前完成，
    //    否則 session 已清空，寫入會被 RLS 擋下（影響 0 筆）並跳出誤導的錯誤提示。
    try {
      await deactivateCurrentDeviceTokens();
    } catch (e) {
      console.warn("[logout] deactivateCurrentDeviceTokens failed", e);
    }

    try {
      await resetServerUnreadBadge();
    } catch (e) {
      console.warn("[logout] resetServerUnreadBadge failed", e);
    }

    // 3. 清除 Keychain 憑證 + 關閉 Face ID 開關（失敗不可中斷登出，也不跳錯誤）
    try {
      await disableBiometricLogin();
    } catch (e) {
      console.warn("[logout] disableBiometricLogin failed", e);
    }

    // 4. 登出
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e) {
      console.error("[logout] signOut failed", e);
      toast.error("登出失敗，請再試一次");
      return;
    }

    // 5. 清角標（純本機動作，不會再打 API）
    try {
      await clearAppBadge();
    } catch (e) {
      console.warn("[logout] clearAppBadge failed", e);
    }

    toast.success("已登出");
    navigate("/booking", { replace: true });
  };

  // 原生 App：登出改由「我的」頁內觸發（網站版不受影響）
  useEffect(() => {
    if (!native) return;
    const open = () => setLogoutOpen(true);
    window.addEventListener(MEMBER_LOGOUT_EVENT, open);
    return () => window.removeEventListener(MEMBER_LOGOUT_EVENT, open);
  }, [native]);

  return (
    <div className={native ? "min-h-screen bg-background" : "min-h-screen bg-gradient-to-b from-orange-50 to-white"}>
      {native && <AtmPaymentBanner />}
      {/* Header（網站版專用；原生 App 改用 iOS 導覽列） */}
      {!native && (
      <header className="sticky top-0 z-50 safe-top bg-white/95 backdrop-blur border-b">
        <AtmPaymentBanner />
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
            <Button variant="ghost" size="sm" onClick={() => setLogoutOpen(true)} className="gap-1 text-destructive px-2 sm:px-3">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">登出</span>
            </Button>
          </div>
        </div>
      </header>
      )}

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認登出</AlertDialogTitle>
            <AlertDialogDescription>確定要登出會員中心嗎？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>確認登出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 一次性提示：啟用 Face ID 快速登入（僅 iOS App） */}
      <BiometricEnrollPrompt />

      {/* Desktop top nav（原生 App 不顯示，改用底部 Tab Bar） */}
      {!isMobile && !native && (
        <nav className="border-b bg-white">
          <div className="max-w-4xl mx-auto px-4 flex gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
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
      <main className={`max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 ${isMobile && !native ? "pb-[calc(6rem+env(safe-area-inset-bottom,0px))]" : ""}`}>
        <Outlet />
      </main>

      {/* Mobile bottom tab bar（原生 App 由 NativeTabBar 取代） */}
      {!native && <MobileBottomNav />}
    </div>
  );
};

export default MemberLayout;
