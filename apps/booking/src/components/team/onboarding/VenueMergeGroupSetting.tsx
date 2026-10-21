import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@lakeze/shared/components/ui/radio-group";
import { fmtMoney, type MergeGroups, type Rates } from "@/hooks/use-venue-bonus-flags";

export type GroupDraft = { mode: "none" | "existing" | "new"; existing: string; newName: string };

export const groupOfDraft = (d: GroupDraft) => (d.mode === "existing" ? d.existing : d.mode === "new" ? d.newName.trim() : "");
export const draftOfGroup = (group: string, groups: MergeGroups): GroupDraft =>
  group ? { mode: groups.has(group) ? "existing" : "new", existing: group, newName: groups.has(group) ? "" : group } : { mode: "none", existing: "", newName: "" };

/** 「固定額合併群組」：三選一＋現有群組成員＋結果預覽 */
export function VenueMergeGroupSetting({ accId, accName, draft, onChange, canEdit, groups, rates }: {
  accId: string; accName: string; draft: GroupDraft; onChange: (d: GroupDraft) => void; canEdit: boolean; groups: MergeGroups; rates: Rates;
}) {
  const group = groupOfDraft(draft);
  const others = (groups.get(group) ?? []).filter((v) => v.id !== accId);
  const count = others.length + 1;
  const amFixed = rates.am_venue_bonus?.fixed_amount ?? null;
  const kolFixed = rates.kol_monthly?.fixed_amount ?? null;
  return (
    <div className="space-y-3 rounded-md border bg-background p-3" data-testid="bonus-group-setting">
      <div className="space-y-1">
        <Label className="text-sm font-medium">② 每館固定金額的獎金，這間館要不要和其他館「合併算一館」？</Label>
        <p className="text-xs text-muted-foreground">
          影響 AM 場域獎金（目前每館 {fmtMoney(amFixed)}）與網紅營銷專利月費（目前每館 {fmtMoney(kolFixed)}）。同一個群組的館別合計只算 1 館；
          KOL 邀約時，同一位 KOL 用同一支折扣碼合作同群組的館別，也視為同一份合約，只算 1 個資格。
        </p>
      </div>
      <RadioGroup value={draft.mode} disabled={!canEdit} onValueChange={(m) => onChange({ ...draft, mode: m as GroupDraft["mode"] })} className="gap-2">
        <ModeOption value="none" label="不合併（一般）" hint="這間館自己算 1 館" />
        <ModeOption value="existing" label="加入現有群組" hint={groups.size ? "從下方選一個群組" : "目前還沒有任何群組"} disabled={!groups.size} />
        {draft.mode === "existing" && (
          <div className="ml-6 grid gap-2 sm:grid-cols-2" data-testid="bonus-group-existing-list">
            {[...groups].map(([name, members]) => (
              <button key={name} type="button" disabled={!canEdit} onClick={() => onChange({ ...draft, existing: name })}
                data-testid={`bonus-group-existing-${name}`}
                className={`rounded border p-2 text-left text-xs transition-colors ${draft.existing === name ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                <p className="font-medium">{name}（{members.length} 館）</p>
                <p className="text-muted-foreground">{members.map((m) => m.name).join("、")}</p>
              </button>
            ))}
          </div>
        )}
        <ModeOption value="new" label="建立新群組" hint="之後其他館可以選擇加入" />
        {draft.mode === "new" && (
          <div className="ml-6 space-y-1">
            <Input value={draft.newName} maxLength={40} disabled={!canEdit} data-testid="bonus-group-new-input"
              placeholder="輸入群組名稱，例如：旅行日系列" onChange={(e) => onChange({ ...draft, newName: e.target.value })} />
            {groups.has(draft.newName.trim()) && (
              <p className="text-xs text-amber-700" data-testid="bonus-group-new-dup">這個名稱已經有群組了，儲存後會直接加入「{draft.newName.trim()}」。</p>
            )}
          </div>
        )}
      </RadioGroup>
      <p className="rounded border border-dashed p-2 text-xs" data-testid="bonus-group-preview">
        <span className="font-medium">儲存後的結果：</span>
        {!group ? `「${accName}」自己算 1 館：負責的 AM 會因這間館拿到 1 份 AM 場域獎金（${fmtMoney(amFixed)}）。`
          : `「${accName}」${others.length ? `和 ${others.map((o) => o.name).join("、")}` : ""}合計算 1 館（群組「${group}」，共 ${count} 館）。例如同一位 AM 負責這 ${count} 館，AM 場域獎金只發 1 份 ${fmtMoney(amFixed)}${amFixed != null && count > 1 ? `，不合併的話是 ${count} 份 ${fmtMoney(amFixed * count)}` : ""}；網紅月費同理。`}
      </p>
    </div>
  );
}

function ModeOption({ value, label, hint, disabled }: { value: string; label: string; hint: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={`bonus-group-mode-${value}`} disabled={disabled} data-testid={`bonus-group-mode-${value}`} />
      <Label htmlFor={`bonus-group-mode-${value}`} className="text-sm">{label}</Label>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}
