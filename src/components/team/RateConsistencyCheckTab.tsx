import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

interface Row {
  accId: string;
  accName: string;
  consultRate: number | null;
  consultThreshold: number | null;
  consultFrom: string | null;
  ruleRate: number | null;
  ruleThreshold: number | null;
  ruleFrom: string | null;
  status: "ok" | "missing_rule" | "missing_consult" | "diff";
  detail: string;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const fmtRate = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);
const fmtAmt = (v: number | null) => (v === null ? "—" : `NT$${Math.round(v).toLocaleString()}`);

/**
 * 費率一致性檢查：比對 Gate B 來源（consulting_fee_settings 歷史表）
 * 與唯一真實來源 owner_settlement_pricing_rules 的最新生效版本。
 * 僅唯讀查詢，不修改任何設定。
 */
export default function RateConsistencyCheckTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: accData }, { data: ruleData }, { data: consultData }] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, is_active")
          .eq("is_active", true)
          .neq("name", "奧丁丁測試")
          .order("name"),
        supabase
          .from("owner_settlement_pricing_rules")
          .select("accommodation_id, commission_rate, commission_threshold, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
        supabase
          .from("consulting_fee_settings")
          .select("accommodation_id, rate, revenue_threshold, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
      ]);

      const rules = (ruleData ?? []) as any[];
      const consults = (consultData ?? []) as any[];

      const out: Row[] = ((accData ?? []) as any[]).map((a) => {
        const r = rules.find((x) => x.accommodation_id === a.id);
        const c = consults.find((x) => x.accommodation_id === a.id);
        const ruleRate = r ? num(r.commission_rate) : null;
        const ruleThreshold = r ? num(r.commission_threshold) ?? 0 : null;
        const consultRate = c ? num(c.rate) : null;
        const consultThreshold = c ? num(c.revenue_threshold) ?? 0 : null;

        let status: Row["status"] = "ok";
        const diffs: string[] = [];
        if (!r && !c) {
          status = "missing_rule";
          diffs.push("兩邊都沒有設定");
        } else if (!r) {
          status = "missing_rule";
          diffs.push("缺少業主月結設定（唯一真實來源）");
        } else if (!c) {
          status = "missing_consult";
          diffs.push("管顧費率歷史表無對應紀錄");
        } else {
          if (Math.abs((ruleRate ?? 0) - (consultRate ?? 0)) > 0.001)
            diffs.push(`費率 ${fmtRate(consultRate)} → ${fmtRate(ruleRate)}`);
          if (Math.abs((ruleThreshold ?? 0) - (consultThreshold ?? 0)) > 0.5)
            diffs.push(`門檻 ${fmtAmt(consultThreshold)} → ${fmtAmt(ruleThreshold)}`);
          if (diffs.length > 0) status = "diff";
        }

        return {
          accId: a.id,
          accName: a.name,
          consultRate,
          consultThreshold,
          consultFrom: c ? String(c.effective_from).slice(0, 10) : null,
          ruleRate,
          ruleThreshold,
          ruleFrom: r ? String(r.effective_from).slice(0, 10) : null,
          status,
          detail: diffs.join("；") || "一致",
        };
      });

      out.sort((a, b) => (a.status === "ok" ? 1 : 0) - (b.status === "ok" ? 1 : 0));
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const problems = rows.filter((r) => r.status !== "ok");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>費率一致性檢查（唯讀）</CardTitle>
            <CardDescription>
              自動比對「業主月結服務費（owner_settlement_pricing_rules）最新生效版本」與 Ragic Gate B
              來源的管顧費率歷史表，列出費率／門檻不一致或缺漏的館別。此頁不會修改任何設定。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新檢查
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              problems.length === 0
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/40 bg-amber-500/10"
            }`}
          >
            {problems.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <span>
              共檢查 {rows.length} 間館別，
              {problems.length === 0 ? "全部一致。" : `發現 ${problems.length} 間需要確認。`}
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">月結費率</TableHead>
                <TableHead className="text-right">月結門檻</TableHead>
                <TableHead className="text-right">管顧費率</TableHead>
                <TableHead className="text-right">管顧門檻</TableHead>
                <TableHead>差異說明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.accId}>
                  <TableCell className="whitespace-nowrap font-medium">{r.accName}</TableCell>
                  <TableCell>
                    {r.status === "ok" ? (
                      <Badge variant="secondary">一致</Badge>
                    ) : (
                      <Badge className="bg-amber-600 text-white hover:bg-amber-700">需確認</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtRate(r.ruleRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtAmt(r.ruleThreshold)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtRate(r.consultRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtAmt(r.consultThreshold)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
