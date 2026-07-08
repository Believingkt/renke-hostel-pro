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

    const [pmsRes, venueRes] = await Promise.all([
      supabase.from("accommodation_info").select("id, name, is_active").eq("is_active", true),
      supabase.from("kol_venues").select("id, name, type, is_active").eq("is_active", true),
    ]);

    if (pmsRes.error) throw pmsRes.error;
    if (venueRes.error) throw venueRes.error;

    const rows: Array<{ id: string; name: string; type: string; source: string; is_active: boolean }> = [];

    for (const r of pmsRes.data ?? []) {
      rows.push({ id: r.id, name: r.name ?? "", type: "民宿", source: "pms", is_active: true });
    }
    for (const r of venueRes.data ?? []) {
      rows.push({ id: r.id, name: r.name ?? "", type: r.type ?? "", source: "venue", is_active: !!r.is_active });
    }

    const header = ["id", "name", "type", "source", "is_active"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.id, r.name, r.type, r.source, r.is_active].map(csvEscape).join(","));
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
