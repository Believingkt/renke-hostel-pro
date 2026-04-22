import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  ChevronRight,
  Check,
  ChevronDown,
  Coffee,
  UtensilsCrossed,
  Cake,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  base_price: number;
  room_count: number | null;
}

interface CapacityOption {
  guestCount: number;
  roomTypeId: string;
  roomTypeName: string;
  totalPrice: number;
  isRecommended?: boolean;
}

/** 折疊的子方案（早餐/兩食/三食含下午茶/延遲退房 …） */
interface SubPlan {
  key: string;
  label: string;
  description: string;
  /** 相對於基礎價的加價（NT$，每晚） */
  extraPerNight: number;
  icon: React.ReactNode;
  /** 標註，例如「最受歡迎」 */
  tag?: string;
}

interface Props {
  roomTypes: RoomType[];
  onSelect: (option: CapacityOption, subPlanKey?: string) => void;
  nights: number;
}

/** 為一張人數卡產生子方案（依基礎價推算加價，UI 範本資料） */
function buildSubPlans(basePerNight: number, guestCount: number): SubPlan[] {
  // 依人數縮放餐食加價（人多時餐食加價更貴）
  const breakfast = Math.round((basePerNight * 0.06) / 10) * 10 || 200;
  const dinner = Math.round((basePerNight * 0.14) / 10) * 10 || 600;
  const teatime = Math.round((basePerNight * 0.18) / 10) * 10 || 800;
  const lateCheckout = Math.round((basePerNight * 0.08) / 10) * 10 || 500;

  return [
    {
      key: "breakfast",
      label: "含早餐",
      description: `主廚現做早餐 · 每位 +NT$${breakfast.toLocaleString()}`,
      extraPerNight: breakfast * guestCount,
      icon: <Coffee className="h-3.5 w-3.5" />,
    },
    {
      key: "two_meals",
      label: "一泊二食（早＋晚）",
      description: "在地食材晚餐＋隔日早餐",
      extraPerNight: (breakfast + dinner) * guestCount,
      icon: <UtensilsCrossed className="h-3.5 w-3.5" />,
      tag: "最受歡迎",
    },
    {
      key: "three_meals_tea",
      label: "一泊三食 含下午茶",
      description: "下午茶 + 晚餐 + 早餐 全包",
      extraPerNight: (breakfast + dinner + teatime) * guestCount,
      icon: <Cake className="h-3.5 w-3.5" />,
    },
    {
      key: "late_checkout",
      label: "延遲退房 至 14:00",
      description: "多睡 2 小時，悠閒整理行李",
      extraPerNight: lateCheckout,
      icon: <Clock className="h-3.5 w-3.5" />,
    },
  ];
}

/**
 * 包棟特化：人數階梯卡片（Trip.com 折疊式價格卡）
 *
 * - 主卡：N 人方案，預設只顯示「基礎價」
 * - 點「查看 4 種其他方案 ▼」展開含餐 / 延遲退房等加值方案
 * - 全部預設折疊；保留「最划算」推薦標
 */
