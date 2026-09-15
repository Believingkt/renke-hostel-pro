/** 行程時間軸點（Phase 2 才接拖拉排序，本階段先預留 dragHandle） */
import type { ReactNode } from "react";
import { Bed, Camera, Ticket, Utensils, Sparkles, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineItemType = "attraction" | "ticket" | "experience" | "meal" | "room";

const ICONS: Record<TimelineItemType, typeof Camera> = {
  attraction: Camera,
  ticket: Ticket,
  experience: Sparkles,
  meal: Utensils,
  room: Bed,
};

interface TimelineItemProps {
  type: TimelineItemType;
  time?: string | null;
  title: string;
  subtitle?: string;
  durationMin?: number | null;
  price?: number | null;
  trailing?: ReactNode;
  isLast?: boolean;
  draggable?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TimelineItem({
  type,
  time,
  title,
  subtitle,
  durationMin,
  price,
  trailing,
  isLast,
  draggable,
  className,
  children,
}: TimelineItemProps) {
  const Icon = ICONS[type] ?? Camera;

  return (
    <div className={cn("relative flex gap-3 pb-4", className)}>
      {/* 軸線 */}
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {time && <div className="text-xs font-medium text-primary tabular-nums">{time}</div>}
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {trailing}
            {draggable && (
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden />
            )}
          </div>
        </div>

        {subtitle && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}

        {(durationMin || price != null) && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            {durationMin ? <span>約 {durationMin} 分</span> : null}
            {price != null && price > 0 ? (
              <span className="tabular-nums">NT$ {price.toLocaleString()}</span>
            ) : null}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

export default TimelineItem;
