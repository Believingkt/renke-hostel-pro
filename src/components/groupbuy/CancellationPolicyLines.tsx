import { cancellationPolicyCopy, type CancellationPolicyType } from "@/lib/cancellation-policy";

interface Props {
  policy: CancellationPolicyType;
  className?: string;
}

/**
 * 取消政策條列（前台唯一顯示元件）。
 * 文案一律取自 src/lib/cancellation-policy.ts 的 cancellationPolicyCopy()，
 * 任何頁面都不得自行 hardcode 級距，避免與後端實際計算的退款金額不一致。
 */
export function CancellationPolicyLines({ policy, className }: Props) {
  const copy = cancellationPolicyCopy(policy);
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      {copy.intro && <p className="mt-1 text-xs font-medium text-foreground">{copy.intro}</p>}
      {copy.lines.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          {copy.lines.map((line) => (
            <li key={line}>・{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.fallbackNote}</p>
      )}
    </div>
  );
}

export default CancellationPolicyLines;
