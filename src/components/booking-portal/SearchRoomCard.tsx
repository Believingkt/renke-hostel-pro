import { Badge } from "@/components/ui/badge";
import { MapPin, Users, BedDouble, Maximize2 } from "lucide-react";

export interface SearchRoomCardData {
  id: string;
  name: string;
  accommodation_id: string;
  accommodation_name: string;
  accommodation_type: string | null;
  region_1: string | null;
  region_2: string | null;
  country: string | null;
  photo_url: string | null;
  capacity: number;
  size_sqm: number | null;
  /** 每晚單價（已依日期 / template 解出） */
  nightly_price: number | null;
  /** 總價（nightly × nights） */
  total_price: number | null;
  /** 顯示用原價（如 nightly 有打折） */
  original_total_price: number | null;
  discount_percent: number | null;
  /** 剩餘房間數，<=2 顯示緊急色 */
  available_rooms: number | null;
  feature_tags: string[];
  /** 是否售完／無價／不可預訂 */
  sold_out: boolean;
}

interface Props {
  data: SearchRoomCardData;
  nights: number;
  onClick: () => void;
}

const SearchRoomCard = ({ data, nights, onClick }: Props) => {
  const location =
    data.country === "台灣" || !data.country
      ? [data.region_1, data.region_2].filter(Boolean).join(" · ")
      : [data.country, data.region_1, data.region_2].filter(Boolean).join(" · ");

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-border hover:shadow-lg transition-all"
    >
      {/* 大圖區 */}
      <div className="relative aspect-[16/10] bg-muted overflow-hidden">
        {data.photo_url ? (
          <img
            src={data.photo_url}
            alt={data.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "hsl(25, 60%, 95%)" }}
          >
            <BedDouble className="h-14 w-14" style={{ color: "hsl(25, 60%, 75%)" }} />
          </div>
        )}

        {/* 左上：民宿型態 */}
        {data.accommodation_type && (
          <Badge
            className="absolute top-3 left-3 text-[11px] font-medium border-none text-white"
            style={{ background: "hsla(25, 70%, 45%, 0.9)" }}
          >
            {data.accommodation_type}
          </Badge>
        )}

        {/* 右上：剩餘 / 售完 */}
        {data.sold_out ? (
          <Badge className="absolute top-3 right-3 text-[11px] font-medium border-none bg-foreground/70 text-white">
            已售完
          </Badge>
        ) : data.available_rooms !== null && data.available_rooms <= 2 ? (
          <Badge
            className="absolute top-3 right-3 text-[11px] font-medium border-none text-white"
            style={{ background: "hsla(0, 70%, 50%, 0.9)" }}
          >
            僅剩 {data.available_rooms} 間
          </Badge>
        ) : null}

        {/* 左下：特色標籤 overlay */}
        {data.feature_tags.length > 0 && (
          <div className="absolute left-3 bottom-3 right-3 flex flex-wrap gap-1.5">
            {data.feature_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 rounded-full backdrop-blur-sm bg-white/85 text-foreground/80 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 資訊區 */}
      <div className="p-3.5 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base sm:text-lg text-foreground leading-tight line-clamp-1">
              {data.name}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-1">
              {data.accommodation_name}
              {location && <span className="opacity-70"> · {location}</span>}
            </p>
          </div>

          {/* 價格區 */}
          <div className="text-right shrink-0">
            {data.sold_out || data.nightly_price == null ? (
              <p className="text-xs text-muted-foreground">價格電洽</p>
            ) : (
              <>
                {data.original_total_price &&
                  data.total_price &&
                  data.original_total_price > data.total_price && (
                    <p className="text-[11px] text-muted-foreground line-through leading-none">
                      NT${data.original_total_price.toLocaleString()}
                    </p>
                  )}
                <p
                  className="font-bold text-lg sm:text-xl leading-tight"
                  style={{ color: "hsl(25, 70%, 50%)" }}
                >
                  NT${(data.total_price ?? data.nightly_price).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                  {nights > 0 ? `共 ${nights} 晚` : "每晚"}
                  {data.discount_percent ? (
                    <span
                      className="ml-1 inline-block px-1 py-0.5 rounded text-white text-[10px] font-bold"
                      style={{ background: "hsl(0, 70%, 55%)" }}
                    >
                      -{data.discount_percent}%
                    </span>
                  ) : null}
                </p>
              </>
            )}
          </div>
        </div>

        {/* meta：人數 / 坪數 / 地區 */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {data.capacity} 人
          </span>
          {data.size_sqm ? (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" />
              {data.size_sqm} 坪
            </span>
          ) : null}
          {location && (
            <span className="hidden sm:flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {location}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

export default SearchRoomCard;
