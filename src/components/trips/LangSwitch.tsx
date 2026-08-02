/** 語言切換（中／日／英），寫入 ?lang= query */
import { TRIP_LANGS, type TripLang } from "@/lib/tripI18n";
import { cn } from "@/lib/utils";

interface LangSwitchProps {
  value: TripLang;
  onChange: (lang: TripLang) => void;
  className?: string;
}

export function LangSwitch({ value, onChange, className }: LangSwitchProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-background/80 p-0.5 backdrop-blur border border-border",
        className,
      )}
    >
      {TRIP_LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === l.code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default LangSwitch;
