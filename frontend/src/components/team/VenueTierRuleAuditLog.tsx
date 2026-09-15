import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BonusTier {
  min_revenue: number;
  rate: number;
}

interface LogRow {
  id: string;
  rule_id: string | null;
  accommodation_id: string | null;
  bonus_type: string;
  effective_from: string | null;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  tiers_before: BonusTier[] | null;
  tiers_after: BonusTier[] | null;
  note: string | null;
  created_at: string;
}

interface AccOption {
  id: string;
  name: string;
}

const BONUS_LABELS: Record<string, string> = {
  am_performance: "AM 績效獎金",
  am_manager: "AM 總管獎金",
  closer_performance: "成交大師績效獎金",
};

const ACTION_LABELS: Record<string, string> = {
  create: "新增版本",
  update: "修改版本",
  delete: "刪除版本",
};

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const describeTiers = (tiers: BonusTier[] | null) =>
  !tiers || tiers.length === 0
    ? "（無）"
    : [...tiers]
        .sort((a, b) => a.min_revenue - b.min_revenue)
        .map(
          (t) =>
            `${Math.round(t.min_revenue).toLocaleString("zh-TW")}↑ ${(t.rate * 100)
              .toFixed(2)
              .replace(/\.?0+$/, "")}%`,
        )
        .join("、");

export default function VenueTierRuleAuditLog({
  accs,
  accountFilter,
}: {
  accs: AccOption[];
  accountFilter?: string | null;
}) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [usage, setUsage] = useState<Map<string, { months: string[]; lines: number }>>(new Map());
  const [filterAcc, setFilterAcc] = useState<string>(accountFilter ?? "all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accountFilter) setFilterAcc(accountFilter);
  }, [accountFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("venue_team_bonus_tier_rule_logs")
        .select(
          "id, rule_id, accommodation_id, bonus_type, effective_from, action, actor_id, actor_email, tiers_before, tiers_after, note, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (cancelled) return;
      const rows = ((data ?? []) as any[]).map((r) => ({
        ...r,
        tiers_before: Array.isArray(r.tiers_before) ? r.tiers_before : null,
        tiers_after: Array.isArray(r.tiers_after) ? r.tiers_after : null,
      })) as LogRow[];
      setLogs(rows);

      // 套用到哪些快照：以 tier_rule_id 反查快照明細 → 對應資料月
      const ruleIds = Array.from(new Set(rows.map((r) => r.rule_id).filter(Boolean))) as string[];
      const map = new Map<string, { months: string[]; lines: number }>();
      if (ruleIds.length > 0) {
        const { data: lines } = await supabase
          .from("teamcommission_bonus_snapshot_lines")
          .select("tier_rule_id, snapshot_id")
          .in("tier_rule_id", ruleIds)
          .limit(5000);
        const snapIds = Array.from(
          new Set(((lines ?? []) as any[]).map((l) => l.snapshot_id).filter(Boolean)),
        );
        const monthById = new Map<string, string>();
        if (snapIds.length > 0) {
          const { data: snaps } = await supabase
            .from("teamcommission_bonus_snapshots")
            .select("id, snapshot_month")
            .in("id", snapIds);
          ((snaps ?? []) as any[]).forEach((s) => monthById.set(s.id, s.snapshot_month));
        }
        ((lines ?? []) as any[]).forEach((l) => {
          const cur = map.get(l.tier_rule_id) ?? { months: [], lines: 0 };
          cur.lines += 1;
          const m = monthById.get(l.snapshot_id);
          if (m && !cur.months.includes(m)) cur.months.push(m);
          map.set(l.tier_rule_id, cur);
        });
      }
      if (!cancelled) {
        setUsage(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accName = (id: string | null) =>
    accs.find((a) => a.id === id)?.name ?? (id ? "（未知館別）" : "—");

  const shown = useMemo(
    () => (filterAcc === "all" ? logs : logs.filter((l) => l.accommodation_id === filterAcc)),
    [logs, filterAcc],
  );

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">規則版本審計紀錄</CardTitle>
          <CardDescription>
            每次新增／修改／刪除級距版本都會自動留存操作者、時間與級距前後內容；
            並可看到該版本已被哪些資料月的快照實際採用（依快照明細凍結的 tier_rule_id 反查）。
          </CardDescription>
        </div>
        <Select value={filterAcc} onValueChange={setFilterAcc}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部館別</SelectItem>
            {accs.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">尚無變更紀錄。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {shown.map((l) => {
              const u = l.rule_id ? usage.get(l.rule_id) : undefined;
              return (
                <li key={l.id} className="space-y-1 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        l.action === "delete"
                          ? "destructive"
                          : l.action === "update"
                            ? "outline"
                            : "default"
                      }
                    >
                      {ACTION_LABELS[l.action] ?? l.action}
                    </Badge>
                    <span className="font-medium">{accName(l.accommodation_id)}</span>
                    <span className="text-muted-foreground">
                      {BONUS_LABELS[l.bonus_type] ?? l.bonus_type}
                    </span>
                    {l.effective_from && (
                      <span className="tabular-nums text-muted-foreground">
                        生效日 {l.effective_from}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fmtTime(l.created_at)} ｜ 操作者：{l.actor_email ?? l.actor_id ?? "系統"}
                  </p>
                  {l.action === "update" ? (
                    <p className="text-xs">
                      級距：{describeTiers(l.tiers_before)} → {describeTiers(l.tiers_after)}
                    </p>
                  ) : (
                    <p className="text-xs">
                      級距：{describeTiers(l.action === "delete" ? l.tiers_before : l.tiers_after)}
                    </p>
                  )}
                  {l.note && <p className="text-xs text-muted-foreground">備註：{l.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {u
                      ? `已被快照採用：${u.months.sort().join("、")} 資料月（共 ${u.lines} 筆明細）`
                      : "尚未被任何快照採用"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
