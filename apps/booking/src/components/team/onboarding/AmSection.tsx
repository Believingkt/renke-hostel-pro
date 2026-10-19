import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Label } from "@lakeze/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { OnbStatusBadge } from "./OnbStatusBadge";
import { AmAccessList } from "./AmAccessList";
import { ResponsibleAmHistory } from "./ResponsibleAmHistory";
import { amStatus, venueStage, type OnboardingAmMember, type OnboardingRow } from "@/lib/teamOnboarding";

const NONE = "__none__";

interface Props {
  row: OnboardingRow;
  members: OnboardingAmMember[];
  canEdit: boolean;
  isSuperAdmin: boolean;
  onChanged: () => void;
}

export function AmSection({ row, members, canEdit, isSuperAdmin, onChanged }: Props) {
  const [pick, setPick] = useState<string>(row.responsible_member_id ?? NONE);
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const inactive = venueStage(row) === "inactive";
  const candidates = members.filter((m) => m.can_be_responsible);

  useEffect(() => setPick(row.responsible_member_id ?? NONE), [row.responsible_member_id]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setSaving(true);
    const { error } = await supabase.rpc(fn as any, args as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(ok);
    setHistoryKey((k) => k + 1);
    onChanged();
  };

  const saveResponsible = () =>
    call("team_set_responsible_am", { _accommodation_id: row.accommodation_id, _member_id: pick === NONE ? null : pick },
      pick === NONE ? "已取消負責 AM" : "已指定負責 AM");

  return (
    <Card data-testid="onboarding-am-section">
      <CardHeader>
        <CardTitle className="text-base">AM 設定</CardTitle>
        <CardDescription>指定負責 AM（一館一位）。其他 AM 與 AM 總管自動成為職代，系統會開好民宿後台權限，不需要再請總部設定。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">目前負責 AM：</span>
            <OnbStatusBadge status={amStatus(row)} testId="onboarding-current-responsible" />
          </div>
          {canEdit && !inactive && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className="w-64" data-testid="onboarding-responsible-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>（不指定負責 AM）</SelectItem>
                  {candidates.map((m) => (
                    <SelectItem key={m.member_id} value={m.member_id}>{m.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={saveResponsible} disabled={saving || pick === (row.responsible_member_id ?? NONE)} data-testid="onboarding-responsible-save-btn">
                儲存負責 AM
              </Button>
            </div>
          )}
          {canEdit && !inactive && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="am-not-required"
                checked={row.am_not_required}
                disabled={saving || !!row.responsible_member_id}
                onCheckedChange={(v) => call("team_set_am_not_required", { _accommodation_id: row.accommodation_id, _value: v === true }, "已更新")}
                data-testid="onboarding-am-not-required-checkbox"
              />
              <Label htmlFor="am-not-required" className="cursor-pointer text-sm">不需要負責 AM（總覽與小鈴鐺不再提醒）</Label>
            </div>
          )}
          {inactive && <p className="text-xs text-muted-foreground">館別已停用，系統已自動取消負責 AM；重新開賣後可再指定。</p>}
          {!canEdit && <p className="text-xs text-muted-foreground">只有 AM 總管或總部管理員可以指定負責 AM。</p>}
        </div>
        <AmAccessList row={row} members={members} isSuperAdmin={isSuperAdmin} />
        <ResponsibleAmHistory accommodationId={row.accommodation_id} refreshKey={historyKey} />
      </CardContent>
    </Card>
  );
}
