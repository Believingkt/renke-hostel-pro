import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

const ORDER_FIELDS =
  "order_number, accommodation_id, guest_name, guest_phone, guest_email, check_in_date, check_out_date, guest_count, order_status, payment_status, final_price, paid_amount, order_source, order_date, notes";

export default defineTool({
  name: "list_orders",
  title: "查詢訂單",
  description:
    "List bookings for the signed-in user's accommodations. Filter by accommodation, check-in date range, order status and guest keyword.",
  inputSchema: {
    accommodation_id: z.string().uuid().optional().describe("Accommodation UUID from list_accommodations."),
    check_in_from: z.string().optional().describe("Earliest check-in date, YYYY-MM-DD."),
    check_in_to: z.string().optional().describe("Latest check-in date, YYYY-MM-DD."),
    order_status: z.string().optional().describe("e.g. pending, confirmed, cancelled."),
    guest_keyword: z.string().optional().describe("Partial guest name match."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    let query = supabaseForUser(ctx)
      .from("orders")
      .select(ORDER_FIELDS)
      .order("check_in_date", { ascending: false })
      .limit(input.limit ?? 50);

    if (input.accommodation_id) query = query.eq("accommodation_id", input.accommodation_id);
    if (input.check_in_from) query = query.gte("check_in_date", input.check_in_from);
    if (input.check_in_to) query = query.lte("check_in_date", input.check_in_to);
    if (input.order_status) query = query.eq("order_status", input.order_status);
    if (input.guest_keyword) query = query.ilike("guest_name", `%${input.guest_keyword}%`);

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return {
      ...textResult(JSON.stringify(data ?? [], null, 2)),
      structuredContent: { orders: data ?? [], count: data?.length ?? 0 },
    };
  },
});
