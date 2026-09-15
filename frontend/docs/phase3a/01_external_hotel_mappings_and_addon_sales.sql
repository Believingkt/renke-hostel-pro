-- ============================================================
-- Phase 3A — SAFE SIMPLE RLS DRAFT (NOT APPLIED / NOT A MIGRATION)
-- Do NOT copy this file into supabase/migrations/.
-- Scope: external_hotel_mappings, addon_sales ONLY.
-- No ALTER TABLE / no new column / no trigger / no RPC / no schema change.
-- SELECT semantics are intentionally preserved on both tables.
-- ============================================================

-- ============================================================
-- SECTION A — external_hotel_mappings
-- Contract: Channel Manager Staff = hidden/readonly only.
--           WRITE = target-accommodation hotel_admin OR super_admin.
-- ============================================================

-- A1. DROP the broad FOR ALL policy (root cause of readonly write bypass).
--     Current policy name: "Admins can manage external mappings"
--     Current: FOR ALL TO authenticated
--       USING/WITH CHECK user_has_access_to_accommodation(auth.uid(), accommodation_id)
DROP POLICY IF EXISTS "Admins can manage external mappings" ON public.external_hotel_mappings;

-- A2. SELECT — unchanged semantics.
--     Existing policy "Staff can read accommodation mappings" is KEPT AS-IS.
--     (It already provides the accommodation-level read that A1 also provided.)
--     No DROP, no CREATE here. SELECT behaviour change = 0.

-- A3. INSERT — admin only (target accommodation).
CREATE POLICY "Admins can insert external mappings"
ON public.external_hotel_mappings
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);

-- A4. UPDATE — admin only, USING and WITH CHECK identical
--     (prevents moving a row to another accommodation).
CREATE POLICY "Admins can update external mappings"
ON public.external_hotel_mappings
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);

-- A5. DELETE — admin only.
CREATE POLICY "Admins can delete external mappings"
ON public.external_hotel_mappings
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
);

-- Result for SECTION A:
--   SELECT : "Staff can read accommodation mappings" (unchanged)
--   INSERT/UPDATE/DELETE : admin-only, TO authenticated
--   anon    : no policy for any command => no anonymous read/write
--   Staff with legacy channel_manager='editable' : WRITE = DENY
--   No policy gap: every command is explicitly covered.

-- ============================================================
-- SECTION B — addon_sales
-- Module owner: addon_center
-- Contract: WRITE = staff_can_edit_module(accommodation_id, 'addon_center')
--           (that helper already returns 'editable' for target hotel_admin
--            and for super_admin, so admins keep full capability;
--            is_super_admin/is_hotel_admin_of are added explicitly for clarity)
-- ============================================================

-- B1. SELECT — unchanged. The following policies are KEPT AS-IS:
--       "Members can view addon sales of their accommodation"
--       "AM team can view addon sales"
--       "Finance can view addon sales"
--     No DROP, no CREATE. SELECT behaviour change = 0.

-- B2. DROP broad write policies (root cause of readonly/hidden write bypass).
DROP POLICY IF EXISTS "Members can insert addon sales for their accommodation" ON public.addon_sales;
DROP POLICY IF EXISTS "Members can update addon sales of their accommodation" ON public.addon_sales;
DROP POLICY IF EXISTS "Members can delete addon sales of their accommodation" ON public.addon_sales;

-- B3. INSERT — addon_center editable OR admin.
CREATE POLICY "Addon center editors can insert addon sales"
ON public.addon_sales
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);

-- B4. UPDATE — USING and WITH CHECK identical.
CREATE POLICY "Addon center editors can update addon sales"
ON public.addon_sales
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);

-- B5. DELETE — addon_center editable OR admin.
CREATE POLICY "Addon center editors can delete addon sales"
ON public.addon_sales
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_edit_module(accommodation_id, 'addon_center')
);

-- NOTE: the previous broad write policies were TO public (anon included, but
-- user_has_access_to_accommodation() returns false when auth.uid() IS NULL).
-- The proposed policies are TO authenticated, which keeps anonymous write DENY
-- and does not change any authenticated legitimate path.
