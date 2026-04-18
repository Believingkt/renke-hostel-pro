
-- Roll back the over-restrictive policy and restore public read for booking flow
DROP POLICY IF EXISTS "Staff can view pricing templates in their accommodation" ON public.pricing_templates;

-- Public can read (front-end booking flow & rooms section depend on this);
-- if any future internal-only fields are added, they should live in a separate
-- table or be exposed via a SECURITY DEFINER function instead.
CREATE POLICY "Public can view pricing templates"
ON public.pricing_templates
FOR SELECT
USING (true);
