import { Home, DoorOpen, Clock, CreditCard, CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QuickFilterType } from "@/types/order";

interface QuickFiltersProps {
  quickFilter: QuickFilterType;
  onFilterChange: (filter: QuickFilterType) => void;
  getFilterCount: (filter: string) => number;
}

export function QuickFilters({ quickFilter, onFilterChange, getFilterCount }: QuickFiltersProps) {
  const hasActiveFilter = quickFilter !== "";
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-base font-semibold">快速篩選</Label>
        <Button
          variant={hasActiveFilter ? "destructive" : "outline"}
          size="sm"
          onClick={() => onFilterChange("")}
          disabled={!hasActiveFilter}
          className={`gap-2 transition-all h-10 sm:h-9 touch-manipulation ${
            hasActiveFilter 
              ? "shadow-md" 
              : "opacity-50"
          }`}
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">清除篩選</span>
          <span className="sm:hidden">清除</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 [&>button]:min-h-[76px] sm:[&>button]:min-h-[100px] [&>button]:p-3 sm:[&>button]:p-4 [&>button>div:first-child]:mb-1.5 sm:[&>button>div:first-child]:mb-3 [&>button_.p-2\\.5]:p-2 sm:[&>button_.p-2\\.5]:p-2.5 [&>button_.h-5]:h-4 sm:[&>button_.h-5]:h-5 [&>button_.w-5]:w-4 sm:[&>button_.w-5]:w-5 [&>button_.text-2xl]:text-xl sm:[&>button_.text-2xl]:text-2xl">
        {/* 今日入住 */}
        <button
          onClick={() => onFilterChange("today_checkin")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 touch-manipulation min-h-[100px] ${
            quickFilter === "today_checkin"
              ? "border-primary bg-primary/5 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-primary/30 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "today_checkin"
                ? "bg-primary"
                : "bg-primary/10 group-hover:bg-primary/20"
            }`}>
              <Home className={`h-5 w-5 ${
                quickFilter === "today_checkin" ? "text-white" : "text-primary"
              }`} />
            </div>
            {getFilterCount("today_checkin") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "today_checkin" ? "text-primary" : "text-muted-foreground"
              }`}>
                {getFilterCount("today_checkin")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "today_checkin" ? "text-primary" : "text-foreground"
          }`}>
            今日入住
          </span>
        </button>

        {/* 今日退房 */}
        <button
          onClick={() => onFilterChange("today_checkout")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 touch-manipulation min-h-[100px] ${
            quickFilter === "today_checkout"
              ? "border-info bg-info-light shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-info/30 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "today_checkout"
                ? "bg-info"
                : "bg-info-light group-hover:bg-info/20"
            }`}>
              <DoorOpen className={`h-5 w-5 ${
                quickFilter === "today_checkout" ? "text-white" : "text-info"
              }`} />
            </div>
            {getFilterCount("today_checkout") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "today_checkout" ? "text-info" : "text-muted-foreground"
              }`}>
                {getFilterCount("today_checkout")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "today_checkout" ? "text-info" : "text-foreground"
          }`}>
            今日退房
          </span>
        </button>

        {/* 待確認 */}
        <button
          onClick={() => onFilterChange("pending")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 touch-manipulation min-h-[100px] ${
            quickFilter === "pending"
              ? "border-warning bg-warning-light shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-warning/30 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "pending"
                ? "bg-warning"
                : "bg-warning-light group-hover:bg-warning/20"
            }`}>
              <Clock className={`h-5 w-5 ${
                quickFilter === "pending" ? "text-white" : "text-warning"
              }`} />
            </div>
            {getFilterCount("pending") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "pending" ? "text-warning" : "text-muted-foreground"
              }`}>
                {getFilterCount("pending")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "pending" ? "text-warning" : "text-foreground"
          }`}>
            待確認
          </span>
        </button>

        {/* 未付款 */}
        <button
          onClick={() => onFilterChange("unpaid")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 touch-manipulation min-h-[100px] ${
            quickFilter === "unpaid"
              ? "border-error bg-error-light shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-error/30 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "unpaid"
                ? "bg-error"
                : "bg-error-light group-hover:bg-error/20"
            }`}>
              <CreditCard className={`h-5 w-5 ${
                quickFilter === "unpaid" ? "text-white" : "text-error"
              }`} />
            </div>
            {getFilterCount("unpaid") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "unpaid" ? "text-error" : "text-muted-foreground"
              }`}>
                {getFilterCount("unpaid")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "unpaid" ? "text-error" : "text-foreground"
          }`}>
            未付款
          </span>
        </button>

        {/* 即將到來 */}
        <button
          onClick={() => onFilterChange("upcoming")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 touch-manipulation min-h-[100px] ${
            quickFilter === "upcoming"
              ? "border-success bg-success-light shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-success/30 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "upcoming"
                ? "bg-success"
                : "bg-success-light group-hover:bg-success/20"
            }`}>
              <CalendarClock className={`h-5 w-5 ${
                quickFilter === "upcoming" ? "text-white" : "text-success"
              }`} />
            </div>
            {getFilterCount("upcoming") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "upcoming" ? "text-success" : "text-muted-foreground"
              }`}>
                {getFilterCount("upcoming")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "upcoming" ? "text-success" : "text-foreground"
          }`}>
            即將到來
          </span>
        </button>
      </div>
    </div>
  );
}
