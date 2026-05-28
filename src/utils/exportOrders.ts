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
  // Fetch order_rooms + addon data for all orders
  const orderIds = orders.map(o => o.id);
  let allOrderRooms: OrderRoom[] = [];
  const addonByOrder = new Map<string, {
    meal_plan: string | null;
    meal_plan_details: any;
    meal_plan_total: number | null;
    custom_addon_details: any;
    pet_count: number | null;
    pet_plan_price: number | null;
  }>();

  // Batch fetch in chunks of 50 to avoid query limits
  for (let i = 0; i < orderIds.length; i += 50) {
    const chunk = orderIds.slice(i, i + 50);
    const [{ data: roomsData }, { data: addonData }] = await Promise.all([
      supabase
        .from("order_rooms")
        .select("order_id, room_type_id, quantity, room_price, template_name, room_types(name)")
        .in("order_id", chunk),
      supabase
        .from("orders")
        .select("id, meal_plan, meal_plan_details, meal_plan_total, custom_addon_details, pet_count, pet_plan_price")
        .in("id", chunk),
    ]);
    if (roomsData) allOrderRooms = allOrderRooms.concat(roomsData as unknown as OrderRoom[]);
    if (addonData) {
      for (const a of addonData as any[]) addonByOrder.set(a.id, a);
    }
  }

  // Group by order_id
  const roomsByOrder = new Map<string, OrderRoom[]>();
  for (const r of allOrderRooms) {
    const list = roomsByOrder.get(r.order_id) || [];
    list.push(r);
    roomsByOrder.set(r.order_id, list);
  }

  const parseExtraAmount = (notes: string | null): number => {
    if (!notes) return 0;
    const m = notes.match(/【額外現場加購金額[^】]*】\n?(\d+)\n?【額外現場加購金額END】/);
    return m ? (parseInt(m[1], 10) || 0) : 0;
  };
  const parseAddonNote = (notes: string | null): string => {
    if (!notes) return "";
    const blocks = [...notes.matchAll(/【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】/g)];
    if (blocks.length > 0) return blocks[blocks.length - 1][1].trim();
    const m = notes.match(/^【(?:加購備註|額外現場加購備註)[^】]*】(.*)$/m);
    return m ? m[1].trim() : "";
  };
  const cleanNotes = (notes: string | null): string => {
    if (!notes) return "";
    return notes
      .replace(/【(?:加購備註|額外現場加購備註)[^】]*】\n?[\s\S]*?\n?【(?:加購備註|額外現場加購備註)END】\n?/g, "")
      .replace(/【額外現場加購金額[^】]*】\n?[\s\S]*?\n?【額外現場加購金額END】\n?/g, "")
      .trim();
  };

  const data = orders.map((order) => {
    const effectivePayment = getEffectivePaymentStatus(order.payment_status, order.payment_link_created_at);
    const rooms = roomsByOrder.get(order.id) || [];
    const addon = addonByOrder.get(order.id);

    // Build room details string
    let roomInfo = order.room_types?.name || "";
    if (rooms.length > 0) {
      roomInfo = rooms.map(r => {
        const name = r.room_types?.name || "未知房型";
        const tpl = r.template_name ? `(${r.template_name})` : "";
        return `${name}${tpl} x${r.quantity} $${r.room_price}`;
      }).join("、");
    }

    // Build addon content & subtotal (mirrors OrderDetail logic)
    const addonItems: string[] = [];
    const customs = Array.isArray(addon?.custom_addon_details) ? (addon!.custom_addon_details as any[]) : [];
    const petFromCustom = customs.filter(d => d?.addon_type === 'pet').reduce((s, d) => s + (Number(d?.total) || 0), 0);
    const mealFromCustom = customs.filter(d => d?.addon_type === 'meal').reduce((s, d) => s + (Number(d?.total) || 0), 0);
    const otherCustoms = customs.filter(d => d?.addon_type !== 'pet' && d?.addon_type !== 'meal');
    const petTotal = (addon?.pet_plan_price || 0) > 0 ? (addon!.pet_plan_price as number) : petFromCustom;
    const mealTotal = (addon?.meal_plan_total || 0) > 0 ? (addon!.meal_plan_total as number) : mealFromCustom;

    if (mealTotal > 0) {
      const label = addon?.meal_plan && addon.meal_plan !== "none" ? `餐食(${addon.meal_plan})` : "餐食";
      addonItems.push(`${label} $${mealTotal}`);
    }
    if ((addon?.pet_count || 0) > 0 || petTotal > 0) {
      addonItems.push(`寵物 x${addon?.pet_count || 0} $${petTotal}`);
    }
    for (const c of otherCustoms) {
      const name = c?.name || c?.addon_type || "加購";
      const qty = c?.quantity ? ` x${c.quantity}` : "";
      addonItems.push(`${name}${qty} $${Number(c?.total) || 0}`);
    }
    const addonSubtotal = mealTotal + petTotal + otherCustoms.reduce((s, d) => s + (Number(d?.total) || 0), 0);

    const extraAmount = parseExtraAmount(order.notes);
    const extraNote = parseAddonNote(order.notes);

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
      "加購內容": addonItems.join("、"),
      "加購小計": addonSubtotal,
      "額外現場加購金額": extraAmount,
      "額外現場加購備註": extraNote,
      "來源": getOrderSourceConfig(order.order_source).label,
      "訂單狀態": getOrderStatusConfig(order.order_status).label,
      "付款狀態": getPaymentStatusConfig(effectivePayment).label,
      "備註": cleanNotes(order.notes),
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
