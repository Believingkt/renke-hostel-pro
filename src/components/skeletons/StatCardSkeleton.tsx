import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
  return (
    <Card className="p-3 md:p-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2 md:gap-3">
        <div className="space-y-1.5 md:space-y-2 flex-1 min-w-0">
          {/* 標題骨架 */}
          <Skeleton className="h-2.5 w-16 md:h-3 md:w-20" />
          {/* 數值和變化骨架 */}
          <div className="flex items-baseline gap-1.5 md:gap-2">
            <Skeleton className="h-5 w-20 md:h-7 md:w-28" />
            <Skeleton className="h-2.5 w-10 md:h-3 md:w-14" />
          </div>
        </div>
        {/* 圖標骨架 */}
        <Skeleton className="h-10 w-10 md:h-14 md:w-14 rounded-lg md:rounded-xl shrink-0" />
      </div>
    </Card>
  );
}
