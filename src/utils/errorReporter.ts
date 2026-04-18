/**
 * Frontend error reporter — writes structured errors to public.error_logs
 * (source='frontend'). Best-effort; never throws.
 *
 * Use for booking flow failures, payment errors, and other user-facing
 * critical paths where we want a paper trail in the HQ admin.
 */
import { supabase } from "@/integrations/supabase/client";

export interface FrontendErrorInput {
  category: string; // e.g. "booking_flow", "payment", "tappay_prime"
  step?: string; // e.g. "dates", "room", "payment_submit"
  errorMessage: string;
  errorCode?: string | number;
  accommodationId?: string | null;
  idempotencyKey?: string | null;
  context?: Record<string, unknown>;
}

export async function reportFrontendError(
  input: FrontendErrorInput,
): Promise<void> {
  try {
    await supabase.from("error_logs").insert({
      source: "frontend",
      category: input.category,
      step: input.step ?? null,
      accommodation_id: input.accommodationId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      error_message: String(input.errorMessage).substring(0, 2000),
      error_code: input.errorCode != null ? String(input.errorCode) : null,
      context: input.context ?? null,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : null,
      url: typeof window !== "undefined" ? window.location.href : null,
    });
  } catch (e) {
    // Swallow — logging must never break the user flow
    console.error("[errorReporter] Failed:", e);
  }
}
