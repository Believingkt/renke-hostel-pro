import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { toast } from "sonner";
import { taipeiToday, wizardApi, type SeasonArgs, type SeasonPlan } from "@/lib/onboarding/wizardApi";
import type { WizardPackage } from "@/hooks/use-wizard-data";
import { WizardField } from "./WizardField";

/** 季節價：先預覽新增／覆蓋筆數，覆蓋既有價格前跳確認框 */
export function SeasonStep({ packages, locked }: { packages: WizardPackage[]; locked: boolean }) {
  const [form, setForm] = useState({ packageId: packages[0]?.id ?? "", start: taipeiToday(), end: taipeiToday(), sale: "", original: "" });
  const [plan, setPlan] = useState<SeasonPlan | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const args = (): SeasonArgs => ({ packageId: form.packageId, start: form.start, end: form.end, sale: Number(form.sale), original: Number(form.original) });
  const set = (k: keyof typeof form, v: string) => { setForm((f) => ({ ...f, [k]: v })); setPlan(null); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const preview = () => run(async () => {
    const a = args();
    if (!(a.sale > 0 && a.original > 0)) throw new Error("售價與原價都必須大於 0");
    if (a.original < a.sale) throw new Error("原價不得低於售價");
    setPlan(await wizardApi.previewSeason(a));
  });
  const apply = () => run(async () => {
    const r = await wizardApi.applySeason(args());
    toast.success(`已寫入：新增 ${r.insert_count} 筆、覆蓋 ${r.overwrite_count} 筆`);
    setPlan(null);
    setConfirmOpen(false);
  });

  if (packages.length === 0) return <p className="text-sm text-muted-foreground">請先建立方案。</p>;
  return (
    <div className="space-y-4" data-testid="season-step">
      <div className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
        <p className="font-medium">選填：特定期間要用不同價格時才需要填（例如暑假、春節連假）。</p>
        <p className="text-muted-foreground">期間內每一晚改用這裡的售價／原價，取代方案的三日型價格；沒有特別期間可以直接跳過。</p>
      </div>
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <WizardField label="方案" hint="要套用季節價的方案。">
          <Select value={form.packageId} onValueChange={(v) => set("packageId", v)} disabled={locked}>
            <SelectTrigger data-testid="season-package"><SelectValue /></SelectTrigger>
            <SelectContent>{packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </WizardField>
        <div className="hidden md:block" />
        {([
          ["start", "開始日", "第一晚入住的日期（含）。"],
          ["end", "結束日", "最後一晚入住的日期（含）。"],
          ["sale", "售價（實收）", "期間內每晚旅客實際付款金額。"],
          ["original", "原價（劃線）", "期間內每晚顯示的劃線價，不得低於售價。"],
        ] as const).map(([k, label, hint]) => (
          <WizardField key={k} label={label} htmlFor={`season-${k}`} hint={hint}>
            <Input id={`season-${k}`} type={k === "start" || k === "end" ? "date" : "number"} min={k === "sale" || k === "original" ? 1 : undefined}
              value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={locked} placeholder={k === "sale" ? "例：12000" : k === "original" ? "例：13000" : undefined} data-testid={`season-${k}`} />
          </WizardField>
        ))}
      </div>
      {!locked && <Button variant="outline" onClick={preview} disabled={busy} data-testid="season-preview-btn">預覽</Button>}
      {plan && (
        <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="season-preview-result">
          <p>將新增 <b>{plan.insert_count}</b> 筆、覆蓋 <b>{plan.overwrite_count}</b> 筆。</p>
          {plan.overwrites.length > 0 && (
            <ul className="max-h-40 overflow-y-auto text-muted-foreground">
              {plan.overwrites.map((o) => <li key={o.date}>{o.date}：原本售價 {o.old_sale ?? "—"}／原價 {o.old_original ?? "—"}</li>)}
            </ul>
          )}
          <Button onClick={() => (plan.overwrite_count > 0 ? setConfirmOpen(true) : apply())} disabled={busy} data-testid="season-apply-btn">套用</Button>
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定覆蓋既有價格？</AlertDialogTitle>
            <AlertDialogDescription>有 {plan?.overwrite_count} 天已經設定過價格，套用後會改成新的售價與原價。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={apply} disabled={busy} data-testid="season-overwrite-confirm">確定覆蓋</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
