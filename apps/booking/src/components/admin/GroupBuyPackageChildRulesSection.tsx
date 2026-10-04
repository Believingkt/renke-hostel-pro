import { useMemo } from "react";
import ChildAgeRulesEditor from "@/components/website-content/ChildAgeRulesEditor";
import {
  initGroupBuyChildRulesFrom,
  parseGroupBuyChildRules,
  type GroupBuyChildRules,
} from "@lakeze/shared/lib/groupBuyChildRules";

interface Props {
  /** 方案目前的 group_buy_campaign_packages.child_age_rules（null＝尚未設定） */
  value: unknown | null;
  /** COPY ONCE 初始值來源：活動層規則（過渡期）或民宿一般規則 */
  fallbackRaw: unknown;
  onChange: (rules: GroupBuyChildRules) => void;
}

/**
 * 團購「方案層」兒童分齡規則（PER PACKAGE，正式 SoT）。
 * 只寫回 group_buy_campaign_packages.child_age_rules，
 * 絕不寫回 accommodation_info.child_age_rules 或 accommodation_packages.child_age_rules_override。
 */
const GroupBuyPackageChildRulesSection = ({ value, fallbackRaw, onChange }: Props) => {
  const initialized = !!value && typeof value === "object";
  const rules: GroupBuyChildRules = useMemo(
    () => (initialized ? parseGroupBuyChildRules(value) : initGroupBuyChildRulesFrom(fallbackRaw)),
    [initialized, value, fallbackRaw],
  );

  return (
    <div className="md:col-span-2 space-y-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        此設定只套用本方案，不影響其他方案，也不會修改一般訂房頁的兒童分齡規則。
        「團購頁顯示」關閉時，前台不出現該人數選項，設定資料仍完整保留。
        {!initialized && "（尚未儲存；下方為以現行規則複製的初始值，儲存後才生效。）"}
      </p>
      <ChildAgeRulesEditor
        value={rules}
        onChange={(next) => onChange({ ...next, tier_visibility: rules.tier_visibility })}
        visibility={{
          value: rules.tier_visibility,
          onChange: (tier_visibility) => onChange({ ...rules, tier_visibility }),
        }}
        noteLabel="備註（顯示於團購頁）"
      />
    </div>
  );
};

export default GroupBuyPackageChildRulesSection;
