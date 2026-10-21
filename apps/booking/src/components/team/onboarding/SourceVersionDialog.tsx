import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Label } from "@lakeze/shared/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { getOrderSourceConfig } from "@lakeze/shared/utils/orderHelpers";
import { effectiveExplain, sourceDiff } from "@/lib/venueSourceVersions";

const label = (s: string) => getOrderSourceConfig(s).label;

type Props = {
  mode: "custom" | "global";
  title: string;
  months: string[];
  takenMonths: string[];
  options: string[];
  initial: string[];
  globalSources: string[];
  onClose: () => void;
  onSubmit: (month: string, sources: string[] | null) => Promise<boolean>;
};

/** 新增生效版本（本館自訂）或改回沿用全站：先填寫 → 再確認 → 儲存 */
export function SourceVersionDialog({ mode, title, months, takenMonths, options, initial, globalSources, onClose, onSubmit }: Props) {
  const [month, setMonth] = useState(months[0]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [saving, setSaving] = useState(false);
  const diff = sourceDiff(selected, globalSources);
  const sameAsGlobal = mode === "custom" && diff.added.length === 0 && diff.removed.length === 0;

  const submit = async () => {
    setSaving(true);
    const ok = await onSubmit(month, mode === "custom" ? selected : null);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden" data-testid="source-version-dialog">
        <DialogHeader>
          <DialogTitle>{mode === "custom" ? "新增本館自訂版本" : "改回沿用全站設定"}：{title}</DialogTitle>
          <DialogDescription>{step === "edit" ? "第 1 步／共 2 步：選擇生效月份" + (mode === "custom" ? "與採計來源" : "") : "第 2 步／共 2 步：確認內容"}</DialogDescription>
        </DialogHeader>
        {step === "edit" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>生效日（只能選本月或之後的 1 日）</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger data-testid="source-version-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={m} value={m} data-testid={`source-version-month-${m}`}>
                      {m}{i === 0 ? "（本月）" : ""}{takenMonths.includes(m) ? "（已有版本，將覆蓋）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-primary" data-testid="source-version-explain">{effectiveExplain(month)}</p>
            </div>
            {mode === "custom" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>勾選本館要採計的訂單來源</Label>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelected(globalSources)} data-testid="source-version-copy-global">從全站清單帶入</Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {options.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selected.includes(s)} data-testid={`source-version-opt-${s}`}
                        onCheckedChange={(c) => setSelected((p) => (c ? [...new Set([...p, s])] : p.filter((x) => x !== s)))} />
                      <span>{label(s)}{globalSources.includes(s) ? "" : <span className="text-muted-foreground">（全站未含）</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm">從生效月份起，本館改用全站清單：{globalSources.map(label).join("、") || "（全站未設定）"}</p>
            )}
          </div>
        ) : (
          <ConfirmSummary mode={mode} month={month} selected={selected} diff={diff} taken={takenMonths.includes(month)} sameAsGlobal={sameAsGlobal} />
        )}
        <DialogFooter className="gap-2">
          {step === "edit" ? (
            <>
              <Button variant="outline" onClick={onClose} data-testid="source-version-cancel">取消</Button>
              <Button onClick={() => setStep("confirm")} data-testid="source-version-next">下一步：確認</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("edit")} data-testid="source-version-back">回上一步</Button>
              <Button onClick={submit} disabled={saving} data-testid="source-version-submit">{saving ? "儲存中…" : "確定儲存"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmSummary({ mode, month, selected, diff, taken, sameAsGlobal }: {
  mode: "custom" | "global"; month: string; selected: string[]; diff: { added: string[]; removed: string[] }; taken: boolean; sameAsGlobal: boolean;
}) {
  return (
    <div className="space-y-2 text-sm" data-testid="source-version-confirm">
      <p>生效日：<strong>{month}</strong></p>
      <p className="text-primary">{effectiveExplain(month)}；之前的月份不受影響。</p>
      {mode === "custom" ? (
        <>
          <p>採計來源（{selected.length}）：{selected.map(label).join("、") || "（無）"}</p>
          {diff.added.length > 0 && <p>比全站多：{diff.added.map(label).join("、")}</p>}
          {diff.removed.length > 0 && <p>比全站少：{diff.removed.map(label).join("、")}</p>}
          {selected.length === 0 && <p className="text-destructive" data-testid="source-version-warn-empty">沒有勾選任何來源：本館這條獎金的營收會變成 0。</p>}
          {sameAsGlobal && <p className="text-amber-700" data-testid="source-version-warn-same">內容和全站相同；若之後全站調整，本館不會跟著變。想跟著全站請改用「改回沿用全站」。</p>}
        </>
      ) : (
        <p>從這個月份起，本館改回沿用全站清單（之後全站調整會自動跟著變）。</p>
      )}
      {taken && <p className="text-amber-700" data-testid="source-version-warn-overwrite">這個月份已經有一個版本，儲存後會覆蓋它。</p>}
    </div>
  );
}
