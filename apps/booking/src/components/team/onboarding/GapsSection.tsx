import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { GAP_DETAILS, validateGapLink } from "@lakeze/shared/lib/settingsGapDetails";
import type { GapKey } from "@lakeze/shared/lib/settingsGapLinks";
import type { VenueGap } from "@/hooks/use-venue-gaps";
import { OnbStatusBadge } from "./OnbStatusBadge";
import { merStatusLabel } from "@/lib/payuniMerchantRules";
import { payuniStatus, type OnboardingRow } from "@/lib/teamOnboarding";

/** 合作條件、費率、獎金等既有缺口（沿用設定完整性檢查）；mine＝你能寫入的那一半 */
export function GapsSection({ gaps, roles, accId, mine }: { gaps: VenueGap[]; roles: string[]; accId: string; mine: boolean }) {
  const suffix = mine ? "mine" : "others";
  return (
    <Card data-testid={`onboarding-gaps-section-${suffix}`}>
      <CardHeader>
        <CardTitle className="text-base">{mine ? "合作條件與獎金設定" : "合作條件與獎金設定（由其他人設定）"}</CardTitle>
        <CardDescription>
          {mine
            ? "沿用「設定完整性檢查」的結果，只列出你能補齊的項目；連結會帶你到可編輯的頁面。"
            : "這些缺口由其他角色負責，你可以查看狀態，不計入你的待處理。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid={`onboarding-gaps-empty-${suffix}`}>沒有缺漏項目。</p>
        ) : (
          <ul className="divide-y" data-testid={`onboarding-gaps-list-${suffix}`}>
            {gaps.map((g) => {
              const link = validateGapLink(g.key as GapKey, roles, accId);
              const writers = GAP_DETAILS[g.key as GapKey]?.writeRoles;
              return (
                <li key={g.key} className="flex flex-wrap items-start justify-between gap-2 py-2.5" data-testid={`onboarding-gap-${g.key}`}>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium">{g.label} <OnbStatusBadge status={{ level: "warn", label: g.result.label }} /></div>
                    {g.result.hint && <p className="text-xs text-muted-foreground">{g.result.hint}</p>}
                    {!mine && writers && <p className="text-xs text-muted-foreground" data-testid={`onboarding-gap-writers-${g.key}`}>由{writers}設定</p>}
                  </div>
                  {link.href && (
                    <Link to={link.href} className="shrink-0 text-sm underline" data-testid={`onboarding-gap-link-${g.key}`}>
                      {link.editable ? "前往設定" : "前往查看"}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PayuniSection({ row, isSuperAdmin }: { row: OnboardingRow; isSuperAdmin: boolean }) {
  return (
    <Card data-testid="onboarding-payuni-section">
      <CardHeader>
        <CardTitle className="text-base">金流（PAYUNi）</CardTitle>
        <CardDescription>建店、審核與切換金流僅限總部最高管理員操作，這裡只顯示狀態。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <div>目前：<OnbStatusBadge status={payuniStatus(row)} testId="onboarding-payuni-status" /></div>
        <p className="text-muted-foreground">PAYUNi 商店代號：{row.payuni_mer_id ?? "—"}（{merStatusLabel(row.payuni_mer_status)}）</p>
        {isSuperAdmin && <a href="/hq?tab=payuni" className="underline" data-testid="onboarding-hq-payuni-link">前往 PAYUNi 金流管理</a>}
      </CardContent>
    </Card>
  );
}
