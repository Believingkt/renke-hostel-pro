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
} from "lucide-react";

interface PortalSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  checkIn: Date | undefined;
  checkOut: Date | undefined;
  onCheckInChange: (d: Date | undefined) => void;
  onCheckOutChange: (d: Date | undefined) => void;
  onSearch: () => void;
}

const PortalSearchBar = ({
  searchQuery,
  onSearchQueryChange,
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
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
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
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

          {/* Guests (placeholder for now) */}
          <div className="w-full md:w-36 text-left">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              房客人數
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                placeholder="2 位成人"
                className="!pl-10 h-10 border-border text-foreground"
                readOnly
              />
            </div>
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
