import { HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { getBonusFormula } from "@/lib/bonusFormulas";

interface Props {
  /** bonus_type / source key */
  bonusKey: string;
  /** 已發放（paid）→ 讀快照、標示已凍結；未發放 → 即時試算 */
  frozen?: boolean;
  /** 本筆實際代入的數字（依序顯示） */
  values?: Array<{ label: string; value: string | number | null | undefined }>;
  /** 前往結算規則說明的路徑（預設 /team/commission?tab=rules） */
  rulesPath?: string;
  className?: string;
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString("zh-TW") : String(Number(v.toFixed(4)));
  }
  return String(v);
}

/** 獎金公式提示：顯示通用公式與本筆代入值，並可跳至結算規則說明 */
export function BonusFormulaHint({
  bonusKey,
  frozen = false,
  values = [],
  rulesPath = "/team/commission?tab=payout",
  className,
}: Props) {
  const formula = getBonusFormula(bonusKey);
  if (!formula) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${formula.name} 計算公式說明`}
          className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{formula.name}</span>
          {frozen ? (
            <Badge variant="secondary">已凍結（快照當時值）</Badge>
          ) : (
            <Badge variant="outline">即時試算</Badge>
          )}
        </div>

        <div>
          <div className="text-muted-foreground text-xs mb-1">通用公式</div>
          <div className="font-mono text-xs leading-relaxed">{formula.formula}</div>
        </div>

        {values.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs mb-1">
              {frozen ? "快照當時代入值" : "本筆代入值"}
            </div>
            <div className="space-y-0.5">
              {values.map((v) => (
                <div key={v.label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{v.label}</span>
                  <span className="tabular-nums">{fmt(v.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-muted-foreground text-xs mb-1">口徑</div>
          <p className="text-xs leading-relaxed">{formula.basis}</p>
        </div>

        {formula.gates.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {formula.gates.map((g) => (
              <Badge key={g} variant="outline" className="text-[11px] font-normal">
                {g}
              </Badge>
            ))}
          </div>
        )}

        {formula.usesVenueRevenue && (
          <p className="text-xs text-muted-foreground">
            此項以館別營收為基準，受「含／排除業主自帶」雙軌口徑影響。
          </p>
        )}

        <Link
          to={`${rulesPath}#${formula.anchorId}`}
          className="block text-xs text-primary hover:underline"
        >
          → 結算規則說明
        </Link>
      </PopoverContent>
    </Popover>
  );
}

export default BonusFormulaHint;
