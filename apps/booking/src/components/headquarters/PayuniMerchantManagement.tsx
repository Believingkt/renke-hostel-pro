import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { parseFunctionInvokeError } from "@lakeze/shared/utils/parseFunctionError";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lakeze/shared/components/ui/tooltip";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { canSwitchToPayuni, isBindable, merStatusLabel } from "@/lib/payuniMerchantRules";
import { PayuniBindDialog, type PayuniBindAccommodation } from "./PayuniBindDialog";

export interface PayuniAccRow extends PayuniBindAccommodation {
  payuni_mer_id: string | null;
  payuni_mer_status: number | null;
  payuni_member_status: number | null;
  payuni_payment_tools: Record<string, number> | null;
  payment_provider_active: string | null;
  payuni_status_synced_at: string | null;
}

const COLS = "id, name, short_url_alias, address, description, email, phone, payuni_mer_id, payuni_mer_status, payuni_member_status, payuni_payment_tools, payment_provider_active, payuni_status_synced_at";

export function toolBadgeClass(v: unknown): string {
  if (Number(v) === 1) return "bg-green-100 text-green-800 border-green-200";
  if (Number(v) === 9) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-muted text-muted-foreground";
}

export function statusBadgeClass(s: number | null): string {
  if (s === 1) return "bg-green-100 text-green-800 border-green-200";
  if (s === 9 || s === 91) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (s == null) return "bg-muted text-muted-foreground";
  return "bg-red-100 text-red-800 border-red-200";
}

async function invokeStatus(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("payuni-merchant-status", { body });
  if (error) throw new Error((await parseFunctionInvokeError(error)).message);
  return data;
}

function useIsSuperAdmin() {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return setState(false);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "super_admin").limit(1);
      setState((data ?? []).length > 0);
    })();
  }, []);
  return state;
}

export function PayuniMerchantManagement() {
  const isSuper = useIsSuperAdmin();
  const [rows, setRows] = useState<PayuniAccRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bindTarget, setBindTarget] = useState<PayuniAccRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("accommodation_info").select(COLS).order("name");
    if (error) toast.error(`讀取館別失敗：${error.message}`);
    setRows((data ?? []) as unknown as PayuniAccRow[]);
    try {
      const r = await invokeStatus({ action: "list_reasons" });
      setReasons(r?.reasons ?? {});
    } catch (e) {
      console.error("payuni reasons", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isSuper) load(); }, [isSuper, load]);

  const refresh = async (row: PayuniAccRow) => {
    setBusyId(row.id);
    try {
      const r = await invokeStatus({ action: "query", accommodation_id: row.id });
      if (r?.ok) toast.success(`${row.name}：${merStatusLabel(r.payuni_mer_status)}`);
      else toast.error(`查詢失敗：${r?.status ?? ""} ${r?.message ?? ""}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setBusyId(null);
    }
  };

  const switchProvider = async (row: PayuniAccRow, provider: string) => {
    if (provider === row.payment_provider_active) return;
    if (provider === "payuni") {
      const check = canSwitchToPayuni(row.payuni_mer_status, row.payuni_payment_tools);
      if (!check.ok) return toast.error(`無法切換到 PAYUNi：${(check as { reason: string }).reason}`);
    }
    setBusyId(row.id);
    try {
      await invokeStatus({ action: "set_provider", accommodation_id: row.id, provider });
      toast.success(`${row.name} 金流已切換為 ${provider}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切換失敗");
    } finally {
      setBusyId(null);
    }
  };

  if (isSuper === null) return <Loader2 className="h-5 w-5 animate-spin" data-testid="payuni-mgmt-loading" />;
  if (!isSuper) return <p className="text-sm text-muted-foreground" data-testid="payuni-mgmt-forbidden">僅限 super_admin 使用</p>;

  return (
    <Card data-testid="payuni-merchant-management">
      <CardHeader>
        <CardTitle>PAYUNi 金流</CardTitle>
        <CardDescription>建立合作商店、同步審核狀態，商店「啟用」且信用卡或 ATM 開通後才能切換到 PAYUNi</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>館名</TableHead><TableHead>商店代號</TableHead><TableHead>會員狀態</TableHead>
                  <TableHead>商店狀態</TableHead><TableHead>支付工具</TableHead><TableHead>目前金流</TableHead>
                  <TableHead>最近同步</TableHead><TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => <PayuniRow key={row.id} row={row} reason={reasons[row.id]} busy={busyId === row.id}
                  onBind={() => setBindTarget(row)} onRefresh={() => refresh(row)} onSwitch={(p) => switchProvider(row, p)} />)}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </CardContent>
      {bindTarget && (
        <PayuniBindDialog accommodation={bindTarget} open onOpenChange={(o) => { if (!o) setBindTarget(null); }} onDone={load} />
      )}
    </Card>
  );
}

function PayuniRow({ row, reason, busy, onBind, onRefresh, onSwitch }: {
  row: PayuniAccRow; reason?: string; busy: boolean;
  onBind: () => void; onRefresh: () => void; onSwitch: (p: string) => void;
}) {
  const tools = row.payuni_payment_tools ?? {};
  const statusBadge = (
    <Badge variant="outline" className={statusBadgeClass(row.payuni_mer_status)} data-testid={`payuni-status-${row.id}`}>
      {merStatusLabel(row.payuni_mer_status)}
    </Badge>
  );
  return (
    <TableRow data-testid={`payuni-row-${row.id}`}>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="font-mono text-xs" data-testid={`payuni-merid-${row.id}`}>{row.payuni_mer_id ?? "—"}</TableCell>
      <TableCell data-testid={`payuni-member-${row.id}`}>{row.payuni_member_status ?? "—"}</TableCell>
      <TableCell>
        {reason ? (
          <Tooltip><TooltipTrigger asChild><span>{statusBadge}</span></TooltipTrigger><TooltipContent>{reason}</TooltipContent></Tooltip>
        ) : statusBadge}
      </TableCell>
      <TableCell className="space-x-1">
        {["CREDIT", "ForeignCard", "ATM"].map((k) => (
          <Badge key={k} variant="outline" className={toolBadgeClass(tools[k])} data-testid={`payuni-tool-${row.id}-${k}`}>{k}</Badge>
        ))}
      </TableCell>
      <TableCell>
        <Select value={row.payment_provider_active ?? "tappay"} onValueChange={onSwitch} disabled={busy}>
          <SelectTrigger className="w-28" data-testid={`payuni-provider-${row.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tappay">tappay</SelectItem>
            <SelectItem value="payuni">payuni</SelectItem>
            <SelectItem value="none">none</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.payuni_status_synced_at ? new Date(row.payuni_status_synced_at).toLocaleString("zh-TW") : "—"}
      </TableCell>
      <TableCell className="space-x-2 whitespace-nowrap">
        {isBindable(row.payuni_mer_id, row.payuni_mer_status) && (
          <Button size="sm" onClick={onBind} disabled={busy} data-testid={`payuni-bind-${row.id}`}>建店</Button>
        )}
        {row.payuni_mer_id && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy} data-testid={`payuni-refresh-${row.id}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}重新查詢
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
