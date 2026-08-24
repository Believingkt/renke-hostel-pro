import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrderSources } from "@/hooks/use-order-sources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";


interface Props {
  accommodationId: string;
  accommodationName?: string;
  canEdit: boolean;
}

interface RuleRow {
  source: string;
  included: boolean;
  updated_at: string | null;
  updated_by_email: string | null;
}

interface LogRow {
  id: string;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  changes: { source: string; label?: string; before: boolean; after: boolean }[] | null;
}

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

export default function PerformanceSourceRulesSection({
  accommodationId,
  accommodationName,
  canEdit,
}: Props) {
  const sources = useOrderSources(accommodationId);
  const [saved, setSaved] = useState<Record<string, RuleRow>>({});
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId]);

  const load = async () => {
    const [ruleRes, logRes] = await Promise.all([
      supabase
        .from("performance_notification_source_rules")
        .select("source, included, updated_at, updated_by_email")
        .eq("accommodation_id", accommodationId),
      supabase
        .from("performance_notification_source_rule_logs")
        .select("id, created_at, user_email, user_name, changes")
        .eq("accommodation_id", accommodationId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const map: Record<string, RuleRow> = {};
    ((ruleRes.data || []) as RuleRow[]).forEach((r) => (map[r.source] = r));
    setSaved(map);
    const d: Record<string, boolean> = {};
    Object.entries(map).forEach(([k, v]) => (d[k] = v.included));
    setDraft(d);
    setLogs((logRes.data || []) as unknown as LogRow[]);
  };

  const isIncluded = (source: string) => draft[source] ?? saved[source]?.included ?? true;

  const dirty = useMemo(
    () => sources.some((s) => isIncluded(s.value) !== (saved[s.value]?.included ?? true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, draft, saved],
  );

  const excludedCount = sources.filter((s) => !isIncluded(s.value)).length;

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    let userName: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      userName = profile?.name ?? null;
    }

    const changes = sources
      .map((s) => ({
        source: s.value,
        label: s.label,
        before: saved[s.value]?.included ?? true,
        after: isIncluded(s.value),
      }))
      .filter((c) => c.before !== c.after);

    if (changes.length === 0) {
      setSaving(false);
      toast.info("沒有變更需要儲存");
      return;
    }

    const payload = sources.map((s) => ({
      accommodation_id: accommodationId,
      source: s.value,
      included: isIncluded(s.value),
      updated_by: user?.id ?? null,
      updated_by_email: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("performance_notification_source_rules")
      .upsert(payload, { onConflict: "accommodation_id,source" });
    if (error) {
      setSaving(false);
      toast.error("儲存失敗：" + error.message);
      return;
    }

    const { error: logErr } = await supabase
      .from("performance_notification_source_rule_logs")
      .insert([{
        accommodation_id: accommodationId,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_name: userName,
        changes: changes as never,
      }]);
    setSaving(false);
    if (logErr) {
      toast.warning("設定已儲存，但變更紀錄寫入失敗：" + logErr.message);
    } else {
      toast.success("已儲存來源設定");
    }
    await load();
  };

  if (!accommodationId) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          請先選擇館別
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 text-sm space-y-2 text-muted-foreground">
          <p className="font-semibold text-foreground">業績推播來源設定</p>
          <p>
            這裡決定「每日業績通報」的金額要算哪些訂單。預設會計入該館所有訂單來源；
            取消單、保留單、0 元單一律不計，這三項為系統固定規則、無法關閉。
          </p>
          <p>
            期間一律以<span className="font-medium text-foreground">成交日（order_date）</span>、台北時間 00:00–24:00 為準；
            加盟業績另由加盟訂單資料獨立計算，不受本頁設定影響。
          </p>
          <p>調整後隔日的通報即會套用；今日已發送的通報不會重算。</p>
          <p>
            想在通報中列出各來源金額合計，請於通報模板加入變數
            <span className="font-mono mx-1">{"{今日來源明細}"}</span>
            或
            <span className="font-mono mx-1">{"{本月來源明細}"}</span>
            ；未計入的來源不會出現在明細，也不會加進總額。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {accommodationName ? `${accommodationName} — ` : ""}納入計算的訂單來源
          </CardTitle>
          <Badge variant={excludedCount > 0 ? "secondary" : "success"}>
            {excludedCount > 0 ? `已排除 ${excludedCount} 項` : "全部納入"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {sources.map((s) => {
            const rule = saved[s.value];
            return (
              <div
                key={s.value}
                className="flex items-center justify-between gap-3 border rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <Label className="text-sm">{s.label}</Label>
                  <p className="text-xs text-muted-foreground font-mono truncate">{s.value}</p>
                  {rule?.updated_at && (
                    <p className="text-xs text-muted-foreground">
                      最後調整：{fmtTime(rule.updated_at)}
                      {rule.updated_by_email ? `（${rule.updated_by_email}）` : ""}
                    </p>
                  )}
                </div>
                <Switch
                  checked={isIncluded(s.value)}
                  disabled={!canEdit}
                  onCheckedChange={(v) => setDraft((p) => ({ ...p, [s.value]: v }))}
                />
              </div>
            );
          })}
          {sources.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">此館別尚無訂單來源</p>
          )}

          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving ? "儲存中..." : "儲存來源設定"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">變更紀錄</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">尚無變更紀錄</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="border rounded-md px-3 py-2 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{fmtTime(log.created_at)}</span>
                <span>·</span>
                <span>{log.user_name || log.user_email || "未知使用者"}</span>
              </div>
              <ul className="space-y-0.5">
                {(log.changes ?? []).map((c, i) => (
                  <li key={`${log.id}-${i}`}>
                    {c.label || c.source}：
                    <span className={c.after ? "text-emerald-600" : "text-destructive"}>
                      {c.before ? "納入" : "排除"} → {c.after ? "納入" : "排除"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
