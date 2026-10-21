import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Label } from "@lakeze/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";

/** 已產生獎金快照、且 >= fromMonth（YYYY-MM-01）的資料月 */
export async function snapshotMonthsFrom(fromMonth: string): Promise<string[]> {
  const { data } = await (supabase as any)
    .from("teamcommission_bonus_snapshots")
    .select("snapshot_month")
    .gte("snapshot_month", fromMonth.slice(0, 7));
  return Array.from(new Set(((data ?? []) as Array<{ snapshot_month: string }>).map((r) => r.snapshot_month))).sort();
}

export function SnapshotWarning({ months }: { months: string[] }) {
  if (months.length === 0) return null;
  return (
    <p className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-900" data-testid="pricing-snapshot-warning">
      {months.join("、")} 已經計算過獎金（已產生獎金快照）。這次變更不會自動追改已發金額，重新試算時數字可能不同，請確認後再送出。
    </p>
  );
}

/** 需要填原因的確認視窗（補登／修正月份／回復／刪除共用） */
export function ReasonDialog({
  open, title, description, confirmLabel, warningMonths = [], destructive, onClose, onConfirm, testId, children,
}: {
  open: boolean; title: string; description: string; confirmLabel: string; warningMonths?: string[]; destructive?: boolean;
  onClose: () => void; onConfirm: (reason: string) => Promise<boolean>; testId: string; children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm(reason.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          <SnapshotWarning months={warningMonths} />
          <div className="space-y-1.5">
            <Label htmlFor={`${testId}-reason`}>原因（必填，會留在異動紀錄）</Label>
            <Textarea id={`${testId}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="例：簽約當月漏建設定" data-testid={`${testId}-reason`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy} data-testid={`${testId}-cancel`}>取消</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={submit} disabled={busy || !reason.trim()} data-testid={`${testId}-confirm`}>
            {busy ? "處理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DateLog {
  id: string; rule_id: string; action: "backfill" | "fix_date" | "revert" | "delete";
  old_effective_from: string | null; new_effective_from: string | null; reason: string; changed_by: string | null; changed_at: string;
}
const ACTION_LABEL: Record<DateLog["action"], string> = { backfill: "補登", fix_date: "修正月份", revert: "回復", delete: "刪除補登" };
const ym = (d: string | null) => (d ? d.slice(0, 7) : "—");

/** 生效月份異動紀錄：補登／修正／回復／刪除；可修正者可一鍵回復最新一次修正、刪除補登錯的版本 */
export function PricingRuleDateLog({ accId, canFix, ruleIds, onChanged, reloadKey }: {
  accId: string; canFix: boolean; ruleIds: string[]; onChanged: () => void; reloadKey: number;
}) {
  const [logs, setLogs] = useState<DateLog[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<{ kind: "revert" | "delete"; log: DateLog; months: string[] } | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("owner_pricing_rule_date_logs")
      .select("id, rule_id, action, old_effective_from, new_effective_from, reason, changed_by, changed_at")
      .eq("accommodation_id", accId)
      .order("changed_at", { ascending: false });
    const rows = (data ?? []) as DateLog[];
    setLogs(rows);
    const ids = Array.from(new Set(rows.map((r) => r.changed_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", ids);
      setNames(Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p.name || p.email || p.id])));
    }
  }, [accId]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const latestFix = new Map<string, string>();
  for (const l of logs) if ((l.action === "fix_date" || l.action === "revert") && !latestFix.has(l.rule_id)) latestFix.set(l.rule_id, l.id);

  const open = async (kind: "revert" | "delete", log: DateLog) => {
    const from = kind === "revert" ? [log.old_effective_from, log.new_effective_from].filter(Boolean).sort()[0]! : log.new_effective_from!;
    setTarget({ kind, log, months: await snapshotMonthsFrom(from) });
  };
  const confirm = async (reason: string) => {
    if (!target) return false;
    const { error } = target.kind === "revert"
      ? await (supabase as any).rpc("owner_pricing_rule_revert_date", { _log_id: target.log.id, _reason: reason })
      : await (supabase as any).rpc("owner_pricing_rule_delete_backfill", { _rule_id: target.log.rule_id, _reason: reason });
    if (error) { toast.error(error.message); return false; }
    toast.success(target.kind === "revert" ? "已回復生效月份" : "已刪除補登的版本");
    await load();
    onChanged();
    return true;
  };

  return (
    <Card data-testid="pricing-date-log">
      <CardHeader>
        <CardTitle className="text-base">生效月份異動紀錄</CardTitle>
        <CardDescription>
          補登過去月份、修正月份、回復與刪除補登都會留下紀錄。只有 super_admin、管理員與 AM 總管可以補登或修正；回復只能從每個版本最新一次修正開始。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="pricing-date-log-empty">尚無異動紀錄。</p>
        ) : (
          <ul className="divide-y text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-2" data-testid={`pricing-date-log-${l.id}`}>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={l.action === "delete" ? "destructive" : "outline"}>{ACTION_LABEL[l.action]}</Badge>
                    <span>{l.action === "backfill" ? `建立 ${ym(l.new_effective_from)} 版本` : l.action === "delete" ? `刪除 ${ym(l.old_effective_from)} 版本` : `${ym(l.old_effective_from)} → ${ym(l.new_effective_from)}`}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">原因：{l.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {(l.changed_by && names[l.changed_by]) || "—"}・{new Date(l.changed_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                  </p>
                </div>
                {canFix && (
                  <div className="flex shrink-0 gap-2">
                    {latestFix.get(l.rule_id) === l.id && ruleIds.includes(l.rule_id) && (
                      <Button size="sm" variant="outline" onClick={() => open("revert", l)} data-testid={`pricing-date-log-revert-${l.id}`}>回復成 {ym(l.old_effective_from)}</Button>
                    )}
                    {l.action === "backfill" && ruleIds.includes(l.rule_id) && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => open("delete", l)} data-testid={`pricing-date-log-delete-${l.id}`}>刪除這筆補登</Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ReasonDialog
        open={!!target}
        testId="pricing-date-log-dialog"
        title={target?.kind === "revert" ? "回復生效月份" : "刪除補登的版本"}
        description={target?.kind === "revert"
          ? `把這個版本的生效月份從 ${ym(target.log.new_effective_from)} 改回 ${ym(target.log.old_effective_from)}。`
          : `刪除 ${ym(target?.log.new_effective_from ?? null)} 這筆補登的版本；該月若已產生獎金快照則不能刪除。`}
        confirmLabel={target?.kind === "revert" ? "確認回復" : "確認刪除"}
        destructive={target?.kind === "delete"}
        warningMonths={target?.months ?? []}
        onClose={() => setTarget(null)}
        onConfirm={confirm}
      />
    </Card>
  );
}
