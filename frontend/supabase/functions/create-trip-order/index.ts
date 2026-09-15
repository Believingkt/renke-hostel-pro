// create-trip-order
// 行程商品「獨立購買」：不需要住宿訂單、不需要認領。
// 於後端重算金額（不信任前端價格）、預扣行程名額（防超賣）、建立一筆未付款訂單，
// 前端接著導向既有 /pay/order（TapPay 信用卡 / ATM）完成付款，金流不另建一套。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface ItemInput {
  product_id: string;
  count: number;
}

interface Body {
  items: ItemInput[];
  tripId?: string | null;
  guest: { name: string; phone: string; email?: string | null };
  memberId?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pickName(name: unknown): string {
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const n = name as Record<string, string>;
    return n["zh-TW"] || n.zh || n.en || n.ja || Object.values(n)[0] || "行程項目";
  }
  return "行程項目";
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as Body;
    const items = (body.items ?? []).filter((i) => i?.product_id && Number(i.count) > 0);
    if (!items.length) return json({ success: false, message: "購物車沒有行程項目" }, 400);

    const guestName = (body.guest?.name ?? "").trim();
    const guestPhone = (body.guest?.phone ?? "").trim();
    const guestEmail = (body.guest?.email ?? "").trim();
    if (!guestName || !guestPhone) return json({ success: false, message: "請填寫姓名與電話" }, 400);
    if (guestEmail && !EMAIL_RE.test(guestEmail)) {
      return json({ success: false, message: "Email 格式不正確" }, 400);
    }

    // 會員身分（可選）：有帶 Authorization 就掛在會員帳號下
    let memberId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = userData?.user?.id ?? null;
      if (uid) {
        const { data: member } = await admin
          .from("platform_members")
          .select("id")
          .eq("user_id", uid)
          .maybeSingle();
        memberId = member?.id ?? null;
      }
    }

    const ids = [...new Set(items.map((i) => i.product_id))];
    const { data: products, error: prodError } = await admin
      .from("trip_products")
      .select("id, name, type, price, stock, is_active, accommodation_id")
      .in("id", ids);
    if (prodError) return json({ success: false, message: "讀取行程項目失敗" }, 500);

    const map = new Map((products ?? []).map((p) => [p.id, p]));
    let total = 0;
    let accommodationId: string | null = null;
    const lines: Record<string, unknown>[] = [];

    for (const item of items) {
      const p = map.get(item.product_id);
      if (!p || p.is_active === false) {
        return json({ success: false, message: "行程項目已下架，請重新選擇" }, 409);
      }
      const count = Math.max(1, Math.floor(Number(item.count)));
      if (p.stock !== null && Number(p.stock) < count) {
        return json({ success: false, message: "行程項目名額不足，請調整數量" }, 409);
      }
      const unit = Math.round(Number(p.price));
      const lineTotal = unit * count;
      total += lineTotal;
      if (!accommodationId && p.accommodation_id) accommodationId = p.accommodation_id as string;
      lines.push({
        source: "trip_product",
        product_id: p.id,
        addon_type: `trip_${p.id}`,
        count,
        price_per_unit: unit,
        pricing_mode: "per_stay",
        total: lineTotal,
        unit_label: "份",
        name: pickName(p.name),
      });
    }

    if (total <= 0) return json({ success: false, message: "金額不正確" }, 400);

    // 行程商品未綁館別時，用可付款的預設館別承載訂單（金流設定以館別為單位）
    if (!accommodationId) {
      const { data: fallback } = await admin
        .from("accommodation_info")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      accommodationId = fallback?.id ?? null;
    }
    if (!accommodationId) return json({ success: false, message: "找不到可付款的館別設定" }, 500);

    // 行程訂單不佔房：room_type_id 留空、room_quantity = 0
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 86400000);

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert([{
        accommodation_id: accommodationId,
        room_type_id: null,
        room_quantity: 0,
        member_id: memberId,
        order_number: "",
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_email: guestEmail || null,
        check_in_date: iso(today),
        check_out_date: iso(tomorrow),
        guest_count: 1,
        total_price: total,
        final_price: total,
        discount_amount: 0,
        paid_amount: 0,
        deposit_amount: 0,
        deposit_required_amount: 0,
        payment_status: "unpaid",
        order_status: "pending",
        order_source: "website",
        custom_addon_details: lines,
        notes: "[行程商品獨立訂單]",
        payment_link_created_at: new Date().toISOString(),
      }])
      .select("id, order_number, final_price")
      .single();

    if (orderError || !order) {
      console.error("[create-trip-order] insert failed:", orderError);
      return json({ success: false, message: "建立行程訂單失敗，請稍後再試" }, 500);
    }

    // 行程訂單不涉及房間庫存，避免誤觸 OTA 房況／訂單推送
    await admin
      .from("owlting_order_push_queue")
      .update({ status: "skipped" })
      .eq("order_id", order.id)
      .in("status", ["pending", "sending"]);

    // 預扣行程名額（既有機制，防超賣）
    const { data: consumed, error: consumeError } = await admin.rpc("consume_trip_product_stock", {
      p_items: items.map((i) => ({ product_id: i.product_id, count: Math.max(1, Math.floor(Number(i.count))) })),
    });
    if (consumeError || (consumed as { ok?: boolean } | null)?.ok === false) {
      await admin.from("orders").delete().eq("id", order.id);
      return json({ success: false, message: "行程項目名額不足，請調整數量" }, 409);
    }

    if (body.tripId) {
      await admin
        .from("order_meta")
        .upsert({ order_id: order.id, trip_id: body.tripId }, { onConflict: "order_id" });
    }

    return json({
      success: true,
      order_number: order.order_number,
      order_id: order.id,
      amount: order.final_price,
      accommodation_id: accommodationId,
    });
  } catch (e) {
    console.error("[create-trip-order] fatal:", e);
    return json({ success: false, message: "伺服器錯誤" }, 500);
  }
});
