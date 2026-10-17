import { Badge } from "@lakeze/shared/components/ui/badge";

export const NotLiveBadge = ({ testId }: { testId?: string }) => (
  <Badge variant="outline" className="ml-2 border-amber-500 text-amber-700" data-testid={testId ?? "not-live-badge"}>
    未開賣
  </Badge>
);
