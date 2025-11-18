import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  showLegend?: boolean;
  withIcon?: boolean;
}

export function ChartSkeleton({ showLegend = true, withIcon = true }: ChartSkeletonProps) {
  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-2 md:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 md:space-y-2 flex-1">
            {/* 標題骨架 */}
            <Skeleton className="h-4 w-24 md:h-5 md:w-32" />
            {/* 副標題骨架 */}
            <Skeleton className="h-3 w-16 md:h-3.5 md:w-20" />
          </div>
          {withIcon && (
            <Skeleton className="h-6 w-6 md:h-8 md:w-8 rounded-md md:rounded-lg shrink-0" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4">
        {/* 圖例骨架 */}
        {showLegend && (
          <div className="flex items-center justify-center gap-3 md:gap-4 pb-1 md:pb-2">
            <div className="flex items-center gap-1.5 md:gap-2">
              <Skeleton className="h-2 w-2 rounded-sm" />
              <Skeleton className="h-2.5 w-10 md:h-3 md:w-12" />
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <Skeleton className="h-2 w-2 rounded-sm" />
              <Skeleton className="h-2.5 w-10 md:h-3 md:w-12" />
            </div>
          </div>
        )}
        
        {/* 圖表骨架 - 響應式高度 */}
        <div className="h-[200px] md:h-[280px] lg:h-[300px] flex items-end justify-between gap-1 md:gap-2 px-2 md:px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton 
              key={i} 
              className="flex-1 rounded-t-md md:rounded-t-lg animate-pulse"
              style={{ 
                height: `${Math.random() * 50 + 40}%`,
                animationDelay: `${i * 50}ms`
              }}
            />
          ))}
        </div>
        
        {/* X軸標籤骨架 */}
        <div className="flex justify-between px-2 md:px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-6 md:h-3 md:w-8" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
