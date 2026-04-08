import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, Ticket, Gift, User, Home } from "lucide-react";

const navItems = [
  { path: "/booking", label: "首頁", icon: Home },
  { path: "/member/orders", label: "訂單", icon: ShoppingBag },
  { path: "/member/coupons", label: "優惠券", icon: Ticket },
  { path: "/member/points", label: "紅利", icon: Gift },
  { path: "/member/profile", label: "我的", icon: User },
];

const MobileBottomNav = () => {
  const location = useLocation();

  return (
    <nav className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background md:hidden">
      <div
        className="mobile-bottom-nav-inner flex items-end justify-around px-1"
        style={{
          height: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "0.25rem",
        }}
      >
        {navItems.map((item) => {
          const isActive =
            item.path === "/booking"
              ? location.pathname === "/booking"
              : location.pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
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
