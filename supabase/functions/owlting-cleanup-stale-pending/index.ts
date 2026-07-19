// Cleans up stale auto-created OwlTing pending orders.
//
// Two tiers of TTL:
//   1) "等待付款鎖房" orders (created from 「訂單等待付款通知」emails) → 48h
//      These lock inventory speculatively while the guest still hasn't paid;
//      if no 成立通知 arrives within 48h, release the inventory.
//   2) Regular auto-pending orders (from confirmed 訂單成立通知 emails) → 72h
//      Waiting for the owner to fill PII. If never filled, release.
//
// Meant to be invoked by pg_cron on an hourly schedule.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const REGULAR_STALE_HOURS = 72;
const PAYMENT_PENDING_STALE_HOURS = 48;
const PAYMENT_PENDING_MARKER = "[等待付款鎖房]";

interface Sweep {
  label: string;
  cutoff: string;
  matcher: (notes: string | null) => boolean;
  cancelReason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = Date.now();
  const sweeps: Sweep[] = [
    {
      label: "payment_pending_48h",
      cutoff: new Date(now - PAYMENT_PENDING_STALE_HOURS * 3600 * 1000).toISOString(),
      matcher: (notes) => !!notes && notes.includes(PAYMENT_PENDING_MARKER),
      cancelReason: "🔒 系統自動取消：48 小時內未收到成立通知，釋放等待付款保留庫存",
    },
    {
      label: "regular_72h",
      cutoff: new Date(now - REGULAR_STALE_HOURS * 3600 * 1000).toISOString(),
      matcher: (notes) => !notes || !notes.includes(PAYMENT_PENDING_MARKER),
      cancelReason: "🔒 系統自動取消：72 小時內未完成補單，釋放庫存",
    },
  ];

  const summary: Array<{ label: string; cutoff: string; candidates: number; cancelled: number; failed: number }> = [];
  const allResults: Array<{ order_id: string; label: string; ok: boolean; message?: string }> = [];

  for (const sweep of sweeps) {
    const { data: staleOrders, error: findErr } = await supabase
      .from("orders")
      .select("id, order_number, created_at, notes, auto_created_from_email_id")
      .eq("is_pii_pending", true)
      .neq("order_status", "cancelled")
      .lt("created_at", sweep.cutoff)
      .limit(500);

    if (findErr) {
      summary.push({ label: sweep.label, cutoff: sweep.cutoff, candidates: 0, cancelled: 0, failed: 0 });
      continue;
    }

    const candidates = (staleOrders ?? []).filter((o: any) => sweep.matcher(o.notes ?? null));
    let cancelled = 0;
    let failed = 0;

    for (const o of candidates) {
      try {
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            order_status: "cancelled",
            is_pii_pending: false,
            notes: sweep.cancelReason,
          })
          .eq("id", o.id);
        if (uErr) throw uErr;

        await supabase
          .from("owlting_email_parsed_staging")
          .update({ pii_status: "expired" })
          .eq("auto_order_id", o.id)
          .eq("pii_status", "pending_pii_fillup");

        cancelled += 1;
        allResults.push({ order_id: o.id, label: sweep.label, ok: true });
      } catch (e) {
        failed += 1;
        allResults.push({ order_id: o.id, label: sweep.label, ok: false, message: (e as Error).message });
      }
    }

    summary.push({ label: sweep.label, cutoff: sweep.cutoff, candidates: candidates.length, cancelled, failed });
  }

  return new Response(
    JSON.stringify({
      checked_at: new Date().toISOString(),
      sweeps: summary,
      results: allResults,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
