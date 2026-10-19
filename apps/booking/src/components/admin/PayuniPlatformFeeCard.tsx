import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Button } from "@lakeze/shared/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { FEE_NOTICE, ITEM_STATUS, callFee, ntd } from "@/lib/payuniPlatformFee";

interface MyItem {
  id: string; period: string; amount: number; bal_type: number; status: string; fund_date: string | null;
  orders: Array<{ order_id: string; order_number: string; check_in_date: string; check_out_date: string; revenue: number; fee: number }>;
}

/** 金流稽核：人客多平台費（唯讀，只看自己館；經 payuni-platform-fee-run my_items 讀取；沒有任何紀錄時不顯示） */
export function PayuniPlatformFeeCard({ accommodationId }: { accommodationId: string | null }) {
  const [items, setItems] = useState<MyItem[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!accommodationId) return;
    callFee({ action: "my_items", accommodation_id: accommodationId }).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  }, [accommodationId]);
  if (!accommodationId || items.length === 0) return null;
  return (
    <Card data-testid="payuni-fee-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">人客多平台費</CardTitle>
        <CardDescription>{FEE_NOTICE}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead /><TableHead>月份</TableHead><TableHead>項目</TableHead><TableHead className="text-right">金額</TableHead><TableHead>狀態</TableHead><TableHead>撥款日</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((i) => (
              <Fragment key={i.id}>
                <TableRow data-testid={`payuni-fee-my-${i.period}-${i.bal_type}`}>
                  <TableCell>
                    {i.orders.length > 0 && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(open === i.id ? null : i.id)} data-testid={`payuni-fee-my-expand-${i.period}-${i.bal_type}`}>
                        {open === i.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>{i.period}</TableCell>
                  <TableCell>{i.bal_type === 2 ? "退回（修正）" : "平台費扣款"}</TableCell>
                  <TableCell className="text-right font-medium">{ntd(i.bal_type === 2 ? -i.amount : i.amount)}</TableCell>
                  <TableCell><Badge variant="outline">{ITEM_STATUS[i.status] ?? i.status}</Badge></TableCell>
                  <TableCell>{i.fund_date ?? "—"}</TableCell>
                </TableRow>
                {open === i.id && (
                  <TableRow><TableCell colSpan={6}>
                    <table className="w-full text-xs"><tbody>
                      {i.orders.map((o) => (
                        <tr key={o.order_id}>
                          <td><Link to={`/admin/orders/${o.order_id}`} className="font-mono text-primary hover:underline">{o.order_number}</Link></td>
                          <td>{o.check_in_date}～{o.check_out_date}</td><td className="text-right">當月營收 {ntd(o.revenue)}</td><td className="text-right">平台費 {ntd(o.fee)}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
