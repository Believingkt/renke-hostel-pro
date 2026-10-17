import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { parseFunctionInvokeError } from "@lakeze/shared/utils/parseFunctionError";
import { useStaffPermissions } from "@lakeze/shared/hooks/use-staff-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { memberStatusLabel, merStatusLabel } from "@/lib/payuniMerchantRules";

type CardRow = {
  payuni_mer_id: string | null;
  payuni_mer_status: number | null;
  payuni_member_status: number | null;
  payuni_payment_tools: Record<string, number> | null;
};

const TOOL_LABELS: Record<string, string> = { CREDIT: "信用卡", ForeignCard: "國外卡", ATM: "ATM 轉帳", ApplePay: "Apple Pay", GooglePay: "Google Pay" };

/** 民宿後台唯讀卡：PAYUNi 商店代號、狀態與已開通工具（hotel_admin／super_admin 可重新查詢） */
export function PayuniStatusCard({ accommodationId }: { accommodationId: string | null }) {
  const { isStrictAdmin } = useStaffPermissions();
  const [row, setRow] = useState<CardRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accommodationId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("accommodation_info")
      .select("payuni_mer_id, payuni_mer_status, payuni_member_status, payuni_payment_tools")
      .eq("id", accommodationId)
      .maybeSingle();
    setRow((data as unknown as CardRow) ?? null);
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("payuni-merchant-status", {
        body: { action: "query", accommodation_id: accommodationId },
      });
      if (error) throw new Error((await parseFunctionInvokeError(error)).message);
      if (!data?.ok) toast.error(`查詢失敗：${data?.message ?? data?.status ?? ""}`);
      if (data?.provider_changed) toast.warning("商店目前非啟用狀態，線上收款已暫停（金流切回 none），請聯繫人客多總部");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setRefreshing(false);
    }
  };

  const enabledTools = Object.entries(row?.payuni_payment_tools ?? {}).filter(([, v]) => Number(v) === 1).map(([k]) => k);

  return (
    <Card data-testid="payuni-status-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">線上收款（PAYUNi）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : !row?.payuni_mer_id ? (
          <p className="text-muted-foreground" data-testid="payuni-status-card-empty">尚未開通，請聯繫人客多總部</p>
        ) : (
          <>
            <p>商店代號：<span className="font-mono" data-testid="payuni-status-card-merid">{row.payuni_mer_id}</span></p>
            <p>商店狀態：<Badge variant="outline" data-testid="payuni-status-card-status">{merStatusLabel(row.payuni_mer_status)}</Badge></p>
            <p>會員狀態：<span data-testid="payuni-status-card-member">{memberStatusLabel(row.payuni_member_status)}</span></p>
            <p data-testid="payuni-status-card-tools">
              已開通工具：{enabledTools.length > 0 ? enabledTools.map((k) => TOOL_LABELS[k] ?? k).join("、") : "尚無"}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {isStrictAdmin && (
                <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} data-testid="payuni-status-card-refresh">
                  {refreshing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}重新查詢
                </Button>
              )}
              <a href="https://www.payuni.com.tw/login" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" data-testid="payuni-status-card-login">
                登入 PAYUNi 後台 <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
