import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  CalendarDays,
  Lock,
  Info,
  Plus,
  TrendingDown,
  X,
  Baby,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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
  /** 用戶在搜尋條選的入住日期；用來自動判定時段 */
  checkIn?: Date | null;
  /** 用戶在搜尋條輸入的人數；用來高亮對應的階梯 */
  selectedGuestCount?: number | null;
  /** 自訂價目表（非森山民宿透過 accommodation_packages 帶入） */
  pricingTable?: Record<PricingTier, TierPrice[]>;
  /** 自訂「含...內容」清單（非森山可帶入） */
  planIncludes?: string[];
  /** 「一泊二食」標題（自訂顯示，預設保留森山文案） */
  includesTitle?: string;
  /** 是否開放「少人包區」區塊（預設 true，森山以外可關閉） */
  enableFewPeople?: boolean;
  /** 是否為森山（影響「包區/包棟」用詞，預設 true 保留森山文案） */
  isSensan?: boolean;
  /** 判斷某日期是否為國定假日（含補假），命中即視為假日 tier */
  isHolidayDate?: (date: Date | null | undefined) => boolean;
}

import {
  SENSAN_PRICING_TABLE as DEFAULT_PRICING_TABLE,
  detectSensanTierByDate as detectTierByDateShared,
  type SensanPricingTier as PricingTier,
  type SensanTierPrice as TierPrice,
} from "@/lib/sensan-pricing";

const DEFAULT_PLAN_INCLUDES = [
  { icon: <Ticket className="h-3.5 w-3.5" />, label: "星夢森林劇場門票" },
  { icon: <Camera className="h-3.5 w-3.5" />, label: "寫照體驗（棚拍）" },
  { icon: <Coffee className="h-3.5 w-3.5" />, label: "迎賓下午茶" },
  { icon: <Cookie className="h-3.5 w-3.5" />, label: "森山零食車" },
  { icon: <Leaf className="h-3.5 w-3.5" />, label: "手刷抹茶體驗" },
  { icon: <UtensilsCrossed className="h-3.5 w-3.5" />, label: "精緻早餐" },
];

const TIER_LABELS: Record<PricingTier, { short: string; full: string; hint: string; emoji: string }> = {
  weekday: { short: "平日", full: "週一 ~ 週四", hint: "含少人包區早鳥優惠", emoji: "💼" },
  friday_sunday: { short: "旺日", full: "週五、週日", hint: "標準包區方案", emoji: "✨" },
  weekend: { short: "假日", full: "週六、國定假日", hint: "假日包區方案", emoji: "🎉" },
};

function detectTierByDate(
  date: Date | null | undefined,
  isHoliday?: boolean
): PricingTier {
  if (isHoliday) return "weekend";
  return detectTierByDateShared(date);
}

