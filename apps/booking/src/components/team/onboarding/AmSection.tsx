import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { OnbStatusBadge } from "./OnbStatusBadge";
import { AmAccessList } from "./AmAccessList";
import { ResponsibleAmHistory } from "./ResponsibleAmHistory";
import {
  AM_PICK_NOT_REQUIRED as NOT_REQUIRED, AM_PICK_PENDING as PENDING, amSaveSteps, amStatus, currentAmPick as currentPick, venueStage,
  type OnboardingAmMember, type OnboardingRow,
} from "@/lib/teamOnboarding";


interface Props {
  row: OnboardingRow;
  members: OnboardingAmMember[];
  canEdit: boolean;
  isSuperAdmin: boolean;
  onChanged: () => void;
}

export function AmSection({ row, members, canEdit, isSuperAdmin, onChanged }: Props) {
  const [pick, setPick] = useState<string>(currentPick(row));
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const inactive = venueStage(row) === "inactive";
  const candidates = members.filter((m) => m.can_be_responsible);

  const saved = currentPick(row);
  useEffect(() => setPick(saved), [saved]);

  const save = async () => {
    const steps = amSaveSteps(row, pick);
    setSaving(true);
    for (const [fn, args] of steps) {
      const { error } = await supabase.rpc(fn as any, args as any);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        onChanged();
        return;
      }
    }
    setSaving(false);
    toast.success(pick === PENDING ? "已改為尚未指定" : pick === NOT_REQUIRED ? "已設為不需要負責 AM" : "已指定負責 AM");
    setHistoryKey((k) => k + 1);
    onChanged();
  };

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
                <SelectTrigger className="w-80" data-testid="onboarding-responsible-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={PENDING}>尚未指定（總覽與小鈴鐺會提醒）</SelectItem>
                  <SelectItem value={NOT_REQUIRED}>不需要負責 AM（不提醒）</SelectItem>
                  {candidates.map((m) => (
                    <SelectItem key={m.member_id} value={m.member_id}>{m.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={save} disabled={saving || pick === saved} data-testid="onboarding-responsible-save-btn">
                儲存負責 AM
              </Button>
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
