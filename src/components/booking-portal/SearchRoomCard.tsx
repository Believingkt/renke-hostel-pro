import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, BedDouble, Maximize2, TrainFront, Star, DoorOpen, ChevronLeft, ChevronRight } from "lucide-react";

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
  /** 搜尋結果卡片的多張可滑動圖片（最多 5 張）；若無則回退至 photo_url */
  photo_urls?: string[] | null;
  capacity: number;
  /** 上限人數（用於顯示「X 人（含以下）」） */
  guest_count_max?: number | null;
  size_sqm: number | null;
  /** 此方案的總房間數（解析自 room_allocation） */
  room_count: number | null;
  /** 此方案佔幾個包區（預設 1） */
  unit_count?: number | null;
  /** 房型分配描述，例：「雙人房x1，四人房x1」或「包下一整個專屬區域」 */
  room_allocation?: string | null;
  /** 是否為「銷售方案」卡片 */
  is_package?: boolean;
  /** 鄰近車站（可選） */
  nearby_station?: string | null;
  /** 簡易評論摘要（可選） */
  review_summary?: string | null;
  /** 評分（可選，0-5） */
  rating?: number | null;
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
  /** 兒童分齡規則摘要文字（顯示於資訊區） */
  child_rules_summary?: string | null;
  /** 兒童加價總額（若 > 0 顯示於價格旁） */
  child_extra_fee_total?: number | null;
  /** 因兒童條件不符的原因（若非空，將以「不符兒童條件」狀態呈現） */
  child_blocked_reason?: string | null;
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

  // 整理圖片列表（最多 5 張）
  const photos = (
    data.photo_urls && data.photo_urls.length > 0
      ? data.photo_urls
      : data.photo_url
      ? [data.photo_url]
      : []
  )
    .filter(Boolean)
    .slice(0, 5);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const dragState = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 只處理滑鼠拖曳；觸控保留原生捲動
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    const el = scrollerRef.current;
    if (!s || !el) return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 3) {
      s.moved = true;
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {}
    }
    if (s.moved) {
      el.scrollLeft = s.startScroll - dx;
      e.preventDefault();
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    const el = scrollerRef.current;
    dragState.current = null;
    if (!s || !el) return;
    if (s.moved) {
      // snap 到最近的圖
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    }
  };
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    // 拖曳完不要觸發 article 的 onClick
    if (dragState.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };


  return (
    <article
      onClick={onClick}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-card border border-border/60 hover:border-border hover:shadow-lg transition-all relative"
    >
      {/* 售完遮罩 */}
      {data.sold_out && (
        <div className="absolute inset-0 z-20 bg-foreground/35 pointer-events-none rounded-2xl" />
      )}
      {/* 大圖區 — 可水平滑動 */}
      <div className="relative aspect-[16/10] bg-muted overflow-hidden">
        {photos.length === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "hsl(25, 60%, 95%)" }}
          >
            <BedDouble className="h-14 w-14" style={{ color: "hsl(25, 60%, 75%)" }} />
          </div>
        ) : (
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={onClickCapture}
            className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain overscroll-y-none cursor-grab active:cursor-grabbing select-none"
            style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
          >
            {photos.map((src, i) => (
              <div key={i} className="relative shrink-0 w-full h-full snap-start overflow-hidden">
                <img
                  src={src}
                  alt={`${data.name} ${i + 1}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}

        {/* 桌機版：左右整條點擊區（避免誤觸卡片） */}
        {photos.length > 1 && (
          <>
            <div
              role="button"
              aria-label="上一張"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (activeIdx === 0) return;
                const el = scrollerRef.current;
                if (!el) return;
                const idx = Math.max(0, Math.round(el.scrollLeft / el.clientWidth) - 1);
                el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
              }}
              className="hidden md:flex absolute left-0 top-0 bottom-0 w-14 z-20 items-center justify-start pl-2 cursor-pointer group/nav"
            >
              {activeIdx > 0 && (
                <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
            </div>
            <div
              role="button"
              aria-label="下一張"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (activeIdx >= photos.length - 1) return;
                const el = scrollerRef.current;
                if (!el) return;
                const idx = Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth) + 1);
                el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
              }}
              className="hidden md:flex absolute right-0 top-0 bottom-0 w-14 z-20 items-center justify-end pr-2 cursor-pointer group/nav"
            >
              {activeIdx < photos.length - 1 && (
                <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </>
        )}

        {/* 左上：民宿型態 */}
        {data.accommodation_type && (
          <Badge
            className="absolute top-3 left-3 text-[11px] font-medium border-none text-white pointer-events-none"
            style={{ background: "hsla(25, 70%, 45%, 0.9)" }}
          >
            {data.accommodation_type}
          </Badge>
        )}

        {/* 右上：剩餘 / 售完 */}
        {data.sold_out ? (
          <Badge className="absolute top-3 right-3 text-[11px] font-medium border-none bg-foreground/70 text-white pointer-events-none">
            已售完
          </Badge>
        ) : data.available_rooms !== null && data.available_rooms <= 2 ? (
          <Badge
            className="absolute top-3 right-3 text-[11px] font-medium border-none text-white pointer-events-none"
            style={{ background: "hsla(0, 70%, 50%, 0.9)" }}
          >
            僅剩 {data.available_rooms} 間
          </Badge>
        ) : null}

        {/* 左下：特色標籤 overlay */}
        {data.feature_tags.length > 0 && (
          <div className="absolute left-3 bottom-3 right-16 flex flex-wrap gap-1.5 pointer-events-none">
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

        {/* 右下：圖片頁籤（多張時顯示） */}
        {photos.length > 1 && (
          <div className="absolute right-3 bottom-3 flex items-center gap-1 px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm pointer-events-none">
            {photos.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIdx ? "w-3.5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 資訊區 */}
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          {/* 左欄：民宿資訊 */}
          <div className="min-w-0 flex-1 space-y-1">
            {/* 1. 民宿名稱 */}
            <h3 className="font-bold text-base sm:text-lg text-foreground leading-tight line-clamp-1">
              {data.accommodation_name}
            </h3>

            {/* 2. 位置 + 鄰近車站 */}
            {(location || data.nearby_station) && (
              <p className="flex items-center gap-2 text-xs sm:text-[13px] text-muted-foreground line-clamp-1 leading-none">
                {location && (
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70 translate-y-[1px]" />
                    <span className="truncate leading-none">{location}</span>
                  </span>
                )}
                {data.nearby_station && (
                  <span className="flex items-center gap-1 min-w-0">
                    <TrainFront className="h-3.5 w-3.5 shrink-0 opacity-70 translate-y-[1px]" />
                    <span className="truncate leading-none">{data.nearby_station}</span>
                  </span>
                )}
              </p>
            )}

            {/* 3. 房型／方案：人數 · 包區 · 房間數 */}
            <p className="flex items-center gap-1 text-xs sm:text-[13px] text-muted-foreground line-clamp-1 leading-none">
              <DoorOpen className="h-3.5 w-3.5 shrink-0 opacity-70 translate-y-[1px]" />
              <span className="truncate leading-none">
                {data.is_package ? (
                  <span className="font-medium text-foreground/90">{data.name}</span>
                ) : (
                  <>
                    {data.name}
                    {data.room_count ? (
                      <span className="opacity-80"> · 共 {data.room_count} 間</span>
                    ) : null}
                  </>
                )}
              </span>
            </p>

            {/* 3b. 房型分配 / 方案描述 */}
            {data.is_package && data.room_allocation && (
              <p className="text-xs sm:text-[13px] text-muted-foreground/90 line-clamp-1 pl-[18px] leading-none">
                {data.room_allocation}
              </p>
            )}


            {/* 4. 簡易評論 */}
            {(data.rating || data.review_summary) && (
              <p className="flex items-center gap-1 text-xs sm:text-[13px] text-muted-foreground line-clamp-1">
                {data.rating ? (
                  <span
                    className="inline-flex items-center gap-0.5 font-semibold"
                    style={{ color: "hsl(38, 85%, 50%)" }}
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {data.rating.toFixed(1)}
                  </span>
                ) : null}
                {data.review_summary && (
                  <span className="truncate text-foreground">
                    {data.rating ? " · " : ""}
                    {data.review_summary}
                  </span>
                )}
              </p>
            )}

            {/* 5. 兒童規則摘要（不顯示於搜尋卡片，避免版面冗長） */}
            {data.child_blocked_reason && (
              <p className="text-[11px] sm:text-xs font-medium text-destructive line-clamp-1 leading-snug">
                ⚠ {data.child_blocked_reason}
              </p>
            )}
          </div>

          {/* 右欄：價格區 */}
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
                {data.child_extra_fee_total && data.child_extra_fee_total > 0 ? (
                  <p className="text-[10px] text-[hsl(25,70%,50%)] font-medium leading-none mt-0.5">
                    含兒童加價 +NT${data.child_extra_fee_total.toLocaleString()}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

      </div>
    </article>
  );
};

export default SearchRoomCard;
