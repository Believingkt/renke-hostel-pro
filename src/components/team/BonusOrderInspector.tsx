import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, MinusCircle, Search } from "lucide-react";
import { extractExcludedAddonTotal } from "@/lib/ownerSettlement";
import { payoutMonthKeyFromDataMonth } from "@/lib/bonusMultiplier";
import { usesStayRevenue } from "@/lib/teamBonusStayRevenue";

type Verdict = "pass" | "fail" | "info";

interface StepResult {
  step: string;
  title: string;
  verdict: Verdict;
  lines: Array<{ label: string; value: string }>;
  note?: string;
}

const money = (n: number) => `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;

function VerdictIcon({ v }: { v: Verdict }) {
  if (v === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (v === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
}

function pickCurrentWhitelist(rows: any[], onDate: string): string[] {
  const eligible = (rows ?? []).filter((r) => String(r.effective_from ?? "") <= onDate);
  if (eligible.length === 0) return [];
  const latest = eligible.reduce((best, r) =>
    String(r.effective_from ?? "") > String(best.effective_from ?? "") ? r : best,
  );
  return Array.isArray(latest?.included_order_sources) ? latest.included_order_sources : [];
}

/**
 * 訂單獎金試算檢查器：輸入訂單編號，逐步顯示這筆訂單在每一道 gate 的判定結果，
 * 讓使用者不必讀懂全部設定，也能理解「為什麼這筆有／沒有獎金」。
 * 全部為唯讀查詢，不寫入任何資料。
 */
export default function BonusOrderInspector() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<Array<{ label: string; value: string }> | null>(null);
  const [steps, setSteps] = useState<StepResult[] | null>(null);

  const run = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setLoading(true);
    setError(null);
    setSteps(null);
    setHeader(null);
    try {
      const { data: order, error: oErr } = await (supabase as any)
        .from("orders")
        .select(
          "id, order_number, accommodation_id, order_date, check_in_date, check_out_date, final_price, order_source, order_status, owner_direct, currency_at_booking, exchange_rate_snapshot, custom_addon_details, accommodation_info(name), order_meta(team_commission_price, is_excluded)",
        )
        .eq("order_number", kw)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!order) {
        setError("查無此訂單編號");
        return;
      }

      const accId = String(order.accommodation_id ?? "");
      const orderDate = String(order.order_date ?? "").slice(0, 10);
      const checkIn = String(order.check_in_date ?? "").slice(0, 10);
      const dataMonth = (checkIn || orderDate).slice(0, 7);
      const monthStart = `${dataMonth}-01`;

      const [periodsRes, sharedRes, kolRes, ruleRes] = await Promise.all([
        (supabase as any)
          .from("accommodation_partnership_periods")
          .select("start_date, end_date, counts_closer_commission, counts_team_bonus, payout_basis")
          .eq("accommodation_id", accId),
        (supabase as any)
          .from("teamcommission_shared_revenue_source_whitelist")
          .select("included_order_sources, effective_from"),
        (supabase as any)
          .from("teamcommission_kol_revenue_source_whitelist")
          .select("included_order_sources, effective_from"),
        (supabase as any)
          .from("owner_settlement_pricing_rules")
          .select(
            "commission_rate, commission_threshold, exempt_order_sources, commission_excluded_addon_ids, commission_excluded_addon_types, effective_from",
          )
          .eq("accommodation_id", accId)
          .lte("effective_from", monthStart)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const periods = (periodsRes.data ?? []) as any[];
      const inPeriod = (d: string, flag: "counts_team_bonus" | "counts_closer_commission") =>
        periods.some(
          (p) =>
            p[flag] !== false &&
            d >= String(p.start_date ?? "").slice(0, 10) &&
            (!p.end_date || d <= String(p.end_date).slice(0, 10)),
        );

      const activePeriod =
        periods.find(
          (p) =>
            (checkIn || orderDate) >= String(p.start_date ?? "").slice(0, 10) &&
            (!p.end_date || (checkIn || orderDate) <= String(p.end_date).slice(0, 10)),
        ) ?? null;

      const shared = pickCurrentWhitelist(sharedRes.data ?? [], monthStart);
      const kolWl = pickCurrentWhitelist(kolRes.data ?? [], monthStart);
      const rule = ruleRes.data ?? null;
      const source = String(order.order_source ?? "");
      const status = String(order.order_status ?? "");
      const statusOk = status !== "cancelled" && status !== "hold";

      const rate =
        order.currency_at_booking && String(order.currency_at_booking) !== "TWD"
          ? Number(order.exchange_rate_snapshot ?? 0) || 0
          : 0;
      const toTwd = (v: number) => (rate > 0 ? v / rate : v);
      const gross = toTwd(Number(order.final_price) || 0);
      const excludedAddon = toTwd(
        extractExcludedAddonTotal(
          order.custom_addon_details,
          rule?.commission_excluded_addon_ids ?? null,
          rule?.commission_excluded_addon_types ?? null,
        ),
      );
      const basePrice = Math.max(0, gross - excludedAddon);
      const meta = Array.isArray(order.order_meta) ? order.order_meta[0] : order.order_meta;
      const teamPrice = Number(meta?.team_commission_price ?? 0) || 0;

      setHeader([
        { label: "訂單編號", value: String(order.order_number ?? "") },
        { label: "館別", value: String(order.accommodation_info?.name ?? accId.slice(0, 8)) },
        { label: "訂單日 / 入住日", value: `${orderDate || "—"} / ${checkIn || "—"}` },
        { label: "訂單來源", value: source || "—" },
        { label: "訂單狀態", value: status || "—" },
        {
          label: "金額",
          value:
            rate > 0
              ? `${money(gross)}（原幣 ${order.currency_at_booking}，匯率 ${order.exchange_rate_snapshot}）`
              : money(gross),
        },
      ]);

      const teamGate = statusOk && inPeriod(checkIn || orderDate, "counts_team_bonus");
      const closerGate = statusOk && inPeriod(orderDate, "counts_closer_commission");
      const inShared = shared.includes(source);
      const inKol = kolWl.includes(source);
      const ownerDirect = order.owner_direct === true;
      const basis = String(activePeriod?.payout_basis ?? "include_owner_direct");
      const excludedByBasis = basis === "exclude_owner_direct" && ownerDirect;
      const exemptSource = (rule?.exempt_order_sources ?? []).includes(source);

      const result: StepResult[] = [
        {
          step: "①",
          title: "這筆訂單算不算數？",
          verdict: teamGate || closerGate ? "pass" : "fail",
          lines: [
            { label: "訂單狀態可採計", value: statusOk ? "✓ 是" : `✗ 否（${status}）` },
            {
              label: "合作期間（團隊獎金）",
              value: teamGate ? "✓ 採計" : "✗ 不採計",
            },
            {
              label: "合作期間（成交大師）",
              value: closerGate ? "✓ 採計" : "✗ 不採計",
            },
            {
              label: "生效期間",
              value: activePeriod
                ? `${String(activePeriod.start_date).slice(0, 10)} ~ ${activePeriod.end_date ? String(activePeriod.end_date).slice(0, 10) : "無結束日"}`
                : "未設定合作期間",
            },
          ],
          note: activePeriod ? undefined : "此館別在該日期沒有任何合作期間，所有獎金一律不採計。",
        },
        {
          step: "②",
          title: "用多少金額當基準？",
          verdict: basePrice > 0 && (inShared || inKol) ? "pass" : basePrice > 0 ? "info" : "fail",
          lines: [
            {
              label: "共用來源白名單",
              value: inShared ? "✓ 在清單內" : "✗ 不在清單內（AM／成交組績效不計）",
            },
            {
              label: "獨立來源白名單（專利）",
              value: inKol ? "✓ 在清單內" : "✗ 不在清單內",
            },
            {
              label: "業主自帶（owner_direct）",
              value: ownerDirect ? "是" : "否",
            },
            {
              label: "館別實付口徑",
              value:
                basis === "exclude_owner_direct" ? "排除業主自帶" : "含業主自帶",
            },
            {
              label: "雙軌判定",
              value: excludedByBasis ? "✗ 本筆不計入實付真值" : "✓ 計入實付真值",
            },
            { label: "訂單總額（台幣）", value: money(gross) },
            { label: "扣除不列入抽成的增值服務", value: `- ${money(excludedAddon)}` },
            { label: "計算後基準金額", value: money(basePrice) },
            {
              label: "系統寫入的分潤基準金額",
              value: meta ? money(teamPrice) : "尚未寫入 order_meta",
            },
            {
              label: "營收歸屬口徑",
              value: usesStayRevenue(monthStart)
                ? "入住營收（逐夜攤提）"
                : "舊口徑（訂單日 + 分潤基準金額）",
            },
          ],
          note:
            meta && Math.abs(teamPrice - basePrice) > 1
              ? "系統寫入值與現行規則試算值不一致，可能是規則在訂單成立後才調整。"
              : undefined,
        },
        {
          step: "③",
          title: "分給誰？",
          verdict: "info",
          lines: [
            {
              label: "成交大師（成交組／影音）",
              value: closerGate ? "依訂單歸屬的成交人／影音人員" : "不採計",
            },
            {
              label: "AM 績效／場域",
              value: teamGate && inShared ? "依該館別所轄 AM" : "不採計",
            },
            {
              label: "網紅營銷專利",
              value: teamGate && inKol ? "依專利獎金角色綁定" : "不採計",
            },
            {
              label: "月結免抽成來源",
              value: exemptSource ? "✓ 此來源在免抽成清單內" : "✗ 不在免抽成清單",
            },
          ],
          note: "此步只影響「發給誰」，不改變基準金額。",
        },
        {
          step: "④",
          title: "分多少、何時發？",
          verdict: "info",
          lines: [
            {
              label: "適用抽成費率（月結規則）",
              value: rule ? `${((Number(rule.commission_rate) || 0) * 100).toFixed(2)}%` : "未設定（沿用舊制）",
            },
            {
              label: "抽成門檻",
              value: rule ? money(Number(rule.commission_threshold) || 0) : "—",
            },
            { label: "資料月", value: dataMonth },
            { label: "發放期別", value: `${payoutMonthKeyFromDataMonth(dataMonth)}/10` },
          ],
          note: "實際費率依各獎金項目的費率版本（生效日）決定；已發放者一律以快照為準。",
        },
      ];
      setSteps(result);
    } catch (e: any) {
      setError(e?.message ?? "查詢失敗");
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">試算檢查器：這筆訂單的獎金怎麼算？</CardTitle>
        <CardDescription>
          輸入訂單編號，逐步顯示這筆訂單在每一道判定的結果（合作期間 → 基準金額 → 分給誰 →
          發放期別）。唯讀查詢，不會修改任何資料。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="輸入訂單編號，例如 A3F7K9QD"
            className="max-w-xs"
          />
          <Button onClick={run} disabled={loading || !keyword.trim()}>
            <Search className="mr-1 h-4 w-4" />
            {loading ? "查詢中…" : "追蹤試算"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {header && (
          <div className="grid gap-x-6 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
            {header.map((h) => (
              <div key={h.label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{h.label}</span>
                <span className="tabular-nums text-right">{h.value}</span>
              </div>
            ))}
          </div>
        )}

        {steps?.map((s) => (
          <div key={s.step} className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2">
              <VerdictIcon v={s.verdict} />
              <span className="font-medium">
                {s.step} {s.title}
              </span>
              <Badge
                variant={s.verdict === "fail" ? "destructive" : "outline"}
                className="text-[11px] font-normal"
              >
                {s.verdict === "pass" ? "通過" : s.verdict === "fail" ? "不採計" : "參考"}
              </Badge>
            </div>
            <Separator className="mb-2" />
            <div className="space-y-1 text-sm">
              {s.lines.map((l) => (
                <div key={l.label} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{l.label}</span>
                  <span className="text-right tabular-nums">{l.value}</span>
                </div>
              ))}
            </div>
            {s.note && <p className="mt-2 text-xs text-muted-foreground">{s.note}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
