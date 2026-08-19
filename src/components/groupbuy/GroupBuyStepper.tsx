import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  /** 1-based 步驟編號 */
  no: number;
  label: string;
  /** 點擊可捲動到的區塊 id（可選） */
  targetId?: string;
}

interface Props {
  steps: StepDef[];
  /** 目前進行中的步驟編號 */
  current: number;
  /** 已完成的步驟編號集合 */
  completed: number[];
  className?: string;
}

/**
 * 團購訂房流程進度（純顯示 + 捲動導引，不影響任何訂房邏輯）
 * 手機版採橫向捲動，避免四個步驟擠成一團。
 */
export function GroupBuyStepper({ steps, current, completed, className }: Props) {
  const go = (id?: string) => {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="訂房流程"
      className={cn(
        "-mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <ol className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:gap-2">
        {steps.map((s, i) => {
          const done = completed.includes(s.no);
          const active = current === s.no;
          return (
            <li key={s.no} className="flex items-center gap-1.5 sm:flex-1 sm:gap-2">
              <button
                type="button"
                onClick={() => go(s.targetId)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition sm:w-full sm:justify-center sm:text-sm",
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : done
                      ? "border-primary/25 bg-card text-foreground"
                      : "border-border/70 bg-card text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : String(s.no).padStart(2, "0")}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden className="h-px w-4 shrink-0 bg-border sm:w-5" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default GroupBuyStepper;
