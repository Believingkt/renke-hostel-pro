import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PricingTemplateSkeletonProps {
  count?: number;
}

/**
 * 價格模板列表骨架屏
 * 專為價格模板卡片設計的載入狀態
 */
export function PricingTemplateSkeleton({ count = 3 }: PricingTemplateSkeletonProps) {
  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
          <CardContent className="p-4 sm:p-5 space-y-3 sm:space-y-4">
            {/* 標題和描述 */}
            <div className="space-y-1.5 sm:space-y-2">
              <Skeleton className="h-5 sm:h-6 w-2/3" />
              <Skeleton className="h-3 sm:h-4 w-full" />
            </div>

            {/* 價格區塊 */}
            <div className="space-y-2 sm:space-y-3">
              <div className="bg-muted/50 rounded-lg p-2.5 sm:p-3">
                <Skeleton className="h-3 sm:h-4 w-20 mb-2" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Skeleton className="h-2.5 sm:h-3 w-12 mb-1" />
                    <Skeleton className="h-4 sm:h-5 w-20" />
                  </div>
                  <div>
                    <Skeleton className="h-2.5 sm:h-3 w-12 mb-1" />
                    <Skeleton className="h-4 sm:h-5 w-20" />
                  </div>
                </div>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-2 pt-2 border-t">
              <Skeleton className="h-8 sm:h-9 flex-1" />
              <Skeleton className="h-8 sm:h-9 w-8 sm:w-9" />
              <Skeleton className="h-8 sm:h-9 w-8 sm:w-9" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
