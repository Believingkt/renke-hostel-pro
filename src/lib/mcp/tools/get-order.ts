import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

const ORDER_DETAIL_FIELDS = [
  "id","order_number","accommodation_id","room_type_id","package_id","customer_id","member_id",
  "guest_name","guest_phone","guest_email","guest_address","guest_count","room_quantity",
  "check_in_date","check_out_date","nights","order_status","payment_status","order_source",
  "order_date","total_price","discount_code","discount_amount","final_price","paid_amount",
  "deposit_amount","deposit_status","deposit_required_amount","deposit_method",
  "payment_method","deposit_payment_method","balance_payment_method",
  "meal_plan","meal_plan_details","pet_count","pet_plan_price","custom_addon_details",
  "notes","created_at","updated_at",
].join(", ");

export default defineTool({
  name: "get_order",
  title: "取得訂單明細",
  description: "Get the full detail of a single booking by its order number.",
  inputSchema: {
    order_number: z.string().trim().min(1).describe("The 8-character order number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order_number }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("orders")
      .select(ORDER_DETAIL_FIELDS)
      .eq("order_number", order_number)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult(`Order ${order_number} not found or not accessible.`);
    return {
      ...textResult(JSON.stringify(data, null, 2)),
      structuredContent: { order: data },
    };
  },
});
