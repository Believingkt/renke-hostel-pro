import { Check } from "lucide-react";
import { WIZARD_STEPS } from "@/lib/onboarding/wizardSteps";

interface Props { current: number; done: boolean[]; onSelect: (i: number) => void }

/** 步驟列：目前步驟高亮、已完成顯示 ✓；手機橫向捲動 */
export function WizardStepper({ current, done, onSelect }: Props) {
  return (
    <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="wizard-stepper">
      {WIZARD_STEPS.map((s, i) => {
        const active = i === current;
        return (
          <li key={s.key} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}
              data-testid={`wizard-step-${i}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${done[i] ? "bg-emerald-600 text-white" : active ? "bg-primary-foreground/20" : "bg-muted"}`} data-testid={`wizard-step-${i}-${done[i] ? "done" : "todo"}`}>
                {done[i] ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.title}
              {s.optional && <span className="text-xs opacity-70">（選填）</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
