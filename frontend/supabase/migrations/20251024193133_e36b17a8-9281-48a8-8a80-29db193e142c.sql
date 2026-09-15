-- Fix RLS policies for faqs table
-- Remove overly permissive public write policies
DROP POLICY IF EXISTS "Allow public to insert FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Allow public to update FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Allow public to delete FAQs" ON public.faqs;

-- Update the public select policy to only show published FAQs to unauthenticated users
DROP POLICY IF EXISTS "Allow public to view all FAQs" ON public.faqs;

CREATE POLICY "Public can view published FAQs"
ON public.faqs
FOR SELECT
USING (is_published = true);

-- Add authenticated policies for admin users
CREATE POLICY "Authenticated users can view all FAQs"
ON public.faqs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert FAQs"
ON public.faqs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update FAQs"
ON public.faqs
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete FAQs"
ON public.faqs
FOR DELETE
TO authenticated
USING (true);

-- Fix RLS policies for accommodation_facilities table
-- Remove overly permissive public write policies
DROP POLICY IF EXISTS "Allow public to insert facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Allow public to update facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Allow public to delete facilities" ON public.accommodation_facilities;

-- Public can still view facilities (for frontend display)
-- The existing "Public can view facilities" policy remains

-- Add authenticated policies for admin users
CREATE POLICY "Authenticated users can insert facilities"
ON public.accommodation_facilities
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update facilities"
ON public.accommodation_facilities
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete facilities"
ON public.accommodation_facilities
FOR DELETE
TO authenticated
USING (true);