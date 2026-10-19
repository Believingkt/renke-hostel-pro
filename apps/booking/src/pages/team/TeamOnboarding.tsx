import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Input } from "@lakeze/shared/components/ui/input";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Label } from "@lakeze/shared/components/ui/label";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useTeamOnboarding } from "@/hooks/use-team-onboarding";
import { useVenueGaps } from "@/hooks/use-venue-gaps";
import { OnbStatusBadge } from "@/components/team/onboarding/OnbStatusBadge";
import { OnboardingRoleGuide } from "@/components/team/onboarding/OnboardingRoleGuide";
import {
  STAGE_LABEL,
  accessStatus,
  amStatus,
  canViewOnboarding,
  kolStatus,
  payuniStatus,
  pendingCount,
  quotaStatus,
  venueStage,
} from "@/lib/teamOnboarding";

export default function TeamOnboarding() {
  const { roles } = useTeam();
  const { rows, loading, error, reload } = useTeamOnboarding();
  const { gapsByAcc, reload: reloadGaps } = useVenueGaps();
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((r) => ({ r, pending: pendingCount(r, gapsByAcc.get(r.accommodation_id)?.length ?? 0) }))
      .filter(({ r, pending }) => (!s || r.accommodation_name.toLowerCase().includes(s)) && (!pendingOnly || pending > 0));
  }, [rows, gapsByAcc, search, pendingOnly]);

  if (!canViewOnboarding(roles)) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="onboarding-no-access">你沒有檢視館別設定總覽的權限。</p>;
  }

  return (
    <div className="space-y-4" data-testid="onboarding-overview-page">
      <OnboardingRoleGuide />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">館別設定總覽</CardTitle>
            <CardDescription>一館一列，集中檢查新館需要的設定。點館別進入後可直接設定（依你的角色決定能否編輯）。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { reload(); reloadGaps(); }} disabled={loading} data-testid="onboarding-reload-btn">
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Input placeholder="搜尋館別" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" data-testid="onboarding-search-input" />
            <div className="flex items-center gap-2">
              <Switch id="onb-pending" checked={pendingOnly} onCheckedChange={setPendingOnly} data-testid="onboarding-pending-only-switch" />
              <Label htmlFor="onb-pending" className="cursor-pointer text-sm">只看待處理</Label>
            </div>
          </div>
          {error && <p className="text-sm text-destructive" data-testid="onboarding-error">{error}</p>}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>館別</TableHead>
                  <TableHead>負責 AM</TableHead>
                  <TableHead>AM 協作權限</TableHead>
                  <TableHead>KOL 場域</TableHead>
                  <TableHead>互惠額度</TableHead>
                  <TableHead>金流</TableHead>
                  <TableHead className="text-right">待處理</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(({ r, pending }) => {
                  const stage = venueStage(r);
                  const id = r.accommodation_id;
                  return (
                    <TableRow key={id} className={stage === "inactive" ? "opacity-60" : ""} data-testid={`onboarding-row-${id}`}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link to={`/team/onboarding/${id}`} className="hover:underline" data-testid={`onboarding-venue-link-${id}`}>{r.accommodation_name}</Link>
                        <Badge variant="outline" className="ml-2 font-normal">{STAGE_LABEL[stage]}</Badge>
                      </TableCell>
                      <TableCell><OnbStatusBadge status={amStatus(r)} testId={`onboarding-am-${id}`} /></TableCell>
                      <TableCell><OnbStatusBadge status={accessStatus(r)} testId={`onboarding-access-${id}`} /></TableCell>
                      <TableCell><OnbStatusBadge status={kolStatus(r)} testId={`onboarding-kol-${id}`} /></TableCell>
                      <TableCell><OnbStatusBadge status={quotaStatus(r)} testId={`onboarding-quota-${id}`} /></TableCell>
                      <TableCell><OnbStatusBadge status={payuniStatus(r)} testId={`onboarding-payuni-${id}`} /></TableCell>
                      <TableCell className="text-right" data-testid={`onboarding-pending-${id}`}>
                        {pending > 0 ? <span className="font-semibold text-amber-700">{pending} 項</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="w-8">
                        <Link to={`/team/onboarding/${id}`} aria-label="進入設定"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && list.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">沒有符合的館別</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
