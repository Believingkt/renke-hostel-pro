import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pickRateVersion, groupRatesByProject, type FranchiseRateRow } from "@/lib/franchiseRates";

/**
 * 加盟分潤「校驗盤點」— 純唯讀。
 * 只讀取資料、在瀏覽器端重算並比對，不寫入 / 不修改任何既有訂單資料。
 *
 * 內部單：嚴格比對 commission_amount / leader_amount 是否等於
 *        plan_price × 依 sold_at 生效版本費率（依下線人數階梯）。
 * 外部單：total_amount 嚴格比對（= unit_count × plan_price）；
 *        sales_bonus 系列只檢查「合計是否超過 total_amount × 20% 上限」與「是否未填(NULL)」。
 */

const EXTERNAL_BONUS_CAP_RATE = 0.2;

interface InternalIssue {
  id: string;
  member_number: string | null;
  customer_name: string;
  sold_at: string | null;
  plan_price: number;
  effective_from: string | null;
  currentCommission: number | null;
  expectedCommission: number | null;
  currentLeader: number | null;
  expectedLeader: number | null;
  note: string;
}

interface ExternalIssue {
  id: string;
  project_name: string;
  signed_at: string | null;
  customer_name: string;
  total_amount: number | null;
  expectedTotal: number;
  bonusSum: number;
  cap: number;
  kinds: string[];
}

interface AuditResult {
  internalTotal: number;
  internalUnverifiable: number;
  internalIssues: InternalIssue[];
  externalTotal: number;
  externalTotalMismatch: ExternalIssue[];
  externalOverCap: ExternalIssue[];
  externalNullBonus: ExternalIssue[];
}

export default function FranchiseCommissionAuditDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const runAudit = async () => {
    setLoading(true);
    try {
      const [ratesRes, internalRes, externalRes, teamRes] = await Promise.all([
        (supabase as any).from("franchise_commission_settings").select("*"),
        supabase
          .from("franchise_orders")
          .select(
            "id,member_number,customer_name,plan_price,sold_by,team_leader,commission_rate,leader_rate,commission_amount,leader_amount,sold_at",
          ),
        supabase
          .from("franchise_external_orders")
          .select(
            "id,project_name,signed_at,customer_name,unit_count,plan_price,total_amount,sales_bonus,co_sales_name,co_sales_bonus,co_sales_name2,co_sales_bonus2",
          ),
        supabase.from("franchise_team_settings").select("member_id,direct_leader_id"),
      ]);

      const rates = (ratesRes.data ?? []) as FranchiseRateRow[];
      const internalVersions = rates.filter((r) => r.type === "internal");
      const externalByProject = groupRatesByProject(rates.filter((r) => r.type === "external"));
      const teamRows = (teamRes.data ?? []) as Array<{
        member_id: string;
        direct_leader_id: string | null;
      }>;
      const leaderOf = new Map<string, string | null>();
      teamRows.forEach((t) => leaderOf.set(t.member_id, t.direct_leader_id));
      const downlineCount = (memberId: string) =>
        teamRows.filter((t) => t.direct_leader_id === memberId).length;

      // ---- 內部單 ----
      const internalOrders = (internalRes.data ?? []) as any[];
      const internalIssues: InternalIssue[] = [];
      let internalUnverifiable = 0;

      for (const o of internalOrders) {
        const version = pickRateVersion(internalVersions, o.sold_at);
        const planPrice = Number(o.plan_price ?? 0);
        let note = "";
        let expectedRate: number | null = null;
        let expectedLeaderRate: number | null = null;

        if (!version) {
          note = "找不到對應生效版本費率";
        } else if (!o.sold_by) {
          // 無銷售人 → 無法依下線人數重算階梯，退回以訂單既存費率驗算金額
          internalUnverifiable += 1;
          note = "未填銷售人，僅以訂單既存費率驗算金額";
          expectedRate = o.commission_rate == null ? null : Number(o.commission_rate);
          expectedLeaderRate = o.leader_rate == null ? null : Number(o.leader_rate);
        } else {
          const n = downlineCount(o.sold_by);
          expectedRate =
            n >= 2
              ? Number(version.tier2_rate ?? 0.13)
              : n === 1
                ? Number(version.tier1_rate ?? 0.11)
                : Number(version.base_rate ?? 0.1);
          const directLeader = leaderOf.get(o.sold_by) ?? null;
          expectedLeaderRate = directLeader ? Number(version.leader_override_rate ?? 0.035) : 0;
        }

        const expectedCommission =
          expectedRate == null ? null : Math.round(planPrice * expectedRate);
        const expectedLeader =
          expectedLeaderRate == null ? null : Math.round(planPrice * expectedLeaderRate);
        const curC = o.commission_amount == null ? null : Number(o.commission_amount);
        const curL = o.leader_amount == null ? null : Number(o.leader_amount);

        const mismatch =
          (expectedCommission != null && curC !== expectedCommission) ||
          (expectedLeader != null && curL !== expectedLeader) ||
          expectedRate == null;

        if (mismatch) {
          internalIssues.push({
            id: o.id,
            member_number: o.member_number ?? null,
            customer_name: o.customer_name,
            sold_at: o.sold_at ?? null,
            plan_price: planPrice,
            effective_from: version?.effective_from ?? null,
            currentCommission: curC,
            expectedCommission,
            currentLeader: curL,
            expectedLeader,
            note,
          });
        }
      }

      // ---- 外部單 ----
      const externalOrders = (externalRes.data ?? []) as any[];
      const externalTotalMismatch: ExternalIssue[] = [];
      const externalOverCap: ExternalIssue[] = [];
      const externalNullBonus: ExternalIssue[] = [];

      for (const o of externalOrders) {
        const expectedTotal = (Number(o.unit_count) || 0) * (Number(o.plan_price) || 0);
        const total = o.total_amount == null ? null : Number(o.total_amount);
        const bonusSum =
          Number(o.sales_bonus ?? 0) + Number(o.co_sales_bonus ?? 0) + Number(o.co_sales_bonus2 ?? 0);
        const cap = Math.round(expectedTotal * EXTERNAL_BONUS_CAP_RATE);
        const base: ExternalIssue = {
          id: o.id,
          project_name: o.project_name,
          signed_at: o.signed_at ?? null,
          customer_name: o.customer_name,
          total_amount: total,
          expectedTotal,
          bonusSum,
          cap,
          kinds: [],
        };

        if (total !== expectedTotal) {
          externalTotalMismatch.push({ ...base, kinds: ["total_amount 不符"] });
        }
        if (bonusSum > cap) {
          externalOverCap.push({ ...base, kinds: ["獎金合計超過 20% 上限"] });
        }
        const nulls: string[] = [];
        if (o.sales_bonus == null) nulls.push("sales_bonus 未填");
        if ((o.co_sales_name ?? "").trim() && o.co_sales_bonus == null) nulls.push("co_sales_bonus 未填");
        if ((o.co_sales_name2 ?? "").trim() && o.co_sales_bonus2 == null)
          nulls.push("co_sales_bonus2 未填");
        if (nulls.length > 0) externalNullBonus.push({ ...base, kinds: nulls });

        // 供未來擴充：外部單費率版本（依 signed_at）目前僅用於新增時自動試算
        void pickRateVersion(externalByProject[(o.project_name ?? "").trim()], o.signed_at);
      }

      setResult({
        internalTotal: internalOrders.length,
        internalUnverifiable,
        internalIssues,
        externalTotal: externalOrders.length,
        externalTotalMismatch,
        externalOverCap,
        externalNullBonus,
      });
    } catch (e) {
      toast.error("盤點失敗：" + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderExternalTable = (title: string, list: ExternalIssue[]) => (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {title}
        <Badge variant={list.length ? "destructive" : "secondary"} className="ml-2">
          {list.length}
        </Badge>
      </div>
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>訂單 ID</TableHead>
                <TableHead>簽約日</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead className="text-right">total_amount</TableHead>
                <TableHead className="text-right">應為</TableHead>
                <TableHead className="text-right">獎金合計 / 上限</TableHead>
                <TableHead>異常類型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={`${title}-${r.id}`}>
                  <TableCell className="font-mono">{r.id}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.signed_at ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.customer_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total_amount ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.expectedTotal}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.bonusSum} / {r.cap}
                  </TableCell>
                  <TableCell>{r.kinds.join("、")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !result) void runAudit();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardCheck className="h-4 w-4 mr-1" />
          校驗盤點
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>加盟分潤金額校驗盤點（唯讀）</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          此功能僅讀取資料並重算比對，不會修改任何訂單金額。費率版本依訂單日期（內部單 sold_at／外部單
          signed_at）選取當時生效的版本。
        </p>

        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => void runAudit()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            重新盤點
          </Button>
        </div>

        {loading && !result && (
          <div className="py-10 text-center text-sm text-muted-foreground">盤點中…</div>
        )}

        {result && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                內部單（共 {result.internalTotal} 筆，其中 {result.internalUnverifiable}{" "}
                筆未填銷售人無法重算階梯）
              </h3>
              <div className="text-sm">
                不一致筆數：
                <Badge
                  variant={result.internalIssues.length ? "destructive" : "secondary"}
                  className="ml-2"
                >
                  {result.internalIssues.length}
                </Badge>
              </div>
              {result.internalIssues.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>訂單 ID</TableHead>
                        <TableHead>成交日</TableHead>
                        <TableHead>客戶</TableHead>
                        <TableHead className="text-right">方案金額</TableHead>
                        <TableHead>生效版本</TableHead>
                        <TableHead className="text-right">個人獎金 現值/應為</TableHead>
                        <TableHead className="text-right">隊長獎金 現值/應為</TableHead>
                        <TableHead>備註</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.internalIssues.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono">{r.id}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.sold_at ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.customer_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.plan_price}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.effective_from ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.currentCommission ?? "—"} / {r.expectedCommission ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.currentLeader ?? "—"} / {r.expectedLeader ?? "—"}
                          </TableCell>
                          <TableCell>{r.note}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">外部單（共 {result.externalTotal} 筆）</h3>
              {renderExternalTable("total_amount 異常", result.externalTotalMismatch)}
              {renderExternalTable("獎金合計超過 20% 上限", result.externalOverCap)}
              {renderExternalTable("獎金欄位未填（NULL）", result.externalNullBonus)}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
