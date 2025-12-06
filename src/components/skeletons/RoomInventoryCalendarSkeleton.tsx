import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RoomInventoryCalendarSkeleton() {
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* 頂部控制區 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* 房型名稱和視圖切換 */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Skeleton className="h-5 w-24 sm:h-6 sm:w-32" />
              <div className="flex sm:hidden gap-1">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-lg" />
              </div>
            </div>
            
            {/* 月份導航 */}
            <div className="flex items-center justify-center sm:justify-end">
              <div className="flex items-center gap-2 border rounded-lg p-1 bg-muted/30">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>

          {/* 工具列 */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* 日曆網格 */}
        <div className="space-y-2">
          {/* 星期標題 */}
          <div className="grid grid-cols-7 gap-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => (
              <div key={i} className="text-center py-2">
                <Skeleton className="h-4 w-6 mx-auto" />
              </div>
            ))}
          </div>
          
          {/* 日期格子 - 5行 */}
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, colIndex) => (
                <div 
                  key={colIndex} 
                  className="border rounded-lg p-2 min-h-[80px] sm:min-h-[100px] space-y-2 bg-muted/20"
                  style={{ animationDelay: `${(rowIndex * 7 + colIndex) * 20}ms` }}
                >
                  {/* 日期數字 */}
                  <Skeleton className="h-5 w-5 rounded-full" />
                  
                  {/* 價格資訊 */}
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  
                  {/* 庫存標籤 */}
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 圖例 */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RoomInventoryListSkeleton() {
  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <div className="flex flex-col gap-3">
          {/* 頂部控制區 */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <div className="flex gap-1">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          
          {/* 月份導航 */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 border rounded-lg p-1 bg-muted/30">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>

          {/* 工具列 */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2">
        {/* 列表項目 */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between p-3 border rounded-lg bg-muted/10"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="flex items-center gap-3">
              {/* 日期 */}
              <div className="text-center">
                <Skeleton className="h-5 w-8 mb-1" />
                <Skeleton className="h-3 w-6 mx-auto" />
              </div>
              
              {/* 價格資訊 */}
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            
            {/* 庫存標籤 */}
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
