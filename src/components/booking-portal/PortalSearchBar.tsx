import { useMemo, useRef, useState } from "react";
import { format, addDays, eachDayOfInterval } from "date-fns";
import { zhTW } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  Search,
  MapPin,
  CalendarDays,
  Users,
  Minus,
  Plus,
  Loader2,
} from "lucide-react";

interface PortalSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  checkIn: Date | undefined;
  checkOut: Date | undefined;
  onCheckInChange: (d: Date | undefined) => void;
  onCheckOutChange: (d: Date | undefined) => void;
  adults: number;
  onAdultsChange: (n: number) => void;
  children: number;
  onChildrenChange: (n: number) => void;
  rooms: number;
  onRoomsChange: (n: number) => void;
  onSearch: () => void;
  availableDateSet?: Set<string> | null;
  isStayRangeAvailable?: (start: Date, endExclusive: Date) => boolean;
  isLoadingAvailability?: boolean;
  onDestinationRequired?: () => void;
}

const PortalSearchBar = ({
  searchQuery,
  onSearchQueryChange,
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  adults,
  onAdultsChange,
  children,
  onChildrenChange,
  rooms,
  onRoomsChange,
  onSearch,
  availableDateSet,
  isStayRangeAvailable,
  isLoadingAvailability,
  onDestinationRequired,
}: PortalSearchBarProps) => {
  const [dateOpen, setDateOpen] = useState(false);
  const [dateOpenMobile, setDateOpenMobile] = useState(false);
  const desktopDestinationInputRef = useRef<HTMLInputElement>(null);
  const mobileDestinationInputRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isDateUnavailable = (date: Date) => {
    if (!availableDateSet) return false;
    const key = format(date, "yyyy-MM-dd");
    return !availableDateSet.has(key);
  };

  // For range mode: disable past dates and unavailable nights (the night
  // starting on that date). The "退房" date itself does not need a night,
  // so we still allow selecting one day after the last available night.
  const rangeDayDisabled = (date: Date) => {
    if (date < today) return true;
    if (!availableDateSet) return false;
    // Allow if either this date has an available night, or the previous
    // night is available (so it can serve as a check-out date).
    const thisKey = format(date, "yyyy-MM-dd");
    const prevKey = format(addDays(date, -1), "yyyy-MM-dd");
    return !availableDateSet.has(thisKey) && !availableDateSet.has(prevKey);
  };

  const rangeIsContinuouslyAvailable = (from: Date, toExclusive: Date) => {
    if (!availableDateSet) return true;
    if (isStayRangeAvailable) return isStayRangeAvailable(from, toExclusive);
    const nights = eachDayOfInterval({ start: from, end: addDays(toExclusive, -1) });
    return nights.every((n) => availableDateSet.has(format(n, "yyyy-MM-dd")));
  };

  const selectedRange: DateRange | undefined = checkIn
    ? { from: checkIn, to: checkOut }
    : undefined;

  const handleRangeSelect = (
    range: DateRange | undefined,
    selectedDay?: Date
  ) => {
    // Case A: 已選完入住+退房，再點任何一天 → 以該天為新的入住，重新選
    if (checkIn && checkOut && selectedDay) {
      onCheckInChange(selectedDay);
      onCheckOutChange(undefined);
      return;
    }

    if (!range) {
      // 取消（例如點到同一天）→ 若有 selectedDay 視為新入住
      if (selectedDay) {
        onCheckInChange(selectedDay);
        onCheckOutChange(undefined);
      } else {
        onCheckInChange(undefined);
        onCheckOutChange(undefined);
      }
      return;
    }

    const { from, to } = range;

    // Case B: 只有入住，沒有退房 → 保持開啟，等使用者再點退房
    if (from && !to) {
      onCheckInChange(from);
      onCheckOutChange(undefined);
      return;
    }

    // Case C: 入住 + 退房都有
    if (from && to) {
      if (to <= from) {
        onCheckInChange(from);
        onCheckOutChange(undefined);
        return;
      }
      if (!rangeIsContinuouslyAvailable(from, to)) {
        toast({
          title: "中間日期已無空房",
          description: "請選擇連續有空房的日期區間",
          variant: "destructive",
        });
        onCheckInChange(from);
        onCheckOutChange(undefined);
        return;
      }
      onCheckInChange(from);
      onCheckOutChange(to);
      // 兩個日期都選完才關閉
      setTimeout(() => {
        setDateOpen(false);
        setDateOpenMobile(false);
      }, 150);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };

  const renderGuestPicker = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-border/40">
        <p className="text-sm font-medium">總人數</p>
        <span className="text-sm font-semibold" style={{ color: "hsl(25, 70%, 45%)" }}>
          {adults + children} 人
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">大人</p>
          <p className="text-xs text-muted-foreground">18 歲以上</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onAdultsChange(Math.max(1, adults - 1))} disabled={adults <= 1}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-7 text-center text-base font-medium tabular-nums">{adults}</span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onAdultsChange(Math.min(20, adults + 1))} disabled={adults >= 20}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">兒童</p>
          <p className="text-xs text-muted-foreground">0–6 歲</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onChildrenChange(Math.max(0, children - 1))} disabled={children <= 0}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-7 text-center text-base font-medium tabular-nums">{children}</span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onChildrenChange(Math.min(10, children + 1))} disabled={children >= 10}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <div>
          <p className="text-sm font-medium">房間數</p>
          <p className="text-xs text-muted-foreground">需求房間數量</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onRoomsChange(Math.max(1, rooms - 1))} disabled={rooms <= 1}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-7 text-center text-base font-medium tabular-nums">{rooms}</span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onRoomsChange(Math.min(20, rooms + 1))} disabled={rooms >= 20}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(
      0,
      Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
    );
  }, [checkIn, checkOut]);

  const renderRangeButtonContent = (compact = false) => {
    if (!checkIn && !checkOut) {
      return <span className="truncate text-muted-foreground">選擇入住與退房日期</span>;
    }
    const inLabel = checkIn ? format(checkIn, "M/d (EEE)", { locale: zhTW }) : "入住 —";
    const outLabel = checkOut ? format(checkOut, "M/d (EEE)", { locale: zhTW }) : "退房 —";
    return (
      <span className={cn("flex items-center gap-1.5 truncate", compact && "text-sm")}>
        <span className="font-semibold text-foreground">{inLabel}</span>
        <span className="text-muted-foreground">→</span>
        <span className={cn("font-semibold", checkOut ? "text-foreground" : "text-muted-foreground")}>
          {outLabel}
        </span>
        {nights > 0 && (
          <span
            className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: "hsl(25, 80%, 95%)", color: "hsl(25, 70%, 40%)" }}
          >
            {nights} 晚
          </span>
        )}
      </span>
    );
  };

  const renderRangeCalendarHeader = () => (
    <div
      className="px-4 py-3 border-b border-border/40"
      style={{ background: "hsl(25, 80%, 97%)" }}
    >
      <p className="text-xs text-muted-foreground">
        {!checkIn ? "選擇入住日期" : !checkOut ? "選擇退房日期" : "入住與退房日期"}
      </p>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className={cn("font-medium", checkIn ? "text-foreground" : "text-muted-foreground")}>
          {checkIn ? format(checkIn, "M/d (EEE)", { locale: zhTW }) : "入住 —"}
        </span>
        <span className="text-muted-foreground">→</span>
        <span className={cn("font-medium", checkOut ? "text-foreground" : "text-muted-foreground")}>
          {checkOut ? format(checkOut, "M/d (EEE)", { locale: zhTW }) : "退房 —"}
        </span>
        {nights > 0 && (
          <span
            className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "hsl(25, 70%, 55%)", color: "white" }}
          >
            共 {nights} 晚
          </span>
        )}
      </div>
    </div>
  );

  const renderRangeCalendar = (numberOfMonths: number) => (
    <>
      {renderRangeCalendarHeader()}
      <Calendar
        mode="range"
        selected={selectedRange}
        onSelect={handleRangeSelect}
        disabled={rangeDayDisabled}
        defaultMonth={checkIn || today}
        numberOfMonths={numberOfMonths}
        className={cn("p-3 pointer-events-auto")}
      />
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <p className="text-xs text-muted-foreground">
          {availableDateSet ? "僅可選擇連續有空房的日期" : "點選入住，再點選退房"}
        </p>
        {(checkIn || checkOut) && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={() => {
              onCheckInChange(undefined);
              onCheckOutChange(undefined);
            }}
          >
            清除
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-4 md:p-6">
        {/* Desktop */}
        <div className="hidden md:flex gap-4 items-start">
          {/* Destination */}
          <div className="flex-1 text-left">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              目的地 <span className="text-muted-foreground/70 text-xs">（選填）</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                ref={desktopDestinationInputRef}
                placeholder="城市、地區或民宿名稱"
                className="!h-12 !min-h-12 !py-3 !pl-10 border-border text-foreground"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {["宜蘭", "南投", "苗栗"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSearchQueryChange(s)}
                  className="text-xs px-2.5 py-0.5 rounded-full border border-[hsl(25,70%,55%)]/30 text-[hsl(25,70%,45%)] hover:bg-[hsl(25,70%,55%)]/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Combined date range */}
          <div className="text-left min-w-[300px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              入住 / 退房
            </label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-10 justify-start text-left font-normal border-border"
                  )}
                >
                  {isLoadingAvailability ? (
                    <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {renderRangeButtonContent()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {renderRangeCalendar(2)}
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests & Rooms */}
          <div className="text-left">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              房客 / 房間
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 justify-start text-left font-normal border-border text-foreground gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  {adults} 大人{children > 0 ? ` · ${children} 兒童` : ""} · {rooms} 間
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" align="start">
                {renderGuestPicker()}
              </PopoverContent>
            </Popover>
          </div>

          {/* Search */}
          <Button
            className="h-10 px-8 mt-[26px] rounded-lg text-white font-medium shrink-0"
            style={{ background: "hsl(25, 70%, 55%)" }}
            onClick={onSearch}
          >
            <Search className="h-4 w-4 mr-2" />
            搜尋
          </Button>
        </div>

        {/* Mobile */}
        <div className="flex md:hidden flex-col gap-2.5">
          <div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                ref={mobileDestinationInputRef}
                placeholder="城市、地區或民宿名稱（選填）"
                className="!pl-10 h-11 border-border text-foreground text-base"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {["宜蘭", "南投", "苗栗"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSearchQueryChange(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-[hsl(25,70%,55%)]/30 text-[hsl(25,70%,45%)] hover:bg-[hsl(25,70%,55%)]/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Combined date range */}
          <Popover open={dateOpenMobile} onOpenChange={setDateOpenMobile}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-11 justify-start text-left font-normal border-border text-base"
                )}
              >
                {isLoadingAvailability ? (
                  <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <CalendarDays className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                {renderRangeButtonContent(true)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              {renderRangeCalendar(1)}
            </PopoverContent>
          </Popover>

          {/* Guests + search */}
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 h-11 justify-start text-left font-normal border-border text-foreground text-base gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  {adults} 大人{children > 0 ? ` · ${children} 兒童` : ""} · {rooms} 間
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" align="start">
                {renderGuestPicker()}
              </PopoverContent>
            </Popover>

            <Button
              className="h-11 px-6 rounded-lg text-white font-medium shrink-0"
              style={{ background: "hsl(25, 70%, 55%)" }}
              onClick={onSearch}
            >
              <Search className="h-4 w-4 mr-1.5" />
              搜尋
            </Button>
          </div>

          {checkIn && checkOut && (
            <p className="text-sm text-muted-foreground text-center">
              {format(checkIn, "M/d (EEE)", { locale: zhTW })} 至{" "}
              {format(checkOut, "M/d (EEE)", { locale: zhTW })}，共 {nights} 晚
            </p>
          )}
        </div>

        <div className="hidden md:block">
          {checkIn && checkOut && (
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {format(checkIn, "yyyy/M/d (EEE)", { locale: zhTW })} 至{" "}
              {format(checkOut, "yyyy/M/d (EEE)", { locale: zhTW })}，共 {nights} 晚
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalSearchBar;
