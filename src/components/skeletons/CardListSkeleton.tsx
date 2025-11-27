import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CardListSkeletonProps {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  showImage?: boolean;
}

/**
 * 卡片列表骨架屏
 * 適用於房型列表、價格模板列表等卡片式佈局
 */
export function CardListSkeleton({ 
  count = 3, 
  columns = 1,
  showImage = false 
}: CardListSkeletonProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`grid gap-3 sm:gap-4 md:gap-6 ${gridCols[columns]}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
          {showImage && (
            <Skeleton className="h-32 sm:h-40 md:h-48 w-full rounded-t-lg" />
          )}
          <CardContent className="p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4">
            {/* 標題 */}
            <div className="space-y-2">
              <Skeleton className="h-5 sm:h-6 w-2/3" />
              <Skeleton className="h-3 sm:h-4 w-full" />
            </div>

            {/* 內容行 */}
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 sm:h-4 w-20 sm:w-24" />
                <Skeleton className="h-4 sm:h-5 w-24 sm:w-28" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 sm:h-4 w-20 sm:w-24" />
                <Skeleton className="h-4 sm:h-5 w-24 sm:w-28" />
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 sm:h-9 flex-1" />
              <Skeleton className="h-8 sm:h-9 w-8 sm:w-9" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
