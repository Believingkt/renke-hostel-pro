import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Clock, X } from "lucide-react";
import { usePendingAtmOrders, formatCountdown } from "@/hooks/use-pending-atm-orders";

const DISMISS_KEY = "atm_banner_dismissed_until";

/**
 * 置頂未付款 ATM 倒數提醒條（首頁 / 會員中心共用）。
 * 只要停留在頁面上就持續每秒更新。
 */
const AtmPaymentBanner = () => {
  const navigate = useNavigate();
  const { orders } = usePendingAtmOrders();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const until = Number(sessionStorage.getItem(DISMISS_KEY) || 0);
    if (until > Date.now()) setDismissed(true);
  }, []);

  const active = orders.filter((o) => o.expireAt && o.expireAt.getTime() > now);
  if (dismissed || active.length === 0) return null;

  const first = active[0];
  const extra = active.length - 1;

  return (
    <div className="w-full bg-[hsl(215,32%,17%)] text-[hsl(0,0%,100%)]">
      <div className="max-w-4xl mx-auto flex items-center gap-2 px-3 py-2 sm:px-4">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(45,100%,60%)]" />
        <button
          type="button"
          onClick={() => navigate(`/member/orders/${first.order_number}`)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-sm">
            訂單 {first.order_number} 尚未完成 ATM 付款
            {extra > 0 ? `（另有 ${extra} 筆）` : ""}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-[hsl(45,100%,60%)] px-2 py-0.5 text-sm font-semibold tabular-nums text-[hsl(215,32%,17%)]">
            <Clock className="h-3.5 w-3.5" />
            {formatCountdown(first.expireAt!, now)}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
        <button
          type="button"
          aria-label="關閉提醒"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, String(Date.now() + 60 * 60 * 1000));
            setDismissed(true);
          }}
          className="shrink-0 rounded p-1 hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AtmPaymentBanner;
