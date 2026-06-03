import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PreloadLink } from "@/components/PreloadLink";
import { Mail, ExternalLink } from "lucide-react";

interface Stats {
  total: number;
  parsed: number;
  quarantined: number;
  ignored: number;
  pendingPii: number;
  overduePii: number;
}

interface Props {
  showDetailLink?: boolean;
  showHeader?: boolean;
  refreshKey?: number | string;
  /** Tenant scope. When set, every stat is filtered by accommodation_id.
   *  When null/undefined, stats are global (HQ super_admin view). */
  accommodationId?: string | null;
}

export function OwlTingEmailStatsCards({ showDetailLink = true, showHeader = true, refreshKey, accommodationId }: Props) {
  const [stats, setStats] = useState<Stats>({
    total: 0, parsed: 0, quarantined: 0, ignored: 0, pendingPii: 0, overduePii: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();

    const scope = <T extends { eq: (col: string, val: any) => any }>(q: T) =>
      accommodationId ? (q.eq("accommodation_id", accommodationId) as T) : q;

    const [
      { count: total },
      { count: parsed },
      { count: ignored },
      { count: quarantined },
      { count: pendingPii },
      { count: overduePii },
    ] = await Promise.all([
      scope(supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true })),
      scope(supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true }).eq("status", "parsed")),
      scope(supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true }).eq("status", "ignored")),
      // Quarantine = subject_parse failures. No accommodation_id column → RLS limits to HQ super_admin.
      // For tenants, force 0 so the stat stays consistent with the (always-empty) tenant list.
      accommodationId
        ? Promise.resolve({ count: 0 } as { count: number })
        : supabase
            .from("owlting_email_parse_failures")
            .select("*", { count: "exact", head: true })
            .eq("resolved", false)
            .eq("failure_stage", "subject_parse"),
      scope(
        supabase
          .from("owlting_email_parsed_staging")
          .select("*", { count: "exact", head: true })
          .eq("pii_status", "pending_pii_fillup")
      ),
      scope(
        supabase
          .from("owlting_email_parsed_staging")
          .select("*", { count: "exact", head: true })
          .eq("pii_status", "pending_pii_fillup")
          .lt("pii_due_at", nowIso)
      ),
    ]);
    setStats({
      total: total ?? 0,
      parsed: parsed ?? 0,
      quarantined: quarantined ?? 0,
      ignored: ignored ?? 0,
      pendingPii: pendingPii ?? 0,
      overduePii: overduePii ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [refreshKey, accommodationId]);

  return (
    <Card>
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">奧丁丁訂單收件監控</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              重新整理
            </Button>
            {showDetailLink && (
              <Button variant="outline" size="sm" asChild>
                <PreloadLink to="/admin/owlting-email-ingest">
                  詳細記錄
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </PreloadLink>
              </Button>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatBox label="總收件數" value={stats.total} />
          <StatBox label="成功解析" value={stats.parsed} tone="primary" />
          <StatBox
            label="待補 PII"
            value={stats.pendingPii}
            tone={stats.pendingPii > 0 ? "warning" : "muted"}
            hint="業主尚未補齊住客資料"
          />
          <StatBox
            label="逾期未補"
            value={stats.overduePii}
            tone={stats.overduePii > 0 ? "destructive" : "muted"}
            hint="超過補單截止時間"
          />
          <StatBox
            label="隔離區(需人工)"
            value={stats.quarantined}
            tone={stats.quarantined > 0 ? "destructive" : "muted"}
            hint="信任來源但無法解析"
          />
          <StatBox
            label="已忽略(非信任)"
            value={stats.ignored}
            tone="muted"
            hint="非白名單寄件者"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "destructive" | "muted" | "warning";
  hint?: string;
}) {
  const colorClass =
    tone === "primary"
      ? "text-primary"
      : tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
