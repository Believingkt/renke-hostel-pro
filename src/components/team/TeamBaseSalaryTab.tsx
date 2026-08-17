import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

interface MemberRow {
  user_id: string;
  display_name: string;
  amount: string;
  note: string;
  dirty: boolean;
}

function taipeiMonthKey(offset = 0) {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 成員底薪設定（總部限定）。
 * 只有全域 super_admin / admin 可讀寫（RLS 亦同步限制）；
 * 一般成員只能在 TeamHome 看到自己的底薪數字。
 */
export default function TeamBaseSalaryTab() {
  const [month, setMonth] = useState(taipeiMonthKey(-1));
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const monthOptions = useMemo(
    () => Array.from({ length: 15 }, (_, i) => taipeiMonthKey(1 - i)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: profiles }, { data: salaries }] = await Promise.all([
        supabase.from("team_member_profiles").select("user_id, display_name"),
        supabase
          .from("team_base_salaries")
          .select("user_id, amount, note")
          .eq("salary_month", month),
      ]);
      if (cancelled) return;
      const map = new Map((salaries ?? []).map((s: any) => [s.user_id, s]));
      const list = ((profiles ?? []) as any[])
        .filter((p) => p?.user_id)
        .map((p) => {
          const s = map.get(p.user_id);
          return {
            user_id: p.user_id as string,
            display_name: (p.display_name as string) || "未命名",
            amount: s ? String(Number(s.amount ?? 0)) : "",
            note: (s?.note as string) ?? "",
            dirty: false,
          };
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-Hant"));
      setRows(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const update = (userId: string, patch: Partial<MemberRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, ...patch, dirty: true } : r)),
    );

  const save = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = dirty.map((r) => ({
      user_id: r.user_id,
      salary_month: month,
      amount: Number(r.amount || 0),
      note: r.note || null,
      created_by: userData?.user?.id ?? null,
    }));
    const { error } = await supabase
      .from("team_base_salaries")
      .upsert(payload, { onConflict: "user_id,salary_month" });
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
    toast({ title: "已儲存", description: `${month} 底薪已更新 ${dirty.length} 筆` });
  };

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>成員底薪設定</CardTitle>
        <CardDescription>
          以「月份」為單位設定每位成員的底薪。底薪只會顯示在該月份對應的月結期（每月 10 日期）
          的 TeamHome 總收入旁，並註明實際領款時須扣除勞健保相關金額。
          此頁僅總部管理員可讀寫。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50 bg-background max-h-80">
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground tabular-nums">
            合計 ${total.toLocaleString()}
          </span>
          <Button size="sm" onClick={save} disabled={saving || !rows.some((r) => r.dirty)}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            儲存變更
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">讀取中…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-left font-medium">成員</th>
                  <th className="py-2 text-left font-medium w-40">底薪（TWD）</th>
                  <th className="py-2 text-left font-medium">備註</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.display_name}</td>
                    <td className="py-1.5 pr-3">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={r.amount}
                        placeholder="0"
                        onChange={(e) => update(r.user_id, { amount: e.target.value })}
                        className="h-8 tabular-nums"
                      />
                    </td>
                    <td className="py-1.5">
                      <Input
                        value={r.note}
                        placeholder="選填"
                        onChange={(e) => update(r.user_id, { note: e.target.value })}
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
