import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { useVenueBonusFlags } from "@/hooks/use-venue-bonus-flags";
import { HelpDialogButton } from "./HelpDialogButton";
import { VenueExcludeSetting } from "./VenueExcludeSetting";
import { VenueMergeGroupSetting, draftOfGroup, groupOfDraft, type GroupDraft } from "./VenueMergeGroupSetting";

const EMPTY: GroupDraft = { mode: "none", existing: "", newName: "" };

/** 特殊館別兩設定：不列入抽成類獎金、固定額合併群組（無版本，儲存後下次試算即套用） */
export function VenueFlagsBlock({ accId, accName, canEdit }: { accId: string; accName: string; canEdit: boolean }) {
  const f = useVenueBonusFlags(accId);
  const [exclude, setExclude] = useState(false);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(EMPTY);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setExclude(f.exclude); setGroupDraft(draftOfGroup(f.group, f.groups)); };
  useEffect(reset, [f.exclude, f.group, f.groups]);

  const group = groupOfDraft(groupDraft);
  const incomplete = groupDraft.mode !== "none" && !group;
  const dirty = exclude !== f.exclude || group !== f.group;

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from("teamcommission_venue_bonus_flags").upsert(
      { accommodation_id: accId, exclude_from_commission: exclude, fixed_merge_group: group || null, updated_at: new Date().toISOString() },
      { onConflict: "accommodation_id" },
    );
    setSaving(false);
    setConfirm(false);
    if (error) return toast.error(`儲存失敗：${error.message}`);
    toast.success("已儲存特殊館別設定");
    void f.reload();
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="bonus-flags-block">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">特殊館別設定（例如旅行日系列）</span>
          <FlagsHelp />
        </div>
        <p className="text-xs text-muted-foreground">大部分館別兩項都維持預設：①列入、②不合併。</p>
      </div>
      <VenueExcludeSetting value={exclude} onChange={setExclude} canEdit={canEdit} rates={f.rates} />
      <VenueMergeGroupSetting accId={accId} accName={accName} draft={groupDraft} onChange={setGroupDraft} canEdit={canEdit} groups={f.groups} rates={f.rates} />
      {canEdit && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || incomplete || saving} onClick={() => setConfirm(true)} data-testid="bonus-flags-save-btn">儲存特殊館別設定</Button>
          {dirty && <Button size="sm" variant="ghost" onClick={reset} data-testid="bonus-flags-reset-btn">取消變更</Button>}
          {incomplete && <span className="text-xs text-amber-700" data-testid="bonus-flags-incomplete">請選擇或輸入群組名稱</span>}
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent data-testid="bonus-flags-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確認儲存「{accName}」的特殊館別設定？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>① 抽成類獎金：{f.exclude ? "不列入" : "列入"} → <strong>{exclude ? "不列入" : "列入"}</strong></p>
                <p>② 固定金額合併：{f.group || "不合併"} → <strong>{group || "不合併"}</strong></p>
                <p className="text-amber-700">這兩個設定沒有生效版本，儲存後「下一次試算／結算」就會套用，包含還沒結算的月份。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="bonus-flags-confirm-cancel">再想想</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void save(); }} disabled={saving} data-testid="bonus-flags-confirm-ok">確定儲存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FlagsHelp() {
  return (
    <HelpDialogButton title="特殊館別設定說明" testId="bonus-flags">
      <p>這兩個設定是給「不由團隊經營營收、但仍要發部分固定獎金」的館別用的，最典型的是旅行日系列。一般館別不用動。</p>
      <p><strong>① 不列入抽成類獎金</strong>：打開後，這間館的營收不算進 AM 績效、AM 總管、成交組績效、成交大師管理、網紅營銷專利（抽成）獎金，場域成交獎金也不發。</p>
      <p><strong>② 固定額合併群組</strong>：同一個群組的多間館，在 AM 場域獎金和網紅月費裡合計只算 1 館；KOL 用同一支折扣碼合作同群組的館別，視為同一份合約。</p>
      <p className="font-medium">旅行日系列的設定方式</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>① 打開「不列入」。</li>
        <li>② 選「加入現有群組」→「旅行日系列」；如果是第一間，就選「建立新群組」並輸入「旅行日系列」。</li>
        <li>按「儲存特殊館別設定」，確認視窗會列出修改前後的差異，確認後按「確定儲存」。</li>
      </ol>
      <p className="text-amber-700">注意：這兩個設定沒有版本，儲存後下一次試算或結算就會套用。</p>
    </HelpDialogButton>
  );
}
