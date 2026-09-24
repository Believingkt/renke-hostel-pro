import { ShieldAlert } from "lucide-react";
import { cn } from "@lakeze/shared/lib/utils";
import {
  FRAUD_NOTICE_CORE_POINTS,
  FRAUD_NOTICE_TITLE,
  getFraudNoticeVariantNote,
  type FraudNoticeVariant,
} from "@/lib/fraudNotice";

interface Props {
  variant?: FraudNoticeVariant;
  className?: string;
  compact?: boolean;
}

/** 純展示元件：固定顯示的防詐騙提醒（不可收合、無任何業務邏輯） */
export function FraudPreventionNotice({ variant = "generic", className, compact }: Props) {
  const note = getFraudNoticeVariantNote(variant);

  return (
    <section
      aria-label={FRAUD_NOTICE_TITLE}
      className={cn(
        "rounded-xl border border-amber-300/70 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10",
        compact ? "p-3" : "p-3.5 sm:p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">{FRAUD_NOTICE_TITLE}</p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {FRAUD_NOTICE_CORE_POINTS.map((point) => (
              <li key={point} className="flex gap-1.5">
                <span aria-hidden className="shrink-0">•</span>
                <span className="min-w-0 break-words">{point}</span>
              </li>
            ))}
          </ul>
          {note && (
            <p className="rounded-lg border border-amber-400/60 bg-amber-100/70 px-3 py-2 text-xs font-medium leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100 sm:text-sm">
              {note}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default FraudPreventionNotice;
