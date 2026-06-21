import { useMemo, useRef, useState } from "react";
import { format, addDays } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
  Sparkles,
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
  /** Set of YYYY-MM-DD dates that have available rooms for the destination */
  availableDateSet?: Set<string> | null;
  /** Validates whether a stay range has at least one bookable room type for every night */
  isStayRangeAvailable?: (start: Date, endExclusive: Date) => boolean;
  /** Whether the availability index is being prepared */
  isLoadingAvailability?: boolean;
  /** Called when user opens a date picker without a destination set */
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
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkInOpenMobile, setCheckInOpenMobile] = useState(false);
  const [checkOutOpenMobile, setCheckOutOpenMobile] = useState(false);
  const desktopDestinationInputRef = useRef<HTMLInputElement>(null);
  const mobileDestinationInputRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getDestinationValue = () => {
    const mobileValue = mobileDestinationInputRef.current?.value?.trim();
    const desktopValue = desktopDestinationInputRef.current?.value?.trim();
    return mobileValue || desktopValue || searchQuery.trim();
  };

  // Destination is now optional — never gate the date pickers.
  const hasDestination = true;
  const dateGateActive = false;

  const handleDatePopoverOpenChange = (
    nextOpen: boolean,
    setOpen: (open: boolean) => void
  ) => {
    setOpen(nextOpen);
  };

  // Gating now happens in Popover's onOpenChange (more reliable than onClick).

  const isDateUnavailable = (date: Date) => {
    if (!availableDateSet) return false;
    const key = format(date, "yyyy-MM-dd");
    return !availableDateSet.has(key);
  };

  const handleCheckInSelect = (date: Date | undefined) => {
    onCheckInChange(date);
    setCheckInOpen(false);
    setCheckInOpenMobile(false);
    if (date) {
      if (checkOut && checkOut <= date) {
        onCheckOutChange(undefined);
      }
      setTimeout(() => {
        setCheckOutOpen(true);
        setCheckOutOpenMobile(true);
      }, 200);
    }
  };

  const handleCheckOutSelect = (date: Date | undefined) => {
    onCheckOutChange(date);
    setCheckOutOpen(false);
    setCheckOutOpenMobile(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };

  const checkInDisabled = (date: Date) => {
    if (date < today) return true;
    return isDateUnavailable(date);
  };

  const checkOutDisabled = (date: Date) => {
    const minDate = checkIn ? addDays(checkIn, 1) : addDays(today, 1);
    if (date < minDate) return true;
    if (!availableDateSet) return false;

    if (checkIn && isStayRangeAvailable) {
      return !isStayRangeAvailable(checkIn, date);
    }

    // Without a selected check-in date yet, at least require the previous night to be available.
    const prevNight = addDays(date, -1);
    return !availableDateSet.has(format(prevNight, "yyyy-MM-dd"));
  };

  const renderGuestPicker = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">大人</p>
          <p className="text-sm text-muted-foreground">18 歲以上</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onAdultsChange(Math.max(1, adults - 1))} disabled={adults <= 1}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-sm font-medium">{adults}</span>
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onAdultsChange(Math.min(20, adults + 1))} disabled={adults >= 20}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">兒童</p>
          <p className="text-sm text-muted-foreground">0–6 歲</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onChildrenChange(Math.max(0, children - 1))} disabled={children <= 0}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-sm font-medium">{children}</span>
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onChildrenChange(Math.min(10, children + 1))} disabled={children >= 10}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <div>
          <p className="text-sm font-medium">房間數</p>
          <p className="text-sm text-muted-foreground">入住房間數量</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onRoomsChange(Math.max(1, rooms - 1))} disabled={rooms <= 1}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-6 text-center text-sm font-medium">{rooms}</span>
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onRoomsChange(Math.min(20, rooms + 1))} disabled={rooms >= 20}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );

  const dateButtonDisabledClass = dateGateActive
    ? "opacity-60 cursor-not-allowed"
    : "";

  const renderDateLabel = (date: Date | undefined, fallback: string) => {
    if (date) return format(date, "M/d (EEE)", { locale: zhTW });
    return fallback;
  };

  const renderDestinationRequiredHint = () => (
    <div className="w-[280px] p-4 text-sm">
      <p className="font-medium text-foreground">請先輸入目的地</p>
      <p className="mt-1 text-muted-foreground">
        先輸入城市、地區或民宿名稱，系統才會顯示可預訂日期。
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={() => {
          onDestinationRequired?.();
          toast({
            title: "請先輸入目的地",
            description: "請輸入城市、地區或民宿名稱後再選擇日期",
            variant: "destructive",
          });
          mobileDestinationInputRef.current?.focus();
          desktopDestinationInputRef.current?.focus();
        }}
      >
        返回輸入目的地
      </Button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-4 md:p-6">
        {/* Desktop: horizontal row */}
        <div className="hidden md:flex gap-4 items-start">
          {/* Destination (optional) */}
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

          {/* Check-in */}
          <div className="text-left">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              入住日期
            </label>
            <Popover open={checkInOpen} onOpenChange={(o) => handleDatePopoverOpenChange(o, setCheckInOpen)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  
                  className={cn(
                    "w-full h-10 justify-start text-left font-normal border-border",
                    checkIn ? "text-foreground" : "text-muted-foreground",
                    dateButtonDisabledClass
                  )}
                >
                  {isLoadingAvailability ? (
                    <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {renderDateLabel(checkIn, "選擇日期")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {hasDestination ? (
                  <>
                    <Calendar
                      mode="single"
                      selected={checkIn}
                      onSelect={handleCheckInSelect}
                      disabled={checkInDisabled}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    {availableDateSet && (
                      <p className="text-xs text-muted-foreground px-3 pb-2">
                        僅可選擇有空房的日期
                      </p>
                    )}
                  </>
                ) : (
                  renderDestinationRequiredHint()
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Check-out */}
          <div className="text-left">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              退房日期
            </label>
            <Popover open={checkOutOpen} onOpenChange={(o) => handleDatePopoverOpenChange(o, setCheckOutOpen)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  
                  className={cn(
                    "w-full h-10 justify-start text-left font-normal border-border",
                    checkOut ? "text-foreground" : "text-muted-foreground",
                    dateButtonDisabledClass
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  {renderDateLabel(checkOut, "選擇日期")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {hasDestination ? (
                  <>
                    <Calendar
                      mode="single"
                      selected={checkOut}
                      onSelect={handleCheckOutSelect}
                      disabled={checkOutDisabled}
                      defaultMonth={checkIn || today}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    {availableDateSet && (
                      <p className="text-xs text-muted-foreground px-3 pb-2">
                        僅可選擇連續有空房的退房日期
                      </p>
                    )}
                  </>
                ) : (
                  renderDestinationRequiredHint()
                )}
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
              <PopoverContent className="w-60 p-4" align="start">
                {renderGuestPicker()}
              </PopoverContent>
            </Popover>
          </div>

          {/* Search Button */}
          <Button
            className="h-10 px-8 mt-[26px] rounded-lg text-white font-medium shrink-0"
            style={{ background: "hsl(25, 70%, 55%)" }}
            onClick={onSearch}
          >
            <Search className="h-4 w-4 mr-2" />
            搜尋
          </Button>
        </div>

        {/* Mobile: compact stacked layout */}
        <div className="flex md:hidden flex-col gap-2.5">
          {/* Destination */}
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

          {/* Dates row */}
          <div className="flex gap-2">
            <Popover open={checkInOpenMobile} onOpenChange={(o) => handleDatePopoverOpenChange(o, setCheckInOpenMobile)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  
                  className={cn(
                    "flex-1 h-11 justify-start text-left font-normal border-border text-base",
                    checkIn ? "text-foreground" : "text-muted-foreground",
                    dateButtonDisabledClass
                  )}
                >
                  {isLoadingAvailability ? (
                    <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <CalendarDays className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {renderDateLabel(checkIn, "入住日期")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                {hasDestination ? (
                  <>
                    <Calendar
                      mode="single"
                      selected={checkIn}
                      onSelect={handleCheckInSelect}
                      disabled={checkInDisabled}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    {availableDateSet && (
                      <p className="text-xs text-muted-foreground px-3 pb-2">
                        僅可選擇有空房的日期
                      </p>
                    )}
                  </>
                ) : (
                  renderDestinationRequiredHint()
                )}
              </PopoverContent>
            </Popover>

            <Popover open={checkOutOpenMobile} onOpenChange={(o) => handleDatePopoverOpenChange(o, setCheckOutOpenMobile)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  
                  className={cn(
                    "flex-1 h-11 justify-start text-left font-normal border-border text-base",
                    checkOut ? "text-foreground" : "text-muted-foreground",
                    dateButtonDisabledClass
                  )}
                >
                  <CalendarDays className="mr-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {renderDateLabel(checkOut, "退房日期")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                {hasDestination ? (
                  <>
                    <Calendar
                      mode="single"
                      selected={checkOut}
                      onSelect={handleCheckOutSelect}
                      disabled={checkOutDisabled}
                      defaultMonth={checkIn || today}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    {availableDateSet && (
                      <p className="text-xs text-muted-foreground px-3 pb-2">
                        僅可選擇連續有空房的退房日期
                      </p>
                    )}
                  </>
                ) : (
                  renderDestinationRequiredHint()
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests row + search button */}
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
              <PopoverContent className="w-60 p-4" align="start">
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

          {/* Date hint */}
          {checkIn && checkOut && (
            <p className="text-sm text-muted-foreground text-center">
              {format(checkIn, "M/d (EEE)", { locale: zhTW })} 至{" "}
              {format(checkOut, "M/d (EEE)", { locale: zhTW })}，共{" "}
              {Math.round(
                (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
              )}{" "}
              晚
            </p>
          )}
        </div>

        {/* Desktop date hint */}
        <div className="hidden md:block">
          {checkIn && checkOut && (
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {format(checkIn, "yyyy/M/d (EEE)", { locale: zhTW })} 至{" "}
              {format(checkOut, "yyyy/M/d (EEE)", { locale: zhTW })}，共{" "}
              {Math.round(
                (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
              )}{" "}
              晚
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalSearchBar;
