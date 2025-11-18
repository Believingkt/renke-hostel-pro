import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  showLegend?: boolean;
  withIcon?: boolean;
}

export function ChartSkeleton({ showLegend = true, withIcon = true }: ChartSkeletonProps) {
  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          {withIcon && (
            <Skeleton className="h-8 w-8 rounded-lg" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 圖例骨架 */}
        {showLegend && (
          <div className="flex items-center justify-center gap-4 pb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-sm" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-sm" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        )}
        
        {/* 圖表骨架 */}
        <div className="h-[300px] flex items-end justify-between gap-2 px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton 
              key={i} 
              className="flex-1 rounded-t-lg animate-pulse"
              style={{ 
                height: `${Math.random() * 60 + 40}%`,
                animationDelay: `${i * 50}ms`
              }}
            />
          ))}
        </div>
        
        {/* X軸標籤骨架 */}
        <div className="flex justify-between px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
