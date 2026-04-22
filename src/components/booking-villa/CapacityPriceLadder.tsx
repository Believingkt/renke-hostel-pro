import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Users,
  ChevronRight,
  Check,
  ChevronDown,
  Ticket,
  Camera,
  Coffee,
  Cookie,
  Leaf,
  UtensilsCrossed,
  Sparkles,
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
  originalPrice: number;
  discountPercent: number;
  isRecommended?: boolean;
}

interface Props {
  roomTypes: RoomType[];
  onSelect: (option: CapacityOption, subPlanKey?: string) => void;
  nights: number;
}

type PricingTier = "weekday" | "friday_sunday" | "weekend";

/** 各時段的人數階梯定價（依照森山寫照 DM 實際定價） */
interface TierPrice {
  guestCount: number;
  original: number;
  sale: number;
  roomAllocation: string;
  isFewPeople?: boolean; // 少人包區（僅平日）
}

const PRICING_TABLE: Record<PricingTier, TierPrice[]> = {
  // 週一 ~ 週四：少人包區早鳥 + 標準包區
  weekday: [
    { guestCount: 6, original: 18000, sale: 14999, roomAllocation: "雙人房 3 間", isFewPeople: true },
    { guestCount: 8, original: 24000, sale: 19999, roomAllocation: "雙人房 1 間 · 四人房 2 間", isFewPeople: true },
    { guestCount: 12, original: 47000, sale: 35250, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 54000, sale: 40500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 57000, sale: 42750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 60000, sale: 45000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
  // 週五、週日：標準平日包區
  friday_sunday: [
    { guestCount: 12, original: 47000, sale: 35250, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 54000, sale: 40500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 57000, sale: 42750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 60000, sale: 45000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
  // 週六、國定假日
  weekend: [
    { guestCount: 12, original: 58000, sale: 43500, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 66000, sale: 49500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 69000, sale: 51750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 72000, sale: 54000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
};

/** 一泊二食包含的 6 項體驗（從 DM 文案抽出） */
const PLAN_INCLUDES = [
  { icon: <Ticket className="h-3.5 w-3.5" />, label: "星夢森林劇場門票" },
  { icon: <Camera className="h-3.5 w-3.5" />, label: "寫照體驗（棚拍）" },
  { icon: <Coffee className="h-3.5 w-3.5" />, label: "迎賓下午茶" },
  { icon: <Cookie className="h-3.5 w-3.5" />, label: "森山零食車" },
  { icon: <Leaf className="h-3.5 w-3.5" />, label: "手刷抹茶體驗" },
  { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, label: "精緻早餐" },
];

const TIER_LABELS: Record<PricingTier, { short: string; full: string; hint: string }> = {
  weekday: { short: "平日", full: "週一 ~ 週四", hint: "含少人包區早鳥優惠" },
  friday_sunday: { short: "週五日", full: "週五、週日", hint: "標準包區方案" },
  weekend: { short: "假日", full: "週六、國定假日", hint: "假日包區方案" },
};

/** 自動依入住日推測時段 */
function detectInitialTier(): PricingTier {
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

const CapacityPriceLadder = ({ roomTypes, onSelect, nights }: Props) => {
  const [activeTier, setActiveTier] = useState<PricingTier>(detectInitialTier());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showIncludes, setShowIncludes] = useState(false);

  /** 把預設定價對應到實際的 roomTypes（找不到就用第一個） */
  const fallbackRoomType = roomTypes[0];

  const buildOption = (tier: TierPrice, isRecommended: boolean): CapacityOption => {
    // 嘗試對應到實際 roomType（依容量），否則用 fallback
    const matched =
      roomTypes.find((rt) => rt.capacity === tier.guestCount) ||
      roomTypes.find((rt) => rt.capacity >= tier.guestCount) ||
      fallbackRoomType;

    const safeNights = Math.max(1, nights);
    const totalPrice = tier.sale * safeNights;
    const originalPrice = tier.original * safeNights;
    const discountPercent = Math.round(((tier.original - tier.sale) / tier.original) * 100);

    return {
      guestCount: tier.guestCount,
      roomTypeId: matched?.id || `virtual-${tier.guestCount}`,
      roomTypeName: matched?.name || `${tier.guestCount} 人包區方案`,
      totalPrice,
      originalPrice,
      discountPercent,
      isRecommended,
    };
  };

  const currentTiers = PRICING_TABLE[activeTier];
  const fewPeopleTiers = currentTiers.filter((t) => t.isFewPeople);
  const standardTiers = currentTiers.filter((t) => !t.isFewPeople);

  // 推薦：標準方案中每人單價最低者
  const recommendedGuestCount = useMemo(() => {
    if (standardTiers.length === 0) return null;
    return standardTiers.reduce((best, cur) =>
      cur.sale / cur.guestCount < best.sale / best.guestCount ? cur : best
    ).guestCount;
  }, [standardTiers]);

  if (roomTypes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        目前沒有可預訂的方案
      </div>
    );
  }

  const safeNights = Math.max(1, nights);

  return (
    <div className="space-y-3 px-4">
      {/* ── 時段切換 Tabs ── */}
      <Tabs value={activeTier} onValueChange={(v) => { setActiveTier(v as PricingTier); setExpandedKey(null); }}>
        <TabsList className="grid grid-cols-3 w-full h-auto p-1 bg-muted/60">
          {(Object.keys(TIER_LABELS) as PricingTier[]).map((tier) => (
            <TabsTrigger
              key={tier}
              value={tier}
              className="flex flex-col gap-0.5 py-1.5 px-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <span className="text-[12px] font-semibold leading-tight">{TIER_LABELS[tier].short}</span>
              <span className="text-[9px] text-muted-foreground leading-tight">{TIER_LABELS[tier].full}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(TIER_LABELS) as PricingTier[]).map((tier) => (
          <TabsContent key={tier} value={tier} className="mt-2.5 space-y-2.5">
            {/* 時段提示 */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium"
              style={{
                background: "hsl(25, 70%, 96%)",
                color: "hsl(25, 70%, 35%)",
              }}
            >
              <Sparkles className="h-3 w-3" />
              {TIER_LABELS[tier].hint}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── 一泊二食 包含內容（折疊） ── */}
      <Card className="overflow-hidden border-border/60">
        <button
          type="button"
          onClick={() => setShowIncludes((v) => !v)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
            showIncludes ? "bg-muted/40" : "hover:bg-muted/20"
          )}
          aria-expanded={showIncludes}
        >
          <div
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "hsl(140, 30%, 92%)", color: "hsl(140, 40%, 30%)" }}
          >
            <UtensilsCrossed className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13px] text-foreground">一泊二食 · 含 6 項體驗</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              點此查看方案完整內容
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showIncludes && "rotate-180")} />
        </button>

        {showIncludes && (
          <div className="border-t border-border/50 bg-muted/10 px-3.5 py-2.5 grid grid-cols-2 gap-2">
            {PLAN_INCLUDES.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span style={{ color: "hsl(140, 40%, 35%)" }}>{item.icon}</span>
                <span className="text-[11px] text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 少人包區（僅平日顯示） ── */}
      {activeTier === "weekday" && fewPeopleTiers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
              style={{ background: "hsl(0, 75%, 50%)" }}
            >
              限週一~四
            </span>
            <p className="text-[12px] font-semibold text-foreground">少人包區 · 早鳥活動價</p>
          </div>

          {fewPeopleTiers.map((tier) => {
            const opt = buildOption(tier, false);
            const saved = opt.originalPrice - opt.totalPrice;
            return (
              <PriceCard
                key={`few-${tier.guestCount}`}
                opt={opt}
                tier={tier}
                saved={saved}
                nights={nights}
                safeNights={safeNights}
                accent="few"
                onSelect={onSelect}
                isExpanded={expandedKey === `few-${tier.guestCount}`}
                onToggle={() =>
                  setExpandedKey(
                    expandedKey === `few-${tier.guestCount}` ? null : `few-${tier.guestCount}`
                  )
                }
              />
            );
          })}
        </div>
      )}

      {/* ── 標準包區方案 ── */}
      <div className="space-y-2">
        {(activeTier === "weekday" && fewPeopleTiers.length > 0) && (
          <div className="flex items-center gap-1.5 px-1 pt-1">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: "hsl(25, 70%, 92%)", color: "hsl(25, 70%, 35%)" }}
            >
              一泊二食
            </span>
            <p className="text-[12px] font-semibold text-foreground">標準包區方案</p>
          </div>
        )}

        {standardTiers.map((tier) => {
          const isRecommended = tier.guestCount === recommendedGuestCount;
          const opt = buildOption(tier, isRecommended);
          const saved = opt.originalPrice - opt.totalPrice;
          return (
            <PriceCard
              key={`std-${tier.guestCount}`}
              opt={opt}
              tier={tier}
              saved={saved}
              nights={nights}
              safeNights={safeNights}
              accent="standard"
              onSelect={onSelect}
              isExpanded={expandedKey === `std-${tier.guestCount}`}
              onToggle={() =>
                setExpandedKey(
                  expandedKey === `std-${tier.guestCount}` ? null : `std-${tier.guestCount}`
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
};

/** 單張價格卡（共用） */
interface PriceCardProps {
  opt: CapacityOption;
  tier: TierPrice;
  saved: number;
  nights: number;
  safeNights: number;
  accent: "few" | "standard";
  onSelect: (option: CapacityOption, subPlanKey?: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

const PriceCard = ({ opt, tier, saved, nights, safeNights, accent, onSelect, isExpanded, onToggle }: PriceCardProps) => {
  const perPerson = Math.round(opt.totalPrice / opt.guestCount / safeNights);

  // 配色：少人包區用紅（特惠），標準包區用橘（品牌色）
  const accentColor = accent === "few" ? "hsl(0, 75%, 50%)" : "hsl(25, 70%, 50%)";
  const accentBgLight = accent === "few" ? "hsl(0, 75%, 96%)" : "hsl(25, 70%, 96%)";
  const accentBgMid = accent === "few" ? "hsl(0, 75%, 90%)" : "hsl(25, 70%, 90%)";
  const accentText = accent === "few" ? "hsl(0, 75%, 40%)" : "hsl(25, 70%, 35%)";

  return (
    <Card className="overflow-hidden border-border/60 hover:border-primary/50 transition-all relative">
      {opt.isRecommended && (
        <div
          className="absolute top-0 right-0 z-10 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-md flex items-center gap-0.5"
          style={{ background: "hsl(25, 70%, 50%)" }}
        >
          <Check className="h-2.5 w-2.5" />
          最划算
        </div>
      )}

      <button
        type="button"
        onClick={() => onSelect(opt)}
        className="w-full text-left p-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        {/* 人數圖示 */}
        <div
          className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${accentBgLight}, ${accentBgMid})`,
          }}
        >
          <Users className="h-4 w-4 mb-0.5" style={{ color: accentColor }} />
          <span className="font-bold text-base leading-none" style={{ color: accentText }}>
            {opt.guestCount}
          </span>
          <span className="text-[9px] mt-0.5" style={{ color: accentText }}>人</span>
        </div>

        {/* 中間資訊 */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">
            {opt.guestCount} 人包區
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {tier.roomAllocation}
          </p>
          <p className="text-[10px] mt-1" style={{ color: accentText }}>
            平均每人 NT${perPerson.toLocaleString()}/晚
          </p>
        </div>

        {/* 價格區 */}
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1 mb-0.5">
            <span className="text-[10px] line-through text-muted-foreground">
              NT${opt.originalPrice.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-end gap-1 mb-0.5">
            <span
              className="text-[9px] font-bold px-1 py-px rounded leading-none"
              style={{ background: "hsl(0, 75%, 95%)", color: "hsl(0, 75%, 45%)" }}
            >
              -{opt.discountPercent}%
            </span>
            <span className="text-[9px] font-medium" style={{ color: "hsl(0, 75%, 45%)" }}>
              省 ${saved.toLocaleString()}
            </span>
          </div>
          <p className="font-bold text-base leading-none" style={{ color: "hsl(0, 75%, 50%)" }}>
            NT${opt.totalPrice.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {nights > 1 ? `總價/${nights}晚` : "/晚"}
          </p>
          <span
            className="inline-flex items-center gap-0.5 mt-1.5 h-7 px-2.5 text-[11px] rounded-md text-white font-medium"
            style={{ background: accentColor }}
          >
            選擇
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </button>

      {/* 房型分配明細（可選展開） */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "w-full px-3.5 py-1.5 flex items-center justify-between border-t border-border/50 text-[11px] font-medium transition-colors",
          isExpanded ? "bg-muted/40 text-foreground" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
        )}
        aria-expanded={isExpanded}
      >
        <span className="flex items-center gap-1.5">
          <BedDouble className="h-3 w-3" />
          {isExpanded ? "收合房型分配" : "查看房型分配"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
      </button>

      {isExpanded && (
        <div className="border-t border-border/50 bg-muted/10 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-1">本方案配置：</p>
          <p className="text-[12px] font-medium text-foreground">{tier.roomAllocation}</p>
        </div>
      )}
    </Card>
  );
};

export default CapacityPriceLadder;
export type { CapacityOption };
