# Phase 3B-1 — Customers Dedicated RPC + RLS Draft (NO APPLY)

Draft only. Nothing here has been applied to production. Files must NOT be moved into
`supabase/migrations/` until each deployment step is separately authorized.

## Deployment sequence (must not skip)
1. STEP 1 — create `public.upsert_customer_for_order` in production; keep current broad customers Staff RLS.
2. STEP 2 — `CreateOrderDialog` switches to the RPC; preview test, then Publish.
3. STEP 3 — Customers page readonly UI convergence.
4. STEP 4 — apply `02_customers_rls_future.sql` (tighten customers Staff INSERT/UPDATE).

## Files
- `01_upsert_customer_for_order.sql` — RPC draft.
- `02_customers_rls_future.sql` — STEP 4 RLS draft (INSERT/UPDATE only).
- `03_verification_queries.sql` — persona pickers + CASE A–L test matrix + future RLS matrix.

## RPC contract
- Authorization: `is_super_admin(auth.uid()) OR is_hotel_admin_of(_accommodation_id) OR staff_can_edit_module(_accommodation_id,'orders')`. `customers=editable` never grants it.
- SECURITY DEFINER + `SET search_path = public`, schema-qualified objects, EXECUTE revoked from `anon`.
- Matching: `accommodation_id = _accommodation_id AND phone = _phone`, no normalization added.
  0 rows → create, 1 row → update, >1 rows → ERROR (`21000`), never LIMIT 1 / merge / dedupe.
- Update fields: `name, email, gender, nationality, visit_count+1, updated_at`. Not touched: `phone`, `first_order_date`, `notes`, `member_id`.
- Insert fields: `accommodation_id, name, phone, email, gender, nationality, visit_count=1, first_order_date`.
- Returns `(customer_id uuid, action text)` with `action ∈ {created, updated}`; frontend must require `customer_id IS NOT NULL`.
- All denials raise SQL exceptions (`42501`), never `success=false` with an OK response.

### BEHAVIORAL IMPLEMENTATION DIFFERENCE
`visit_count` is incremented inside the UPDATE statement (`visit_count + 1`) rather than
read-then-write as in `CreateOrderDialog`. Single-caller outcome is identical; the SQL form
additionally avoids a lost-update race. This is an implementation difference, not
authorization-only.

## Evidence — customers DELETE
Production policies (2026-08-30):
- DELETE `Admins can delete customers in their accommodation` — `user_has_role(..., 'hotel_admin') OR user_has_role(..., 'super_admin')`
- DELETE `Only admins can delete customers` — same predicate
- No Staff DELETE policy exists.
Frontend `src/pages/Customers.tsx:301-324` renders a delete AlertDialog for any user reaching
the page, and reports `刪除成功` when the delete returns no error — RLS-blocked deletes return
0 rows without error, so the UI can show false success (global write audit logs delete 0-row
as a benign no-op).

- `CUSTOMER_DELETE_DESIGN = ADMIN_ONLY` (backend contract has never granted Staff DELETE).
- `CUSTOMERS_DELETE_PERMISSION_MISMATCH = YES` (UI exposes an action the DB denies).
- Not changed in this phase.

## Other flags
- `PUBLIC_BOOKING_CUSTOMER_WRITE_DEAD_PATH = YES` — `src/pages/BookingFlow.tsx` writes customers
  anonymously; authenticated-only RLS blocks it and it fails soft. Real landing is the
  service-role flow (`supabase/functions/_shared/customerUpsert.ts`). Cleanup only, not a blocker.
- Service-role flows frozen: `_shared/customerUpsert`, `owlting-fillup-submit`, `backup-data`,
  `restore-data`, `generate-test-orders`, `delete-account`.