const CapacityPriceLadder = ({ roomTypes, onSelect, nights }: Props) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const options: CapacityOption[] = useMemo(() => {
    if (roomTypes.length === 0) return [];

    const byCapacity = new Map<number, RoomType>();
    for (const rt of roomTypes) {
      const existing = byCapacity.get(rt.capacity);
      if (!existing || rt.base_price < existing.base_price) {
        byCapacity.set(rt.capacity, rt);
      }
    }

    const sorted = Array.from(byCapacity.values()).sort(
      (a, b) => a.capacity - b.capacity
    );

    let recommendedIdx = 0;
    let lowestPerPerson = Infinity;
    sorted.forEach((rt, i) => {
      const perPerson = rt.base_price / rt.capacity;
      if (perPerson < lowestPerPerson) {
        lowestPerPerson = perPerson;
        recommendedIdx = i;
      }
    });

    return sorted.map((rt, i) => ({
      guestCount: rt.capacity,
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      totalPrice: rt.base_price * Math.max(1, nights),
      isRecommended: i === recommendedIdx && sorted.length > 1,
    }));
  }, [roomTypes, nights]);

  if (options.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        目前沒有可預訂的方案
      </div>
    );
  }

  const safeNights = Math.max(1, nights);

  return (
    <div className="space-y-2.5 px-4">
      {options.map((opt) => {
        const basePerNight = Math.round(opt.totalPrice / safeNights);
        const perPerson = Math.round(opt.totalPrice / opt.guestCount / safeNights);
        const subPlans = buildSubPlans(basePerNight, opt.guestCount);
        const isExpanded = expandedKey === opt.roomTypeId;

        return (
          <Card
            key={opt.roomTypeId}
            className="overflow-hidden border-border/60 hover:border-primary/50 transition-all relative"
          >
            {opt.isRecommended && (
              <div
                className="absolute top-0 right-0 z-10 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-md flex items-center gap-0.5"
                style={{ background: "hsl(25, 70%, 50%)" }}
              >
                <Check className="h-2.5 w-2.5" />
                最划算
              </div>
            )}

            {/* ── 主方案（基礎價）── */}
            <button
              type="button"
              onClick={() => onSelect(opt)}
              className="w-full text-left p-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors"
            >
              {/* Capacity badge */}
              <div
                className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(25, 70%, 96%), hsl(25, 70%, 90%))",
                }}
              >
                <Users
                  className="h-4 w-4 mb-0.5"
                  style={{ color: "hsl(25, 70%, 45%)" }}
                />
                <span
                  className="font-bold text-base leading-none"
                  style={{ color: "hsl(25, 70%, 35%)" }}
                >
                  {opt.guestCount}
                </span>
                <span
                  className="text-[9px] mt-0.5"
                  style={{ color: "hsl(25, 50%, 45%)" }}
                >
                  人
                </span>
              </div>

              {/* Plan info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground line-clamp-1">
                  {opt.roomTypeName}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  純住宿 · 適合 {opt.guestCount} 位旅客
                  {nights > 1 && <> · 共 {nights} 晚</>}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "hsl(25, 60%, 45%)" }}
                >
                  平均每人 NT${perPerson.toLocaleString()}/晚
                </p>
              </div>

              {/* Price + CTA */}
              <div className="text-right shrink-0">
                <p
                  className="font-bold text-base leading-none"
                  style={{ color: "hsl(0, 75%, 50%)" }}
                >
                  NT${opt.totalPrice.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {nights > 1 ? "總價" : "/晚"}
                </p>
                <span
                  className="inline-flex items-center gap-0.5 mt-1.5 h-7 px-2.5 text-[11px] rounded-md text-white font-medium"
                  style={{ background: "hsl(25, 70%, 50%)" }}
                >
                  選擇
                  <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </button>

            {/* ── 折疊觸發列 ── */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedKey(isExpanded ? null : opt.roomTypeId);
              }}
              className={cn(
                "w-full px-3.5 py-2 flex items-center justify-between border-t border-border/50 text-[11px] font-medium transition-colors",
                isExpanded
                  ? "bg-muted/40 text-foreground"
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
              )}
              aria-expanded={isExpanded}
            >
              <span>
                {isExpanded
                  ? "收合其他方案"
                  : `查看 ${subPlans.length} 種其他方案（含餐 / 延遲退房）`}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </button>

            {/* ── 展開的子方案列表 ── */}
            {isExpanded && (
              <div className="border-t border-border/50 bg-muted/10">
                {subPlans.map((sp) => {
                  const subTotal = opt.totalPrice + sp.extraPerNight * safeNights;
                  return (
                    <button
                      key={sp.key}
                      type="button"
                      onClick={() => onSelect(opt, sp.key)}
                      className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 border-b border-border/40 last:border-b-0 hover:bg-background transition-colors"
                    >
                      <div
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          background: "hsl(25, 70%, 95%)",
                          color: "hsl(25, 70%, 40%)",
                        }}
                      >
                        {sp.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-[13px] text-foreground">
                            {sp.label}
                          </p>
                          {sp.tag && (
                            <span
                              className="text-[9px] font-bold px-1 py-px rounded leading-none"
                              style={{
                                background: "hsl(0, 75%, 95%)",
                                color: "hsl(0, 75%, 45%)",
                              }}
                            >
                              {sp.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                          {sp.description}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className="font-bold text-[13px] leading-none"
                          style={{ color: "hsl(0, 75%, 50%)" }}
                        >
                          NT${subTotal.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          +NT${(sp.extraPerNight * safeNights).toLocaleString()}
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default CapacityPriceLadder;
export type { CapacityOption };
