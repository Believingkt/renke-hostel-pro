import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TabsSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Tabs Header */}
      <div className="flex gap-1 sm:gap-2 border-b overflow-x-auto scrollbar-hide">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 sm:h-10 w-20 sm:w-24 shrink-0" />
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-3 sm:space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 sm:h-6 w-32 sm:w-40" />
              <Skeleton className="h-3 sm:h-4 w-full max-w-md mt-2" />
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              <Skeleton className="h-9 sm:h-10 w-full" />
              <Skeleton className="h-9 sm:h-10 w-full" />
              <Skeleton className="h-9 sm:h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
