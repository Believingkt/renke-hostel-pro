import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface DetailSkeletonProps {
  sections?: number;
}

export function DetailSkeleton({ sections = 4 }: DetailSkeletonProps) {
  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 p-4 md:p-0">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="space-y-1.5 sm:space-y-2 min-w-0 flex-1">
          <Skeleton className="h-6 sm:h-7 md:h-8 w-36 sm:w-48" />
          <Skeleton className="h-3 sm:h-4 w-24 sm:w-32" />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Skeleton className="h-9 sm:h-10 flex-1 sm:w-20 md:w-24" />
          <Skeleton className="h-9 sm:h-10 flex-1 sm:w-20 md:w-24" />
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 sm:h-8 w-20 sm:w-24 rounded-full" />
        <Skeleton className="h-7 sm:h-8 w-24 sm:w-28 rounded-full" />
      </div>

      {/* Main Content Sections */}
      <div className="grid gap-3 sm:gap-4 md:gap-6 lg:grid-cols-2">
        {Array.from({ length: sections }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 sm:h-6 w-28 sm:w-32" />
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {/* Info Rows */}
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1 sm:space-y-1.5">
                  <Skeleton className="h-2.5 sm:h-3 w-16 sm:w-20" />
                  <Skeleton className="h-4 sm:h-5 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Additional Info Card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 sm:h-6 w-20 sm:w-24" />
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3">
          <Skeleton className="h-16 sm:h-20 w-full" />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Skeleton className="h-9 sm:h-10 w-full sm:w-28 md:w-32" />
            <Skeleton className="h-9 sm:h-10 w-full sm:w-28 md:w-32" />
            <Skeleton className="h-9 sm:h-10 w-full sm:w-28 md:w-32" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
