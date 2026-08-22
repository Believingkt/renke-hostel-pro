import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { zhTW } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * PMS Admin Calendar Design Standard
 * ----------------------------------
 * 後台（PMS Admin）新增任何日期選擇功能（單日／區間／篩選／月份）時，
 * 預設使用 <Calendar variant="admin" />，或直接使用 AdminDateRangeField / DateField 等封裝元件，
 * 不要再為單一頁面另外撰寫一次性 Calendar 樣式。
 * 旅客前台請維持 variant="frontend"，勿更動其預設外觀。
 */
export type CalendarVariant = "frontend" | "backend" | "admin";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  variant?: CalendarVariant;
};

const colorSchemes = {
  frontend: {
    selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
    today: "border-2 border-primary font-semibold aria-selected:border-0 aria-selected:bg-primary aria-selected:text-primary-foreground",
    hover: "hover:bg-primary/10 hover:text-primary",
    rangeMiddle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
    cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
    dayOutside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
  },
  backend: {
    selected: "bg-[hsl(203,78%,43%)] text-white hover:bg-[hsl(203,78%,43%)] hover:text-white focus:bg-[hsl(203,78%,43%)] focus:text-white",
    today: "border border-[hsl(203,78%,43%)] font-semibold aria-selected:border-0 aria-selected:bg-[hsl(203,78%,43%)] aria-selected:text-white",
    hover: "hover:bg-[hsl(203,78%,43%)]/10 hover:text-[hsl(203,78%,43%)]",
    rangeMiddle: "aria-selected:bg-[hsl(203,78%,85%)] aria-selected:text-[hsl(203,78%,25%)]",
    cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[hsl(203,78%,85%)]/50 [&:has([aria-selected])]:bg-[hsl(203,78%,85%)] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
    dayOutside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-[hsl(203,78%,85%)]/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
  },
  /** PMS Admin：品牌橘、cell 36px、today 細框、range 中段淡橘 */
  admin: {
    selected:
      "bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
    today:
      "border border-primary/70 text-primary font-semibold aria-selected:border-0 aria-selected:bg-primary aria-selected:text-primary-foreground",
    hover: "hover:bg-primary/10 hover:text-foreground",
    rangeMiddle: "aria-selected:bg-primary/15 aria-selected:text-foreground",
    cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
    dayOutside:
      "day-outside text-muted-foreground/50 aria-selected:bg-primary/10 aria-selected:text-muted-foreground",
  },
};

function Calendar({ className, classNames, showOutsideDays = true, variant = "backend", ...props }: CalendarProps) {
  const colors = colorSchemes[variant];
  const isAdmin = variant === "admin";

  return (
    <DayPicker
      locale={props.locale ?? zhTW}
      showOutsideDays={showOutsideDays}
      weekStartsOn={props.weekStartsOn ?? (isAdmin ? 0 : undefined)}
      className={cn("p-3 bg-popover pointer-events-auto", isAdmin && "p-3 sm:p-4", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: cn("text-sm font-medium text-popover-foreground", isAdmin && "text-[0.95rem] font-semibold"),
        nav: "space-x-1 flex items-center",
        nav_button: isAdmin
          ? "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          : cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-popover p-0 opacity-70 hover:opacity-100 hover:bg-accent",
            ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: cn(
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
          isAdmin && "w-9 text-xs font-normal",
        ),
        row: "flex w-full mt-2",
        cell: colors.cell,
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          isAdmin && "rounded-lg",
          colors.hover,
        ),
        day_range_end: "day-range-end",
        day_selected: colors.selected,
        day_today: colors.today,
        day_outside: colors.dayOutside,
        day_disabled: isAdmin
          ? "text-muted-foreground/35 opacity-100 cursor-not-allowed hover:bg-transparent"
          : "text-muted-foreground opacity-50",
        day_range_middle: colors.rangeMiddle,
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
