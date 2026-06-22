import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, BedDouble, Sparkles, Tag } from "lucide-react";
import {
  useAccommodationPackages,
  useAccommodationHolidays,
  getPackagePriceForTier,
  detectTierByDate,
  isPackageExcludedOnDate,
  type AccommodationPackage,
  type PackageTier,
} from "@/hooks/use-accommodation-packages";

interface Props {
  accommodationId: string | null;
  /** 可選：用戶搜尋的入住日，若有則以該日 tier 顯示；無則以今天起 30 天內掃描，挑最便宜 tier */
  checkIn?: Date | null;
}

const TIER_LABEL: Record<PackageTier, string> = {
  weekday: "平日",
  friday_sunday: "週五/日",
  weekend: "週六/假日",
};

const TAG_LABEL: Record<string, string> = {
  early_bird: "早鳥優惠",
  few_people: "少人數包棟",
  meal_included: "一泊二食",
  best_value: "超划算",
  recommended: "推薦",
};

interface ResolvedPrice {
  tier: PackageTier;
  sale: number;
  original: number | null;
  discount: number | null;
}

function resolvePrice(
  pkg: AccommodationPackage,
  checkIn: Date | null,
  isHolidayDate: (d: Date) => boolean,
): ResolvedPrice | null {
  if (pkg.applicable_tiers.length === 0) return null;
  // 1) 若有指定入住日 → 直接該日 tier
  if (checkIn) {
    if (isPackageExcludedOnDate(pkg, checkIn)) return null;
    const tier = detectTierByDate(checkIn, isHolidayDate(checkIn));
    if (!pkg.applicable_tiers.includes(tier)) return null;
    const { sale, original } = getPackagePriceForTier(pkg, tier);
    const discount = original && original > sale
      ? Math.round(((original - sale) / original) * 100)
      : null;
    return { tier, sale, original, discount };
  }
  // 2) 無指定日 → 從今天起 60 天，挑最便宜 tier
  let best: ResolvedPrice | null = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (isPackageExcludedOnDate(pkg, d)) continue;
    const tier = detectTierByDate(d, isHolidayDate(d));
    if (!pkg.applicable_tiers.includes(tier)) continue;
    const { sale, original } = getPackagePriceForTier(pkg, tier);
    if (!best || sale < best.sale) {
      const discount = original && original > sale
        ? Math.round(((original - sale) / original) * 100)
        : null;
      best = { tier, sale, original, discount };
    }
  }
  return best;
}

const SalesPackagesList = ({ accommodationId, checkIn = null }: Props) => {
  const { packages, loading } = useAccommodationPackages(accommodationId, { onlyEnabled: true });
  const { isHolidayDate } = useAccommodationHolidays(accommodationId);

  const items = useMemo(
    () =>
      packages
        .map((pkg) => ({ pkg, price: resolvePrice(pkg, checkIn ?? null, isHolidayDate) }))
        .filter((x) => x.price !== null),
    [packages, checkIn, isHolidayDate],
  );

  if (loading || items.length === 0) return null;

  return (
    <div className="mb-10 md:mb-12">
      <div className="flex items-end justify-between mb-4 md:mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            精選銷售方案
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            民宿主推薦組合，含房型搭配與最適優惠價
          </p>
        </div>
      </div>


          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {items.map(({ pkg, price }) => (
              <Card
                key={pkg.id}
                className="overflow-hidden border border-border/60 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <CardContent className="p-4 md:p-5 flex flex-col h-full">
                  {/* 標籤 */}
                  {pkg.tags && pkg.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {pkg.tags.slice(0, 3).map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="text-[10px] font-medium px-1.5 py-0.5"
                        >
                          {TAG_LABEL[t] ?? t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* 名稱 */}
                  <h3 className="text-base md:text-lg font-bold leading-snug mb-1">
                    {pkg.name}
                  </h3>
                  {pkg.subtitle && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {pkg.subtitle}
                    </p>
                  )}

                  {/* 人數 + 房型配置 */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {pkg.guest_count}
                      {pkg.guest_count_max && pkg.guest_count_max > pkg.guest_count
                        ? `~${pkg.guest_count_max}`
                        : ""} 人
                    </span>
                    {pkg.room_allocation && (
                      <span className="flex items-center gap-1 truncate">
                        <BedDouble className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{pkg.room_allocation}</span>
                      </span>
                    )}
                  </div>

                  {/* 適用日型 */}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-3">
                    <Tag className="h-3 w-3" />
                    適用：
                    {pkg.applicable_tiers.map((t) => TIER_LABEL[t]).join("、")}
                  </div>

                  {/* 價格 */}
                  <div className="mt-auto border-t border-border/60 pt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground leading-none mb-0.5">
                        {checkIn ? "您選擇的日期" : `${TIER_LABEL[price!.tier]}最低價`}
                      </div>
                      <div className="flex items-baseline flex-wrap gap-x-1.5">
                        {price!.original && price!.original > price!.sale && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            NT${price!.original.toLocaleString()}
                          </span>
                        )}
                        <span className="text-lg md:text-xl font-bold text-primary">
                          NT${price!.sale.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">/晚起</span>
                        {price!.discount && price!.discount > 0 && (
                          <span className="text-[10px] font-bold text-white px-1 py-0.5 rounded bg-[hsl(0,70%,55%)]">
                            -{price!.discount}%
                          </span>
                        )}
                      </div>
                    </div>
                    <Link to={`/booking?packageId=${pkg.id}&step=dates`} className="shrink-0">
                      <Button
                        size="sm"
                        className="h-9 px-3 text-xs font-medium rounded-lg"
                      >
                        立即預訂
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SalesPackagesList;
