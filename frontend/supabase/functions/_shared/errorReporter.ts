// Shared error reporting helper for Edge Functions
// Writes structured errors to public.error_logs (source='backend')

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BackendErrorInput {
  functionName: string;
  category: string; // e.g. "tappay_charge", "order_insert", "price_validation"
  step?: string;
  errorMessage: string;
  errorCode?: string | number;
  accommodationId?: string | null;
  userId?: string | null;
  idempotencyKey?: string | null;
  context?: Record<string, unknown>;
}

export async function reportBackendError(input: BackendErrorInput): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;

    const supabase = createClient(supabaseUrl, serviceKey);
    await supabase.from("error_logs").insert({
      source: "backend",
      function_name: input.functionName,
      category: input.category,
      step: input.step ?? null,
      accommodation_id: input.accommodationId ?? null,
      user_id: input.userId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      error_message: input.errorMessage.substring(0, 2000),
      error_code: input.errorCode != null ? String(input.errorCode) : null,
      context: input.context ?? null,
    });
  } catch (e) {
    // Never let logging itself crash the request
    console.error("[errorReporter] Failed to write error log:", e);
  }
}
