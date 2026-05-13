import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, X, Plus } from "lucide-react";
import {
  type AccommodationPackage,
  type PackageTier,
  detectTierByDate,
  useAccommodationHolidays,
} from "@/hooks/use-accommodation-packages";

interface PackagesSectionProps {
  accommodationId: string;
  packages: AccommodationPackage[];
  customTitle?: string;
  customSubtitle?: string;
}

const TIER_LABEL: Record<PackageTier, string> = {
  weekday: "平日",
  friday_sunday: "旺日",
  weekend: "假日",
};

const TAG_LABEL: Record<string, { label: string; tone: "primary" | "soft" | "dark" }> = {
  best_value: { label: "最划算", tone: "primary" },
  early_bird: { label: "早鳥優惠", tone: "soft" },
  meal_included: { label: "一泊二食", tone: "dark" },
  few_people: { label: "少人數包棟", tone: "soft" },
};

const PackagesSection = ({
  accommodationId,
  packages,
  customTitle,
  customSubtitle,
}: PackagesSectionProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  const checkIn = checkInStr ? new Date(checkInStr) : null;
  const { isHolidayDate } = useAccommodationHolidays(accommodationId);
  const currentTier = detectTierByDate(checkIn, checkIn ? isHolidayDate(checkIn) : false);

  const visible = useMemo(() => {
    return packages
      .filter((p) => p.enabled)
      .filter((p) => !checkIn || p.applicable_tiers.includes(currentTier));
  }, [packages, checkIn, currentTier]);

  if (visible.length === 0) return null;

  const handleSelect = (pkg: AccommodationPackage) => {
    const params = new URLSearchParams();
    params.set("acc", accommodationId);
    if (pkg.primary_room_type_id) params.set("roomId", pkg.primary_room_type_id);
    params.set("packageId", pkg.id);
    if (checkInStr) params.set("checkIn", checkInStr);
    if (checkOutStr) params.set("checkOut", checkOutStr);
    params.set("adults", String(pkg.guest_count));
    navigate(`/book?${params.toString()}`);
  };

  return (
    <section id="rooms" className="py-12 sm:py-16 bg-background">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            {customTitle || "銷售方案"}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            {customSubtitle || "請選擇最適合您的人數方案"}
          </p>
          {checkIn && (
            <p className="text-xs text-muted-foreground mt-1">
              依入住日（{checkIn.toLocaleDateString("zh-TW")}）顯示適用方案 ·{" "}
              {TIER_LABEL[currentTier]}
            </p>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          {visible.map((pkg) => {
            const discount =
              pkg.original_price && pkg.original_price > pkg.sale_price
                ? Math.round(((pkg.original_price - pkg.sale_price) / pkg.original_price) * 100)
                : null;
            const perPerson = Math.round(pkg.sale_price / Math.max(1, pkg.guest_count));
            return (
              <div
                key={pkg.id}
                className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden flex flex-col md:flex-row hover:shadow-md transition-shadow"
              >
                {/* Left: Title & Tier */}
                <div className="p-5 md:w-1/3 flex flex-col justify-between border-b md:border-b-0 md:border-r border-border bg-[hsl(25,70%,97%)]">
                  <div>
                    {pkg.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {pkg.tags.map((tag) => {
                          const cfg = TAG_LABEL[tag] || { label: tag, tone: "soft" as const };
                          const cls =
                            cfg.tone === "primary"
                              ? "bg-[hsl(25,70%,50%)] text-white"
                              : cfg.tone === "dark"
                                ? "bg-foreground text-background"
                                : "bg-[hsl(25,70%,90%)] text-[hsl(25,70%,40%)]";
                          return (
                            <span
                              key={tag}
                              className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${cls}`}
                            >
                              {cfg.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <h3 className="text-lg sm:text-xl font-bold text-foreground mb-1">
                      {pkg.name}
                    </h3>
                    <p className="text-base font-medium text-[hsl(25,70%,50%)]">
                      建議 {pkg.guest_count} 人
                      {pkg.guest_count_max && pkg.guest_count_max !== pkg.guest_count
                        ? ` (上限 ${pkg.guest_count_max} 人)`
                        : ""}
                    </p>
                    {pkg.subtitle && (
                      <p className="text-sm text-muted-foreground mt-1">{pkg.subtitle}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    適用：
                    {pkg.applicable_tiers.map((t) => TIER_LABEL[t]).join(" / ")}
                  </p>
                </div>

                {/* Middle: Details */}
                <div className="p-5 md:w-5/12 space-y-3.5">
                  {pkg.room_allocation && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        房型分配
                      </span>
                      <div className="mt-1.5 text-sm text-foreground flex flex-wrap gap-x-4 gap-y-1">
                        {pkg.room_allocation
                          .split(/[、,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((part, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(25,70%,50%)]" />
                              <span>{part}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {pkg.includes.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        附加說明
                      </span>
                      <ul className="mt-1.5 text-sm space-y-1">
                        {pkg.includes.map((inc, i) => {
                          const Icon =
                            inc.available === "yes" ? Check : inc.available === "no" ? X : Plus;
                          const color =
                            inc.available === "yes"
                              ? "text-emerald-500"
                              : inc.available === "no"
                                ? "text-rose-400"
                                : "text-[hsl(25,70%,50%)]";
                          const textColor =
                            inc.available === "no" ? "text-muted-foreground line-through" : "text-foreground";
                          return (
                            <li key={i} className={`flex items-start gap-2 ${textColor}`}>
                              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                              <span>
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

                {/* Right: Price + CTA */}
                <div className="p-5 md:w-1/4 bg-muted/30 flex flex-col justify-center items-center md:items-end text-center md:text-right border-t md:border-t-0 md:border-l border-border">
                  {pkg.original_price && pkg.original_price > pkg.sale_price && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground line-through">
                        NT$ {pkg.original_price.toLocaleString()}
                      </span>
                      {discount && (
                        <span className="text-xs font-bold text-rose-500">-{discount}%</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-foreground">NT$</span>
                    <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                      {pkg.sale_price.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-[hsl(25,70%,50%)] font-medium mt-1">
                    每人約 ${perPerson.toLocaleString()}
                  </p>
                  <button
                    onClick={() => handleSelect(pkg)}
                    className="mt-3 w-full py-2.5 px-5 bg-[hsl(25,70%,50%)] hover:bg-[hsl(25,70%,45%)] text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    立即預訂
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PackagesSection;
