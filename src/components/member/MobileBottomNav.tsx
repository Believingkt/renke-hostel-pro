import { Link, useLocation } from "react-router-dom";
import { MessageCircle, User, Home, CalendarCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { path: "/booking", label: "首頁", icon: Home },
  { path: "/member/messages", label: "訊息", icon: MessageCircle },
  { path: "/member/orders", label: "行程", icon: CalendarCheck },
  { path: "/member/profile", label: "我的帳號", icon: User },
];

interface MobileBottomNavProps {
  onVisibilityChange?: (visible: boolean) => void;
  onHeightChange?: (height: number) => void;
}

const MobileBottomNav = ({ onVisibilityChange, onHeightChange }: MobileBottomNavProps) => {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 60) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !onHeightChange) return;
    const measure = () => onHeightChange(Math.round(nav.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onHeightChange]);

  return (
    <nav
      ref={navRef}
      data-mobile-bottom-nav
      className={`fixed bottom-0 inset-x-0 z-50 bg-white border-t border-border md:hidden transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex justify-around items-center h-16 px-1 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive =
            item.path === "/booking"
              ? location.pathname === "/booking"
              : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors ${
                isActive
                  ? "text-[hsl(24,100%,50%)]"
                  : "text-muted-foreground"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[11px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
