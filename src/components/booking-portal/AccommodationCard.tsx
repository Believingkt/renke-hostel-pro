import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, ChevronRight, BedDouble, Home, Sparkles, Package } from "lucide-react";
import { isSensanAccommodation } from "@/lib/sensan-pricing";

export interface AccommodationCardData {
  id: string;
  name: string;
  type: string | null;
  region_1: string | null;
  region_2: string | null;
  country: string | null;
  hero_photo_url: string | null;
  /** 全棟總房間數（sum of room_count） */
  total_rooms: number;
  /** 房型數量 */
  room_type_count: number;
  /** 最少可住人數（最小房型 capacity） */
  min_capacity: number;
  /** 最多可住人數（sum of capacity × room_count） */
  max_capacity: number;
  /** 額外可加床/加人數（取自 addon_settings） */
  extra_bed_count: number;
  /** 包棟特色標籤（最多 3 個） */
  feature_tags: string[];
  /** 起價（最少人數方案） */
  min_price: number | null;
  /** 全棟整包價（最大人數方案） */
  max_price: number | null;
  /** max_price 對應人數 */
  max_capacity_price_capacity: number;
  /** 原價（如有折扣顯示，用於 strikethrough） */
  original_price: number | null;
  /** 折扣百分比（如有折扣才顯示） */
  discount_percent: number | null;
  /** 有日期過濾時的剩餘房間數（min across stay dates） */
  available_rooms: number | null;
  /** 使用者選擇的人數（搜尋條），>0 才有 matched 資料 */
  matched_guests: number | null;
  /** 對應人數試算所需房間數 */
  matched_rooms: number | null;
  /** 對應人數試算可容納總人數（≥ matched_guests） */
  matched_capacity: number | null;
  /** 對應人數試算總價（含 nights 計算） */
  matched_total_price: number | null;
}

interface Props {
  data: AccommodationCardData;
  onClick: () => void;
  hasDateFilter: boolean;
  nights: number;
}

