import { useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  Search,
  MapPin,
  CalendarDays,
  Users,
  Minus,
  Plus,
  DoorOpen,
  Baby,
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
}: PortalSearchBarProps) => {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleCheckInSelect = (date: Date | undefined) => {
    onCheckInChange(date);
    setCheckInOpen(false);
    if (date) {
      // Auto-clear checkout if it's before or equal to new check-in
      if (checkOut && checkOut <= date) {
        onCheckOutChange(undefined);
      }
      // Auto-open checkout picker
      setTimeout(() => setCheckOutOpen(true), 200);
    }
  };

  const handleCheckOutSelect = (date: Date | undefined) => {
    onCheckOutChange(date);
    setCheckOutOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-3 sm:p-4 md:p-6">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-end">
          {/* Destination */}
          <div className="flex-1 text-left">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              目的地
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                placeholder="城市、地區或民宿名稱"
                className="!pl-10 h-10 border-border text-foreground"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          {/* Check-in / Check-out */}
          <div className="flex gap-3 flex-1">
            <div className="flex-1 text-left">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                入住日期
              </label>
              <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-10 justify-start text-left font-normal border-border",
                      checkIn ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    {checkIn
                      ? format(checkIn, "M/d (EEE)", { locale: zhTW })
                      : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkIn}
                    onSelect={handleCheckInSelect}
                    disabled={(date) => date < today}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 text-left">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                退房日期
              </label>
              <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-10 justify-start text-left font-normal border-border",
                      checkOut ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    {checkOut
                      ? format(checkOut, "M/d (EEE)", { locale: zhTW })
                      : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={checkOut}
                    onSelect={handleCheckOutSelect}
                    disabled={(date) =>
                      date < (checkIn ? addDays(checkIn, 1) : addDays(today, 1))
                    }
                    defaultMonth={checkIn || today}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Guests & Rooms */}
          <div className="w-full md:w-auto text-left">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              房客 / 房間
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full md:w-auto h-10 justify-start text-left font-normal border-border text-foreground gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  {adults} 大人{children > 0 ? ` · ${children} 兒童` : ""} · {rooms} 間
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-4" align="start">
                <div className="space-y-4">
                  {/* Adults stepper */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">大人</p>
                      <p className="text-sm text-muted-foreground">18 歲以上</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onAdultsChange(Math.max(1, adults - 1))}
                        disabled={adults <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onAdultsChange(Math.min(20, adults + 1))}
                        disabled={adults >= 20}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Children stepper */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">兒童</p>
                      <p className="text-sm text-muted-foreground">0–17 歲</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onChildrenChange(Math.max(0, children - 1))}
                        disabled={children <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{children}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onChildrenChange(Math.min(10, children + 1))}
                        disabled={children >= 10}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Rooms stepper */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">房間數</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onRoomsChange(Math.max(1, rooms - 1))}
                        disabled={rooms <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{rooms}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={() => onRoomsChange(Math.min(10, rooms + 1))}
                        disabled={rooms >= 10}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Search Button */}
          <Button
            className="h-10 px-8 rounded-lg text-white font-medium shrink-0"
            style={{ background: "hsl(25, 70%, 55%)" }}
            onClick={onSearch}
          >
            <Search className="h-4 w-4 mr-2" />
            搜尋
          </Button>
        </div>

        {/* Date hint */}
        {checkIn && checkOut && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
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
  );
};

export default PortalSearchBar;
