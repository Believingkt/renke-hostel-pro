import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
  return (
    <Card className="p-3 md:p-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2 md:gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-20 md:h-4 md:w-24" />
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-6 w-24 md:h-8 md:w-32" />
            <Skeleton className="h-3 w-12 md:h-4 md:w-16" />
          </div>
        </div>
        <Skeleton className="h-12 w-12 md:h-16 md:w-16 rounded-lg md:rounded-2xl" />
      </div>
    </Card>
  );
}
