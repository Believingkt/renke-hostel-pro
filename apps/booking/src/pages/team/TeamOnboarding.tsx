import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Input } from "@lakeze/shared/components/ui/input";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Label } from "@lakeze/shared/components/ui/label";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Tabs } from "@lakeze/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useTeamOnboarding } from "@/hooks/use-team-onboarding";
import { useVenueGaps } from "@/hooks/use-venue-gaps";
import { OnbStatusBadge } from "@/components/team/onboarding/OnbStatusBadge";
import { OnboardingRoleGuide } from "@/components/team/onboarding/OnboardingRoleGuide";
import { OnbTabsList } from "@/components/team/onboarding/OnbTabsList";
import { STAGE_LABEL, canViewOnboarding, venueStage } from "@/lib/teamOnboarding";
import { ONB_TABS, OVERVIEW_COLUMNS, defaultTab, itemInTab, tabPending, visibleTabs, type OnbTabKey } from "@/lib/onboardingTabs";

export default function TeamOnboarding() {
  const { roles } = useTeam();
  const { rows, loading, error, reload } = useTeamOnboarding();
  const { gapsByAcc, reload: reloadGaps } = useVenueGaps();
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const tabs = visibleTabs(roles);
  const [tab, setTab] = useState<OnbTabKey>(() => defaultTab(roles));
  const active = tabs.includes(tab) ? tab : tabs[0];

  const gapKeys = (accId: string) => (gapsByAcc.get(accId) ?? []).map((g) => g.key);
  const counts = useMemo(
    () => Object.fromEntries(tabs.map((k) => [k, rows.filter((r) => tabPending(r, gapKeys(r.accommodation_id), k) > 0).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, gapsByAcc, roles],
  );
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((r) => ({ r, pending: tabPending(r, gapKeys(r.accommodation_id), active) }))
      .filter(({ r, pending }) => (!s || r.accommodation_name.toLowerCase().includes(s)) && (!pendingOnly || pending > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, gapsByAcc, search, pendingOnly, active]);

  if (!canViewOnboarding(roles)) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="onboarding-no-access">你沒有檢視館別設定總覽的權限。</p>;
  }
  const columns = OVERVIEW_COLUMNS.filter((c) => itemInTab(active, c.item));

  return (
    <div className="space-y-4" data-testid="onboarding-overview-page">
      <OnboardingRoleGuide />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">館別設定總覽</CardTitle>
            <CardDescription>依角色分 Tab：每個 Tab 只列出該角色要設定的項目，Tab 上的數字是還有缺的館別數。</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { reload(); reloadGaps(); }} disabled={loading} data-testid="onboarding-reload-btn">
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={active} onValueChange={(v) => setTab(v as OnbTabKey)}>
            <OnbTabsList tabs={tabs} counts={counts} prefix="onboarding" unit=" 館" />
          </Tabs>
          <p className="text-sm text-muted-foreground" data-testid="onboarding-tab-hint">{ONB_TABS[active].hint}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Input placeholder="搜尋館別" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" data-testid="onboarding-search-input" />
            <div className="flex items-center gap-2">
              <Switch id="onb-pending" checked={pendingOnly} onCheckedChange={setPendingOnly} data-testid="onboarding-pending-only-switch" />
              <Label htmlFor="onb-pending" className="cursor-pointer text-sm">只看這個 Tab 還有缺的</Label>
            </div>
          </div>
          {error && <p className="text-sm text-destructive" data-testid="onboarding-error">{error}</p>}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>館別</TableHead>
                  {columns.map((c) => <TableHead key={c.item}>{c.label}</TableHead>)}
                  <TableHead className="text-right" title="含合作條件、費率與獎金等缺口，明細請進入館別">還缺</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(({ r, pending }) => {
                  const stage = venueStage(r);
                  const id = r.accommodation_id;
                  const href = `/team/onboarding/${id}?tab=${active}`;
                  return (
                    <TableRow key={id} className={stage === "inactive" ? "opacity-60" : ""} data-testid={`onboarding-row-${id}`}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <Link to={href} className="hover:underline" data-testid={`onboarding-venue-link-${id}`}>{r.accommodation_name}</Link>
                        <Badge variant="outline" className="ml-2 font-normal">{STAGE_LABEL[stage]}</Badge>
                      </TableCell>
                      {columns.map((c) => (
                        <TableCell key={c.item}><OnbStatusBadge status={c.status(r)} testId={`onboarding-${c.testId}-${id}`} /></TableCell>
                      ))}
                      <TableCell className="text-right" data-testid={`onboarding-pending-${id}`}>
                        {pending > 0 ? <span className="font-semibold text-amber-700">{pending} 項</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="w-8">
                        <Link to={href} aria-label="進入設定"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && list.length === 0 && (
                  <TableRow><TableCell colSpan={columns.length + 3} className="py-8 text-center text-sm text-muted-foreground">沒有符合的館別</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
