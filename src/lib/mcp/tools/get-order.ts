import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

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
      .select("*")
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
