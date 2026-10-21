import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { HelpDialogButton } from "./HelpDialogButton";

type Flags = { exclude: boolean; group: string };

/** 旅行日兩設定：不列入抽成類獎金、固定額合併群組（無版本，儲存後下次試算即套用） */
export function VenueFlagsBlock({ accId, canEdit }: { accId: string; canEdit: boolean }) {
  const [saved, setSaved] = useState<Flags>({ exclude: false, group: "" });
  const [draft, setDraft] = useState<Flags>({ exclude: false, group: "" });
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await (supabase as any).from("teamcommission_venue_bonus_flags")
      .select("exclude_from_commission, fixed_merge_group").eq("accommodation_id", accId);
    const f = (data ?? [])[0];
    const v = { exclude: !!f?.exclude_from_commission, group: f?.fixed_merge_group ?? "" };
    setSaved(v);
    setDraft(v);
  }, [accId]);
  useEffect(() => { void load(); }, [load]);

  const dirty = draft.exclude !== saved.exclude || draft.group.trim() !== saved.group;
  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from("teamcommission_venue_bonus_flags").upsert(
      { accommodation_id: accId, exclude_from_commission: draft.exclude, fixed_merge_group: draft.group.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "accommodation_id" },
    );
    setSaving(false);
    setConfirm(false);
    if (error) return toast.error(`儲存失敗：${error.message}`);
    toast.success("已儲存旅行日相關設定");
    void load();
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="bonus-flags-block">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">特殊館別設定（例如旅行日系列）</span>
        <FlagsHelp />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="bonus-exclude" className="text-sm">不列入抽成類獎金</Label>
        <Switch id="bonus-exclude" checked={draft.exclude} disabled={!canEdit} data-testid="bonus-exclude-switch"
          onCheckedChange={(v) => setDraft((d) => ({ ...d, exclude: v }))} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bonus-group" className="text-sm">固定額合併群組</Label>
        <Input id="bonus-group" value={draft.group} maxLength={40} disabled={!canEdit} data-testid="bonus-group-input"
          placeholder="例如：旅行日系列（留空＝不合併）" onChange={(e) => setDraft((d) => ({ ...d, group: e.target.value }))} />
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={() => setConfirm(true)} data-testid="bonus-flags-save-btn">儲存這兩個設定</Button>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(saved)} data-testid="bonus-flags-reset-btn">取消變更</Button>}
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent data-testid="bonus-flags-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確認儲存特殊館別設定？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>不列入抽成類獎金：{saved.exclude ? "是" : "否"} → <strong>{draft.exclude ? "是" : "否"}</strong></p>
                <p>固定額合併群組：{saved.group || "（不合併）"} → <strong>{draft.group.trim() || "（不合併）"}</strong></p>
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
      <p><strong>不列入抽成類獎金</strong>：打開後，這間館的營收不計入 AM 績效、AM 總管、成交組、成交大師、網紅專利與場域成交獎金。固定金額類獎金不受影響。</p>
      <p><strong>固定額合併群組</strong>：填一樣名稱的多間館，固定金額獎金只算一館；KOL 邀約時也視為同一份合約。留空＝不合併。</p>
      <p className="font-medium">操作步驟</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>切換開關或填寫群組名稱。</li>
        <li>按「儲存這兩個設定」，確認視窗會列出修改前後的差異。</li>
        <li>確認無誤後按「確定儲存」。</li>
      </ol>
      <p className="text-amber-700">注意：這兩個設定沒有版本，儲存後下一次試算或結算就會套用。</p>
    </HelpDialogButton>
  );
}
