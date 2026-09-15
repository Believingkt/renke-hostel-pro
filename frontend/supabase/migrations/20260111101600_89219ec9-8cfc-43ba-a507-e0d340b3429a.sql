
-- Fix security issues for customers and discount_codes tables
-- Issue 1: customers table - restrict SELECT to authenticated staff only (already correct, but ensure no public access)
-- Issue 2: discount_codes table - change policies from public to authenticated role

-- First, drop and recreate discount_codes SELECT policy to use authenticated role
DROP POLICY IF EXISTS "Admins can view all discount codes" ON public.discount_codes;

-- Create new SELECT policy for discount_codes with authenticated role (more restrictive)
CREATE POLICY "Admins can view all discount codes"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Update the INSERT policy for discount_codes to use authenticated role
DROP POLICY IF EXISTS "Admins can insert discount codes" ON public.discount_codes;

CREATE POLICY "Admins can insert discount codes"
ON public.discount_codes
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Update the UPDATE policy for discount_codes to use authenticated role
DROP POLICY IF EXISTS "Admins can update discount codes" ON public.discount_codes;

CREATE POLICY "Admins can update discount codes"
ON public.discount_codes
FOR UPDATE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Update the DELETE policy for discount_codes to use authenticated role
DROP POLICY IF EXISTS "Admins can delete discount codes" ON public.discount_codes;

CREATE POLICY "Admins can delete discount codes"
ON public.discount_codes
FOR DELETE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- For customers table, ensure only authenticated users with proper access can read
-- The current policy is already correct (Staff can view customers in their accommodation uses authenticated role)
-- But let's also update the other policies to use authenticated role consistently

-- Update customers INSERT policies to use authenticated role  
DROP POLICY IF EXISTS "Only admins can insert customers" ON public.customers;

CREATE POLICY "Only admins can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Update customers UPDATE policy to use authenticated role
DROP POLICY IF EXISTS "Only admins can update customers" ON public.customers;

CREATE POLICY "Only admins can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Update customers DELETE policy to use authenticated role
DROP POLICY IF EXISTS "Only admins can delete customers" ON public.customers;

CREATE POLICY "Only admins can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);
