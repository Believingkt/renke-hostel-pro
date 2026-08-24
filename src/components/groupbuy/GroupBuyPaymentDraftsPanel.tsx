import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const twd = (n: number) => `NT$ ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** Draft 狀態顯示對照（唯讀，僅呈現後端既有狀態，不在此頁變更任何資料） */
const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "付款保留中", variant: "outline" },
  payment_processing: { label: "付款處理中", variant: "secondary" },
  paid: { label: "已付款待轉單", variant: "secondary" },
  converted: { label: "已轉正式訂單", variant: "default" },
  expired: { label: "已逾時釋放", variant: "outline" },
  failed: { label: "付款失敗", variant: "destructive" },
  manual_review: { label: "需人工處理", variant: "destructive" },
  cancelled: { label: "客人已放棄（已釋放房況）", variant: "outline" },
};

interface Props {
  campaignId: string | null;
  accommodationId: string | null;
}

/**
 * 團購「付款保留」後台可視化（唯讀）。
 *
 * Payment Draft 不是正式訂單，因此獨立一個分頁呈現，避免混入訂單對帳造成金額口徑污染。
 * 本面板只做 SELECT，不修改 draft、不釋放保留、不呼叫 TapPay。
 */
export function GroupBuyPaymentDraftsPanel({ campaignId, accommodationId }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!campaignId && !accommodationId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("group_buy_payment_drafts")
        .select(
          "id, status, guest_name, guest_phone, guest_email, check_in_date, check_out_date, room_quantity, amount_to_charge, total_price, expires_at, created_at, converted_order_id, converted_at, refund_status, refunded_amount, last_error",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      q = campaignId ? q.eq("campaign_id", campaignId) : q.eq("accommodation_id", accommodationId!);
      const { data, error } = await q;
      if (error) throw error;
      setRows(data ?? []);
    } catch (e: any) {
      console.error("[group-buy-drafts] load failed", e);
      toast({
        title: "讀取付款保留失敗",
        description: e?.message ?? "請稍後再試",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [campaignId, accommodationId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // 倒數只影響顯示，不影響後端到期判定
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const live = rows.filter(
    (r) => ["pending", "payment_processing"].includes(String(r.status)) && new Date(r.expires_at).getTime() > now,
  );

  const remainText = (iso: string) => {
    const s = Math.floor((new Date(iso).getTime() - now) / 1000);
    if (s <= 0) return "已逾時";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">付款保留（信用卡）</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            旅客進入信用卡付款時建立的 10 分鐘房位保留。保留期間會占用庫存，轉為正式訂單或逾時後自動釋放。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          重新整理
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className="gap-1">
            <Timer className="h-3.5 w-3.5" /> 目前保留中 {live.length} 筆
          </Badge>
          <Badge variant="secondary">總計 {rows.length} 筆</Badge>
        </div>

        {rows.length === 0
          ? <p className="py-6 text-center text-sm text-muted-foreground">目前沒有任何付款保留紀錄。</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-28 whitespace-nowrap py-2">狀態</th>
                    <th className="w-32 whitespace-nowrap py-2">訂房人</th>
                    <th className="w-44 whitespace-nowrap py-2">入住 / 退房</th>
                    <th className="w-24 whitespace-nowrap py-2 text-right">間數</th>
                    <th className="w-32 whitespace-nowrap py-2 text-right">應收金額</th>
                    <th className="w-28 whitespace-nowrap py-2 text-right">剩餘保留</th>
                    <th className="w-40 whitespace-nowrap py-2">建立時間</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const meta = STATUS_META[String(r.status)] ?? { label: String(r.status), variant: "outline" as const };
                    const isLive = ["pending", "payment_processing"].includes(String(r.status));
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </td>
                        <td className="truncate py-2">{r.guest_name}</td>
                        <td className="whitespace-nowrap py-2 tabular-nums">
                          {r.check_in_date} → {r.check_out_date}
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.room_quantity}</td>
                        <td className="py-2 text-right tabular-nums">{twd(r.amount_to_charge)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {isLive ? remainText(r.expires_at) : "—"}
                        </td>
                        <td className="whitespace-nowrap py-2 text-muted-foreground tabular-nums">
                          {new Date(r.created_at).toLocaleString("zh-TW")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

export default GroupBuyPaymentDraftsPanel;
