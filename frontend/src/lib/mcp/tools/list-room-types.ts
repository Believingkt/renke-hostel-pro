import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_room_types",
  title: "列出房型與方案",
  description:
    "List room types and sales packages (including capacity and pricing) for one accommodation.",
  inputSchema: {
    accommodation_id: z.string().uuid().describe("Accommodation UUID from list_accommodations."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ accommodation_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const [rooms, packages] = await Promise.all([
      supabase
        .from("room_types")
        .select("id, name, capacity, base_price, room_count, is_exclusive_package, display_order")
        .eq("accommodation_id", accommodation_id)
        .order("display_order", { ascending: true }),
      supabase
        .from("accommodation_packages")
        .select("id, name, subtitle, guest_count, guest_count_max, original_price, sale_price, enabled")
        .eq("accommodation_id", accommodation_id)
        .order("display_order", { ascending: true }),
    ]);
    if (rooms.error) return errorResult(rooms.error.message);
    if (packages.error) return errorResult(packages.error.message);
    const payload = { room_types: rooms.data ?? [], packages: packages.data ?? [] };
    return { ...textResult(JSON.stringify(payload, null, 2)), structuredContent: payload };
  },
});
