import { Badge } from "@lakeze/shared/components/ui/badge";
import { venueStage, type OnboardingAmMember, type OnboardingRow } from "@/lib/teamOnboarding";

interface Props {
  row: OnboardingRow;
  members: OnboardingAmMember[];
  isSuperAdmin: boolean;
}

/** 職代 AM 的權限同步狀態＋其他在 HQ 設定的民宿管理員 */
export function AmAccessList({ row, members, isSuperAdmin }: Props) {
  const missing = new Set(row.am_missing_names ?? []);
  const inactive = venueStage(row) === "inactive";
  const others = row.other_hotel_admin_names ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">AM 協作（民宿後台權限）</p>
        <div className="flex flex-wrap gap-1.5" data-testid="onboarding-am-access-list">
          {members.map((m) => {
            const isResp = m.member_id === row.responsible_member_id;
            const ok = !missing.has(m.display_name);
            return (
              <Badge key={m.member_id} variant="outline" className={`font-normal ${ok ? "border-emerald-200" : "border-amber-300 text-amber-700"}`}>
                {m.display_name}
                <span className="ml-1 text-xs text-muted-foreground">
                  {isResp ? "負責" : m.is_am_manager ? "AM 總管" : "職代"}
                  {inactive ? "" : ok ? "・已開" : "・未開"}
                </span>
              </Badge>
            );
          })}
          {members.length === 0 && <span className="text-xs text-muted-foreground">目前沒有 AM</span>}
        </div>
        {inactive && <p className="text-xs text-muted-foreground">停用館別不會自動開權限，既有權限不會被收回。</p>}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">其他有民宿後台權限的人（HQ 設定）</p>
        <p className="text-xs text-muted-foreground" data-testid="onboarding-other-hotel-admins">
          {others.length > 0 ? others.join("、") : "—"}
          {row.other_hotel_admin_unnamed > 0 && `；另有 ${row.other_hotel_admin_unnamed} 個非團隊帳號（如業主、現場人員）`}
        </p>
        <p className="text-xs text-muted-foreground">
          由總部在帳號管理維護，系統不會更動；有權限查看，但不計 AM 獎金。
          {isSuperAdmin && <a href="/hq?tab=users" className="ml-1 underline" data-testid="onboarding-hq-users-link">前往帳號管理</a>}
        </p>
      </div>
    </div>
  );
}
