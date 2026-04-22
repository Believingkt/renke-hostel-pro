import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Users,
  ChevronRight,
  Check,
  ChevronDown,
  Coffee,
  UtensilsCrossed,
  Cake,
  Clock,
  BedDouble,
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
  /** 原價（折扣前） */
  originalPrice: number;
  /** 折扣百分比，如 15 代表 -15% */
  discountPercent: number;
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

/** 判斷是否為「包棟/包區」方案：依名稱關鍵字或大容量 */
const isVillaPlan = (rt: RoomType) =>
  /包棟|包區|whole|villa/i.test(rt.name) || rt.capacity >= 8;

/** 為一張人數卡產生子方案（依基礎價推算加價） */
function buildSubPlans(basePerNight: number, guestCount: number): SubPlan[] {
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

/** 計算原價（含折扣回推）— 視覺上製造「原價→折扣→售價」效果 */
function computeOriginalAndDiscount(salePrice: number) {
  // 預設 15% 折扣（可由後端覆蓋；此處為範本）
  const discountPercent = 15;
  const originalPrice = Math.round(salePrice / (1 - discountPercent / 100) / 10) * 10;
  return { originalPrice, discountPercent };
}

/** 從同人數中挑最便宜的一個房型作為該人數方案 */
function pickLowestPerCapacity(rts: RoomType[]): RoomType[] {
  const byCapacity = new Map<number, RoomType>();
  for (const rt of rts) {
    const existing = byCapacity.get(rt.capacity);
    if (!existing || rt.base_price < existing.base_price) {
      byCapacity.set(rt.capacity, rt);
    }
  }
  return Array.from(byCapacity.values()).sort((a, b) => a.capacity - b.capacity);
}

/** 將 RoomType 轉為 CapacityOption */
function toOption(
  rt: RoomType,
  nights: number,
  isRecommended: boolean
): CapacityOption {
  const totalPrice = rt.base_price * Math.max(1, nights);
  const { originalPrice, discountPercent } = computeOriginalAndDiscount(totalPrice);
  return {
    guestCount: rt.capacity,
    roomTypeId: rt.id,
    roomTypeName: rt.name,
    totalPrice,
    originalPrice,
    discountPercent,
    isRecommended,
  };
}

/**
 * 包棟特化：人數階梯卡片（Trip.com 折疊式價格卡）
 *
 * - 主區：包棟方案（大人數）每張卡可展開「含餐/延遲退房」子方案
 * - 底部摺疊：「平日單間方案」（雙人房 / 四人房 等小房型）預設折疊
 */
const CapacityPriceLadder = ({ roomTypes, onSelect, nights }: Props) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [singleRoomOpen, setSingleRoomOpen] = useState(false);

  const { villaOptions, singleOptions } = useMemo(() => {
    if (roomTypes.length === 0) {
      return { villaOptions: [] as CapacityOption[], singleOptions: [] as CapacityOption[] };
    }

    const villas = pickLowestPerCapacity(roomTypes.filter(isVillaPlan));
    const singles = pickLowestPerCapacity(roomTypes.filter((r) => !isVillaPlan(r)));

    // 在包棟方案中找出「最划算」（每人單價最低）
    let recommendedIdx = 0;
    let lowestPerPerson = Infinity;
    villas.forEach((rt, i) => {
      const perPerson = rt.base_price / rt.capacity;
      if (perPerson < lowestPerPerson) {
        lowestPerPerson = perPerson;
        recommendedIdx = i;
      }
    });

    return {
      villaOptions: villas.map((rt, i) =>
        toOption(rt, nights, i === recommendedIdx && villas.length > 1)
      ),
      singleOptions: singles.map((rt) => toOption(rt, nights, false)),
    };
  }, [roomTypes, nights]);

  if (villaOptions.length === 0 && singleOptions.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        目前沒有可預訂的方案
      </div>
    );
  }

  const safeNights = Math.max(1, nights);

  return (
    <div className="space-y-2.5 px-4">
      {/* ── 主區：包棟方案 ── */}
      {villaOptions.map((opt) => {
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

            {/* 主方案 */}
            <button
              type="button"
              onClick={() => onSelect(opt)}
              className="w-full text-left p-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors"
            >
              <div
                className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(25, 70%, 96%), hsl(25, 70%, 90%))",
                }}
              >
                <Users className="h-4 w-4 mb-0.5" style={{ color: "hsl(25, 70%, 45%)" }} />
                <span className="font-bold text-base leading-none" style={{ color: "hsl(25, 70%, 35%)" }}>
                  {opt.guestCount}
                </span>
                <span className="text-[9px] mt-0.5" style={{ color: "hsl(25, 50%, 45%)" }}>人</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground line-clamp-1">
                  {opt.roomTypeName}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  純住宿 · 適合 {opt.guestCount} 位旅客
                  {nights > 1 && <> · 共 {nights} 晚</>}
                </p>
                <p className="text-[10px] mt-1" style={{ color: "hsl(25, 60%, 45%)" }}>
                  平均每人 NT${perPerson.toLocaleString()}/晚
                </p>
              </div>

              {/* 價格區：原價 → 折扣 → 售價 */}
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 mb-0.5">
                  <span className="text-[10px] line-through text-muted-foreground">
                    NT${opt.originalPrice.toLocaleString()}
                  </span>
                  <span
                    className="text-[9px] font-bold px-1 rounded leading-none"
                    style={{ background: "hsl(0, 75%, 95%)", color: "hsl(0, 75%, 45%)" }}
                  >
                    -{opt.discountPercent}%
                  </span>
                </div>
                <p className="font-bold text-base leading-none" style={{ color: "hsl(0, 75%, 50%)" }}>
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

            {/* 折疊觸發列 */}
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
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
            </button>

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
                        style={{ background: "hsl(25, 70%, 95%)", color: "hsl(25, 70%, 40%)" }}
                      >
                        {sp.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-[13px] text-foreground">{sp.label}</p>
                          {sp.tag && (
                            <span
                              className="text-[9px] font-bold px-1 py-px rounded leading-none"
                              style={{ background: "hsl(0, 75%, 95%)", color: "hsl(0, 75%, 45%)" }}
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
                        <p className="font-bold text-[13px] leading-none" style={{ color: "hsl(0, 75%, 50%)" }}>
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

      {/* ── 底部：平日單間方案（預設折疊） ── */}
      {singleOptions.length > 0 && (
        <Card className="overflow-hidden border-border/60 border-dashed">
          <button
            type="button"
            onClick={() => setSingleRoomOpen((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-3.5 py-3 transition-colors text-left",
              singleRoomOpen ? "bg-muted/40" : "hover:bg-muted/20"
            )}
            aria-expanded={singleRoomOpen}
          >
            <div
              className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "hsl(25, 30%, 95%)", color: "hsl(25, 50%, 45%)" }}
            >
              <BedDouble className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-foreground">平日單間方案</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                小資旅人可單訂個別房型 · 共 {singleOptions.length} 種
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                singleRoomOpen && "rotate-180"
              )}
            />
          </button>

          {singleRoomOpen && (
            <div className="border-t border-border/50 bg-muted/10">
              {singleOptions.map((opt) => {
                const perPerson = Math.round(opt.totalPrice / opt.guestCount / safeNights);
                return (
                  <button
                    key={opt.roomTypeId}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 border-b border-border/40 last:border-b-0 hover:bg-background transition-colors"
                  >
                    <div
                      className="shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center"
                      style={{ background: "hsl(25, 70%, 95%)" }}
                    >
                      <span className="font-bold text-sm leading-none" style={{ color: "hsl(25, 70%, 35%)" }}>
                        {opt.guestCount}
                      </span>
                      <span className="text-[8px] mt-0.5" style={{ color: "hsl(25, 50%, 45%)" }}>人</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-foreground line-clamp-1">
                        {opt.roomTypeName}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        平均每人 NT${perPerson.toLocaleString()}/晚
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[9px] line-through text-muted-foreground">
                          NT${opt.originalPrice.toLocaleString()}
                        </span>
                        <span
                          className="text-[8px] font-bold px-1 rounded leading-none"
                          style={{ background: "hsl(0, 75%, 95%)", color: "hsl(0, 75%, 45%)" }}
                        >
                          -{opt.discountPercent}%
                        </span>
                      </div>
                      <p className="font-bold text-[13px] leading-none mt-0.5" style={{ color: "hsl(0, 75%, 50%)" }}>
                        NT${opt.totalPrice.toLocaleString()}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default CapacityPriceLadder;
export type { CapacityOption };
