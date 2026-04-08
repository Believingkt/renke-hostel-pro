import { Link, useLocation, useNavigate } from "react-router-dom";
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
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-border md:hidden" style={{ paddingBottom: 0, marginBottom: 0 }}>
      <div className="flex justify-around items-center h-14 px-1" style={{ paddingBottom: 0 }}>
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