const AccommodationCard = ({ data, onClick, hasDateFilter, nights }: Props) => {
  const location =
    data.country === "台灣" || !data.country
      ? [data.region_1, data.region_2].filter(Boolean).join(" ")
      : [data.country, data.region_1, data.region_2].filter(Boolean).join(" ");

  const totalPrice = data.min_price ?? 0;
  const perPerson =
    totalPrice > 0 && data.max_capacity > 0
      ? Math.round(totalPrice / data.max_capacity)
      : null;
  const isUrgent =
    hasDateFilter && data.available_rooms !== null && data.available_rooms <= 2;
  const isSensan = isSensanAccommodation(data.name);
  return (
    <Card
      className="overflow-hidden cursor-pointer border-border/60 hover:border-border hover:shadow-md transition-all bg-card"
      onClick={onClick}
    >
      <div className="flex">
        {/* Image — 40% on mobile, fixed-ish ratio */}
        <div className="relative w-[40%] shrink-0 aspect-[4/5] sm:aspect-square bg-muted overflow-hidden">
          {data.hero_photo_url ? (
            <img
              src={data.hero_photo_url}
              alt={data.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: "hsl(25, 60%, 95%)" }}
            >
              <BedDouble className="h-10 w-10" style={{ color: "hsl(25, 60%, 75%)" }} />
            </div>
          )}
          {data.type && (
            <Badge
              className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 font-medium border-none text-white"
              style={{ background: "hsla(25, 70%, 45%, 0.9)" }}
            >
              {data.type}
            </Badge>
          )}
          {isUrgent && (
            <Badge
              className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 font-medium border-none text-white"
              style={{ background: "hsla(0, 75%, 50%, 0.95)" }}
            >
              僅剩 {data.available_rooms} 間
            </Badge>
          )}
        </div>

        {/* Info — Trip.com style dense layout */}
        <div className="flex-1 min-w-0 p-2.5 sm:p-3 flex flex-col">
          {/* Title */}
          <h3 className="font-bold text-sm sm:text-base text-foreground leading-tight line-clamp-2 mb-1">
            {data.name}
          </h3>

          {/* Location */}
          {location && (
            <p className="text-[11px] sm:text-xs text-muted-foreground flex items-start gap-0.5 mb-1.5 leading-snug">
              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{location}</span>
            </p>
          )}

          {/* Whole-villa highlight: rooms + capacity range */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-foreground/80 mb-1.5">
            <span className="flex items-center gap-0.5">
              <Home className="h-3 w-3" style={{ color: "hsl(25, 70%, 50%)" }} />
              <span className="font-semibold">{data.total_rooms}</span> 間房
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" style={{ color: "hsl(25, 70%, 50%)" }} />
              {data.min_capacity === data.max_capacity ? (
                <><span className="font-semibold">{data.max_capacity}</span> 人</>
              ) : (
                <>
                  可住 <span className="font-semibold">{data.min_capacity}~{data.max_capacity}</span> 人
                </>
              )}
              {data.extra_bed_count > 0 && (
                <span
                  className="ml-1 inline-flex items-center text-[10px] font-bold px-1 py-px rounded leading-none"
                  style={{
                    background: "hsl(25, 70%, 92%)",
                    color: "hsl(25, 70%, 35%)",
                  }}
                  title={`可加床 ${data.extra_bed_count} 人`}
                >
                  +{data.extra_bed_count}
                </span>
              )}
            </span>
          </div>

          {/* Sensan: 包區方案徽章 */}
          {isSensan && (
            <div className="mb-1.5 flex items-center gap-1 px-1.5 py-1 rounded border"
              style={{
                background: "hsl(25, 70%, 97%)",
                borderColor: "hsl(25, 60%, 85%)",
              }}
            >
              <Package className="h-3 w-3 shrink-0" style={{ color: "hsl(25, 70%, 45%)" }} />
              <span className="text-[10px] sm:text-[11px] leading-tight font-semibold" style={{ color: "hsl(25, 70%, 35%)" }}>
                包區方案 6 / 8 / 12 / 14 / 16 / 18 人
              </span>
            </div>
          )}

          {/* Feature tags */}
          {!isSensan && data.feature_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {data.feature_tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded border"
                  style={{
                    background: "hsl(25, 70%, 97%)",
                    borderColor: "hsl(25, 60%, 88%)",
                    color: "hsl(25, 60%, 35%)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Price block — push to bottom */}
          <div className="mt-auto pt-1">
            {/* Matched plan (when guest count selected and fits) */}
            {data.matched_guests && data.matched_total_price && data.matched_rooms ? (
              <div className="mb-1.5 flex items-center gap-1.5 px-1.5 py-1 rounded"
                style={{ background: "hsl(140, 50%, 96%)" }}
              >
                <Sparkles className="h-3 w-3 shrink-0" style={{ color: "hsl(140, 50%, 35%)" }} />
                <span className="text-[10px] leading-tight" style={{ color: "hsl(140, 50%, 25%)" }}>
                  <span className="font-bold">{data.matched_guests} 人方案</span>
                  <span className="opacity-70"> · 開 {data.matched_rooms} 間</span>
                </span>
              </div>
            ) : data.matched_guests && data.max_capacity > 0 && data.matched_guests > data.max_capacity ? (
              <div className="mb-1.5 flex items-center gap-1.5 px-1.5 py-1 rounded bg-muted">
                <span className="text-[10px] text-muted-foreground leading-tight">
                  超過最多 {data.max_capacity} 人 · 請洽客服
                </span>
              </div>
            ) : null}

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                {data.matched_guests && data.matched_total_price ? (
                  <>
                    <p
                      className="font-bold text-base sm:text-lg leading-none"
                      style={{ color: "hsl(0, 75%, 50%)" }}
                    >
                      NT${data.matched_total_price.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {hasDateFilter && nights > 1 ? `共 ${nights} 晚` : "每晚"}
                      {data.matched_guests > 0 && (
                        <> · 平均每人 NT${Math.round(
                          data.matched_total_price /
                            data.matched_guests /
                            (hasDateFilter && nights > 0 ? nights : 1)
                        ).toLocaleString()}</>
                      )}
                    </p>
                  </>
                ) : totalPrice > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1 leading-none">
                      <span className="text-[10px] text-muted-foreground">
                        {data.min_capacity} 人起
                      </span>
                      <span
                        className="font-bold text-base sm:text-lg"
                        style={{ color: "hsl(0, 75%, 50%)" }}
                      >
                        NT${totalPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">起</span>
                    </div>
                    {data.max_price && data.max_price !== totalPrice && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {data.max_capacity_price_capacity} 人整棟 NT${data.max_price.toLocaleString()}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {hasDateFilter && nights > 1 ? `共 ${nights} 晚` : "每晚"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">價格電洽</p>
                )}
              </div>
              <Button
                size="sm"
                className="h-7 px-2 text-[11px] gap-0.5 shrink-0 text-white rounded-md"
                style={{ background: "hsl(25, 70%, 50%)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
              >
                查看
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AccommodationCard;
