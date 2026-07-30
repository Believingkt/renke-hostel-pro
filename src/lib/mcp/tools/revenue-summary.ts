import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "revenue_summary",
  title: "營收概況",
  description:
    "Summarise bookings for one accommodation over a check-in date range: order count, total revenue, paid amount and room nights. Cancelled orders are excluded.",
  inputSchema: {
    accommodation_id: z.string().uuid().describe("Accommodation UUID from list_accommodations."),
    check_in_from: z.string().describe("Start of the check-in range, YYYY-MM-DD."),
    check_in_to: z.string().describe("End of the check-in range, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("orders")
      .select("final_price, paid_amount, check_in_date, check_out_date, order_status, order_source")
      .eq("accommodation_id", input.accommodation_id)
      .gte("check_in_date", input.check_in_from)
      .lte("check_in_date", input.check_in_to)
      .neq("order_status", "cancelled")
      .limit(2000);
    if (error) return errorResult(error.message);

    const rows = data ?? [];
    const nights = rows.reduce((sum, r: any) => {
      const inD = new Date(r.check_in_date).getTime();
      const outD = new Date(r.check_out_date).getTime();
      return sum + Math.max(0, Math.round((outD - inD) / 86400000));
    }, 0);
    const bySource: Record<string, number> = {};
    for (const r of rows as any[]) {
      const key = r.order_source ?? "unknown";
      bySource[key] = (bySource[key] ?? 0) + Number(r.final_price ?? 0);
    }
    const summary = {
      order_count: rows.length,
      total_revenue: rows.reduce((s, r: any) => s + Number(r.final_price ?? 0), 0),
      paid_amount: rows.reduce((s, r: any) => s + Number(r.paid_amount ?? 0), 0),
      room_nights: nights,
      revenue_by_source: bySource,
    };
    return { ...textResult(JSON.stringify(summary, null, 2)), structuredContent: summary };
  },
});
