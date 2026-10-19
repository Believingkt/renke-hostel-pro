import { Badge } from "@lakeze/shared/components/ui/badge";
import type { OnbStatus } from "@/lib/teamOnboarding";

const CLASS: Record<OnbStatus["level"], string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  muted: "bg-muted text-muted-foreground border-transparent",
};

export function OnbStatusBadge({ status, testId }: { status: OnbStatus; testId?: string }) {
  return (
    <Badge variant="outline" className={`font-normal whitespace-nowrap ${CLASS[status.level]}`} data-testid={testId}>
      {status.label}
    </Badge>
  );
}
