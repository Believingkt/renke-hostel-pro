import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FormSkeletonProps {
  fields?: number;
  hasImage?: boolean;
}

export function FormSkeleton({ fields = 6, hasImage = false }: FormSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full max-w-md mt-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        {hasImage && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        )}
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
