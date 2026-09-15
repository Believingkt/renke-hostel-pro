import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingBag } from "lucide-react";

interface AddonRow {
  id: string;
  sale_date: string;
  item_name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");

export function OrderAddonSalesCard({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<AddonRow[]>([]);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("addon_sales")
        .select("id, sale_date, item_name, category, quantity, unit_price, total_amount, notes")
        .eq("related_order_id", orderId)
        .order("sale_date", { ascending: true });
      if (!cancelled) setRows((data || []) as AddonRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-lg flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          購物商品（非訂房收入）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 text-sm border-b last:border-b-0 pb-2 last:pb-0">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {r.item_name}
                {r.category ? <span className="ml-2 text-xs text-muted-foreground">{r.category}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.sale_date} · {r.quantity} × NT$ {fmt(r.unit_price)}
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            </div>
            <span className="tabular-nums font-medium whitespace-nowrap">NT$ {fmt(r.total_amount)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 text-sm">
          <span className="text-muted-foreground">合計（不計入訂單金額，不列入平台抽成）</span>
          <span className="tabular-nums font-semibold">NT$ {fmt(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
