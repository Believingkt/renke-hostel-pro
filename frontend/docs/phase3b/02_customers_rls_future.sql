-- Phase 3B-1 DRAFT — STEP 4 ONLY. Do NOT apply now, do NOT place under supabase/migrations/.
-- Scope: customers INSERT / UPDATE Staff broad policies only.
-- SELECT: unchanged. DELETE: unchanged (admin-only, see README CUSTOMER_DELETE_DESIGN).

-- Current production (2026-08-30):
--   INSERT "Only admins can insert customers"                    -> keep
--   INSERT "Staff can insert customers in their accommodation"   -> user_has_access_to_accommodation  (DROP)
--   UPDATE "Only admins can update customers"                    -> keep
--   UPDATE "Staff can update customers in their accommodation"   -> user_has_access_to_accommodation  (DROP)

DROP POLICY IF EXISTS "Staff can insert customers in their accommodation" ON public.customers;
DROP POLICY IF EXISTS "Staff can update customers in their accommodation" ON public.customers;

CREATE POLICY "Customers module editors can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'customers')
);

CREATE POLICY "Customers module editors can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'customers')
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'customers')
);

-- NOTE: the Orders create-order path must already be on
-- public.upsert_customer_for_order (SECURITY DEFINER) before this file is applied,
-- otherwise orders=editable / customers=readonly Staff lose order creation.
