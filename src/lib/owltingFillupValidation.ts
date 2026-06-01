// Shared validation helpers for the OwlTing fillup dialog.
// Kept pure (no React / no Supabase) so they can be unit-tested in isolation
// and reused by the edge function if needed.

export const AMOUNT_MIN_SUSPICIOUS = 100;
export const AMOUNT_MAX_SUSPICIOUS = 100_000;
export const GUEST_COUNT_MIN = 1;
export const GUEST_COUNT_MAX = 50;

/**
 * Returns true when the amount looks wrong and a warning should be surfaced
 * to the operator. Empty / NaN input is NOT suspicious (operator hasn't
 * typed yet). Boundaries: 100 and 100,000 inclusive are OK.
 */
export function isAmountSuspicious(raw: string | number | null | undefined): boolean {
  if (raw === null || raw === undefined || raw === "") return false;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(n)) return false;
  return n < AMOUNT_MIN_SUSPICIOUS || n > AMOUNT_MAX_SUSPICIOUS;
}

/**
 * Returns true when the guest count is a valid integer in [1, 50].
 */
export function isGuestCountValid(raw: string | number | null | undefined): boolean {
  if (raw === null || raw === undefined || raw === "") return false;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= GUEST_COUNT_MIN && n <= GUEST_COUNT_MAX;
}
