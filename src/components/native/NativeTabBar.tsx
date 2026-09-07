import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Search, CalendarCheck, MessageCircle, User } from "lucide-react";
import { getStoredCategoriesUnread, subscribeMessagesUnread } from "@/lib/messagesUnread";
import { hapticSelection } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/booking", label: "首頁", icon: Home, match: (p: string) => p === "/booking" || p === "/" },
  { path: "/booking/search", label: "找房", icon: Search, match: (p: string) => p.startsWith("/booking/search") || p.startsWith("/booking/villa") },
  { path: "/member/orders", label: "訂單", icon: CalendarCheck, match: (p: string) => p.startsWith("/member/orders") },
  { path: "/member/messages", label: "訊息", icon: MessageCircle, match: (p: string) => p.startsWith("/member/messages") },
  { path: "/member/profile", label: "我的", icon: User, match: (p: string) => p.startsWith("/member/profile") || p.startsWith("/member/points") || p.startsWith("/member/coupons") },
];

/** iOS 風格底部固定 Tab Bar（僅原生 App 掛載） */
export function NativeTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(() => getStoredCategoriesUnread());

  useEffect(() => {
    setUnread(getStoredCategoriesUnread());
    return subscribeMessagesUnread((total) => setUnread(total));
  }, [location.pathname]);

  return (
    <nav
      data-native-tab-bar
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/70 bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-[50px] items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.match(location.pathname);
          const Icon = tab.icon;
          const showBadge = tab.path === "/member/messages" && unread > 0;
          return (
            <button
              key={tab.path}
              type="button"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                void hapticSelection();
                if (!active) navigate(tab.path);
              }}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className={cn("h-[22px] w-[22px]", active && "stroke-[2.4]")} />
                {showBadge && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default NativeTabBar;
