import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { VenueClosingCard } from "@lakeze/shared/components/team/BonusSettingsTab";
import CommissionRatesTab from "@/components/team/CommissionRatesTab";
import VenueBonusTierRulesTab from "@/components/team/VenueBonusTierRulesTab";

function Part({ no, title, hint, testId, children }: { no: string; title: string; hint: string; testId: string; children: ReactNode }) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <div>
        <h3 className="text-sm font-semibold">{no} {title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** 從 HQ「獎金發放規則」「館別獎金級距規則」與訂單「民宿分潤比例」搬來的單館設定；寫入權限維持總部 */
export function BonusRulesSection({ accId, roles }: { accId: string; roles: string[] }) {
  const isSuper = roles.includes("super_admin");
  const isHq = isSuper || roles.includes("admin");
  return (
    <Card data-testid="onboarding-bonus-rules-section">
      <CardHeader>
        <CardTitle className="text-base">獎金發放規則（本館）</CardTitle>
        <CardDescription>
          原本分散在 HQ「獎金發放規則」「館別獎金級距規則」與訂單「民宿分潤比例」的本館設定，集中在這裡。
          {!isHq && <span className="font-medium text-foreground" data-testid="onboarding-bonus-rules-readonly"> 目前只有管理員層級可以修改，你可以查看。</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Part no="①" title="場域簽約人與合作期間" hint="合作期間決定這段期間的訂單要不要進獎金，並可分別開關「採計團隊獎金」「採計成交大師獎金」；場域簽約人是場域成交獎金的發放對象。" testId="onboarding-bonus-rules-closing">
          <VenueClosingCard accId={accId} readOnly={!isHq} />
        </Part>
        <Part no="②" title="成交費率" hint="成交組分潤（成交大師獎金）的本館費率，以版本記錄，只能新增不能改舊版。" testId="onboarding-bonus-rules-closer-rate">
          <CommissionRatesTab lockedAccId={accId} readOnly={!isHq} />
        </Part>
        <Part no="③" title="館別獎金級距規則" hint="本館營收落在哪一階就整筆套用該階費率；沒設定就沿用全站費率。只有 super_admin 可以修改。" testId="onboarding-bonus-rules-tiers">
          <VenueBonusTierRulesTab lockedAccId={accId} readOnly={!isSuper} />
        </Part>
      </CardContent>
    </Card>
  );
}
