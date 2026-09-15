import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Timer } from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { usePendingAtmOrders, formatCountdown } from "@/hooks/use-pending-atm-orders";

const ORANGE = "hsl(24,100%,50%)";

/** 會員中心個人資料頁的 ATM 繳費期限倒數卡片 */
const AtmCountdownCard = () => {
  const navigate = useNavigate();
  const { orders } = usePendingAtmOrders();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = orders.filter((o) => o.expireAt && o.expireAt.getTime() > now);
  if (active.length === 0) return null;

  return (
    <div className="space-y-3">
      {active.map((o) => (
        <Card key={o.id} className="p-4 border-orange-200 bg-orange-50/60">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Timer className="h-4 w-4" style={{ color: ORANGE }} /> ATM 虛擬帳號
          </p>
          <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4" style={{ color: ORANGE }} /> 繳費期限倒數計時
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: ORANGE }}>
              {formatCountdown(o.expireAt!, now)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              期限：{format(o.expireAt!, "yyyy/M/d aa h:mm:ss", { locale: zhTW })}（逾期未收到訂金將自動取消訂單）
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                訂單 {o.order_number} · 待繳 NT$ {o.amount.toLocaleString()}
              </span>
              <Button
                size="sm"
                className="bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
                onClick={() => navigate(`/member/orders/${o.order_number}`)}
              >
                查看繳費資訊
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default AtmCountdownCard;
