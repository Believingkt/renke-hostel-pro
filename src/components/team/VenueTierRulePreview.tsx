import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download } from "lucide-react";

export interface BonusTier {
  min_revenue: number;
  rate: number;
}

export interface TierRuleLite {
  id: string;
  accommodation_id: string;
  bonus_type: string;
  effective_from: string;
  tiers: BonusTier[];
  created_at: string;
}

interface AccOption {
  id: string;
  name: string;
}

const BONUS_TYPES = [
  { value: "am_performance", label: "AM 績效獎金" },
  { value: "am_manager", label: "AM 總管獎金" },
  { value: "closer_performance", label: "成交大師績效獎金" },
] as const;

const twMoney = (n: number) =>
  `NT$ ${Math.round(n).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** 整筆套用（flat）：取營收所落在的最高一階；低於最低門檻 → null */
export function pickTier(tiers: BonusTier[], revenue: number): BonusTier | null {
  const sorted = [...tiers].sort((a, b) => a.min_revenue - b.min_revenue);
  let hit: BonusTier | null = null;
  for (const t of sorted) if (revenue >= t.min_revenue) hit = t;
  return hit;
}

function monthOptions(count = 18): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** 版本切點對齊資料月：asOf = 資料月 1 日 */
function resolveVersion(rules: TierRuleLite[], asOf: string): TierRuleLite | null {
  const eligible = rules.filter((r) => r.effective_from <= asOf);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) =>
    r.effective_from > best.effective_from ||
    (r.effective_from === best.effective_from && r.created_at > best.created_at)
      ? r
      : best,
  );
}

export default function VenueTierRulePreview({
  accs,
  rules,
}: {
  accs: AccOption[];
  rules: TierRuleLite[];
}) {
  const { toast } = useToast();
  const months = useMemo(() => monthOptions(), []);
  const [acc, setAcc] = useState<string>("");
  const [bonusType, setBonusType] = useState<string>("am_performance");
  const [month, setMonth] = useState<string>(months[1] ?? months[0]);
  const [revenueInput, setRevenueInput] = useState<string>("");
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [systemRate, setSystemRate] = useState<number | null>(null);

  const asOf = `${month}-01`;
  const versionRules = useMemo(
    () =>
      rules.filter((r) => r.accommodation_id === acc && r.bonus_type === bonusType),
    [rules, acc, bonusType],
  );
  const version = useMemo(() => resolveVersion(versionRules, asOf), [versionRules, asOf]);
  const revenue = Number(revenueInput.replace(/,/g, ""));
  const hasRevenue = revenueInput !== "" && Number.isFinite(revenue);
  const hit = version && hasRevenue ? pickTier(version.tiers, revenue) : null;

  const fetchRevenue = async () => {
    if (!acc) {
      toast({ title: "請先選擇館別", variant: "destructive" });
      return;
    }
    setFetching(true);
    setFetchNote(null);
    try {
      const { data: snaps } = await supabase
        .from("teamcommission_bonus_snapshots")
        .select("id")
        .eq("snapshot_month", month)
        .eq("bonus_type", bonusType);
      const ids = (snaps ?? []).map((s: { id: string }) => s.id);
      if (ids.length === 0) {
        setFetchNote("該資料月尚無快照，請手動輸入基準營收試算。");
        return;
      }
      const { data: lines } = await supabase
        .from("teamcommission_bonus_snapshot_lines")
        .select("revenue_base")
        .in("snapshot_id", ids)
        .eq("accommodation_id", acc);
      const values = (lines ?? [])
        .map((l: { revenue_base: number | null }) => Number(l.revenue_base ?? 0))
        .filter((v) => Number.isFinite(v));
      if (values.length === 0) {
        setFetchNote("快照中查無此館別的基準營收，請手動輸入。");
        return;
      }
      const base = Math.max(...values);
      setRevenueInput(String(Math.round(base)));
      setFetchNote(`已自 ${month} 快照抓取基準營收（同期多筆取最大值）。`);
    } finally {
      setFetching(false);
    }
  };

  const fetchSystemRate = async () => {
    const { data } = await supabase
      .from("teamcommission_bonus_rate_settings")
      .select("rate, effective_from")
      .eq("bonus_type", bonusType)
      .lte("effective_from", asOf)
      .order("effective_from", { ascending: false })
      .limit(1);
    setSystemRate(data?.[0]?.rate != null ? Number(data[0].rate) : null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">級距規則套用預覽</CardTitle>
        <CardDescription>
          選館別、獎金類型與資料月後，輸入或抓取該月基準營收，即可看到會命中哪一階、用什麼費率、
          以及該館貢獻的獎金金額。版本切點以資料月 1 日判定；此處僅為試算，不會寫入任何快照。
          AM 總管／成交大師績效的實際發放金額還要再「÷ 人數 × 在職比例」。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>館別</Label>
            <Select value={acc} onValueChange={setAcc}>
              <SelectTrigger>
                <SelectValue placeholder="選擇館別" />
              </SelectTrigger>
              <SelectContent>
                {accs.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>獎金類型</Label>
            <Select value={bonusType} onValueChange={setBonusType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BONUS_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>資料月</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>基準營收</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              inputMode="numeric"
              placeholder="輸入金額，或按右側抓取"
              value={revenueInput}
              onChange={(e) => setRevenueInput(e.target.value)}
            />
            <Button variant="outline" onClick={fetchRevenue} disabled={fetching}>
              <Download className="mr-1 h-4 w-4" />
              抓取該月快照營收
            </Button>
          </div>
          {fetchNote && <p className="text-xs text-muted-foreground">{fetchNote}</p>}
        </div>

        {!acc ? null : !version ? (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <p className="mb-2">
              此館別於 {month} 資料月<strong>沒有生效中的獨立級距規則</strong>，將沿用系統費率。
            </p>
            <Button size="sm" variant="outline" onClick={fetchSystemRate}>
              查詢該期系統費率
            </Button>
            {systemRate != null && hasRevenue && (
              <p className="mt-2 tabular-nums">
                系統費率 {pct(systemRate)} × {twMoney(revenue)} ={" "}
                <strong>{twMoney(revenue * systemRate)}</strong>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="default">套用獨立級距</Badge>
              <span className="text-muted-foreground">
                版本生效日 {version.effective_from}（依資料月 {month} 判定）
              </span>
            </div>
            {!hasRevenue ? (
              <p className="text-sm text-muted-foreground">請輸入或抓取基準營收以查看試算結果。</p>
            ) : (
              <>
                <div className="grid gap-2 text-sm tabular-nums sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">基準營收</p>
                    <p className="font-medium">{twMoney(revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">命中級距</p>
                    <p className="font-medium">
                      {hit
                        ? `${twMoney(hit.min_revenue)} 以上 ｜ ${pct(hit.rate)}`
                        : "未達最低門檻（該館貢獻 0）"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">該館獎金貢獻</p>
                    <p className="font-medium">{twMoney(hit ? revenue * hit.rate : 0)}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="w-20 py-1.5 text-left font-medium">階層</th>
                        <th className="py-1.5 text-right font-medium whitespace-nowrap">門檻</th>
                        <th className="py-1.5 text-right font-medium whitespace-nowrap">費率</th>
                        <th className="py-1.5 text-right font-medium whitespace-nowrap">試算金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...version.tiers]
                        .sort((a, b) => a.min_revenue - b.min_revenue)
                        .map((t, i) => {
                          const isHit = !!hit && t.min_revenue === hit.min_revenue && t.rate === hit.rate;
                          return (
                            <tr
                              key={i}
                              className={`border-b last:border-0 ${isHit ? "bg-muted/50 font-medium" : ""}`}
                            >
                              <td className="py-1.5">第 {i + 1} 階</td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {twMoney(t.min_revenue)} 以上
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap">{pct(t.rate)}</td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                {twMoney(revenue * t.rate)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
