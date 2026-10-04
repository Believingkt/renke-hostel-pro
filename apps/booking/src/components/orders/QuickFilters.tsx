import { Home, DoorOpen, Clock, CreditCard, CalendarClock, X, LucideIcon } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Label } from "@lakeze/shared/components/ui/label";
import { QuickFilterType } from "@/types/order";

interface QuickFiltersProps {
  quickFilter: QuickFilterType;
  onFilterChange: (filter: QuickFilterType) => void;
  getFilterCount: (filter: string) => number;
}

type FilterItem = {
  key: Exclude<QuickFilterType, "">;
  label: string;
  icon: LucideIcon;
  /** 選中時的外框 / 底色 */
  activeCard: string;
  /** 未選中時 hover 外框 */
  idleCard: string;
  /** 選中時的 icon 底色 */
  activeIcon: string;
  /** 未選中時的 icon 底色 */
  idleIcon: string;
  iconColor: string;
  textColor: string;
};

const FILTERS: FilterItem[] = [
  {
    key: "today_checkin",
    label: "今日入住",
    icon: Home,
    activeCard: "border-primary bg-primary/5 shadow-lg md:scale-[1.02]",
    idleCard: "border-border bg-card hover:border-primary/30 hover:shadow-md",
    activeIcon: "bg-primary",
    idleIcon: "bg-primary/10 group-hover:bg-primary/20",
    iconColor: "text-primary",
    textColor: "text-primary",
  },
  {
    key: "today_checkout",
    label: "今日退房",
    icon: DoorOpen,
    activeCard: "border-info bg-info-light shadow-lg md:scale-[1.02]",
    idleCard: "border-border bg-card hover:border-info/30 hover:shadow-md",
    activeIcon: "bg-info",
    idleIcon: "bg-info-light group-hover:bg-info/20",
    iconColor: "text-info",
    textColor: "text-info",
  },
  {
    key: "pending",
    label: "待確認",
    icon: Clock,
    activeCard: "border-warning bg-warning-light shadow-lg md:scale-[1.02]",
    idleCard: "border-border bg-card hover:border-warning/30 hover:shadow-md",
    activeIcon: "bg-warning",
    idleIcon: "bg-warning-light group-hover:bg-warning/20",
    iconColor: "text-warning",
    textColor: "text-warning",
  },
  {
    key: "unpaid",
    label: "未付款",
    icon: CreditCard,
    activeCard: "border-error bg-error-light shadow-lg md:scale-[1.02]",
    idleCard: "border-border bg-card hover:border-error/30 hover:shadow-md",
    activeIcon: "bg-error",
    idleIcon: "bg-error-light group-hover:bg-error/20",
    iconColor: "text-error",
    textColor: "text-error",
  },
  {
    key: "upcoming",
    label: "即將到來",
    icon: CalendarClock,
    activeCard: "border-success bg-success-light shadow-lg md:scale-[1.02]",
    idleCard: "border-border bg-card hover:border-success/30 hover:shadow-md",
    activeIcon: "bg-success",
    idleIcon: "bg-success-light group-hover:bg-success/20",
    iconColor: "text-success",
    textColor: "text-success",
  },
];

export function QuickFilters({ quickFilter, onFilterChange, getFilterCount }: QuickFiltersProps) {
  const hasActiveFilter = quickFilter !== "";

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-base font-semibold">快速篩選</Label>
        <Button
          variant={hasActiveFilter ? "destructive" : "outline"}
          size="sm"
          onClick={() => onFilterChange("")}
          disabled={!hasActiveFilter}
          className={`gap-2 transition-all h-10 sm:h-9 touch-manipulation ${hasActiveFilter ? "shadow-md" : "opacity-50"}`}
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">清除篩選</span>
          <span className="sm:hidden">清除</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {FILTERS.map((f) => {
          const active = quickFilter === f.key;
          const count = getFilterCount(f.key);
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`group relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all duration-300 touch-manipulation min-h-[64px] md:min-h-[100px] md:flex-col md:items-start md:p-4 ${
                active ? f.activeCard : f.idleCard
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2 md:mb-3">
                <div className={`shrink-0 rounded-lg p-2 transition-colors md:p-2.5 ${active ? f.activeIcon : f.idleIcon}`}>
                  <Icon className={`h-4 w-4 md:h-5 md:w-5 ${active ? "text-white" : f.iconColor}`} />
                </div>
                <span className={`hidden text-2xl font-bold transition-colors md:inline ${active ? f.textColor : "text-muted-foreground"} ${count > 0 ? "" : "md:invisible"}`}>
                  {count}
                </span>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 md:hidden">
                  <span className={`truncate text-sm font-medium ${active ? f.textColor : "text-foreground"}`}>
                    {f.label}
                  </span>
                  {count > 0 && (
                    <span className={`shrink-0 text-lg font-bold tabular-nums ${active ? f.textColor : "text-muted-foreground"}`}>
                      {count}
                    </span>
                  )}
                </div>
              </div>
              <span className={`hidden text-sm font-medium transition-colors md:inline ${active ? f.textColor : "text-foreground"}`}>
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
