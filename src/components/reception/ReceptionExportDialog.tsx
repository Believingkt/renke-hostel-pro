import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPaymentStatusConfig, getOrderSourceConfig, getOrderOtaCode } from "@/utils/orderHelpers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accommodationId: string;
  mode: "checkin" | "checkout" | "list";
  targetDate?: string; // yyyy-MM-dd, required for checkin/checkout
  orderIds?: string[]; // required for mode="list"
  titleOverride?: string;
}

interface Row {
  order_number: string;
  order_date: string;
  guest_name: string;
  guest_phone: string;
  customer_name: string;
  nationality: string;
  check_in_date: string;
  check_out_date: string;
  room_info: string;
  adults: number;
  children: string;
  infants: string;
  order_source: string;
  guest_source: string;
  ota_id: string;
  payment_status: string;
  currency: string;
  price: number;
  paid: number;
  unpaid: number;
  addons: string;
  addon_qty: string;
  notes: string;
}

const sourceMap: Record<string, string> = {
  manual: "手動訂單", manual_line: "手動訂單(Line)", website: "官網", line: "Line",
  owlting: "OwlTing", booking: "Booking.com", airbnb: "Airbnb", agoda: "Agoda",
  expedia: "Expedia", trip: "Trip", kol: "KOL 互惠", official_use: "自用",
  owner_provided: "業主提供", accommodation_voucher: "住宿票卷",
};
const labelSource = (s: string | null | undefined) => (s ? (sourceMap[s] || s) : "");

