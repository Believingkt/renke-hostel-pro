import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ChevronRight, Check } from "lucide-react";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  base_price: number;
  room_count: number | null;
}

interface CapacityOption {
  guestCount: number;
  /** 對應使用的房型（從小到大組合，剛好容納人數的最佳組合） */
  roomTypeId: string;
  roomTypeName: string;
  totalPrice: number;
  /** 是否為「最划算」推薦 */
  isRecommended?: boolean;
}

interface Props {
  roomTypes: RoomType[];
  /** 點擊方案後跳轉至 booking flow */
  onSelect: (option: CapacityOption) => void;
  /** 入住晚數，影響總價計算 */
  nights: number;
}

/**
 * 包棟特化：人數階梯卡片
 *
 * 邏輯：
 * - 將所有房型依 capacity 排序
 * - 對每個房型生成一張「N 人方案」卡片
 * - 顯示總價 + 平均每人單價
 */
const CapacityPriceLadder = ({ roomTypes, onSelect, nights }: Props) => {
  const options: CapacityOption[] = useMemo(() => {
    if (roomTypes.length === 0) return [];

    // 依容納人數遞增排序，並移除重複容量（同容量取最便宜）
    const byCapacity = new Map<number, RoomType>();
    for (const rt of roomTypes) {
      const existing = byCapacity.get(rt.capacity);
      if (!existing || rt.base_price < existing.base_price) {
        byCapacity.set(rt.capacity, rt);
      }
    }

    const sorted = Array.from(byCapacity.values()).sort((a, b) => a.capacity - b.capacity);

    // 找出 CP 值最高（每人單價最低）的方案標記為推薦
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

  return (
    <div className="space-y-2.5 px-4">
      {options.map((opt) => {
        const perPerson = Math.round(opt.totalPrice / opt.guestCount / Math.max(1, nights));
        return (
          <Card
            key={opt.roomTypeId}
            className="overflow-hidden border-border/60 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer relative"
            onClick={() => onSelect(opt)}
          >
            {opt.isRecommended && (
              <div
                className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-md flex items-center gap-0.5"
                style={{ background: "hsl(25, 70%, 50%)" }}
              >
                <Check className="h-2.5 w-2.5" />
                最划算
              </div>
            )}

            <div className="p-3.5 flex items-center gap-3">
              {/* Capacity badge */}
              <div
                className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(25, 70%, 96%), hsl(25, 70%, 90%))",
                }}
              >
                <Users className="h-4 w-4 mb-0.5" style={{ color: "hsl(25, 70%, 45%)" }} />
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
                  適合 {opt.guestCount} 位旅客
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
                <Button
                  size="sm"
                  className="mt-1.5 h-7 px-2.5 text-[11px] gap-0.5 text-white"
                  style={{ background: "hsl(25, 70%, 50%)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(opt);
                  }}
                >
                  選擇
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default CapacityPriceLadder;
export type { CapacityOption };
