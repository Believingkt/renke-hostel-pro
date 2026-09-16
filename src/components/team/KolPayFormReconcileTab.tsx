import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";

/** 系統端當期應發（已依 CID 彙總） */
export interface ExpectedPayout {
  cid_code: string;
  name: string | null;
  venue: string | null;
  amount: number;
}

interface RagicPayForm {
  ragic_id: string;
  payform_no: string | null;
  recon_code: string;
  cid_code: string | null;
  period: string | null;
  nickname: string;
  ig_url: string;
  venue: string;
  amount: number;
  created_at: string | null;
  remit_date: string | null;
}

type StatusKey =
  | "matched"
  | "period_mismatch"
  | "other_period"
  | "amount_diff"
  | "not_submitted"
  | "ragic_only";

const STATUS_LABEL: Record<StatusKey, string> = {
  matched: "金額相符",
  period_mismatch: "期別不符（延後送單）",
  other_period: "他期應發（延後送單）",
  amount_diff: "金額不符",
  not_submitted: "未送單",
  ragic_only: "Ragic 有、系統沒有",
};

const STATUS_CLASS: Record<StatusKey, string> = {
  matched: "bg-green-100 text-green-700 border-green-200",
  period_mismatch: "bg-amber-100 text-amber-700 border-amber-200",
  other_period: "bg-slate-100 text-slate-700 border-slate-200",
  amount_diff: "bg-red-100 text-red-700 border-red-200",
  not_submitted: "bg-orange-100 text-orange-700 border-orange-200",
  ragic_only: "bg-blue-100 text-blue-700 border-blue-200",
};

const fmtMoney = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;

