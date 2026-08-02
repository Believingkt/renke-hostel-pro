/** 匹配度徽章：沿用既有 accent／primary 色系，不新增色票 */
import { cn } from "@/lib/utils";

interface MatchBadgeProps {
  score: number;
  label?: string;
  className?: string;
}

export function MatchBadge({ score, label = "匹配度", className }: MatchBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent",
        className,
      )}
    >
      <span>{label}</span>
      <span className="font-bold tabular-nums">{score}%</span>
    </span>
  );
}

export default MatchBadge;
