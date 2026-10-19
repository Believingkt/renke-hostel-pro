import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { validateGapLink } from "@lakeze/shared/lib/settingsGapDetails";
import type { GapKey } from "@lakeze/shared/lib/settingsGapLinks";
import type { VenueGap } from "@/hooks/use-venue-gaps";
import { OnbStatusBadge } from "./OnbStatusBadge";
import { merStatusLabel } from "@/lib/payuniMerchantRules";
import { payuniStatus, type OnboardingRow } from "@/lib/teamOnboarding";

/** 合作條件、費率、獎金等既有缺口（沿用設定完整性檢查） */
export function GapsSection({ gaps, roles, accId }: { gaps: VenueGap[]; roles: string[]; accId: string }) {
  return (
    <Card data-testid="onboarding-gaps-section">
      <CardHeader>
        <CardTitle className="text-base">合作條件與獎金設定</CardTitle>
        <CardDescription>沿用「設定完整性檢查」的結果，只列出需要補齊的項目；連結會帶你到你能編輯的頁面。</CardDescription>
      </CardHeader>
      <CardContent>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="onboarding-gaps-empty">沒有缺漏項目。</p>
        ) : (
          <ul className="divide-y" data-testid="onboarding-gaps-list">
            {gaps.map((g) => {
              const link = validateGapLink(g.key as GapKey, roles, accId);
              return (
                <li key={g.key} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium">{g.label} <OnbStatusBadge status={{ level: "warn", label: g.result.label }} /></div>
                    {g.result.hint && <p className="text-xs text-muted-foreground">{g.result.hint}</p>}
                    {!link.editable && link.reason && <p className="text-xs text-amber-700">{link.reason}</p>}
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
