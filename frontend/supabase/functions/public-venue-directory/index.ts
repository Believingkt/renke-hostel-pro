import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 統一從 kol_venues 讀取（PMS 館別已建檔在 kol_venues）
    const { data, error } = await supabase
      .from("kol_venues")
      .select("id, name, type, is_active, accommodation_id, room_type_id")
      .eq("is_active", true);
    if (error) throw error;

    const rows = data ?? [];

    // 有子館別的母館 accommodation_id 集合（該母館本身在 CSV 中 is_selectable=false）
    const parentAccIdsWithChild = new Set<string>();
    for (const r of rows) {
      if (r.room_type_id && r.accommodation_id) {
        parentAccIdsWithChild.add(r.accommodation_id as string);
      }
    }

    const header = [
      "id",
      "name",
      "type",
      "source",
      "is_active",
      "parent_id",
      "venue_level",
      "is_selectable",
    ];
    const lines = [header.join(",")];

    for (const r of rows) {
      const hasAcc = !!r.accommodation_id;
      const isChild = !!r.room_type_id;
      const source = hasAcc && !isChild ? "pms" : isChild ? "child" : "venue";
      const venueLevel = isChild ? "child" : "parent";
      const parentId = isChild ? (r.accommodation_id as string) ?? "" : "";
      // 母館本身若有子館別 → 不可選；子館別 / 獨立館別 / 外部場域 → 可選
      const isParentWithChildren =
        !isChild && hasAcc && parentAccIdsWithChild.has(r.accommodation_id as string);
      const isSelectable = isParentWithChildren ? "false" : "true";

      lines.push(
        [
          r.id,
          r.name ?? "",
          r.type ?? "",
          source,
          r.is_active === true ? "true" : "false",
          parentId,
          venueLevel,
          isSelectable,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    // Prepend UTF-8 BOM so Excel opens it with correct encoding.
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'inline; filename="venue-directory.csv"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("public-venue-directory error:", e);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});
