import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_accommodations",
  title: "列出民宿館別",
  description:
    "List the accommodations (properties) the signed-in user can access, with id, name, region and active status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("accommodation_info")
      .select("id, name, short_name, region_1, region_2, is_active, booking_type, total_rooms")
      .order("display_order", { ascending: true });
    if (error) return errorResult(error.message);
    return {
      ...textResult(JSON.stringify(data ?? [], null, 2)),
      structuredContent: { accommodations: data ?? [] },
    };
  },
});
