import { useState } from "react";
import { ChevronDown, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChildAgeRules, ChildTierKey } from "@/lib/child-rules";
import { TIER_ORDER } from "@/lib/child-rules";
import { formatGuestComposition, type GuestCounts } from "@/lib/groupBuyGuests";

interface Props {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
  rules: ChildAgeRules;
  /** 規則不符時的提示（由 evaluateChildSelection 產生） */
  blockReason?: string;
}

function tierField(key: ChildTierKey): keyof GuestCounts {
  if (key === "infant") return "infants";
  if (key === "toddler") return "toddlers";
  return "children";
}

function Stepper({
  label,
  hint,
  value,
  min = 0,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 rounded-full"
          aria-label={`減少${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-7 text-center text-base font-semibold tabular-nums">{disabled ? 0 : value}</span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 rounded-full"
          aria-label={`增加${label}`}
          disabled={disabled}
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** 團購專用入住人數選擇器：成人／兒童／幼兒／嬰兒，規則文字全部依 child_age_rules 動態產生 */
export function GroupBuyGuestPicker({ value, onChange, rules, blockReason }: Props) {
  const [open, setOpen] = useState(false);
  const summary = formatGuestComposition(value, rules) || "1 成人";

  const tierHint = (key: ChildTierKey) => {
    const t = rules.tiers[key];
    const range = `${t.min_age}–${t.max_age} 歲`;
    if (!t.allowed) return `${range}｜不接受入住`;
    const fee = t.fee_per_night > 0 ? `每晚 NT$${t.fee_per_night.toLocaleString("en-US")}` : "免費";
    const cap = t.max_count !== null ? `｜最多 ${t.max_count} 位` : "";
    const over =
      t.max_count !== null && (t.over_limit_fee_per_night ?? 0) > 0
        ? `（超過每位每晚 NT$${Number(t.over_limit_fee_per_night).toLocaleString("en-US")}）`
        : "";
    return `${range}｜${fee}${cap}${over}`;
  };

  return (
    <div>
      <p className="text-sm font-medium text-foreground">入住人數</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left transition hover:border-primary/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-base font-medium text-foreground">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-border/70 bg-muted/50 px-4 py-2">
          <Stepper
            label="成人"
            value={value.adults}
            min={1}
            onChange={(v) => onChange({ ...value, adults: v })}
          />
          {[...TIER_ORDER].reverse().map((key) => {
            const t = rules.tiers[key];
            const field = tierField(key);
            return (
              <div key={key} className="border-t border-border/60">
                <Stepper
                  label={`${t.label} ${t.min_age}–${t.max_age} 歲`}
                  hint={tierHint(key)}
                  value={value[field]}
                  disabled={!t.allowed}
                  onChange={(v) => onChange({ ...value, [field]: v })}
                />
              </div>
            );
          })}
          {rules.max_total_guests != null && rules.max_total_guests > 0 && (
            <p className="border-t border-border/60 py-2 text-xs text-muted-foreground">
              入住總人數上限 {rules.max_total_guests} 位（依民宿設定，嬰兒是否計入以民宿規則為準）。
            </p>
          )}
          {rules.note && <p className="pb-2 text-xs leading-relaxed text-muted-foreground">{rules.note}</p>}
        </div>
      )}

      {blockReason && <p className="mt-1.5 text-sm text-destructive">{blockReason}</p>}
    </div>
  );
}

export default GroupBuyGuestPicker;
