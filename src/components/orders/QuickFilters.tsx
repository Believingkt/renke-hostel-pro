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
          className={`gap-2 transition-all ${
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 今日入住 */}
        <button
          onClick={() => onFilterChange("today_checkin")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 ${
            quickFilter === "today_checkin"
              ? "border-blue-500 bg-blue-50 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-blue-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "today_checkin"
                ? "bg-blue-500"
                : "bg-blue-100 group-hover:bg-blue-200"
            }`}>
              <Home className={`h-5 w-5 ${
                quickFilter === "today_checkin" ? "text-white" : "text-blue-600"
              }`} />
            </div>
            {getFilterCount("today_checkin") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "today_checkin" ? "text-blue-600" : "text-muted-foreground"
              }`}>
                {getFilterCount("today_checkin")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "today_checkin" ? "text-blue-700" : "text-foreground"
          }`}>
            今日入住
          </span>
        </button>

        {/* 今日退房 */}
        <button
          onClick={() => onFilterChange("today_checkout")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 ${
            quickFilter === "today_checkout"
              ? "border-purple-500 bg-purple-50 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-purple-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "today_checkout"
                ? "bg-purple-500"
                : "bg-purple-100 group-hover:bg-purple-200"
            }`}>
              <DoorOpen className={`h-5 w-5 ${
                quickFilter === "today_checkout" ? "text-white" : "text-purple-600"
              }`} />
            </div>
            {getFilterCount("today_checkout") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "today_checkout" ? "text-purple-600" : "text-muted-foreground"
              }`}>
                {getFilterCount("today_checkout")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "today_checkout" ? "text-purple-700" : "text-foreground"
          }`}>
            今日退房
          </span>
        </button>

        {/* 待確認 */}
        <button
          onClick={() => onFilterChange("pending")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 ${
            quickFilter === "pending"
              ? "border-orange-500 bg-orange-50 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-orange-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "pending"
                ? "bg-orange-500"
                : "bg-orange-100 group-hover:bg-orange-200"
            }`}>
              <Clock className={`h-5 w-5 ${
                quickFilter === "pending" ? "text-white" : "text-orange-600"
              }`} />
            </div>
            {getFilterCount("pending") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "pending" ? "text-orange-600" : "text-muted-foreground"
              }`}>
                {getFilterCount("pending")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "pending" ? "text-orange-700" : "text-foreground"
          }`}>
            待確認
          </span>
        </button>

        {/* 未付款 */}
        <button
          onClick={() => onFilterChange("unpaid")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 ${
            quickFilter === "unpaid"
              ? "border-red-500 bg-red-50 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-red-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "unpaid"
                ? "bg-red-500"
                : "bg-red-100 group-hover:bg-red-200"
            }`}>
              <CreditCard className={`h-5 w-5 ${
                quickFilter === "unpaid" ? "text-white" : "text-red-600"
              }`} />
            </div>
            {getFilterCount("unpaid") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "unpaid" ? "text-red-600" : "text-muted-foreground"
              }`}>
                {getFilterCount("unpaid")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "unpaid" ? "text-red-700" : "text-foreground"
          }`}>
            未付款
          </span>
        </button>

        {/* 即將到來 */}
        <button
          onClick={() => onFilterChange("upcoming")}
          className={`relative group flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-300 ${
            quickFilter === "upcoming"
              ? "border-green-500 bg-green-50 shadow-lg scale-[1.02]"
              : "border-border bg-card hover:border-green-300 hover:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between w-full mb-3">
            <div className={`p-2.5 rounded-lg transition-colors ${
              quickFilter === "upcoming"
                ? "bg-green-500"
                : "bg-green-100 group-hover:bg-green-200"
            }`}>
              <CalendarClock className={`h-5 w-5 ${
                quickFilter === "upcoming" ? "text-white" : "text-green-600"
              }`} />
            </div>
            {getFilterCount("upcoming") > 0 && (
              <span className={`text-2xl font-bold transition-colors ${
                quickFilter === "upcoming" ? "text-green-600" : "text-muted-foreground"
              }`}>
                {getFilterCount("upcoming")}
              </span>
            )}
          </div>
          <span className={`text-sm font-medium transition-colors ${
            quickFilter === "upcoming" ? "text-green-700" : "text-foreground"
          }`}>
            即將到來
          </span>
        </button>
      </div>
    </div>
  );
}