const fmtPeriod = (p: string | null) =>
  p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4, 6)}` : "—";

const fmtDate = (v: string | null) => (v ? v.slice(0, 10) : "—");

/** 同一期別視窗內的所有期別（±WINDOW_MONTHS） */
const WINDOW_MONTHS = 3;

interface Props {
  /** 發放期別（獎金結算月）年 */
  payoutYear: number;
  /** 發放期別月（"1".."12" 或 "all"） */
  payoutPeriod: string;
  onChangeYear: (y: number) => void;
  onChangePeriod: (p: string) => void;
  yearOptions: number[];
  /** 系統端當期應發清單 */
  expected: ExpectedPayout[];
  /** 前後數期的系統應發（key = YYYYMM 發放期別），用於跨期歸戶 */
  expectedByPeriod?: Record<string, ExpectedPayout[]>;
  loading?: boolean;
}

export default function KolPayFormReconcileTab({
  payoutYear,
  payoutPeriod,
  onChangeYear,
  onChangePeriod,
  yearOptions,
  expected,
  expectedByPeriod,
  loading,
}: Props) {
  const [forms, setForms] = useState<RagicPayForm[] | null>(null);
  const [fetching, setFetching] = useState(false);
  /** 以「系統應發期別」歸戶檢視（B 方案） */
  const [byExpectedPeriod, setByExpectedPeriod] = useState(false);

  const periodKey =
    payoutPeriod === "all"
      ? null
      : `${payoutYear}${String(Number(payoutPeriod)).padStart(2, "0")}`;

  const load = useCallback(async () => {
    if (!periodKey) {
      setForms(null);
      return;
    }
    setFetching(true);
    const { data, error } = await supabase.functions.invoke(
      "fetch-ragic-kol-payforms",
      { body: { period: periodKey, window_months: WINDOW_MONTHS } },
    );
    setFetching(false);
    if (error) {
      toast.error("讀取 Ragic 勞報單失敗：" + error.message);
      return;
    }
    if ((data as any)?.error) {
      toast.error("讀取 Ragic 勞報單失敗：" + (data as any).error);
      return;
    }
    setForms(((data as any)?.rows ?? []) as RagicPayForm[]);
  }, [periodKey]);

  useEffect(() => {
    setForms(null);
  }, [periodKey]);

  const rows = useMemo(() => {
    const list = forms ?? [];
    const byCid = new Map<string, RagicPayForm[]>();
    for (const f of list) {
      const cid = (f.cid_code ?? "").toUpperCase();
      if (!cid) continue;
      byCid.set(cid, [...(byCid.get(cid) ?? []), f]);
    }

    const out: {
      key: string;
      cid: string;
      name: string;
      venue: string;
      expected: number | null;
      actual: number | null;
      ragicId: string | null;
      reconCode: string | null;
      formPeriods: string[];
      submittedAt: string | null;
      remitDate: string | null;
      status: StatusKey;
    }[] = [];

    const pick = (fs: RagicPayForm[], key: "created_at" | "remit_date") => {
      const vals = fs.map((f) => f[key]).filter(Boolean) as string[];
      return vals.length ? vals.sort().slice(-1)[0] : null;
    };

    for (const e of expected) {
      const cid = e.cid_code.toUpperCase();
      const matched = byCid.get(cid) ?? [];
      const actual = matched.length
        ? matched.reduce((s, f) => s + f.amount, 0)
        : null;
      const periods = [...new Set(matched.map((f) => f.period ?? "").filter(Boolean))];
      const hasOtherPeriod = periods.some((p) => p !== periodKey);
      const amountOk =
        actual !== null && Math.round(actual) === Math.round(e.amount);
      const status: StatusKey =
        actual === null
          ? "not_submitted"
          : !amountOk
            ? "amount_diff"
            : hasOtherPeriod
              ? "period_mismatch"
              : "matched";
      out.push({
        key: cid,
        cid,
        name: e.name || matched[0]?.nickname || "—",
        venue: e.venue || matched[0]?.venue || "—",
        expected: e.amount,
        actual,
        ragicId: matched.map((f) => f.payform_no || f.ragic_id).join("、") || null,
        reconCode: matched.map((f) => f.recon_code).join("、") || null,
        formPeriods: periods,
        submittedAt: pick(matched, "created_at"),
        remitDate: pick(matched, "remit_date"),
        status,
      });
      byCid.delete(cid);
    }

    // Ragic 有、系統沒有：只列出「對帳編號就是本期」的，鄰近期別不算假警訊
    for (const [cid, list2] of byCid.entries()) {
      const thisPeriod = list2.filter((f) => f.period === periodKey);
      if (thisPeriod.length === 0) continue;
      out.push({
        key: `ragic-${cid}`,
        cid,
        name: thisPeriod[0]?.nickname || "—",
        venue: thisPeriod[0]?.venue || "—",
        expected: null,
        actual: thisPeriod.reduce((s, f) => s + f.amount, 0),
        ragicId: thisPeriod.map((f) => f.payform_no || f.ragic_id).join("、"),
        reconCode: thisPeriod.map((f) => f.recon_code).join("、") || null,
        formPeriods: [...new Set(thisPeriod.map((f) => f.period ?? "").filter(Boolean))],
        submittedAt: pick(thisPeriod, "created_at"),
        remitDate: pick(thisPeriod, "remit_date"),
        status: "ragic_only",
      });
    }

    return out;
  }, [forms, expected, periodKey]);

  /** 無對帳編號的勞報單無法精準比對，另外列出提醒 */
  const unmatchable = useMemo(
    () => (forms ?? []).filter((f) => !f.cid_code),
    [forms],
  );

  const summary = useMemo(() => {
    const c: Record<StatusKey, number> = {
      matched: 0,
      period_mismatch: 0,
      amount_diff: 0,
      not_submitted: 0,
      ragic_only: 0,
    };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>勞報單對帳</CardTitle>
        <p className="text-sm text-muted-foreground">
          以 CID 比對系統應發金額與 KOL 已送出的 Ragic 勞報單，並一併讀取前後 {WINDOW_MONTHS} 期，
          KOL 晚送單或對帳編號填錯期別仍配得上（標示為「期別不符」）。「實際匯款日」為會計在勞報單上填寫的匯款日期，
          是款項實際發出的依據。此頁純唯讀，不會修改 Ragic 或任何獎金數字。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">發放期別</span>
          <Select value={String(payoutYear)} onValueChange={(v) => onChangeYear(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payoutPeriod} onValueChange={onChangePeriod}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} 月 10 日
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={load} disabled={!periodKey || fetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "讀取中…" : "讀取 Ragic 勞報單"}
          </Button>
        </div>

        {!periodKey && (
          <p className="text-sm text-muted-foreground">請選擇單一發放期別後再讀取。</p>
        )}

        {forms && (
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(STATUS_LABEL) as StatusKey[]).map((k) => (
              <Badge key={k} variant="outline" className={STATUS_CLASS[k]}>
                {STATUS_LABEL[k]} {summary[k]}
              </Badge>
            ))}
          </div>
        )}

        {forms && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">狀態</TableHead>
                  <TableHead className="whitespace-nowrap">KOL</TableHead>
                  <TableHead className="whitespace-nowrap">CID</TableHead>
                  <TableHead className="whitespace-nowrap">合作場域</TableHead>
                  <TableHead className="whitespace-nowrap text-right">系統應發</TableHead>
                  <TableHead className="whitespace-nowrap text-right">勞報單金額</TableHead>
                  <TableHead className="whitespace-nowrap">勞報單編號</TableHead>
                  <TableHead className="whitespace-nowrap">對帳編號</TableHead>
                  <TableHead className="whitespace-nowrap">勞報單期別</TableHead>
                  <TableHead className="whitespace-nowrap">送單日</TableHead>
                  <TableHead className="whitespace-nowrap">實際匯款日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-6 text-center text-muted-foreground">
                      此期別無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{r.cid}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.venue}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {r.expected === null ? "—" : fmtMoney(r.expected)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {r.actual === null ? "—" : fmtMoney(r.actual)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {r.ragicId || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {r.reconCode || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.formPeriods.length === 0
                          ? "—"
                          : r.formPeriods.map(fmtPeriod).join("、")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {fmtDate(r.submittedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.remitDate ? (
                          <span className="text-green-700">{fmtDate(r.remitDate)}</span>
                        ) : (
                          <span className="text-muted-foreground">未匯款</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {forms && unmatchable.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">
              無對帳編號的勞報單（{unmatchable.length} 筆，需人工核對）
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">勞報單編號</TableHead>
                    <TableHead className="whitespace-nowrap">暱稱</TableHead>
                    <TableHead className="whitespace-nowrap">合作場域</TableHead>
                    <TableHead className="whitespace-nowrap text-right">金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchable.map((f) => (
                    <TableRow key={f.ragic_id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {f.payform_no || f.ragic_id}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{f.nickname || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{f.venue || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtMoney(f.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">系統應發清單載入中…</p>}
      </CardContent>
    </Card>
  );
}
