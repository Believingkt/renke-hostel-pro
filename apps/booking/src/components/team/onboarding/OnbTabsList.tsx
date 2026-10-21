import { TabsList, TabsTrigger } from "@lakeze/shared/components/ui/tabs";
import { ONB_TABS, type OnbTabKey } from "@/lib/onboardingTabs";

/** 依角色分的 Tab 列；count＝該 Tab 還缺的數量 */
export function OnbTabsList({ tabs, counts, prefix, unit }: { tabs: OnbTabKey[]; counts: Record<string, number>; prefix: string; unit: string }) {
  return (
    <TabsList className="h-auto flex-wrap justify-start">
      {tabs.map((k) => (
        <TabsTrigger key={k} value={k} className="gap-1.5" data-testid={`${prefix}-tab-${k}`}>
          {ONB_TABS[k].label}
          {counts[k] > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800" data-testid={`${prefix}-tab-count-${k}`}>
              {counts[k]}{unit}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