const CapacityPriceLadder = ({
  roomTypes,
  onSelect,
  nights,
  checkIn,
  selectedGuestCount = null,
  pricingTable,
  planIncludes,
  includesTitle,
  enableFewPeople = true,
  isSensan = true,
  isHolidayDate,
}: Props) => {
  const TERM = isSensan ? "包區" : "包棟";
  const TIER_HINT: Record<PricingTier, string> = {
    weekday: isSensan ? "含少人包區早鳥優惠" : "標準銷售方案",
    friday_sunday: `標準${TERM}方案`,
    weekend: `假日${TERM}方案`,
  };
  const PRICING_TABLE = pricingTable || DEFAULT_PRICING_TABLE;
  const PLAN_INCLUDES = useMemo(() => {
    if (!planIncludes) return DEFAULT_PLAN_INCLUDES;
    return planIncludes.map((label) => ({
      icon: <Sparkles className="h-3.5 w-3.5" />,
      label,
    }));
  }, [planIncludes]);

  const [activeTier, setActiveTier] = useState<PricingTier>(() =>
    detectTierByDate(checkIn, isHolidayDate?.(checkIn))
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showIncludes, setShowIncludes] = useState(false);
  const [otherTierOpen, setOtherTierOpen] = useState(false);

  // 入住日變動時自動切到對應時段
  useEffect(() => {
    setActiveTier(detectTierByDate(checkIn, isHolidayDate?.(checkIn)));
  }, [checkIn, isHolidayDate]);

  const fallbackRoomType = roomTypes[0];

  const buildOption = (tier: TierPrice, isRecommended: boolean): CapacityOption => {
    // 優先用 tier 自己綁的 roomTypeId（資料驅動），否則 fallback 到容量匹配
    const boundRoomType = tier.roomTypeId
      ? roomTypes.find((rt) => rt.id === tier.roomTypeId)
      : null;
    const matched =
      boundRoomType ||
      roomTypes.find((rt) => rt.capacity === tier.guestCount) ||
      roomTypes.find((rt) => rt.capacity >= tier.guestCount) ||
      fallbackRoomType;

    const safeNights = Math.max(1, nights);
    const totalPrice = tier.sale * safeNights;
    const originalPrice = tier.original * safeNights;
    const discountPercent = tier.original > tier.sale
      ? Math.round(((tier.original - tier.sale) / tier.original) * 100)
      : 0;

    return {
      guestCount: tier.guestCount,
      roomTypeId: tier.roomTypeId || matched?.id || `virtual-${tier.guestCount}`,
      roomTypeName: tier.planName || matched?.name || `${tier.guestCount} 人${TERM}方案`,
      totalPrice,
      originalPrice,
      discountPercent,
      isRecommended,
    };
  };

  const currentTiers = PRICING_TABLE[activeTier];
  const fewPeopleTiers = enableFewPeople ? currentTiers.filter((t) => t.isFewPeople) : [];
  const standardTiers = enableFewPeople
    ? currentTiers.filter((t) => !t.isFewPeople)
    : currentTiers;

  const recommendedGuestCount = useMemo(() => {
    if (standardTiers.length === 0) return null;
    return standardTiers.reduce((best, cur) =>
      cur.sale / cur.guestCount < best.sale / best.guestCount ? cur : best
    ).guestCount;
  }, [standardTiers]);

  // 對應「搜尋條輸入人數」的最佳階梯：找剛好容納得下的最小方案
  const matchedGuestCount = useMemo(() => {
    if (!selectedGuestCount || selectedGuestCount <= 0) return null;
    const sorted = [...currentTiers].sort((a, b) => a.guestCount - b.guestCount);
    return (
      sorted.find((t) => t.guestCount >= selectedGuestCount)?.guestCount ?? null
    );
  }, [currentTiers, selectedGuestCount]);

  // 平日的少人包區，在旺日/假日要顯示為「禁用態」說明（僅當該民宿有設定少人包區方案時才顯示）
  const hasAnyFewPeopleConfigured = useMemo(
    () => (Object.values(PRICING_TABLE) as TierPrice[][]).some((tiers) => tiers.some((t) => t.isFewPeople)),
    [PRICING_TABLE]
  );

  if (roomTypes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        目前沒有可預訂的方案
      </div>
    );
  }

  const safeNights = Math.max(1, nights);
  const tierLabel = { ...TIER_LABELS[activeTier], hint: TIER_HINT[activeTier] };
  const otherTiers = (Object.keys(TIER_LABELS) as PricingTier[]).filter((t) => t !== activeTier);

  // 平日的少人包區，在旺日/假日要顯示為「禁用態」說明（僅當該民宿有設定少人包區方案時才顯示）
  const showDisabledFewPeopleNote = enableFewPeople && hasAnyFewPeopleConfigured && activeTier !== "weekday";

  return (
    <div className="space-y-3 px-4">
      {/* ── 當前時段橫條（自動判定） ── */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border"
        style={{
          background: "hsl(25, 70%, 97%)",
          borderColor: "hsl(25, 70%, 88%)",
        }}
      >
        <div
          className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-base"
          style={{ background: "hsl(25, 70%, 92%)" }}
          aria-hidden
        >
          {tierLabel.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-bold text-foreground">{tierLabel.short}方案</span>
            <span className="text-[10px] text-muted-foreground">{tierLabel.full}</span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "hsl(25, 70%, 35%)" }}>
            {checkIn ? (
              <>
                <CalendarDays className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                {format(checkIn, "MM/dd")}（{["日", "一", "二", "三", "四", "五", "六"][checkIn.getDay()]}）入住 · {tierLabel.hint}
              </>
            ) : (
              <>依今日推算 · {tierLabel.hint}</>
            )}
          </p>
        </div>

        {/* 其他時段查價 Popover */}
        <Popover open={otherTierOpen} onOpenChange={setOtherTierOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 text-[11px] font-medium underline decoration-dotted underline-offset-2"
              style={{ color: "hsl(25, 70%, 40%)" }}
            >
              其他時段查價
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-[12px] font-semibold text-foreground">切換查看其他時段</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                建議改入住日期以套用對應方案
              </p>
            </div>
            <div className="p-1">
              {otherTiers.map((t) => {
                const lbl = TIER_LABELS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setActiveTier(t);
                      setExpandedKey(null);
                      setOtherTierOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-muted/60 text-left"
                  >
                    <span className="text-base" aria-hidden>{lbl.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground">{lbl.short}方案</p>
                      <p className="text-[10px] text-muted-foreground">{lbl.full}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ── 人數價目階梯表（一眼比較划算度） ── */}
      <PriceLadderTable
        tiers={currentTiers}
        safeNights={safeNights}
        recommendedGuestCount={recommendedGuestCount}
        matchedGuestCount={matchedGuestCount}
        selectedGuestCount={selectedGuestCount}
      />

      {/* ── 一泊二食 包含內容（折疊；無 includes 則隱藏） ── */}
      {PLAN_INCLUDES.length > 0 && (
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
            <p className="font-semibold text-[13px] text-foreground">{includesTitle || `一泊二食 · 含 ${PLAN_INCLUDES.length} 項體驗`}</p>
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
      )}

      {/* ── 少人包區（平日才開放） ── */}
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
                term={TERM}
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

      {/* ── 旺日/假日：顯示「少人包區」禁用提示 ── */}
      {showDisabledFewPeopleNote && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded text-muted-foreground bg-muted"
            >
              不開放
            </span>
            <p className="text-[12px] font-semibold text-muted-foreground">少人包區（6 / 8 人）</p>
          </div>

          <Card className="overflow-hidden border-dashed border-border/70 bg-muted/20">
            <div className="px-3.5 py-3 flex items-center gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted/50">
                <Lock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground">
                  {tierLabel.short}不開放 6 / 8 人小包區
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  少人包區僅限週一~週四入住。若想使用，請改選平日日期。
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── 標準包區方案 ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1 pt-1">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "hsl(25, 70%, 92%)", color: "hsl(25, 70%, 35%)" }}
          >
            一泊二食
          </span>
          <p className="text-[12px] font-semibold text-foreground">
            {tierLabel.short}標準{TERM}方案
          </p>
        </div>

        {standardTiers.map((tier) => {
          const isRecommended = tier.guestCount === recommendedGuestCount;
          const opt = buildOption(tier, isRecommended);
          const saved = opt.originalPrice - opt.totalPrice;
          // 找一個更小人數的方案做對照（同 tier 內找最小的人數方案）
          const smallerTier = currentTiers.find(
            (t) => t.guestCount < tier.guestCount
          );
          const smallerPerPerson = smallerTier
            ? Math.round(smallerTier.sale / smallerTier.guestCount)
            : null;
          // 「往上跳一級」：找下一個更高人數的方案
          const biggerTier = standardTiers
            .filter((t) => t.guestCount > tier.guestCount)
            .sort((a, b) => a.guestCount - b.guestCount)[0];
          const biggerExtraTotal = biggerTier
            ? (biggerTier.sale - tier.sale) * safeNights
            : 0;
          const biggerPerPersonSaved = biggerTier
            ? Math.round(tier.sale / tier.guestCount) -
              Math.round(biggerTier.sale / biggerTier.guestCount)
            : 0;
          // 假日差價：同人數的 weekend 方案 sale - 當前 tier sale
          const weekendSame = PRICING_TABLE.weekend.find(
            (t) => t.guestCount === tier.guestCount
          );
          const holidayDiff =
            activeTier !== "weekend" && weekendSame
              ? weekendSame.sale - tier.sale
              : 0;
          return (
            <PriceCard
              key={`std-${tier.guestCount}`}
              opt={opt}
              tier={tier}
              saved={saved}
              nights={nights}
              safeNights={safeNights}
              accent="standard"
              term={TERM}
              onSelect={onSelect}
              isExpanded={expandedKey === `std-${tier.guestCount}`}
              onToggle={() =>
                setExpandedKey(
                  expandedKey === `std-${tier.guestCount}` ? null : `std-${tier.guestCount}`
                )
              }
              smallerPerPerson={smallerPerPerson}
              smallerGuestCount={smallerTier?.guestCount ?? null}
              biggerGuestCount={biggerTier?.guestCount ?? null}
              biggerExtraTotal={biggerExtraTotal}
              biggerPerPersonSaved={biggerPerPersonSaved}
              holidayDiff={holidayDiff}
            />
          );
        })}
      </div>

      {/* ── 底部提示 ── */}
      <div className="flex items-start gap-1.5 px-1 pt-1 pb-2">
        <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          價格依入住日期所屬時段自動套用。週六與國定假日為假日價，週五、週日為旺日價，週一至週四為平日價。
        </p>
      </div>
    </div>
  );
};

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
  smallerPerPerson?: number | null;
  smallerGuestCount?: number | null;
  biggerGuestCount?: number | null;
  biggerExtraTotal?: number;
  biggerPerPersonSaved?: number;
  holidayDiff?: number;
  term?: string;
}

// 人數情境：讓冷冰冰的數字變成可想像的畫面
const GUEST_SCENES: Array<{ max: number; emoji: string; label: string }> = [
  { max: 6, emoji: "👨‍👩‍👧", label: "小家庭・閨蜜" },
  { max: 8, emoji: "🧺", label: "親子小聚" },
  { max: 12, emoji: "🍻", label: "好友揪團" },
  { max: 14, emoji: "🎂", label: "生日同學會" },
  { max: 16, emoji: "🏡", label: "三代同堂" },
  { max: 999, emoji: "🎊", label: "整棟包下・尾牙" },
];
const getGuestScene = (n: number) =>
  GUEST_SCENES.find((s) => n <= s.max) ?? GUEST_SCENES[GUEST_SCENES.length - 1];

const PriceCard = ({
  opt,
  tier,
  saved,
  nights,
  safeNights,
  accent,
  onSelect,
  isExpanded,
  onToggle,
  smallerPerPerson = null,
  smallerGuestCount = null,
  biggerGuestCount = null,
  biggerExtraTotal = 0,
  biggerPerPersonSaved = 0,
  holidayDiff = 0,
  term = "包區",
}: PriceCardProps) => {
  const perPerson = Math.round(opt.totalPrice / opt.guestCount / safeNights);
  const scene = getGuestScene(opt.guestCount);

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
        className="w-full text-left p-3.5 flex items-start gap-3 hover:bg-muted/30 transition-colors"
      >
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

        <div className="flex-1 min-w-0">
          {/* 標籤列（最划算已用右上 ribbon，不重複顯示） */}
          {tier.tags && tier.tags.filter((t) => t !== "best_value").length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {tier.tags
                .filter((t) => t !== "best_value")
                .map((tag) => {
                  const map: Record<string, string> = {
                    early_bird: "早鳥優惠",
                    meal_included: "一泊二食",
                    few_people: "少人數包棟",
                  };
                  const label = map[tag] || tag;
                  return (
                    <span
                      key={tag}
                      className="text-[9px] font-bold px-1.5 py-px rounded leading-none"
                      style={{ background: accentBgMid, color: accentText }}
                    >
                      {label}
                    </span>
                  );
                })}
            </div>
          )}
          <p className="font-semibold text-sm text-foreground line-clamp-1">
            {tier.planName || `${opt.guestCount} 人${term}`}
          </p>
          {tier.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {tier.subtitle}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {tier.roomAllocation}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <p className="text-[10px]" style={{ color: accentText }}>
              平均每人 NT${perPerson.toLocaleString()}/晚
            </p>
            {tier.guestCountMax && tier.guestCountMax > opt.guestCount && (
              <span className="text-[10px] text-muted-foreground">
                · 上限 {tier.guestCountMax} 人
              </span>
            )}
          </div>
        </div>

        <div className={`text-right shrink-0 ${opt.isRecommended ? "pt-5" : ""}`}>
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

      {/* ── 站內比價列：含內容（精簡 2~3 行） ── */}
      {accent === "standard" && (() => {
        // 用方案的 includes（過濾掉 no），最多 2 行；其餘進可展開區
        const yesItems = (tier.includes || []).filter((i) => i.available !== "no");
        const useDataIncludes = yesItems.length > 0;
        return (
          <div
            className="border-t border-border/50 px-3 py-2 space-y-1.5"
            style={{ background: "hsl(140, 25%, 97%)" }}
          >
            {smallerPerPerson && smallerGuestCount && smallerPerPerson > Math.round(opt.totalPrice / opt.guestCount / safeNights) && (
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 shrink-0" style={{ color: "hsl(0, 75%, 45%)" }} />
                <p className="text-[10.5px] leading-tight text-foreground">
                  每人僅
                  <span className="font-bold mx-0.5" style={{ color: "hsl(0, 75%, 45%)" }}>
                    NT${Math.round(opt.totalPrice / opt.guestCount / safeNights).toLocaleString()}
                  </span>
                  / 晚，比 {smallerGuestCount} 人方案
                  <span className="font-bold mx-0.5" style={{ color: "hsl(0, 75%, 45%)" }}>
                    省 NT${(smallerPerPerson - Math.round(opt.totalPrice / opt.guestCount / safeNights)).toLocaleString()} / 人
                  </span>
                </p>
              </div>
            )}

            {useDataIncludes ? (
              yesItems.slice(0, 2).map((inc, i) => {
                const isOptional = inc.available === "optional";
                const Icon = isOptional ? Plus : Check;
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <Icon
                      className="h-3 w-3 shrink-0"
                      style={{ color: isOptional ? "hsl(25, 70%, 45%)" : "hsl(140, 50%, 35%)" }}
                    />
                    <p className="text-[10.5px] leading-tight text-foreground line-clamp-1">
                      <span className="font-medium">{inc.text}</span>
                      {inc.price_note && (
                        <span className="text-muted-foreground"> · {inc.price_note}</span>
                      )}
                    </p>
                  </div>
                );
              })
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0" style={{ color: "hsl(140, 50%, 35%)" }} />
                  <p className="text-[10.5px] leading-tight text-foreground">
                    <span className="font-medium">早餐已含</span>
                    <span className="text-muted-foreground"> · 等值 NT$2,400 已包進總價</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <p className="text-[10.5px] leading-tight text-muted-foreground">
                    加床 <span className="font-medium text-foreground">+NT$3,500 / 床</span>（如需要）
                  </p>
                </div>
              </>
            )}

            {holidayDiff > 0 && (
              <div className="flex items-center gap-1.5">
                <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                <p className="text-[10.5px] leading-tight text-muted-foreground">
                  改假日入住 <span className="font-medium text-foreground">+NT${holidayDiff.toLocaleString()}</span>（同人數）
                </p>
              </div>
            )}

            {biggerGuestCount && biggerExtraTotal > 0 && biggerPerPersonSaved > 0 && (
              <div
                className="flex items-center gap-1.5 mt-1 px-1.5 py-1 rounded"
                style={{ background: "hsl(25, 70%, 95%)" }}
              >
                <TrendingDown className="h-3 w-3 shrink-0" style={{ color: "hsl(25, 70%, 40%)" }} />
                <p className="text-[10.5px] leading-tight" style={{ color: "hsl(25, 70%, 30%)" }}>
                  再揪
                  <span className="font-bold mx-0.5">
                    {biggerGuestCount - opt.guestCount} 人
                  </span>
                  升級到 {biggerGuestCount} 人方案，
                  只多
                  <span className="font-bold mx-0.5">NT${biggerExtraTotal.toLocaleString()}</span>
                  ，每人省
                  <span className="font-bold mx-0.5">NT${biggerPerPersonSaved.toLocaleString()}/晚</span>
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {(() => {
        const allIncludes = tier.includes || [];
        const hasMoreIncludes = allIncludes.length > 2;
        const hasChildInfo = !!(tier.childCountMax || tier.childAgeNote);
        const hasExtra = hasMoreIncludes || hasChildInfo;
        return (
          <>
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
                {isExpanded ? "收合方案明細" : hasExtra ? "查看方案明細" : "查看房型分配"}
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
            </button>

            {isExpanded && (
              <div className="border-t border-border/50 bg-muted/10 px-3.5 py-2.5 space-y-2.5">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">房型分配</p>
                  <p className="text-[12px] font-medium text-foreground">{tier.roomAllocation}</p>
                </div>

                {hasChildInfo && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                      <Baby className="h-3 w-3" /> 兒童
                    </p>
                    <p className="text-[12px] text-foreground">
                      {tier.childCountMax ? `最多可加 ${tier.childCountMax} 位兒童` : ""}
                      {tier.childCountMax && tier.childAgeNote ? "・" : ""}
                      {tier.childAgeNote || ""}
                    </p>
                  </div>
                )}

                {allIncludes.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">附加說明</p>
                    <ul className="space-y-1">
                      {allIncludes.map((inc, i) => {
                        const Icon = inc.available === "yes" ? Check : inc.available === "no" ? X : Plus;
                        const color =
                          inc.available === "yes"
                            ? "hsl(140, 50%, 35%)"
                            : inc.available === "no"
                              ? "hsl(0, 60%, 55%)"
                              : "hsl(25, 70%, 45%)";
                        const textCls =
                          inc.available === "no"
                            ? "text-muted-foreground line-through"
                            : "text-foreground";
                        return (
                          <li key={i} className="flex items-start gap-1.5">
                            <Icon className="h-3 w-3 mt-0.5 shrink-0" style={{ color }} />
                            <span className={`text-[11.5px] leading-tight ${textCls}`}>
                              {inc.text}
                              {inc.price_note && (
                                <span className="text-muted-foreground ml-1">
                                  ({inc.price_note})
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}
    </Card>
  );
};

interface PriceLadderTableProps {
  tiers: TierPrice[];
  safeNights: number;
  recommendedGuestCount: number | null;
  matchedGuestCount?: number | null;
  selectedGuestCount?: number | null;
}

const PriceLadderTable = ({
  tiers,
  safeNights,
  recommendedGuestCount,
  matchedGuestCount = null,
  selectedGuestCount = null,
}: PriceLadderTableProps) => {
  if (tiers.length === 0) return null;

  // 以最高人數方案的每人/晚作為「最低基準」，比例越高代表越貴
  const perPersonList = tiers.map((t) => ({
    tier: t,
    perPerson: Math.round(t.sale / t.guestCount / safeNights),
  }));
  const cheapestPerPerson = Math.min(...perPersonList.map((x) => x.perPerson));
  const mostExpensivePerPerson = Math.max(...perPersonList.map((x) => x.perPerson));
  const range = Math.max(1, mostExpensivePerPerson - cheapestPerPerson);

  return (
    <Card className="overflow-hidden border-border/60">
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1.5"
        style={{ background: "hsl(25, 70%, 97%)" }}
      >
        <TrendingDown className="h-3.5 w-3.5" style={{ color: "hsl(25, 70%, 40%)" }} />
        <p className="text-[12px] font-semibold text-foreground">人數越多 · 平均每人越划算</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground">
              <th className="text-left px-3 py-1.5 font-medium">人數</th>
              <th className="text-right px-2 py-1.5 font-medium whitespace-nowrap">
                {safeNights > 1 ? `總價 / ${safeNights} 晚` : "總價 / 晚"}
              </th>
              <th className="text-right px-3 py-1.5 font-medium whitespace-nowrap">每人 / 晚</th>
            </tr>
          </thead>
          <tbody>
            {perPersonList.map(({ tier, perPerson }) => {
              const isRecommended = tier.guestCount === recommendedGuestCount;
              const isCheapest = perPerson === cheapestPerPerson;
              const isMatched = tier.guestCount === matchedGuestCount;
              // 條形比例：最便宜=100%，最貴=30%
              const ratio = 1 - (perPerson - cheapestPerPerson) / range;
              const barWidth = `${Math.round(30 + ratio * 70)}%`;
              return (
                <tr
                  key={tier.guestCount}
                  className={cn(
                    "border-t border-border/40 transition-colors",
                    isMatched && "bg-[hsl(25,70%,93%)] ring-2 ring-inset ring-[hsl(25,70%,55%)]",
                    !isMatched && isCheapest && "bg-[hsl(25,70%,97%)]"
                  )}
                >
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <span className="font-semibold text-foreground">{tier.guestCount} 人</span>
                      {tier.isFewPeople && (
                        <span
                          className="text-[9px] font-bold px-1 py-px rounded leading-none text-white"
                          style={{ background: "hsl(0, 75%, 50%)" }}
                        >
                          早鳥
                        </span>
                      )}
                      {isRecommended && (
                        <span
                          className="text-[9px] font-bold px-1 py-px rounded leading-none text-white"
                          style={{ background: "hsl(25, 70%, 50%)" }}
                        >
                          最划算
                        </span>
                      )}
                      {isMatched && selectedGuestCount && (
                        <span
                          className="text-[9px] font-bold px-1 py-px rounded leading-none text-white"
                          style={{ background: "hsl(140, 50%, 40%)" }}
                        >
                          ← 你的 {selectedGuestCount} 人
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-foreground/80">
                    NT${(tier.sale * safeNights).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: barWidth,
                            background: isCheapest
                              ? "hsl(0, 75%, 50%)"
                              : "hsl(25, 70%, 55%)",
                          }}
                        />
                      </div>
                      <span
                        className={cn(
                          "font-bold whitespace-nowrap",
                          isCheapest ? "text-base" : "text-[12px]"
                        )}
                        style={{
                          color: isCheapest ? "hsl(0, 75%, 50%)" : "hsl(25, 70%, 35%)",
                        }}
                      >
                        NT${perPerson.toLocaleString()}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default CapacityPriceLadder;
export type { CapacityOption };
