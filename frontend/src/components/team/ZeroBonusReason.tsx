import BonusFieldRef from "./BonusFieldRef";
import type { BonusFieldKey } from "@/lib/bonusFieldGlossary";
import { getBonusFormula } from "@/lib/bonusFormulas";

/** 依獎金類別列出「金額為 0 時最常見的原因」欄位 */
function reasonFields(bonusKey: string): BonusFieldKey[] {
  const category = getBonusFormula(bonusKey)?.category ?? "team";
  if (category === "closer") {
    return ["counts_closer_commission", "exempt_order_sources", "order_status"];
  }
  if (category === "scout") {
    return ["order_status", "exempt_order_sources", "resigned_at"];
  }
  if (category === "kol") {
    return ["order_status"];
  }
  return ["counts_team_bonus", "shared_sources", "resigned_at"];
}

/**
 * 卡片金額為 0 時，一行說明「可能是哪個設定造成的」，
 * 並以中文欄位名 + 溯源連結呈現，讓使用者不必看技術欄位名。
 */
export default function ZeroBonusReason({
  bonusKey,
  roles,
}: {
  bonusKey: string;
  roles: string[];
}) {
  const fields = reasonFields(bonusKey);
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-muted-foreground space-y-1">
      <p className="font-medium text-amber-700">本期為 0 元，常見原因：</p>
      {fields.map((f) => (
        <div key={f}>
          <BonusFieldRef field={f} roles={roles} status="未通過或未設定時不計獎" />
        </div>
      ))}
    </div>
  );
}
