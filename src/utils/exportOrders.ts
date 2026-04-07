import * as XLSX from "xlsx";
import { format } from "date-fns";
import { Order } from "@/types/order";
import { getOrderStatusConfig, getPaymentStatusConfig, getOrderSourceConfig, getEffectivePaymentStatus } from "@/utils/orderHelpers";
import { supabase } from "@/integrations/supabase/client";

interface OrderRoom {
  order_id: string;
  room_type_id: string;
  quantity: number;
  room_price: number;
  template_name: string | null;
  room_types?: { name: string } | null;
}

export async function exportOrdersToExcel(orders: Order[], filename?: string) {
  // Fetch order_rooms for all orders
  const orderIds = orders.map(o => o.id);
  let allOrderRooms: OrderRoom[] = [];
  
  // Batch fetch in chunks of 50 to avoid query limits
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const { data } = await supabase
      .from("order_rooms")
      .select("order_id, room_type_id, quantity, room_price, template_name, room_types(name)")
      .in("order_id", chunk);
    if (data) allOrderRooms = allOrderRooms.concat(data as unknown as OrderRoom[]);
  }

  // Group by order_id
  const roomsByOrder = new Map<string, OrderRoom[]>();
  for (const r of allOrderRooms) {
    const list = roomsByOrder.get(r.order_id) || [];
    list.push(r);
    roomsByOrder.set(r.order_id, list);
  }

  const data = orders.map((order) => {
    const effectivePayment = getEffectivePaymentStatus(order.payment_status, order.payment_link_created_at);
    const rooms = roomsByOrder.get(order.id) || [];
    
    // Build room details string
    let roomInfo = order.room_types?.name || "";
    if (rooms.length > 0) {
      roomInfo = rooms.map(r => {
        const name = r.room_types?.name || "未知房型";
        const tpl = r.template_name ? `(${r.template_name})` : "";
        return `${name}${tpl} x${r.quantity} $${r.room_price}`;
      }).join("、");
    }

    return {
      "訂單編號": order.order_number,
      "訂購時間": format(new Date(order.order_date), "yyyy-MM-dd HH:mm"),
      "訂購人": order.guest_name,
      "電話": order.guest_phone,
      "Email": order.guest_email || "",
      "房型明細": roomInfo,
      "入住日期": order.check_in_date,
      "退房日期": order.check_out_date,
      "人數": order.guest_count,
      "原始金額": order.total_price,
      "折扣金額": order.discount_amount,
      "折扣碼": order.discount_code || "",
      "實收金額": order.final_price,
      "訂金": order.deposit_amount,
      "已付金額": order.paid_amount,
      "來源": getOrderSourceConfig(order.order_source).label,
      "訂單狀態": getOrderStatusConfig(order.order_status).label,
      "付款狀態": getPaymentStatusConfig(effectivePayment).label,
      "備註": order.notes || "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto column widths
  const colWidths = Object.keys(data[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...data.map((row) => String((row as any)[key] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "訂單");

  const defaultName = `訂單匯出_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
  XLSX.writeFile(wb, filename || defaultName);
}
