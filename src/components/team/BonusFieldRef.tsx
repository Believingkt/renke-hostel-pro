import { ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BONUS_FIELD_GLOSSARY,
  canOpenBonusSetting,
  type BonusFieldKey,
} from "@/lib/bonusFieldGlossary";

interface Props {
  field: BonusFieldKey;
  /** 目前使用者角色，用來決定是否顯示設定頁超連結 */
  roles?: string[];
  /** 額外顯示的狀態文字，例如「已關閉」 */
  status?: string;
  className?: string;
}

/**
 * 中文欄位名 + 溯源連結。
 * 全站禁止直接顯示 `counts_team_bonus` 這類技術欄位名，一律改用本元件。
 */
export default function BonusFieldRef({ field, roles = [], status, className }: Props) {
  const meta = BONUS_FIELD_GLOSSARY[field];
  const canOpen = canOpenBonusSetting(meta, roles);

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="underline decoration-dotted underline-offset-2 cursor-help">
              「{meta.label}」
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed">
            <p>{meta.meaning}</p>
            <p className="mt-1 text-muted-foreground">設定位置：{meta.settingLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {status ? <span>{status}</span> : null}
      {canOpen ? (
        <a
          href={meta.href!}
          className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:opacity-80"
        >
          前往設定
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">（{meta.settingLabel}，請洽管理員）</span>
      )}
    </span>
  );
}
