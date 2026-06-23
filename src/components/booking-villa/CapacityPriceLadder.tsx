import { useMemo, useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import PackagePhotoCarousel from "./PackagePhotoCarousel";
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
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  TW_DEFAULT_CANCEL_RULES,
  getFreeCancelDeadline,
  formatFreeCancelDeadline,
  DEFAULT_FREE_CANCEL_DAYS,
} from "@/lib/cancellation-policy";

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
  /** 免費取消天數（住宿日前 N 日含以前取消 0%）。預設 14（台灣法規） */
  freeCancelDays?: number;
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
  freeCancelDays,
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
  const [selectedGuest, setSelectedGuest] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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

      {/* ── 包區方案：人數 Tab + 單一方案卡（參考圖二） ── */}
      {(() => {
        const allTiers = [...currentTiers].sort((a, b) => a.guestCount - b.guestCount);
        if (allTiers.length === 0) {
          return (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              此時段目前沒有可預訂的方案
            </div>
          );
        }

        // 選定的人數（預設：搜尋條 → 最划算 → 第一個）
        const defaultGuest =
          (selectedGuest ?? matchedGuestCount ?? recommendedGuestCount ?? allTiers[0].guestCount);
        const activeTier_ =
          allTiers.find((t) => t.guestCount === defaultGuest) || allTiers[0];

        const opt = buildOption(activeTier_, activeTier_.guestCount === recommendedGuestCount);
        const saved = opt.originalPrice - opt.totalPrice;
        const scene = getGuestScene(activeTier_.guestCount);
        const yesItems = (activeTier_.includes || []).filter((i) => i.available === "yes");
        const optionalItems = (activeTier_.includes || []).filter((i) => i.available === "optional");

        const allocation = activeTier_.roomTypeAllocation || [];
        // 攤平：每一間房一張縮圖（給「房間搭配」顯示用，目前已改成文字 + 輪播照片）
        const roomTiles: { rt: any; index: number }[] = [];
        allocation.forEach((a) => {
          const rt: any = roomTypes.find((r) => r.id === a.room_type_id);
          if (!rt) return;
          for (let i = 0; i < a.qty; i++) roomTiles.push({ rt, index: i });
        });
        const roomBreakdown = allocation
          .map((a) => {
            const rt: any = roomTypes.find((r) => r.id === a.room_type_id);
            return rt ? `${rt.name}×${a.qty}` : null;
          })
          .filter(Boolean)
          .join("・");

        // 房型照片輪播：取所有綁定房型的全部照片
        const carouselPhotos: { url: string; rtName: string; sizeSqm?: number | null }[] = [];
        const seenRtIds = new Set<string>();
        allocation.forEach((a) => {
          if (seenRtIds.has(a.room_type_id)) return;
          seenRtIds.add(a.room_type_id);
          const rt: any = roomTypes.find((r) => r.id === a.room_type_id);
          if (!rt) return;
          const photos = Array.isArray(rt.room_photos) ? rt.room_photos : [];
          photos.forEach((p: any) => {
            if (p?.photo_url) {
              carouselPhotos.push({
                url: p.photo_url,
                rtName: rt.name || "",
                sizeSqm: rt.size_sqm ?? null,
              });
            }
          });
        });


        return (
          <div className="space-y-4">
            {/* 人數 Tab — 可左右滑動 */}
            <GuestTabsScroller
              tiers={allTiers}
              activeGuestCount={activeTier_.guestCount}
              onSelect={(g) => setSelectedGuest(g)}
            />


            {/* 整合圖卡：照片 → 房型分配 → 方案 → 價格 */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              {/* 1. 房型照片輪播（綁定房型的全部照片） */}
              {carouselPhotos.length > 0 && (
                <PackagePhotoCarousel photos={carouselPhotos.map((p) => ({ url: p.url, rtName: p.rtName }))} />
              )}


              <div className="px-4 pt-3 pb-4 space-y-3">
                {/* 2. 房型分配 */}
                {(activeTier_.roomAllocation || roomBreakdown) && (
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground/80">
                      ROOM ALLOCATION
                    </p>
                    <p className="text-[14px] font-bold text-foreground mt-0.5">
                      <span className="mr-1" aria-hidden>👆</span>
                      房間搭配：{activeTier_.roomAllocation || roomBreakdown}
                    </p>
                  </div>
                )}

                {/* 3. 模組化資訊區塊：禮遇 + 訂房規則 */}
                <div className="rounded-xl bg-[#F9F8F6] border border-border/50 p-3.5 space-y-3">
                  {/* 禮遇標題 + 獨享 Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-bold text-foreground">
                      {activeTier_.subtitle || "尊榮禮遇"}
                    </p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-border/60 text-gray-600 text-[11px]">
                      <Sparkles className="h-3 w-3" style={{ color: "#A98467" }} />
                      僅接待一組貴賓
                    </span>
                  </div>

                  {/* 禮遇清單 */}
                  <ul className="space-y-2">
                    {[
                      "私人管家全程接待",
                      "迎賓下午茶與在地點心",
                      "全棟空間尊榮獨享",
                    ].map((label, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#A98467" }} />
                        <span className="text-[13px] text-gray-700 leading-snug">{label}</span>
                      </li>
                    ))}
                  </ul>

                  {/* 分隔線 */}
                  {((activeTier_.childCountMax || activeTier_.childAgeNote)) && (
                    <div className="h-px bg-border/50" />
                  )}

                  {/* 訂房規則：兒童 */}
                  {(activeTier_.childCountMax || activeTier_.childAgeNote) && (
                    <p className="text-[12px] text-gray-600 flex items-center gap-1.5">
                      <Baby className="h-3.5 w-3.5" style={{ color: "#A98467" }} />
                      {activeTier_.childCountMax ? `可加 ${activeTier_.childCountMax} 位兒童` : ""}
                      {activeTier_.childCountMax && activeTier_.childAgeNote ? "・" : ""}
                      {activeTier_.childAgeNote || ""}
                    </p>
                  )}
                </div>

                {/* 4. 價格 + CTA（緊貼按鈕） */}
                <div className="pt-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-[15px] leading-tight text-foreground tracking-tight">
                      {activeTier_.planName || `${opt.guestCount} 人${TERM}`}
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    <Users className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                    可入住 {opt.guestCount} 位
                    {activeTier_.guestCountMax && activeTier_.guestCountMax > opt.guestCount && (
                      <span>~{activeTier_.guestCountMax}</span>
                    )}
                    {" · "}
                    <span className="font-bold text-foreground">
                      {checkIn && nights > 0
                        ? `${format(checkIn, "M/d")}–${format(new Date(checkIn.getTime() + nights * 86400000), "M/d")} ${nights > 1 ? `${nights} 晚總價` : "單晚總價"}`
                        : nights > 1 ? `${nights} 晚總價` : "單晚總價"}
                    </span>
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                    <span
                      className="font-bold text-[32px] leading-none tabular-nums tracking-tight"
                      style={{ color: "#A98467" }}
                    >
                      NT${opt.totalPrice.toLocaleString()}
                    </span>
                    {saved > 0 && (
                      <span
                        className="inline-flex items-center text-[12px] font-medium px-2.5 py-0.5 rounded-full"
                        style={{ background: "#FDF6F5", color: "#C25953" }}
                      >
                        限時特別禮遇
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-300 mt-1">已含稅與服務費</p>

                  {/* 信任訊號：按鈕正上方 */}
                  {(() => {
                    const effectiveFreeDays = freeCancelDays ?? DEFAULT_FREE_CANCEL_DAYS;
                    const deadline = getFreeCancelDeadline(checkIn, effectiveFreeDays);
                    const isFreeNow = !deadline || deadline.getTime() >= Date.now();
                    return (
                      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: "#2F5D3A" }}>
                        <li className="flex items-center gap-1 text-[12.5px] font-medium">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                          <span>即時確認</span>
                        </li>
                        <li>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-[12.5px] font-medium focus:outline-none"
                                style={{ color: "#2F5D3A" }}
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                                <span>
                                  {deadline && isFreeNow
                                    ? `免費取消 ${formatFreeCancelDeadline(deadline)} 之前`
                                    : "依政策免費取消"}
                                </span>
                                <Info className="h-3 w-3 opacity-70" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="top"
                              align="start"
                              className="w-[280px] p-3 text-[12px] leading-relaxed"
                            >
                              <p className="font-bold text-foreground mb-1.5">取消變更規則</p>
                              {deadline && (
                                <p className="text-[12px] mb-2" style={{ color: "#2F5D3A" }}>
                                  ✓ {formatFreeCancelDeadline(deadline)} 之前取消，無須支付任何費用
                                </p>
                              )}
                              <ul className="space-y-1 text-muted-foreground">
                                {TW_DEFAULT_CANCEL_RULES.map((r) => (
                                  <li key={r.daysBefore} className="flex items-start gap-1.5">
                                    <span className="text-[#A98467] shrink-0">★</span>
                                    <span>{r.label}</span>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                                依交通部觀光署旅宿業定型化契約規定計算。
                              </p>
                            </PopoverContent>
                          </Popover>
                        </li>
                      </ul>
                    );
                  })()}


                  <button
                    type="button"
                    onClick={() => onSelect(opt)}
                    className="mt-2 w-full h-10 rounded-full font-bold text-[15px] text-white tracking-wide shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200 focus:outline-none inline-flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: "#F08A3E" }}
                  >
                    <Zap className="h-4 w-4" fill="currentColor" strokeWidth={0} />
                    預約這段專屬假期
                  </button>


                  {showDisabledFewPeopleNote && (
                    <div className="mt-2 flex items-center gap-1.5 px-1 text-[10.5px] text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      少人包區（6 / 8 人）僅平日開放，改週一~四入住即可使用。
                    </div>
                  )}
                </div>


              </div>
            </Card>

          </div>
        );
      })()}


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
          className="shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${accentBgLight}, ${accentBgMid})`,
          }}
          aria-label={`${opt.guestCount} 人・${scene.label}`}
        >
          <span className="text-xl leading-none mb-0.5" aria-hidden>
            {scene.emoji}
          </span>
          <span className="font-black text-base leading-none" style={{ color: accentText }}>
            {opt.guestCount}<span className="text-[10px] font-bold ml-0.5">人</span>
          </span>
          <span className="text-[9px] mt-0.5 font-medium" style={{ color: accentText }}>
            {scene.label}
          </span>
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
            className="inline-flex items-center gap-0.5 mt-1.5 h-7 px-3 text-[11px] rounded-full text-white font-bold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accent === "few" ? "hsl(0,80%,45%)" : "hsl(15,78%,48%)"})` }}
          >
            就選這個
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
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(25, 70%, 96%), hsl(35, 75%, 94%))" }}
      >
        <span className="text-base leading-none" aria-hidden>🧮</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-bold text-foreground leading-tight">人多越划算 · 一眼挑出最甜方案</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">紅色 = 每人最低價，揪到滿員最省荷包</p>
        </div>
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
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="text-base leading-none" aria-hidden>{getGuestScene(tier.guestCount).emoji}</span>
                      <span className="flex flex-col leading-tight">
                        <span className="font-bold text-foreground">{tier.guestCount} 人</span>
                        <span className="text-[9.5px] text-muted-foreground">{getGuestScene(tier.guestCount).label}</span>
                      </span>
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

// ── 人數 Tab 滑動容器：邊緣漸層提示、active 自動置中、可拖動 ──
const GuestTabsScroller = ({
  tiers,
  activeGuestCount,
  onSelect,
}: {
  tiers: { guestCount: number; planName?: string }[];
  activeGuestCount: number;
  onSelect: (g: number) => void;
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [tiers.length]);

  // active 自動捲到視窗內
  useEffect(() => {
    const btn = btnRefs.current[activeGuestCount];
    const el = scrollerRef.current;
    if (!btn || !el) return;
    const btnLeft = btn.offsetLeft;
    const target = btnLeft - el.clientWidth / 2 + btn.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeGuestCount]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex items-center gap-0 px-1 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {tiers.map((t, idx) => {
          const isActive = t.guestCount === activeGuestCount;
          return (
            <div key={`${t.guestCount}-${t.planName || ""}`} className="flex items-center shrink-0">
              {idx > 0 && (
                <span className="px-1 text-muted-foreground/30 text-[13px]">·</span>
              )}
              <button
                ref={(el) => {
                  btnRefs.current[t.guestCount] = el;
                }}
                type="button"
                onClick={() => onSelect(t.guestCount)}
                className={cn(
                  "relative px-4 py-1.5 my-1 text-[15px] whitespace-nowrap rounded-full transition-all",
                  isActive
                    ? "font-semibold"
                    : "font-medium text-muted-foreground/70 hover:text-foreground"
                )}
                style={
                  isActive
                    ? { background: "#FFF1E6", color: "#C2410C" }
                    : undefined
                }
              >
                {t.guestCount}人
              </button>
            </div>
          );
        })}
        {/* 尾端 hint：可滑動時顯示「更多 →」 */}
        {canRight && (
          <span className="shrink-0 ml-1 mr-2 text-[12px] font-medium text-muted-foreground/80 whitespace-nowrap animate-pulse">
            滑動看更多 ›
          </span>
        )}
      </div>

      {/* 左/右漸層 + 提示箭頭 */}
      {canLeft && (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:hidden"
            style={{ background: "linear-gradient(to right, hsl(var(--background)) 30%, transparent)" }}
          />
          <button
            type="button"
            aria-label="向左滑動"
            onClick={() => scrollBy(-1)}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full bg-white border border-border shadow-sm text-foreground/70 hover:text-foreground hover:shadow"
          >
            ‹
          </button>
        </>
      )}
      {canRight && (
        <>
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 sm:hidden"
            style={{ background: "linear-gradient(to left, hsl(var(--background)) 30%, transparent)" }}
          />
          <button
            type="button"
            aria-label="向右滑動"
            onClick={() => scrollBy(1)}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full bg-white border border-border shadow-sm text-foreground/70 hover:text-foreground hover:shadow"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
};

