import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { getSettingImpact, type BonusSettingKey } from "@/lib/bonusSettingImpact";

interface Props {
  settingKey: BonusSettingKey;
  className?: string;
}

/** 設定欄位旁的「這個設定影響什麼」即時說明 */
export function SettingImpactHint({ settingKey, className }: Props) {
  const { impact, affected, unaffected } = getSettingImpact(settingKey);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${impact.label} 影響範圍說明`}
          className={`inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground ${className ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-sm">
        <div className="font-medium">{impact.label}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{impact.role}</p>

        <div>
          <div className="mb-1 text-xs text-muted-foreground">此設定影響</div>
          <div className="flex flex-wrap gap-1">
            {affected.map((f) => (
              <Badge key={f.key} variant="secondary" className="text-[11px] font-normal">
                {f.name}
              </Badge>
            ))}
          </div>
        </div>

        {unaffected.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">不影響</div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {unaffected.map((f) => f.name).join("、")}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default SettingImpactHint;