export function ReceptionExportDialog({ open, onOpenChange, accommodationId, mode, targetDate, orderIds, titleOverride }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !accommodationId) return;
    (async () => {
      setLoading(true);
      try {
        let query: any = supabase
          .from("orders")
          .select(`id, order_number, order_date, guest_name, guest_phone, guest_nationality,
                   check_in_date, check_out_date, guest_count, order_source, payment_status,
                   total_price, final_price, paid_amount, notes, ota_channel,
                   owlting_reservation_id, hotelnabe_res_id, meal_plan, meal_plan_total,
                   custom_addon_details, pet_count, pet_plan_price,
                   room_type:room_types(name)`)
          .eq("accommodation_id", accommodationId);
        if (mode === "list") {
          if (!orderIds || orderIds.length === 0) { setRows([]); return; }
          query = query.in("id", orderIds);
        } else {
          const col = mode === "checkin" ? "check_in_date" : "check_out_date";
          query = query.eq(col, targetDate!).neq("order_status", "cancelled");
        }
        const { data: ordersData } = await query.order("order_number", { ascending: true });

        const ids = (ordersData ?? []).map((o: any) => o.id);
        let roomsMap = new Map<string, any[]>();
        let currencyMap = new Map<string, string>();
        if (ids.length) {
          const [{ data: rooms }, { data: meta }] = await Promise.all([
            supabase.from("order_rooms")
              .select("order_id, quantity, room_price, template_name, room_types(name), room_units(unit_number)")
              .in("order_id", ids),
            supabase.from("order_meta")
              .select("order_id, display_currency")
              .in("order_id", ids),
          ]);
          for (const r of rooms ?? []) {
            const arr = roomsMap.get((r as any).order_id) ?? [];
            arr.push(r);
            roomsMap.set((r as any).order_id, arr);
          }
          for (const m of meta ?? []) {
            if ((m as any).display_currency) currencyMap.set((m as any).order_id, (m as any).display_currency);
          }
        }

        const built: Row[] = (ordersData ?? []).map((o: any) => {
          const rooms = roomsMap.get(o.id) ?? [];
          const roomInfo = rooms.length
            ? rooms.map((r: any) => {
                const name = r.room_types?.name ?? "房型";
                const unit = r.room_units?.unit_number ? `/${r.room_units.unit_number}` : "";
                const qty = r.quantity > 1 ? ` x${r.quantity}` : "";
                return `${name}${unit}${qty}`;
              }).join("、")
            : (o.room_type?.name ?? "");

          const customs = Array.isArray(o.custom_addon_details) ? o.custom_addon_details : [];
          const addons: string[] = [];
          const qtys: string[] = [];
          if (o.meal_plan && o.meal_plan !== "none" && (o.meal_plan_total ?? 0) > 0) {
            addons.push(`餐食(${o.meal_plan}) $${o.meal_plan_total}`);
            qtys.push("");
          }
          if ((o.pet_count ?? 0) > 0) {
            addons.push(`寵物 $${o.pet_plan_price ?? 0}`);
            qtys.push(String(o.pet_count));
          }
          for (const c of customs) {
            addons.push(`${c?.name ?? c?.addon_type ?? "加購"} $${Number(c?.total) || 0}`);
            qtys.push(c?.quantity ? String(c.quantity) : "");
          }

          const price = o.final_price ?? 0;
          const paid = o.paid_amount ?? 0;
          const ota = getOrderOtaCode(o) || o.ota_channel || "";

          return {
            order_number: o.order_number,
            order_date: o.order_date ? format(new Date(o.order_date), "yyyy-MM-dd HH:mm:ss") : "",
            guest_name: o.guest_name ?? "",
            guest_phone: o.guest_phone ?? "",
            customer_name: o.guest_name ?? "",
            nationality: o.guest_nationality ?? "",
            check_in_date: o.check_in_date,
            check_out_date: o.check_out_date,
            room_info: roomInfo,
            adults: o.guest_count ?? 0,
            children: "",
            infants: "",
            order_source: labelSource(o.order_source),
            guest_source: getOrderSourceConfig(o.order_source, ota).label,
            ota_id: o.owlting_reservation_id || o.hotelnabe_res_id || "",
            payment_status: getPaymentStatusConfig(o.payment_status).label,
            currency: currencyMap.get(o.id) || "TWD",
            price,
            paid,
            unpaid: price - paid,
            addons: addons.join("\n"),
            addon_qty: qtys.join("\n"),
            notes: o.notes ?? "",
          };
        });

        setRows(built);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, accommodationId, mode, targetDate]);

  const title = `[${mode === "checkin" ? "入住日期" : "退房日期"}] ${targetDate} ${mode === "checkin" ? "入住" : "退房"}訂單列表`;

  const columns: { key: keyof Row; label: string; align?: string }[] = [
    { key: "order_number", label: "訂單編號" },
    { key: "order_date", label: "訂購日期" },
    { key: "guest_name", label: "訂購人" },
    { key: "guest_phone", label: "訂購人電話" },
    { key: "check_in_date", label: "入住時間" },
    { key: "check_out_date", label: "退房時間" },
    { key: "room_info", label: "房型/房號" },
    { key: "adults", label: "成人", align: "right" },
    
    { key: "guest_source", label: "顧客來源" },
    { key: "payment_status", label: "付款狀態" },
    { key: "currency", label: "幣別" },
    { key: "price", label: "價格", align: "right" },
    { key: "paid", label: "已收", align: "right" },
    { key: "unpaid", label: "未收", align: "right" },
    { key: "addons", label: "加購商品" },
    { key: "addon_qty", label: "數量" },
    { key: "notes", label: "訂單備註" },
  ];

  const download = () => {
    const data = rows.map((r) => {
      const o: any = {};
      for (const c of columns) o[c.label] = (r as any)[c.key];
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = columns.map((c) => ({ wch: Math.min(Math.max(c.label.length + 2, 10), 40) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === "checkin" ? "入住訂單" : "退房訂單");
    XLSX.writeFile(wb, `${mode === "checkin" ? "入住" : "退房"}訂單_${targetDate}.xlsx`);
  };

  const printPreview = () => {
    const win = window.open("", "_blank", "width=1400,height=800");
    if (!win) return;
    const tableHtml = `
      <html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{font-family:sans-serif;padding:20px;}
        h2{text-align:center;}
        table{border-collapse:collapse;width:100%;font-size:12px;}
        th,td{border:1px solid #999;padding:6px 8px;vertical-align:top;white-space:pre-wrap;}
        th{background:#f3f3f3;}
        .right{text-align:right;}
      </style></head><body>
      <h2>${title}</h2>
      <table>
        <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${columns.map(c => `<td class="${c.align === "right" ? "right" : ""}">${(r as any)[c.key] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <script>window.onload=()=>window.print();</script>
      </body></html>`;
    win.document.write(tableHtml);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">載入中…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">沒有可預覽的訂單</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key as string} className="border px-2 py-1.5 text-left font-medium whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => (
                      <td key={c.key as string} className={`border px-2 py-1.5 align-top whitespace-pre-wrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {typeof (r as any)[c.key] === "number"
                          ? ((r as any)[c.key] as number).toLocaleString()
                          : (r as any)[c.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={printPreview} disabled={rows.length === 0} className="gap-2">
            <Printer className="h-4 w-4" /> 列印
          </Button>
          <Button onClick={download} disabled={rows.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> 下載 Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
