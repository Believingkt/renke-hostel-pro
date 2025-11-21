import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* PageHeader Skeleton */}
      <div className="pb-4 md:pb-6 border-b border-border/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 md:gap-3">
            <Skeleton className="h-6 w-6 md:h-7 md:w-7" />
            <Skeleton className="h-8 w-32 md:h-9 md:w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>

      {/* Filter Buttons Skeleton */}
      <div className="space-y-3">
        {/* Read/Unread Filter */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Type Filter */}
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Notification Cards Skeleton */}
      <div className="space-y-6">
        {/* Today Section */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-12" />
          {[1, 2, 3].map((i) => (
            <Card key={`today-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <Skeleton className="h-8 w-8 rounded-md shrink-0 mt-1" />
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Title and Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-8 rounded-full" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded shrink-0" />
                    </div>
                    
                    {/* Description */}
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    
                    {/* Footer */}
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Yesterday Section */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-12" />
          {[1, 2].map((i) => (
            <Card key={`yesterday-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-8 w-8 rounded-md shrink-0 mt-1" />
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-40" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded shrink-0" />
                    </div>
                    
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
