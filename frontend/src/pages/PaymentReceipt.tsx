/**
 * /payment-receipt — 已扣款訂單的付款收據（A4 版面，可直接列印或另存為 PDF）
 * 資料來源與付款狀態頁一致：get-public-order Edge Function。
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Addon = { name?: string; label?: string; quantity?: number; qty?: number; price?: number; amount?: number };

export default function PaymentReceipt() {
  const [params] = useSearchParams();
  const orderNumber = (params.get("order") || "").trim();
  const accommodationId = params.get("acc") || undefined;
  const autoPrint = params.get("print") === "1";

  const [order, setOrder] = useState<any>(null);
  const [acc, setAcc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderNumber) return;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("get-public-order", {
          body: { order_number: orderNumber, accommodation_id: accommodationId },
        });
        if (fnError) throw fnError;
        if (!data?.order) throw new Error("查無此訂單");
        setOrder(data.order);
        setAcc(data.accommodation ?? { name: data.accommodation_name });
      } catch {
        setError("查無此訂單，無法產生收據");
      }
    })();
  }, [orderNumber, accommodationId]);

  const charged = order && (order.room_charge_status === "charged" || order.payment_status === "paid");

  useEffect(() => {
    if (autoPrint && charged) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [autoPrint, charged]);

  const addons: Addon[] = Array.isArray(order?.custom_addon_details) ? order.custom_addon_details : [];
  const money = (n: number | null | undefined) => `NT$ ${Number(n || 0).toLocaleString()}`;

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur print:hidden">
        <Link
          to={`/payment-status?order=${encodeURIComponent(orderNumber)}`}
          aria-label="返回"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-bold text-foreground">付款收據</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => window.print()} disabled={!charged}>
            <Download className="mr-1.5 h-4 w-4" />
            下載 PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 print:p-0">
        {error && <p className="py-10 text-center text-sm text-destructive">{error}</p>}
        {!error && !order && <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>}

        {order && !charged && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            此訂單尚未完成扣款，扣款完成後即可下載收據。
          </p>
        )}

        {order && charged && (
          <article className="rounded-xl border border-border bg-background p-8 shadow-sm print:border-0 print:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">付款收據 Payment Receipt</h2>
                <p className="mt-1 text-sm text-muted-foreground">訂單編號：{order.order_number}</p>
                <p className="text-sm text-muted-foreground">
                  開立日期：
                  {new Date(order.room_charge_at || Date.now()).toLocaleDateString("zh-TW")}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-foreground">{acc?.name || "—"}</p>
                {acc?.address && <p className="text-muted-foreground">{acc.address}</p>}
                {acc?.phone && <p className="text-muted-foreground">{acc.phone}</p>}
              </div>
            </div>

            <section className="grid grid-cols-2 gap-4 py-5 text-sm">
              <div>
                <p className="text-muted-foreground">訂房人</p>
                <p className="font-medium text-foreground">{order.guest_name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">聯絡信箱</p>
                <p className="font-medium text-foreground">{order.guest_email || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">入住 / 退房</p>
                <p className="font-medium text-foreground">
                  {order.check_in_date} → {order.check_out_date}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">人數 / 房間數</p>
                <p className="font-medium text-foreground">
                  {order.guest_count ?? "—"} 人 / {order.room_quantity ?? 1} 間
                </p>
              </div>
            </section>

            <table className="w-full table-fixed border-t border-border text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-2 text-left font-normal">項目</th>
                  <th className="py-2 text-right font-normal">金額</th>
                </tr>
              </thead>
              <tbody className="border-t border-border">
                <tr>
                  <td className="py-2 text-foreground">住宿費用</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{money(order.total_price)}</td>
                </tr>
                {addons.map((a, i) => (
                  <tr key={i}>
                    <td className="py-2 text-foreground">
                      加購：{a.name || a.label || "項目"}
                      {a.quantity || a.qty ? ` ×${a.quantity ?? a.qty}` : ""}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">{money(a.amount ?? a.price)}</td>
                  </tr>
                ))}
                {Number(order.discount_amount || 0) > 0 && (
                  <tr>
                    <td className="py-2 text-foreground">
                      折扣{order.discount_code ? `（${order.discount_code}）` : ""}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      -{money(order.discount_amount)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-border">
                <tr>
                  <td className="py-3 font-semibold text-foreground">實收總額</td>
                  <td className="py-3 text-right text-lg font-bold tabular-nums text-primary">
                    {money(order.paid_amount || order.final_price)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <section className="mt-5 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
              <p>付款方式：{order.payment_method || "信用卡"}</p>
              <p>
                扣款時間：
                {order.room_charge_at ? new Date(order.room_charge_at).toLocaleString("zh-TW") : "—"}
              </p>
              {order.room_charge_rec_trade_id && <p>交易編號：{order.room_charge_rec_trade_id}</p>}
              <p className="pt-3 text-xs">本收據由系統自動產生，供付款紀錄核對之用，不作為統一發票使用。</p>
            </section>
          </article>
        )}
      </main>
    </div>
  );
}
